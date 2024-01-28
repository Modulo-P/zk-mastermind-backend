import { UTxO } from "@meshsdk/core";
import { TransactionOutput } from "../types/kupo";
import { MatchesToUTxOs } from "./utils";

export class KupoMatchesPub {
  private _kupoUrl: string;
  private _observers: MatchesObserver[] = [];
  private _checkTimer: NodeJS.Timeout | null = null;

  private _matches: TransactionOutput[] = [];
  private _utxos: UTxO[] = [];
  private _datums: Map<string, string> = new Map();

  constructor(kupoUrl: string) {
    this._kupoUrl = kupoUrl;
  }

  isRunning() {
    return this._checkTimer !== null;
  }

  start() {
    if (!this._checkTimer) {
      this._checkTimer = setInterval(this.checkMatches, 1000);
    }
  }

  stop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  clone() {
    const publisher = new KupoMatchesPub(this._kupoUrl);
    publisher._matches = this._matches;
    publisher._utxos = this._utxos;
    publisher._datums = this._datums;

    return publisher;
  }

  private checkMatches = async () => {
    try {
      const response = await fetch(`${this._kupoUrl}/matches`);
      const matches = await response.json();

      if (JSON.stringify(this._matches) !== JSON.stringify(matches)) {
        this._matches = matches;
        this._utxos = await MatchesToUTxOs(
          this._matches.filter((m) => !m.spent_at),
          this._datums
        );
        this.notify();
      }
    } catch (_) {}
  };

  subscribe(observer: MatchesObserver) {
    this._observers.push(observer);
  }

  unsubscribe(observer: MatchesObserver) {
    this._observers = this._observers.filter((o) => o !== observer);
  }

  private notify() {
    this._observers.forEach((observer) => observer.update(this.clone()));
  }

  getMatches() {
    return this._matches;
  }

  getUTxOs() {
    return this._utxos;
  }
}

export interface MatchesObserver {
  update(context: KupoMatchesPub): Promise<void>;
}
