import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import {
  Action,
  AppWallet,
  Asset,
  BlockfrostProvider,
  Mint,
  PlutusScript,
  Quantity,
  Transaction,
  UTxO,
  Unit,
  keepRelevant,
  readPlutusData,
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
} from "@meshsdk/core";
import { PrismaClient } from "prisma/prisma-client";
import { HydraEngine } from "../hydra/engine";
import { HydraProvider } from "../hydra/provider";
import { BridgeOperation } from "../types/bridge";
import { toValue, txBuilderConfig } from "./cardano";
import { KupoClient } from "../kupo";
import { client } from "../db";

export class BridgeEngine {
  private _kupoClient: KupoClient;

  private _hydraEngine: HydraEngine;
  private _hydraProvider: HydraProvider;
  private _hydraWallet: AppWallet;

  private _bridgeService: BridgeService;
  private _operationsProcessor: OperationsProcessor;

  private _cardanoProvider: BlockfrostProvider;
  private _cardanoWallet: AppWallet;

  constructor(
    kupoClient: KupoClient,
    hydraEngine: HydraEngine,
    cardanoProvider: BlockfrostProvider
  ) {
    this._kupoClient = kupoClient;

    this._hydraEngine = hydraEngine;
    this._hydraProvider = new HydraProvider(hydraEngine);
    this._hydraWallet = new AppWallet({
      networkId: 0,
      fetcher: this._hydraProvider,
      submitter: this._hydraProvider,
      key: {
        type: "cli",
        payment:
          "582009ed97acc546fc5d85b28eb02e49e0f6d01de5f85da316eae83847c1a218ce45",
      },
    });

    this._bridgeService = new BridgeService(client);

    this._cardanoProvider = cardanoProvider;
    this._cardanoWallet = new AppWallet({
      networkId: 0,
      fetcher: this._cardanoProvider,
      submitter: this._cardanoProvider,
      key: {
        type: "cli",
        payment: "5820" + process.env.FUNDS_WALLET_PRIVATE_KEY!,
      },
    });

    if (!this._kupoClient.isRunning()) {
      this._kupoClient.start();
    }

    this._hydraEngine.on("transaction", this.onHydraTransaction.bind(this));
    this._kupoClient.on("utxos", this.onKupoUTxOs.bind(this));

    this._operationsProcessor = new OperationsProcessor(this);
  }

  async onHydraTransaction(txCbor: string) {
    const transaction = CSL.Transaction.from_hex(txCbor);

    const burningWrappedAsset = transaction
      .body()
      .mint()
      ?.as_negative_multiasset()
      .get_asset(
        CSL.ScriptHash.from_hex(
          "d47ea75b975baa070978b1acd882029d2f95541d678d06bd63b4b9aa"
        ),
        CSL.AssetName.new(Buffer.from("48796472414441", "hex"))
      );
    if (!burningWrappedAsset || burningWrappedAsset.is_zero()) {
      return;
    }

    const firstVkey = transaction
      .witness_set()
      .vkeys()
      ?.get(0)
      .vkey()
      .public_key()
      .hash();

    if (!firstVkey) {
      return;
    }
    const pKeyHash = CSL.Credential.from_keyhash(firstVkey).to_keyhash();

    if (!pKeyHash) {
      return;
    }
    const address = CSL.EnterpriseAddress.new(
      0,
      CSL.Credential.from_keyhash(pKeyHash)
    )
      .to_address()
      .to_bech32();

    if (!address) {
      return;
    }
    const destinationAddress = CSL.Address.from_bech32(
      Buffer.from(
        readPlutusData(
          transaction.witness_set().redeemers()?.get(0).data().to_hex() ?? ""
        ),
        "hex"
      ).toString()
    );

    if (destinationAddress) {
      await client.bridgeOperation.create({
        data: {
          origin: "Hydra",
          originAddress: address,
          originTxHash: CSL.hash_transaction(transaction.body()).to_hex(),
          originOutputIndex: 0,
          amount: [
            { unit: "lovelace", quantity: burningWrappedAsset.to_str() },
          ],
          destination: "Cardano",
          destinationAddress: destinationAddress.to_bech32(),
          destinationTxHash: "",
          destinationOutputIndex: 0,
          state: "Pending",
        },
      });
    }
  }

  async onKupoUTxOs(utxos: UTxO[]) {
    for (const utxo of utxos) {
      // 1. Check if match is already in database
      const bridgeOperations = await this._bridgeService.findBridgeOperation(
        "Cardano",
        utxo.input.txHash,
        utxo.input.outputIndex
      );
      // 2. If not, process match
      if (bridgeOperations.length === 0) {
        //  2a. Check if match is valid
        if (this._bridgeService.isValidMatch(utxo)) {
          //  2b. If valid, add match to database
          await client.bridgeOperation.create({
            data: {
              origin: "Cardano",
              originAddress: utxo.output.address,
              originTxHash: utxo.input.txHash,
              originOutputIndex: utxo.input.outputIndex,
              amount: utxo.output.amount,
              destination: "Hydra",
              destinationAddress: this._bridgeService
                .getDestinationAddress(utxo.output.plutusData!)
                .to_bech32(),
              destinationTxHash: "",
              destinationOutputIndex: 0,
              state: "Pending",
            },
          });
        }
      }
    }
  }

  getHydraProvider() {
    return this._hydraProvider;
  }

  getCardanoProvider() {
    return this._cardanoProvider;
  }

  getCardanoWallet() {
    return this._cardanoWallet;
  }

  getHydraWallet() {
    return this._hydraWallet;
  }
}

class BridgeService {
  private _prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this._prisma = prisma;
  }

  async findBridgeOperation(
    origin: string,
    originTxHash: string,
    originOutputIndex: number
  ) {
    const result = await this._prisma.bridgeOperation.findMany({
      where: {
        origin,
        originTxHash,
        originOutputIndex,
      },
    });

    return result as any as BridgeOperation[];
  }

  isValidMatch(match: UTxO) {
    let result = false;

    if (match.output.plutusData) {
      try {
        const address = this.getDestinationAddress(match.output.plutusData);
        if (!CSL.EnterpriseAddress.from_address(address)) {
          return false;
        }

        if (match.output.amount.some((asset) => asset.unit !== "lovelace")) {
          return false;
        }

        result = true;
      } catch (error) {
        return false;
      }
    }

    return result;
  }

  getDestinationAddress(plutusData: string) {
    const address = Buffer.from(readPlutusData(plutusData), "hex").toString();
    const cslAddress = CSL.Address.from_bech32(address);

    return cslAddress;
  }
}

class OperationsProcessor {
  private _timer: NodeJS.Timeout;
  private _processing: boolean = false;
  private _hydraWallet: AppWallet;

  constructor(private _engine: BridgeEngine) {
    this._timer = setInterval(this.tick.bind(this), 10000);
    this._hydraWallet = this._engine.getHydraWallet();
  }

  async tick() {
    if (this._processing) {
      return;
    }

    this._processing = true;
    const pendingOperations = await client.bridgeOperation.findMany({
      where: { state: "Pending" },
    });

    for (const operation of pendingOperations as BridgeOperation[]) {
      await client.bridgeOperation.update({
        data: { state: "Processing" },
        where: { id: operation.id },
      });

      if (operation.origin === "Cardano") {
        try {
          const utxos = await this._engine
            .getHydraProvider()
            .fetchAddressUTxOs(this._hydraWallet.getPaymentAddress());

          const tx = new Transaction({ initiator: this._hydraWallet });

          const script: PlutusScript = {
            version: "V2",
            code: "590a15590a1201000033232332233223233223232323232323232323232323232323232323232232323222533532532323232335333573466e21400520000240231024153355335300835350052200222222222222200410241023153355335333573466e25400520000230241323230213355300f12001235001223302c0023335001233553013120012350012233030002302f0010012233301001100200123355301312001235001223303000235502e00100133300b00c0020013350213302850053350213302850035002022022500310231024102310231323232323302b225335001148000884d4008894cd4ccd5cd19b8f00200902d02c1300700113006003004302a225335001148000884d4008894cd4ccd5cd19b8f00200702c02b10011300600350035004500213500922001135350022200222222222222200813333535001220012620012626323333573466e1d200035573a002464646466442466002006004646666ae68cdc3a40006aae740048c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cc0a80b4058cc0a80b4050cc0a80c0048ccc0d9d7281a80819981b3ae503500e3302a02c00c33303603175a014646666ae68cdc3a40006aae740048c8c8c8cc8848cc00400c008c8cccd5cd19b8748000d55ce80091919191991091980080180119819bad0023032001357426ae88008d5d08009aab9e00223263203c33573807407c0746ea8008c8cccd5cd19b8748000d55ce80091919191991091980080180119819bad0023032001357426ae88008d5d08009aab9e00223263203c33573807407c0746ea8004d5d09aba2002357420026aae780088c98c80dccd5ce01a81c81a9baa0083302a75c00c66606c05604e00866606ceb809c008c0bc004d5d09aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026aae780088c98c8078cd5ce00e01000e1baa0023012001357426ae88008d5d08009aab9e00223263201933573802e03602e6ea8004406458c080894cd400440748854cd4ccd5cd19b8f350072200200202001f102013004001222333553006120012233501c002001335530071200123500122330240023023001333553006120012235002232230020073025225335001133501f005004221350022253353300c00200710081300600301b0013355300712001235001223233025003300100530252253350011355024003221350022253353300c002008112223300200a0041300600300222333573466e3c00800407006cc07088448894cd40044008884cc014008ccd54c01c48004014010004c06c8844894cd40044060884cd4064c010008cd54c0184800401000480048c8cccd5cd19b874800800480608cccd5cd19b874800000880608c98c8044cd5ce0078098078071aab9d37540024464646666ae68cdc3a40080024244400246666ae68cdc3a40040044646424446006008600e0026ae84d55cf00211999ab9a3370e90000019091100111931900999ab9c01101501101000f35573a0026ea80048c88c008dd6000980c111999aab9f0012014233501330043574200460066ae880080408c8c8cccd5cd19b87480180048c8c848888c010014c018004d5d09aab9e00323333573466e1d200400223232122223002005300c001357426aae780108cccd5cd19b874800800c8c8c848888c004014c028004d5d09aab9e00523333573466e1d2000004232122223003005375c6ae84d55cf00311931900899ab9c00f01300f00e00d00c35573a0026ea80048c8c8cccd5cd19b874803000484888888800c8cccd5cd19b87480280088488888880108cccd5cd19b874802000c8c8c8c8cc8848888888cc004024020dd70011bad001357426ae88008d5d08009aab9e00523333573466e1d2006004232323233221222222233002009008375c0046eb8004d5d09aba2002357420026aae780188cccd5cd19b87480100148c8c8c8cc8848888888cc018024020c040008dd70009aba1357440046ae84004d55cf00391999ab9a3370e90010031191909111111180380418078009aba135573c01046666ae68cdc3a400000e4646424444444600a01060200026ae84d55cf00491931900999ab9c01101501101000f00e00d00c00b35573a0026ea80048c8cccd5cd19b8748000d55ce800919191919910919800801801180380118048009aba1357440046ae84004d55cf00111931900599ab9c00900d00937540024646666ae68cdc3a40006aae740048c8c8c8cc8848cc00400c008c01c008dd68009aba1357440046ae84004d55cf00111931900519ab9c00800c00837540024646666ae68cdc3a40006aae740048dd71aba135573c004464c6401266ae7001c02c01cdd50009191999ab9a3370e90001aab9d0012323232323232323233332222123333001005004003002323333573466e1d200035573a00246464646644246600200600460240046600c0220026ae84d5d10011aba100135573c004464c6402466ae70040050040dd5003999808bae501000532323333573466e1d200400123212223002004357426aae7800c8cccd5cd19b87480080088c84888c004010dd71aba135573c00846666ae68cdc3a400000642444006464c6402a66ae7004c05c04c048044d55ce8009baa0033300175c0044464646666ae68cdc3a4000002464642446004006600c0026ae84d55cf00191999ab9a3370e9001001109100091931900a99ab9c01301701301235573a0026ea8004d5d09aba2002357420026ae88008d5d08009aba2002357420026aae780088c98c8020cd5ce0030050031baa001232323333573466e1d200200123232323232333222122333001005004003375a0086eb4008dd68009aba1357440046ae84004d5d10011aba100135573c00646666ae68cdc3a4000004464642446004006600e0026ae84d55cf00211931900499ab9c00700b00700635573a0026ea80048c8c8cccd5cd19b87480080048c8488c00400cdd71aba135573c00646666ae68cdc3a400000446424460040066eb8d5d09aab9e00423263200833573800c01400c00a6aae74004dd5000a48103505431004984cc005d73ad2232230023756002601a446666aae7c00480248cd4020c8cc040c018d55cea80098029aab9e500113574200460066ae8800801448004c024894cd4004401c88c84d400c88c00c004c034894cd40044c01800c884d400888ccd400494cd4cc039200000113007004100f2253353300f002001130080051010253353300e001480004c01c010403c488008488488cc00401000c88ccd5cd19b870020010040031220021220012122230030041121222300100422123300100300223230010012233003300200200133335122002221233001003002200148811cb5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d8908600488107487964724144410001",
          };

          const redeemer: Partial<Action> = {
            tag: "MINT",
          };

          if (operation.amount === null || !Array.isArray(operation.amount)) {
            return;
          }

          const mint: Mint = {
            assetName: "HydrADA",
            assetQuantity: operation.amount.find(
              (asset) => asset.unit === "lovelace"
            )!.quantity,
            metadata: {},
            recipient: operation.destinationAddress,
            label: "721",
          };

          const asset: Asset = {
            unit: `${
              resolvePlutusScriptHash(resolvePlutusScriptAddress(script, 0)) +
              Buffer.from("HydrADA").toString("hex")
            }`,
            quantity: operation.amount.find(
              (asset) => asset.unit === "lovelace"
            )!.quantity,
          };

          const collateralUTxO = utxos.filter(
            (utxo: UTxO) =>
              utxo.output.amount.length === 1 &&
              utxo.output.amount[0].unit === "lovelace"
          )[0];

          console.log("Collateral UTxO: ", collateralUTxO);

          tx.setCollateral([collateralUTxO]);
          tx.mintAsset(script, mint, redeemer);
          tx.sendAssets(operation.destinationAddress, [
            { unit: "lovelace", quantity: "20000000" },
          ]);
          tx.sendLovelace(operation.destinationAddress, "15000000");
          tx.sendLovelace(operation.destinationAddress, "5000000");

          await client.bridgeOperation.update({
            data: { state: "Submitting" },
            where: { id: operation.id },
          });

          const txUnsigned = await tx.build();
          const txSigned = await this._hydraWallet.signTx(txUnsigned);
          const txHash = await this._hydraWallet.submitTx(txSigned);

          await client.bridgeOperation.update({
            data: {
              state: "Submitted",
              destinationTxHash: txHash,
              destinationOutputIndex: 0,
            },
            where: { id: operation.id },
          });

          await new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              reject(`Timeout confirming transaction ${txHash}`);
            }, 300_000);
            this._engine.getHydraProvider().onTxConfirmed(txHash, async () => {
              await client.bridgeOperation.update({
                data: {
                  state: "Confirmed",
                  destinationTxHash: txHash,
                  destinationOutputIndex: 0,
                },
                where: { id: operation.id },
              });
              resolve();
            });
          });
        } catch (error) {
          console.log(error);
          await client.bridgeOperation.update({
            data: {
              state: "Failed",
            },
            where: { id: operation.id },
          });
        }
      }

      if (operation.origin === "Hydra") {
        const nativeScript = CSL.NativeScript.new_script_pubkey(
          CSL.ScriptPubkey.new(
            CSL.Ed25519KeyHash.from_hex(
              "b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086"
            )
          )
        );

        const utxos = await this._engine
          .getCardanoProvider()
          .fetchAddressUTxOs(
            "addr_test1wz0c73j3czfd77gtg58jtm2dz8fz7yrxzylv7dc67kew5tqk4uqc9"
          );

        const assetMap = new Map<Unit, Quantity>();

        assetMap.set(
          "lovelace",
          operation.amount.filter((asset) => asset.unit === "lovelace")[0]
            .quantity
        );

        const selectedUtxos = keepRelevant(assetMap, utxos);

        const txBuilder = CSL.TransactionBuilder.new(txBuilderConfig);

        for (const utxo of selectedUtxos) {
          const txInput = CSL.TransactionInput.new(
            CSL.TransactionHash.from_hex(utxo.input.txHash),
            utxo.input.outputIndex
          );
          txBuilder.add_native_script_input(
            nativeScript,
            txInput,
            toValue(utxo.output.amount)
          );
        }

        const output = CSL.TransactionOutput.new(
          CSL.Address.from_bech32(operation.destinationAddress),
          toValue(operation.amount)
        );
        txBuilder.add_output(output);

        txBuilder.add_change_if_needed(
          CSL.Address.from_bech32(
            "addr_test1wz0c73j3czfd77gtg58jtm2dz8fz7yrxzylv7dc67kew5tqk4uqc9"
          )
        );

        txBuilder.add_required_signer(
          CSL.Ed25519KeyHash.from_hex(
            "b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086"
          )
        );

        const tx = txBuilder.build_tx();

        try {
          await client.bridgeOperation.update({
            data: { state: "Submitting" },
            where: { id: operation.id },
          });

          const txUnsigned = tx.to_hex();
          const txSigned = await this._engine
            .getCardanoWallet()
            .signTx(txUnsigned, true);
          const txHash = await this._engine
            .getCardanoWallet()
            .submitTx(txSigned);

          await client.bridgeOperation.update({
            data: {
              state: "Submitted",
              destinationTxHash: txHash,
            },
            where: { id: operation.id },
          });

          await new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              reject(`Timeout confirming transaction ${txHash}`);
            }, 300_000);
            this._engine
              .getCardanoProvider()
              .onTxConfirmed(txHash, async () => {
                await client.bridgeOperation.update({
                  data: {
                    state: "Confirmed",
                    destinationTxHash: txHash,
                    destinationOutputIndex: 0,
                  },
                  where: { id: operation.id },
                });
                resolve();
              });
          });
        } catch (error) {
          console.log(error);

          await client.bridgeOperation.update({
            data: { state: "Failed" },
            where: { id: operation.id },
          });
        }
      }
    }
    this._processing = false;
  }
}
