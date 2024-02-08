import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import { BlockfrostProvider, UTxO } from "@meshsdk/core";
import axios, { AxiosError } from "axios";
import blake2 from "blake2";
import cbor from "cbor";
import { EventEmitter } from "stream";
import { HydraClient } from "./client/hydra-client.js";

export class HydraEngine extends EventEmitter {
  private static _instance: HydraEngine;
  private _cardanoProvider: BlockfrostProvider;
  private _client: HydraClient;
  private _confirmedTxs: Set<string> = new Set();

  private constructor() {
    super();
    this._cardanoProvider = new BlockfrostProvider(
      process.env.BLOCKFROST_PROJECT_ID!
    );
    this._client = new HydraClient(
      `ws://${process.env.HYDRA_NODE_1_HOST}/?history=no&tx-output=cbor`
    );

    this._client.on("transaction", (tx) => {
      this.emit("transaction", tx);
    });

    this._client.on("confirmedTransaction", (tx) => {
      this._confirmedTxs.add(tx);
    });

    this.start();
  }

  static getInstance() {
    return this._instance || (this._instance = new HydraEngine());
  }

  get utxos(): UTxO[] {
    return this._client.utxos;
  }

  public async start() {
    this._client.connect();
    while (!this._client.isOpen()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (
      ["DISCONNECTED", "IDLE", "FINAL", "INITIALIZING"].includes(
        this._client.hydraStatus
      )
    ) {
      try {
        await this._client.init(60);
      } catch (e) {
        if (this._client.hydraStatus !== "INITIALIZING") {
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
    return this._client.submitTx(transaction);
  }

  async fetchUTxOs(): Promise<UTxO[]> {
    return this._client.fetchUTxOs();
  }

  isTransactionConfirmed(hash: string): boolean {
    return this._confirmedTxs.has(hash);
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
