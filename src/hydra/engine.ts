import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import { BlockfrostProvider, UTxO, resolveTxHash } from "@meshsdk/core";
import axios, { AxiosError } from "axios";
import blake2 from "blake2";
import cbor from "cbor";
import { PrismaClient } from "prisma/prisma-client";
import { HydraUTxO, HydraWebsocketPromise } from "../types/hydra.js";
import { HydraTxObserver } from "./observer.js";
import { convertHydraToMeshUTxOs } from "./utils.js";
import { HydraConnection } from "./client/connection/hydra-connection.js";
import { Observer, Publisher } from "../common/observer.js";

export class HydraEngine extends Publisher<string> {
  private _wsPool: HydraConnection[] = [];
  private static _instance: HydraEngine;

  public promises: Array<HydraWebsocketPromise> = [];
  public status: string = "NotStarted";
  private _cardanoProvider: BlockfrostProvider;
  public utxos: UTxO[] = [];
  public txPub: HyrdaTxPub;

  private constructor() {
    super();

    this.txPub = new HyrdaTxPub();
    this._cardanoProvider = new BlockfrostProvider(
      process.env.BLOCKFROST_PROJECT_ID!
    );

    this._wsPool.push(
      new HydraConnection(
        `ws://${process.env.HYDRA_NODE_1_HOST}/?history=no&tx-output=cbor`
      )
    );
    this._wsPool.push(
      new HydraConnection(
        `ws://${process.env.HYDRA_NODE_2_HOST}/?history=no&tx-output=cbor`
      )
    );

    const ws = this._wsPool[0];
    ws.subscribe(new HydraUTxOsObserver(this));
    ws.subscribe(new HydraStatusObserver(this));
    ws.subscribe(new HydraErrorObserver(this));
    ws.subscribe(new HyrdaNewTxObserver(this));
    ws.connect();

    this.start();
  }
  static getInstance() {
    return this._instance || (this._instance = new HydraEngine());
  }

  public async start() {
    while (!this._wsPool[0].isOpen()) {
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

      this._wsPool[0].send(
        JSON.stringify({ tag: "Init", contestationPeriod: 120 })
      );
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
        console.log("Please add funds to the wallet");
        setTimeout(() => this.start(), 10000);
        return;
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

    this._wsPool[0].send(JSON.stringify({ tag: "NewTx", transaction }));

    return response;
  }

  async fetchUTxOs(): Promise<UTxO[]> {
    const response = new Promise<UTxO[]>((resolve, reject) => {
      this.promises.push({
        command: { tag: "GetUTxO" },
        resolve,
        reject,
      });
    });

    this._wsPool[0].send(JSON.stringify({ tag: "GetUTxO" }));

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

class HydraUTxOsObserver extends Observer<string, HydraEngine> {
  async update(data: string) {
    const message = JSON.parse(data);

    switch (message.tag) {
      case "Greetings":
        if (message.snapshotUtxo) {
          this._publisher.utxos = await convertHydraToMeshUTxOs(
            message.snapshotUtxo as HydraUTxO
          );
        }
        break;
      case "HeadIsOpen":
        if (message.utxo) {
          this._publisher.utxos = await convertHydraToMeshUTxOs(
            message.utxo as HydraUTxO
          );
        }
      case "SnapshotConfirmed":
        const utxos = await convertHydraToMeshUTxOs(
          message.snapshot.utxo as HydraUTxO
        );
        saveUTxOs(utxos);
        this._publisher.utxos = utxos;
        break;
      case "GetUTxOResponse":
        const utxosResponse = await convertHydraToMeshUTxOs(
          message.utxo as HydraUTxO
        );
        saveUTxOs(utxosResponse);
        this._publisher.utxos = utxosResponse;

        for (const promise of this._publisher.promises) {
          if (promise.command.tag === "GetUTxO") {
            promise.resolve(utxosResponse);
            this._publisher.promises.splice(
              this._publisher.promises.indexOf(promise),
              1
            );
          }
        }
        break;
    }
  }
}

class HydraStatusObserver extends Observer<string, HydraEngine> {
  async update(data: string) {
    const message = JSON.parse(data);
    let status;
    if ((status = this.getStatus(message))) {
      this._publisher.status = status;
      console.log("Head status: ", status);
    }
    if (message.tag === "HeadIsInitializing") {
      this._publisher.promises.forEach((p) => {
        if (p.command.tag === "Init") {
          p.resolve();
          this._publisher.promises.splice(
            this._publisher.promises.indexOf(p),
            1
          );
        }
      });
    }
    if (message.tag === "HeadIsAborted") {
      this._publisher.start();
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

class HydraErrorObserver extends Observer<string, HydraEngine> {
  async update(data: string) {
    const message = JSON.parse(data);
    if (message.tag === "CommandFailed") {
      this._publisher.promises.forEach((p) => {
        if (p.command.tag === message.clientInput.tag) {
          p.reject(message);
          this._publisher.promises.splice(
            this._publisher.promises.indexOf(p),
            1
          );
        }
      });
    }
  }
}

class HyrdaNewTxObserver extends Observer<string, HydraEngine> {
  async update(data: string) {
    const message = JSON.parse(data);

    switch (message.tag) {
      case "TxValid":
        const txCborValid = message.transaction.slice(6);
        const txHash = resolveTxHash(txCborValid);
        this._publisher.txPub.notify(txCborValid);

        for (const promise of this._publisher.promises) {
          if (promise.id === txHash && promise.command.tag === "NewTx") {
            promise.resolve(txHash);
            this._publisher.promises.splice(
              this._publisher.promises.indexOf(promise),
              1
            );
          }
        }
        break;
      case "TxInvalid":
        const txCborInvalid = message.transaction.slice(6);
        const txHashInvalid = resolveTxHash(txCborInvalid);
        for (const promise of this._publisher.promises) {
          if (promise.id === txHashInvalid && promise.command.tag === "NewTx") {
            promise.reject(message.validationError.reason);
            this._publisher.promises.splice(
              this._publisher.promises.indexOf(promise),
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
