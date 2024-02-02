import { EventEmitter } from "stream";
import { WebSocket } from "ws";

export const CONNECTION_STATUS = {
  IDLE: "IDLE",
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
} as const;

export type ConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

export class HydraConnection extends EventEmitter {
  _websocket: WebSocket | undefined;
  _status: ConnectionStatus = "DISCONNECTED";
  _wsUrl: string;

  constructor(wsUrl: string) {
    super();
    this._wsUrl = wsUrl;
  }

  async connect() {

    if (this._status !== "IDLE") {
      return;
    }

    this._websocket = this.createWebSockets();
    this._status = "CONNECTING";

    this._websocket.on("open", () => {
      this._status = "CONNECTED";
    });

    this._websocket.on("message", (data) => {
      console.log(`Received message: ${data}`);
      this.emit("message", data);
    });

    this._websocket.on("error", (error) => {
      console.log(`Received error: ${error}`);
    });

    this._websocket.on("close", (code) => {
      if (code === 1006) {
        this.onerror(new Error("Connection closed unexpectedly"));
      }
    });

    this._websocket.on("ping", (data) => {
      console.log(`Received ping: ${data}`);
    });
  }

  async disconnect() {
    if (this._status === "IDLE") {
      return;
    }

    if (
      this._websocket &&
      this._websocket.readyState === WebSocket.OPEN
    ) {
      this._websocket.close(1007);
    }
    this._status = "IDLE";
  }

  async onerror(error: Error) {
    if (this._status === "IDLE") {
      return;
    }

    if (this._status === "CONNECTED") {
      this._status = "CONNECTING";
    }

    console.log(`Error: ${error}`);

    await setTimeout(() => {
      this._websocket = this.createWebSockets();
      this._websocket.on("open", () => {
        this._status = "CONNECTED";
      });
      this._websocket.on("message", (data) => {
        console.log(`Received message: ${data}`);
        this.emit("message", data);
      });
      this._websocket.on("error", (error) => {
        console.log(`Received error: ${error}`);
      });
      this._websocket.on("close", (code) => {
        if (code === 1006) {
          this.onerror(new Error("Connection closed unexpectedly"));
        }
      });
      this._websocket.on("ping", (data) => {
        console.log(`Received ping: ${data}`);
      });
    }, 1000);
  }

  isOpen(): boolean {
    return this._status === "CONNECTED";
  }

  send(data: string): void {
    if (this._status === "CONNECTED") {
      this._websocket?.send(data);
    }
  }

  createWebSockets(): WebSocket {
    const ws = new WebSocket(this._wsUrl);
    return ws;
  }
}