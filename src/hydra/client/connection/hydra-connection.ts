import { Observer, Publisher } from "../../../common/observer";
import {
  AutomatonBase,
  Event,
  EventSink,
  StateBase,
} from "../../../common/state-machine";
import { Connection } from "./connection";
import { WebSocket } from "ws";

export class HydraConnection
  extends AutomatonBase<Connection>
  implements Connection
{
  _websocket: WebSocket | undefined;

  constructor(wsUrl: string) {
    super();
    const idle = new IdleState(this, this, wsUrl);
    const connecting = new ConnectingState(this, this, wsUrl);
    const connected = new ConnectedState(this, this, wsUrl);

    this.addEdge(idle, new Event("CONNECT"), connecting);
    this.addEdge(connecting, new Event("CONNECTED"), connected);
    this.addEdge(connecting, new Event("ERROR"), connecting);
    this.addEdge(connecting, new Event("DISCONNECT"), idle);
    this.addEdge(connected, new Event("DISCONNECT"), idle);
    this.addEdge(connected, new Event("ERROR"), connecting);

    this._state = idle;
  }

  async connect() {
    this._state.connect();
  }
  async disconnect() {
    this._state.disconnect();
  }

  async onerror(error: Error) {
    this._state.onerror(error);
  }

  isOpen(): boolean {
    return this._state.isOpen();
  }

  send(data: string): void {
    this._state.send(data);
  }

  subscribe(observer: Observer<string>): void {
    this._state.subscribe(observer);
  }

  unsubcribe(observer: Observer<string>): void {
    this._state.unsubcribe(observer);
  }

  notify(data: string): void {
    this._state.notify(data);
  }
}

abstract class ConnectionStateBase
  extends Publisher<string>
  implements StateBase, Connection
{
  protected readonly _automaton: Connection;
  protected readonly _eventSink: EventSink;
  _websocket: WebSocket | undefined;
  private _wsUrl: string;
  private _name: string;

  constructor(
    automaton: Connection,
    eventSink: EventSink,
    name: string,
    wsUrl: string
  ) {
    super();
    this._automaton = automaton;
    this._eventSink = eventSink;
    this._wsUrl = wsUrl;
    this._name = name;
  }
  getName(): string {
    return this._name;
  }

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract onerror(error: Error): void;

  abstract isOpen(): boolean;

  abstract send(data: string): void;

  createWebSockets(): WebSocket {
    const ws = new WebSocket(this._wsUrl);
    return ws;
  }

  castEvent(event: Event): void {
    console.log(`castEvent: ${event.name}`);
    this._eventSink.castEvent(event);
  }
}

class IdleState extends ConnectionStateBase {
  constructor(automaton: Connection, eventSink: EventSink, wsUrl: string) {
    super(automaton, eventSink, "IDLE", wsUrl);
  }

  async connect() {
    this._automaton._websocket = this.createWebSockets();
    this.castEvent(new Event("CONNECT"));
    this._automaton._websocket.on("open", () => {
      this.castEvent(new Event("CONNECTED"));
    });
    this._automaton._websocket.on("message", (data) => {
      console.log(`Received message: ${data}`);
      this.notify(data.toString());
    });
    this._automaton._websocket.on("error", (error) => {
      console.log(`Received error: ${error}`);
    });
    this._automaton._websocket.on("close", (code) => {
      if (code === 1006) {
        this.castEvent(new Event("ERROR"));
        this._automaton.onerror(new Error("Connection closed unexpectedly"));
      }
    });
    this._automaton._websocket.on("ping", (data) => {
      console.log(`Received ping: ${data}`);
    });
  }

  async disconnect(): Promise<void> {
    if (
      this._automaton._websocket &&
      this._automaton._websocket.readyState === WebSocket.OPEN
    ) {
      this._automaton._websocket.close(1007);
    }
    this.castEvent(new Event("DISCONNECT"));
  }

  async onerror(_: Error) {
    throw new Error("Connection is Idle");
  }

  isOpen(): boolean {
    return false;
  }

  send(data: string): void {
    throw new Error("The websocket is not connected.");
  }
}

class ConnectingState extends ConnectionStateBase {
  constructor(automaton: Connection, eventSink: EventSink, wsUrl: string) {
    super(automaton, eventSink, "CONNECTING", wsUrl);
  }

  async connect() {
    throw new Error("The websocket is already connecting.");
  }

  async disconnect(): Promise<void> {
    this._automaton._websocket?.close();
  }

  async onerror(error: Error) {
    if (this._automaton._websocket) {
      this._automaton._websocket.terminate();
    }
    await setTimeout(() => {
      this._automaton._websocket = this.createWebSockets();
      this._automaton._websocket.on("open", () => {
        this.castEvent(new Event("CONNECTED"));
      });
      this._automaton._websocket.on("message", (data) => {
        console.log(`Received message: ${data}`);
        this.notify(data.toString());
      });
      this._automaton._websocket.on("error", (error) => {
        console.log(`Received error: ${error}`);
      });
      this._automaton._websocket.on("close", (code) => {
        if (code === 1006) {
          this.castEvent(new Event("ERROR"));
          this._automaton.onerror(new Error("Connection closed unexpectedly"));
        }
      });
      this._automaton._websocket.on("ping", (data) => {
        console.log(`Received ping: ${data}`);
      });
    }, 1000);
  }

  isOpen(): boolean {
    return false;
  }

  send(data: string): void {
    throw new Error("The websocket is not connected.");
  }
}

class ConnectedState extends ConnectionStateBase {
  constructor(automaton: Connection, eventSink: EventSink, wsUrl: string) {
    super(automaton, eventSink, "CONNECTED", wsUrl);
  }

  async connect() {
    throw new Error("The websocket is already connected.");
  }

  async disconnect(): Promise<void> {
    if (
      this._automaton._websocket &&
      this._automaton._websocket.readyState === WebSocket.OPEN
    ) {
      this._automaton._websocket.close(1007);
    }
    this.castEvent(new Event("DISCONNECT"));
  }

  async onerror(error: Error) {
    console.log(`Received error on connected: ${error}`);
  }

  isOpen(): boolean {
    return true;
  }

  send(data: string): void {
    this._automaton._websocket?.send(data);
  }
}
