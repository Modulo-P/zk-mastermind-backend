import { HydraEngine } from "./engine";

export abstract class HydraMessagePub {
  protected _observers: HydraMessageObserver[] = [];

  public subscribe(observer: HydraMessageObserver) {
    this._observers.push(observer);
  }

  unsubcribe(observer: HydraMessageObserver) {
    this._observers.filter((o) => o !== observer);
  }

  abstract notify(message: any): void;
}

export abstract class HydraMessageObserver {
  protected _hydraEngine: HydraEngine;

  constructor(hydraEngine: HydraEngine) {
    this._hydraEngine = hydraEngine;
  }

  abstract update(message: any): void;
}

export abstract class HydraTxObserver {
  protected _hydraEngine: HydraEngine;

  constructor(hydraEngine: HydraEngine) {
    this._hydraEngine = hydraEngine;
  }

  abstract update(transaction: any): void;
}
