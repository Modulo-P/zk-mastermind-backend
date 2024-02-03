import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import {
  Action,
  AppWallet,
  Asset,
  BlockfrostProvider,
  MeshTxBuilder,
  Mint,
  NativeScript,
  PlutusScript,
  Protocol,
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
import { HydraTxObserver } from "../hydra/observer";
import { HydraProvider } from "../hydra/provider";
import { KupoMatchesPub, MatchesObserver } from "../kupo";
import { BridgeOperation } from "../types/bridge";
import { resetAddress, toValue, txBuilderConfig } from "./cardano";

export class BridgeEngine {
  private _kupoMatches: KupoMatchesPub;
  private _bridgeNewOperationPub: BridgeNewOperationsPub;
  private _bridgeService: BridgeService;
  private _hydraProvider: HydraProvider;
  private _cardanoProvider: BlockfrostProvider;
  private _cardanoWallet: AppWallet;

  constructor(kupoMatches: KupoMatchesPub, hydraProvider: HydraProvider) {
    this._kupoMatches = kupoMatches;
    this._hydraProvider = hydraProvider;
    this._bridgeService = new BridgeService();

    this._bridgeNewOperationPub = new BridgeNewOperationsPub();
    this._bridgeNewOperationPub.subscribe(
      new BridgeNewCardanoOperationsObserver(this)
    );
    this._bridgeNewOperationPub.subscribe(
      new BridgeNewHydraOperationsObserver(this)
    );

    this._kupoMatches.subscribe(new KupoMatchesObserver(this));

    const hydraEngine = HydraEngine.getInstance();
    hydraEngine.on("transaction", this.onTransaction.bind(this));

    this._cardanoProvider = new BlockfrostProvider(
      process.env.BLOCKFROST_PROJECT_ID!
    );
    this._cardanoWallet = new AppWallet({
      networkId: 0,
      fetcher: this._cardanoProvider,
      submitter: this._cardanoProvider,
      key: {
        type: "cli",
        payment:
          "582009ed97acc546fc5d85b28eb02e49e0f6d01de5f85da316eae83847c1a218ce45",
      },
    });
  }

  onTransaction(transaction: any): void {
    const tx = CSL.Transaction.from_hex(transaction);
    this.processHydraMatch(tx);
  }

  async processKupoMatches(matchesUTxOs: UTxO[]) {
    const operations = await this._bridgeService.processMatches(matchesUTxOs);
    this._bridgeNewOperationPub.newOperations(operations);
  }

  async processHydraMatch(transaction: CSL.Transaction) {
    const operation = await this._bridgeService.processHydraMatch(transaction);

    if (operation) {
      this._bridgeNewOperationPub.newOperations([operation]);
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
}

class KupoMatchesObserver implements MatchesObserver {
  private _engine: BridgeEngine;
  constructor(engine: BridgeEngine) {
    this._engine = engine;
  }

  async update(context: KupoMatchesPub) {
    this._engine.processKupoMatches(context.getUTxOs());
  }
}

class BridgeService {
  private _prisma: PrismaClient;

  constructor() {
    this._prisma = new PrismaClient();
  }

  async processMatches(matchesUTxOs: UTxO[]) {
    const result = [];
    for (const match of matchesUTxOs) {
      // 1. Check if match is already in database
      const bridgeOperations = await this.findBridgeOperation(
        "Cardano",
        match.input.txHash,
        match.input.outputIndex
      );
      // 2. If not, process match
      if (bridgeOperations.length === 0) {
        //  2a. Check if match is valid
        if (this.isValidMatch(match)) {
          //  2b. If valid, add match to database
          const newBridgeOperation = await this._prisma.bridgeOperation.create({
            data: {
              origin: "Cardano",
              originAddress: match.output.address,
              originTxHash: match.input.txHash,
              originOutputIndex: match.input.outputIndex,
              amount: match.output.amount,
              destination: "Hydra",
              destinationAddress: this.getDestinationAddress(
                match.output.plutusData!
              ).to_bech32(),
              destinationTxHash: "",
              destinationOutputIndex: 0,
              state: "Pending",
            },
          });
          result.push(newBridgeOperation as any as BridgeOperation);
        }
      }
    }
    return result;
  }

  async processHydraMatch(transaction: CSL.Transaction) {
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
    const pKeyHash = CSL.StakeCredential.from_keyhash(firstVkey).to_keyhash();

    if (!pKeyHash) {
      return;
    }
    const address = CSL.EnterpriseAddress.new(
      0,
      CSL.StakeCredential.from_keyhash(pKeyHash)
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
      const operation: BridgeOperation =
        (await this._prisma.bridgeOperation.create({
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
        })) as any as BridgeOperation;

      return operation;
    }
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

abstract class BridgePub {
  protected _observers: BridgeObserver[] = [];

  subscribe(observer: BridgeObserver) {
    this._observers.push(observer);
  }

  unsubscribe(observer: BridgeObserver) {
    this._observers = this._observers.filter((o) => o !== observer);
  }

  abstract notify(): any;
}

abstract class BridgeObserver {
  protected _engine: BridgeEngine;

  constructor(engine: BridgeEngine) {
    this._engine = engine;
  }
  abstract update(context: BridgePub): void;
}

class BridgeNewOperationsPub extends BridgePub {
  private _operations: BridgeOperation[] = [];

  newOperations(operations: BridgeOperation[]) {
    this._operations = operations;
    this.notify();
  }

  getOperations() {
    return this._operations;
  }

  notify() {
    this._observers.forEach((observer) => observer.update(this));
  }
}

class BridgeNewCardanoOperationsObserver extends BridgeObserver {
  private _client: PrismaClient;

  constructor(engine: BridgeEngine) {
    super(engine);
    this._client = new PrismaClient();
  }
  async update(context: BridgePub) {
    if (context instanceof BridgeNewOperationsPub) {
      const operations = context.getOperations();
      for (const operation of operations) {
        if (operation.state === "Pending" && operation.origin === "Cardano") {
          console.log("New pending operation");
          console.log(operation);

          await this._client.bridgeOperation.update({
            data: { state: "Submitting" },
            where: { id: operation.id },
          });

          const appWallet = new AppWallet({
            networkId: 0,
            fetcher: this._engine.getHydraProvider(),
            submitter: this._engine.getHydraProvider(),
            key: {
              type: "cli",
              payment:
                "582009ed97acc546fc5d85b28eb02e49e0f6d01de5f85da316eae83847c1a218ce45",
            },
          });

          const utxos = await this._engine
            .getHydraProvider()
            .fetchAddressUTxOs(appWallet.getPaymentAddress());

          const tx = new Transaction({ initiator: appWallet });

          const script: PlutusScript = {
            version: "V2",
            code: "590a15590a1201000033232332233223233223232323232323232323232323232323232323232232323222533532532323232335333573466e21400520000240231024153355335300835350052200222222222222200410241023153355335333573466e25400520000230241323230213355300f12001235001223302c0023335001233553013120012350012233030002302f0010012233301001100200123355301312001235001223303000235502e00100133300b00c0020013350213302850053350213302850035002022022500310231024102310231323232323302b225335001148000884d4008894cd4ccd5cd19b8f00200902d02c1300700113006003004302a225335001148000884d4008894cd4ccd5cd19b8f00200702c02b10011300600350035004500213500922001135350022200222222222222200813333535001220012620012626323333573466e1d200035573a002464646466442466002006004646666ae68cdc3a40006aae740048c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cc0a80b4058cc0a80b4050cc0a80c0048ccc0d9d7281a80819981b3ae503500e3302a02c00c33303603175a014646666ae68cdc3a40006aae740048c8c8c8cc8848cc00400c008c8cccd5cd19b8748000d55ce80091919191991091980080180119819bad0023032001357426ae88008d5d08009aab9e00223263203c33573807407c0746ea8008c8cccd5cd19b8748000d55ce80091919191991091980080180119819bad0023032001357426ae88008d5d08009aab9e00223263203c33573807407c0746ea8004d5d09aba2002357420026aae780088c98c80dccd5ce01a81c81a9baa0083302a75c00c66606c05604e00866606ceb809c008c0bc004d5d09aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026ae88008d5d08009aba2002357420026aae780088c98c8078cd5ce00e01000e1baa0023012001357426ae88008d5d08009aab9e00223263201933573802e03602e6ea8004406458c080894cd400440748854cd4ccd5cd19b8f350072200200202001f102013004001222333553006120012233501c002001335530071200123500122330240023023001333553006120012235002232230020073025225335001133501f005004221350022253353300c00200710081300600301b0013355300712001235001223233025003300100530252253350011355024003221350022253353300c002008112223300200a0041300600300222333573466e3c00800407006cc07088448894cd40044008884cc014008ccd54c01c48004014010004c06c8844894cd40044060884cd4064c010008cd54c0184800401000480048c8cccd5cd19b874800800480608cccd5cd19b874800000880608c98c8044cd5ce0078098078071aab9d37540024464646666ae68cdc3a40080024244400246666ae68cdc3a40040044646424446006008600e0026ae84d55cf00211999ab9a3370e90000019091100111931900999ab9c01101501101000f35573a0026ea80048c88c008dd6000980c111999aab9f0012014233501330043574200460066ae880080408c8c8cccd5cd19b87480180048c8c848888c010014c018004d5d09aab9e00323333573466e1d200400223232122223002005300c001357426aae780108cccd5cd19b874800800c8c8c848888c004014c028004d5d09aab9e00523333573466e1d2000004232122223003005375c6ae84d55cf00311931900899ab9c00f01300f00e00d00c35573a0026ea80048c8c8cccd5cd19b874803000484888888800c8cccd5cd19b87480280088488888880108cccd5cd19b874802000c8c8c8c8cc8848888888cc004024020dd70011bad001357426ae88008d5d08009aab9e00523333573466e1d2006004232323233221222222233002009008375c0046eb8004d5d09aba2002357420026aae780188cccd5cd19b87480100148c8c8c8cc8848888888cc018024020c040008dd70009aba1357440046ae84004d55cf00391999ab9a3370e90010031191909111111180380418078009aba135573c01046666ae68cdc3a400000e4646424444444600a01060200026ae84d55cf00491931900999ab9c01101501101000f00e00d00c00b35573a0026ea80048c8cccd5cd19b8748000d55ce800919191919910919800801801180380118048009aba1357440046ae84004d55cf00111931900599ab9c00900d00937540024646666ae68cdc3a40006aae740048c8c8c8cc8848cc00400c008c01c008dd68009aba1357440046ae84004d55cf00111931900519ab9c00800c00837540024646666ae68cdc3a40006aae740048dd71aba135573c004464c6401266ae7001c02c01cdd50009191999ab9a3370e90001aab9d0012323232323232323233332222123333001005004003002323333573466e1d200035573a00246464646644246600200600460240046600c0220026ae84d5d10011aba100135573c004464c6402466ae70040050040dd5003999808bae501000532323333573466e1d200400123212223002004357426aae7800c8cccd5cd19b87480080088c84888c004010dd71aba135573c00846666ae68cdc3a400000642444006464c6402a66ae7004c05c04c048044d55ce8009baa0033300175c0044464646666ae68cdc3a4000002464642446004006600c0026ae84d55cf00191999ab9a3370e9001001109100091931900a99ab9c01301701301235573a0026ea8004d5d09aba2002357420026ae88008d5d08009aba2002357420026aae780088c98c8020cd5ce0030050031baa001232323333573466e1d200200123232323232333222122333001005004003375a0086eb4008dd68009aba1357440046ae84004d5d10011aba100135573c00646666ae68cdc3a4000004464642446004006600e0026ae84d55cf00211931900499ab9c00700b00700635573a0026ea80048c8c8cccd5cd19b87480080048c8488c00400cdd71aba135573c00646666ae68cdc3a400000446424460040066eb8d5d09aab9e00423263200833573800c01400c00a6aae74004dd5000a48103505431004984cc005d73ad2232230023756002601a446666aae7c00480248cd4020c8cc040c018d55cea80098029aab9e500113574200460066ae8800801448004c024894cd4004401c88c84d400c88c00c004c034894cd40044c01800c884d400888ccd400494cd4cc039200000113007004100f2253353300f002001130080051010253353300e001480004c01c010403c488008488488cc00401000c88ccd5cd19b870020010040031220021220012122230030041121222300100422123300100300223230010012233003300200200133335122002221233001003002200148811cb5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d8908600488107487964724144410001",
          };

          const redeemer: Partial<Action> = {
            tag: "MINT",
          };

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

          tx.setCollateral([
            utxos.filter(
              (utxo: UTxO) =>
                utxo.output.amount.length === 1 &&
                utxo.output.amount[0].unit === "lovelace"
            )[0],
          ]);
          tx.mintAsset(script, mint, redeemer);
          tx.sendAssets(operation.destinationAddress, [
            { unit: "lovelace", quantity: "20000000" },
          ]);
          tx.sendLovelace(operation.destinationAddress, "15000000");
          tx.sendLovelace(operation.destinationAddress, "5000000");

          try {
            const txUnsigned = await tx.build();
            const txSigned = await appWallet.signTx(txUnsigned);
            const txHash = await appWallet.submitTx(txSigned);

            await this._client.bridgeOperation.update({
              data: {
                state: "Confirmed",
                destinationTxHash: txHash,
                destinationOutputIndex: 0,
              },
              where: { id: operation.id },
            });
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  }
}

class BridgeNewHydraOperationsObserver extends BridgeObserver {
  async update(context: BridgePub) {
    if (context instanceof BridgeNewOperationsPub) {
      const operations = context.getOperations();
      for (const operation of operations) {
        if (operation.state === "Pending" && operation.origin === "Hydra") {
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
            const txUnsigned = tx.to_hex();
            const txSigned = await this._engine
              .getCardanoWallet()
              .signTx(txUnsigned, true);
            const txHash = await this._engine
              .getCardanoWallet()
              .submitTx(txSigned);

            const client = new PrismaClient();

            await client.bridgeOperation.update({
              data: {
                state: "Submitted",
                destinationTxHash: txHash,
              },
              where: { id: operation.id },
            });
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  }
}
