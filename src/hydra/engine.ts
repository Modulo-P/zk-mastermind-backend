import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import { BlockfrostProvider, UTxO, resolveTxHash } from "@meshsdk/core";
import axios, { AxiosError } from "axios";
import blake2 from "blake2";
import cbor from "cbor";
import { PrismaClient } from "prisma/prisma-client";
import { HydraUTxO, HydraWebsocketPromise } from "../types/hydra.js";
import { HydraMessageObserver, HydraTxObserver } from "./observer.js";
import { convertHydraToMeshUTxOs } from "./utils.js";
import { HydraWebsocketClient } from "./websocket.js";

export class HydraEngine {
  private ws: HydraWebsocketClient = HydraWebsocketClient.getInstance();
  private static _instance: HydraEngine;

  public promises: Array<HydraWebsocketPromise> = [];
  public status: string = "NotStarted";
  private _cardanoProvider: BlockfrostProvider;
  public utxos: UTxO[] = [];
  public txPub: HyrdaTxPub;

  private constructor() {
    this.txPub = new HyrdaTxPub();
    this._cardanoProvider = new BlockfrostProvider(
      process.env.BLOCKFROST_PROJECT_ID!
    );

    this.ws.subscribe(new HydraUTxOsObserver(this));
    this.ws.subscribe(new HydraStatusObserver(this));
    this.ws.subscribe(new HydraErrorObserver(this));
    this.ws.subscribe(new HyrdaNewTxObserver(this));
  }

  static getInstance() {
    return this._instance || (this._instance = new HydraEngine());
  }

  public async start() {
    while (!this.ws.isOpen()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (["NotStarted", "Idle", "Final", "Initializing"].includes(this.status)) {
      const response = new Promise((resolve, reject) => {
        this.promises.push({
          command: { tag: "Init" },
          resolve,
          reject,
        });
      });

      this.ws.sendCommand({ tag: "Init", contestationPeriod: 120 });
      try {
        await response;
      } catch (e) {
        if (this.status !== "Initializing") {
          console.error(e);
          throw e;
        } else {
          console.log("Head is already initializing");
        }
      }

      const privateKey = CSL.PrivateKey.from_hex(
        process.env.FUNDS_WALLET_PRIVATE_KEY!
      );
      const publicKey = privateKey.to_public();
      const address = CSL.EnterpriseAddress.new(
        0,
        CSL.StakeCredential.from_keyhash(publicKey.hash())
      );
      console.log("Funds address: ", address.to_address().to_bech32());

      const utxos = await this._cardanoProvider.fetchAddressUTxOs(
        address.to_address().to_bech32()
      );

      let commitTxUTxOs = {};
      if (utxos.length > 0) {
        commitTxUTxOs = this.transformUTxO(utxos[0]);
      } else {
        throw new Error("No UTxOs found");
      }

      console.log("UTXOS: ", JSON.stringify(commitTxUTxOs, null, 2));

      try {
        let commitTx = (
          await axios.post(
            `http://${process.env.HYDRA_NODE_1_HOST}/commit`,
            commitTxUTxOs
          )
        ).data;

        const tx = CSL.Transaction.from_hex(commitTx.cborHex);

        const txJS = cbor.decode(Buffer.from(commitTx.cborHex, "hex"));
        const txBodyCbor = cbor.encode(txJS[0]).toString("hex");
        const h = blake2.createHash("blake2b", { digestLength: 32 });
        h.update(Buffer.from(txBodyCbor, "hex"));
        const hash = h.digest("hex");

        const witnesses = tx.witness_set();
        const vkeyWitnesses = witnesses.vkeys();
        const vkeyWitness = CSL.make_vkey_witness(
          CSL.TransactionHash.from_hex(hash),
          privateKey
        );
        vkeyWitnesses!.add(vkeyWitness);
        witnesses.set_vkeys(vkeyWitnesses!);
        const signedTx = (commitTx.cborHex as string).replace(
          tx.witness_set().to_hex(),
          witnesses.to_hex()
        );

        let txHash = await this._cardanoProvider.submitTx(signedTx);
        console.log("Tx hash: ", txHash);

        commitTx = (
          await axios.post(`http://${process.env.HYDRA_NODE_2_HOST}/commit`, {})
        ).data;
        txHash = await this._cardanoProvider.submitTx(commitTx.cborHex);
        console.log("Tx hash: ", txHash);
      } catch (e) {
        if (e instanceof AxiosError) {
          console.log("Error: ", e.response?.data);
        } else {
          console.log("Error: ", e);
        }
      }
    }
  }

  async submitTx(transaction: string): Promise<string> {
    const response = new Promise<string>((resolve, reject) => {
      const txHash = resolveTxHash(transaction);
      this.promises.push({
        command: { tag: "NewTx" },
        id: txHash,
        resolve,
        reject,
      });
    });

    this.ws.sendCommand({ tag: "NewTx", transaction });

    return response;
  }

  transformUTxO(utxo: UTxO) {
    const value: {
      lovelace: number;
      [key: string]: { [key: string]: number } | number;
    } = { lovelace: 0 };

    utxo.output.amount.forEach((amount) => {
      if (amount.unit === "lovelace") {
        value.lovelace = Number(amount.quantity);
      } else {
        const policyId = amount.unit.substring(0, 56);
        const assetId = amount.unit.substring(56);
        if (!value[policyId]) {
          value[policyId] = { [assetId]: Number(amount.quantity) };
        } else {
          if (typeof value[policyId] === "object") {
            const policyIdObj = value[policyId] as { [key: string]: number };
            policyIdObj[assetId] = Number(amount.quantity);
          }
        }
      }
    });
    return {
      [utxo.input.txHash + "#" + utxo.input.outputIndex]: {
        address: utxo.output.address,
        value,
      },
    };
  }
}

function saveUTxOs(utxos: UTxO[]) {
  const client = new PrismaClient();

  utxos.forEach(async (utxo) => {
    client.uTxO.create({
      data: {
        txHash: utxo.input.txHash,
        outputIndex: utxo.input.outputIndex,
        address: utxo.output.address,
        amount: utxo.output.amount,
        dataHash: utxo.output.dataHash ?? null,
        plutusData: utxo.output.plutusData ?? null,
        scriptRef: utxo.output.scriptRef ?? null,
        scriptHash: utxo.output.scriptHash ?? null,
      },
    });
  });
}

class HydraUTxOsObserver extends HydraMessageObserver {
  async update(message: any) {
    switch (message.tag) {
      case "Greetings":
        if (message.snapshotUtxo) {
          this._hydraEngine.utxos = await convertHydraToMeshUTxOs(
            message.snapshotUtxo as HydraUTxO
          );
        }
        break;
      case "HeadIsOpen":
        if (message.utxo) {
          this._hydraEngine.utxos = await convertHydraToMeshUTxOs(
            message.utxo as HydraUTxO
          );
        }
      case "SnapshotConfirmed":
        const utxos = await convertHydraToMeshUTxOs(
          message.snapshot.utxo as HydraUTxO
        );
        saveUTxOs(utxos);
        this._hydraEngine.utxos = utxos;
        break;
    }
  }
}

class HydraStatusObserver extends HydraMessageObserver {
  update(message: any): void {
    let status;
    if ((status = this.getStatus(message))) {
      this._hydraEngine.status = status;
      console.log("Head status: ", status);
    }
    if (message.tag === "HeadIsInitializing") {
      this._hydraEngine.promises.forEach((p) => {
        if (p.command.tag === "Init") {
          p.resolve();
          this._hydraEngine.promises.splice(
            this._hydraEngine.promises.indexOf(p),
            1
          );
        }
      });
    }
    if (message.tag === "HeadIsAborted") {
      this._hydraEngine.start();
    }
  }
  getStatus(data: any): string | null {
    switch (data.tag) {
      case "Greetings":
        return data.headStatus;
      case "HeadIsInitializing":
        return "Initializing";
      case "HeadIsOpen":
        return "Open";
      case "HeadIsClosed":
        return "Closed";
      case "ReadyToFanout":
        return "FanoutPossible";
      case "HeadIsFinalized":
        return "Final";
      default:
        return null;
    }
  }
}

class HydraErrorObserver extends HydraMessageObserver {
  update(message: any): void {
    if (message.tag === "CommandFailed") {
      this._hydraEngine.promises.forEach((p) => {
        if (p.command.tag === message.clientInput.tag) {
          p.reject(message);
          this._hydraEngine.promises.splice(
            this._hydraEngine.promises.indexOf(p),
            1
          );
        }
      });
    }
  }
}

class HyrdaNewTxObserver extends HydraMessageObserver {
  update(message: any): void {
    switch (message.tag) {
      case "TxValid":
        const txCborValid = message.transaction.slice(6);
        const txHash = resolveTxHash(txCborValid);
        this._hydraEngine.txPub.notify(txCborValid);

        for (const promise of this._hydraEngine.promises) {
          if (promise.id === txHash && promise.command.tag === "NewTx") {
            promise.resolve(txHash);
            this._hydraEngine.promises.splice(
              this._hydraEngine.promises.indexOf(promise),
              1
            );
          }
        }
        break;
      case "TxInvalid":
        const txCborInvalid = message.transaction.slice(6);
        const txHashInvalid = resolveTxHash(txCborInvalid);
        for (const promise of this._hydraEngine.promises) {
          if (promise.id === txHashInvalid && promise.command.tag === "NewTx") {
            promise.reject(message.validationError.reason);
            this._hydraEngine.promises.splice(
              this._hydraEngine.promises.indexOf(promise),
              1
            );
          }
        }
        break;
    }
  }
}

class HyrdaTxPub {
  protected _observers: HydraTxObserver[] = [];

  public subscribe(observer: HydraTxObserver) {
    this._observers.push(observer);
  }

  unsubcribe(observer: HydraTxObserver) {
    this._observers.filter((o) => o !== observer);
  }

  notify(transaction: any) {
    this._observers.forEach((observer) => observer.update(transaction));
  }
}
