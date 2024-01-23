import { WebSocket } from "ws";
import { HydraMessagePub } from "./observer";

export class HydraWebsocketClient extends HydraMessagePub {
  private static _instance: HydraWebsocketClient;
  private _hydraNodes: WebSocket[] = [];
  private _mainNode: WebSocket;
  private _callbacks: Array<(message: any) => void> = [];
  private _isOpen: boolean = false;

  private constructor() {
    super();
    this._hydraNodes.push(
      new WebSocket(
        `ws://${process.env.HYDRA_NODE_1_HOST}/?history=no&tx-output=cbor`
      )
    );
    this._hydraNodes.push(
      new WebSocket(
        `ws://${process.env.HYDRA_NODE_2_HOST}/?history=no&tx-output=cbor`
      )
    );

    this._mainNode = this._hydraNodes[0];
    this._mainNode.on("open", () => {
      this._isOpen = true;
    });
    this._mainNode.on("close", () => {
      console.log("Connection closed");
      this._isOpen = false;
    });
    this._mainNode.on("message", (data) => {
      const dataJson = JSON.parse(data.toString());
      this.notify(dataJson);
    });

    this._hydraNodes.forEach((node) => {
      node.on("error", console.log);
    });
  }

  public static getInstance() {
    return (
      HydraWebsocketClient._instance ||
      (HydraWebsocketClient._instance = new HydraWebsocketClient())
    );
  }

  public isOpen() {
    return this._isOpen;
  }

  public addCallback(callback: (message: any) => void) {
    this._callbacks.push(callback);
  }

  public sendCommand(command: any, hydraNodeId: number = 0) {
    const commandJson = JSON.stringify(command);
    if (hydraNodeId === 0) {
      this._mainNode.send(commandJson);
    } else {
      this._hydraNodes[hydraNodeId].send(commandJson);
    }
  }

  notify(message: any): void {
    this._observers.forEach((observer) => observer.update(message));
  }
}
