import { EventEmitter } from "stream";
import { HydraUTxO, HydraWebsocketPromise } from "../../types/hydra";
import { HydraConnection } from "./connection/hydra-connection";
import { UTxO, resolveTxHash } from "@meshsdk/core";
import { convertHydraToMeshUTxOs } from "../utils";
import { unwrapCBOR } from "../../common/blockchain";

export const HYDRA_STATUS = {
  IDLE: "IDLE",
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  INITIALIZING: "INITIALIZING",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  FANOUT_POSSIBLE: "FANOUT_POSSIBLE",
  FINAL: "FINAL",
} as const;

export type HydraStatus = (typeof HYDRA_STATUS)[keyof typeof HYDRA_STATUS];

export class HydraClient extends EventEmitter {
  private _connection: HydraConnection;
  private _promises: HydraWebsocketPromise[] = [];
  private _utxos: UTxO[] = [];
  private _status: HydraStatus = "DISCONNECTED";

  constructor(hydraUrl: string) {
    super();
    this._connection = new HydraConnection(hydraUrl);

    this._connection.on("close", (code) => {
      if (this._status !== "DISCONNECTED") {
        if (this._connection._status === "CONNECTING") {
          this._status = "CONNECTING";
        }
      }
      this.emit("close", code);
    });

    this._connection.on("message", this.processStatus.bind(this));
    this._connection.on("message", this.processUTxOS.bind(this));
    this._connection.on("message", this.processCommands.bind(this));
  }

  get hydraStatus(): HydraStatus {
    return this._status;
  }

  get utxos(): UTxO[] {
    return this._utxos;
  }

  async connect() {
    if (this._status !== "DISCONNECTED") {
      return;
    }

    this._status = "CONNECTING";

    this._connection.connect();
  }

  async processStatus(data: string) {
    const message = JSON.parse(data);
    function getStatus(data: any): HydraStatus | null {
      switch (data.tag) {
        case "Greetings":
          return (data.headStatus as string).toUpperCase() as HydraStatus;
        case "HeadIsInitializing":
          return "INITIALIZING";
        case "HeadIsOpen":
          return "OPEN";
        case "HeadIsClosed":
          return "CLOSED";
        case "ReadyToFanout":
          return "FANOUT_POSSIBLE";
        case "HeadIsFinalized":
          return "FINAL";
        default:
          return null;
      }
    }

    let status: HydraStatus | null = null;
    if ((status = getStatus(message)) && status !== null) {
      this._status = status;
      console.log("Head status: ", status);
    }
  }

  async processUTxOS(data: string) {
    const message = JSON.parse(data);

    switch (message.tag) {
      case "Greetings":
        if (message.snapshotUtxo) {
          this._utxos = await convertHydraToMeshUTxOs(
            message.snapshotUtxo as HydraUTxO
          );
        }
        break;
      case "HeadIsOpen":
        if (message.utxo) {
          this._utxos = await convertHydraToMeshUTxOs(
            message.utxo as HydraUTxO
          );
        }
        break;
      case "SnapshotConfirmed":
        const utxos = await convertHydraToMeshUTxOs(
          message.snapshot.utxo as HydraUTxO
        );
        this._utxos = utxos;

        if (
          message.snapshot.confirmedTransactions &&
          Array.isArray(message.snapshot.confirmedTransactions) &&
          message.snapshot.confirmedTransactions.length > 0
        ) {
          for (const hash of message.snapshot
            .confirmedTransactions as string[]) {
            this.emit("confirmedTransaction", hash);
          }
        }
        break;
    }
  }

  async processCommands(data: string) {
    const message = JSON.parse(data);

    const self = this;
    function resolvePromises(command: string, id?: string) {
      for (const promise of self._promises) {
        if (promise.id === id && promise.command.tag === command) {
          promise.resolve(id);
          self._promises.splice(self._promises.indexOf(promise), 1);
        }
      }
    }

    function rejectPromises(command: string, error: string, id?: string) {
      for (const promise of self._promises) {
        if (
          (promise.id === id || id === undefined) &&
          promise.command.tag === command
        ) {
          promise.reject(error);
          self._promises.splice(self._promises.indexOf(promise), 1);
        }
      }
    }

    switch (message.tag) {
      case "HeadIsInitializing":
        resolvePromises("Init");
        break;
      case "GetUTxOResponse":
        const utxosResponse = await convertHydraToMeshUTxOs(
          message.utxo as HydraUTxO
        );
        this._utxos = utxosResponse;
        resolvePromises("GetUTxO");
        break;
      case "TxValid":
        const txCborValid = unwrapCBOR(message.transaction);
        const txHash = resolveTxHash(txCborValid);
        this.emit("tx", txCborValid);
        resolvePromises("NewTx", txHash);
        break;
      case "TxInvalid":
        const txCborInvalid = unwrapCBOR(message.transaction);
        const txHashInvalid = resolveTxHash(txCborInvalid);
        rejectPromises("NewTx", message.validationError.reason, txHashInvalid);
        break;
      case "CommandFailed":
        rejectPromises(message.clientInput.tag, message);
        break;
    }
  }

  isOpen() {
    return this._connection.isOpen();
  }

  async fetchUTxOs(): Promise<UTxO[]> {
    const response = new Promise<UTxO[]>((resolve, reject) => {
      this._promises.push({
        command: { tag: "GetUTxO" },
        resolve,
        reject,
      });
    });

    this._connection.send(JSON.stringify({ tag: "GetUTxO" }));

    return response;
  }

  async submitTx(transaction: string): Promise<string> {
    const txHash = resolveTxHash(transaction);

    const response = new Promise<string>((resolve, reject) => {
      this._promises.push({
        command: { tag: "NewTx" },
        id: txHash,
        resolve: (result: any) => {
          resolve(result);
          this.emit("transaction", transaction);
        },
        reject,
      });
    });

    this._connection.send(JSON.stringify({ tag: "NewTx", transaction }));

    return response;
  }

  async init(contestationPeriod: number): Promise<string> {
    const response = new Promise<string>((resolve, reject) => {
      this._promises.push({
        command: { tag: "Init" },
        resolve,
        reject,
      });
    });

    this._connection.send(JSON.stringify({ tag: "Init", contestationPeriod }));

    return response;
  }
}
