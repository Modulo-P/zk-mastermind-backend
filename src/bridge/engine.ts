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
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
} from "@meshsdk/core";
import { PrismaClient } from "prisma/prisma-client";
import { client } from "../db";
import { HydraEngine } from "../hydra/engine";
import { HydraProvider } from "../hydra/provider";
import { KupoClient } from "../kupo";
import { BridgeOperation } from "../types/bridge";
import { toValue, txBuilderConfig } from "./cardano";

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
        payment: process.env.FUNDS_WALLET_PRIVATE_KEY!,
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
        payment: process.env.FUNDS_WALLET_PRIVATE_KEY!,
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

    const script: PlutusScript = {
      version: "V2",
      code: process.env.MINTING_CONTRACT!,
    };

    const burningWrappedAsset = transaction
      .body()
      .mint()
      ?.as_negative_multiasset()
      .get_asset(
        CSL.ScriptHash.from_hex(
          resolvePlutusScriptHash(resolvePlutusScriptAddress(script, 0))
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
            code: process.env.MINTING_CONTRACT!,
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
              resolvePaymentKeyHash(this._hydraWallet.getBaseAddress())
            )
          )
        );

        const utxos = await this._engine
          .getCardanoProvider()
          .fetchAddressUTxOs(this._hydraWallet.getBaseAddress());

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
          toValue(
            operation.amount.map((amt) => {
              if (amt.unit === "lovelace") {
                return {
                  unit: "lovelace",
                  quantity: (Number(amt.quantity) - 200000).toString(),
                };
              }
              return amt;
            })
          )
        );
        txBuilder.add_output(output);

        txBuilder.add_change_if_needed(
          CSL.Address.from_bech32(this._hydraWallet.getBaseAddress())
        );

        txBuilder.add_required_signer(
          CSL.Ed25519KeyHash.from_hex(
            resolvePaymentKeyHash(this._hydraWallet.getBaseAddress())
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
