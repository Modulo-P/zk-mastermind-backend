import { EventEmitter } from "stream";
import { HydraUTxO, HydraWebsocketPromise } from "../../types/hydra";
import { HydraConnection } from "./connection/hydra-connection";
import { UTxO, resolveTxHash } from "@meshsdk/core";
import { convertHydraToMeshUTxOs } from "../utils";

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
  private _hydraUrl: string;
  private _connection: HydraConnection;
  private _promises: HydraWebsocketPromise[] = [];
  private _utxos: UTxO[] = [];
  private _status: HydraStatus = "DISCONNECTED";

  constructor(hydraUrl: string) {
    super();
    this._hydraUrl = hydraUrl;
    this._connection = new HydraConnection(
      `ws://${hydraUrl}/?history=no&tx-output=cbor`
    );

    this._connection.on("message", this.processStatus);
  }

  get hydraStatus(): HydraStatus {
    return this._status;
  }

  get utxos(): UTxO[] {
    return this._utxos;
  }

  set utxos(utxos: UTxO[]) {
    this._utxos = utxos;
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
          this.utxos = await convertHydraToMeshUTxOs(
            message.snapshotUtxo as HydraUTxO
          );
        }
        break;
      case "HeadIsOpen":
        if (message.utxo) {
          this.utxos = await convertHydraToMeshUTxOs(
            message.utxo as HydraUTxO
          );
        }
      case "SnapshotConfirmed":
        const utxos = await convertHydraToMeshUTxOs(
          message.snapshot.utxo as HydraUTxO
        );
        this.utxos = utxos;
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
          self._promises.splice(
            self._promises.indexOf(promise),
            1
          );
        }
      }
    }

    function rejectPromises(command: string, error: string, id?: string) {
      for (const promise of self._promises) {
        if ((promise.id === id || id === undefined) && promise.command.tag === command) {
          promise.reject(error);
          self._promises.splice(
            self._promises.indexOf(promise),
            1
          );
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
        const txCborValid = message.transaction.slice(6);
        const txHash = resolveTxHash(txCborValid);
        this.emit("tx", txCborValid);
        resolvePromises("NewTx", txHash);
        break;
      case "TxInvalid":
        const txCborInvalid = message.transaction.slice(6);
        const txHashInvalid = resolveTxHash(txCborInvalid);
        rejectPromises("NewTx", message.validationError.reason, txHashInvalid);
        break;
      case "CommandFailed":
        rejectPromises(message.clientInput.tag, message);
        break;
    }
  }
}