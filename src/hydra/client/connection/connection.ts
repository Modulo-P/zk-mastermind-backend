import { WebSocket } from "ws";
import { Observer } from "../../../common/observer";

export interface Connection {
  _websocket: WebSocket | undefined;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onerror(error: Error): void;
  isOpen(): boolean;
  send(data: string): void;

  subscribe(observer: Observer<string>): void;
  unsubcribe(observer: Observer<string>): void;

  notify(data: string): void;
}
