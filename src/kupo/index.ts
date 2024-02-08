import { UTxO } from "@meshsdk/core";
import { TransactionOutput } from "../types/kupo";
import { MatchesToUTxOs } from "./utils";
import { EventEmitter } from "stream";

export class KupoClient extends EventEmitter {
  private _kupoUrl: string;
  private _checkTimer: NodeJS.Timeout | null = null;

  private _matches: TransactionOutput[] = [];
  private _utxos: UTxO[] = [];
  private _datums: Map<string, string> = new Map();

  constructor(kupoUrl: string) {
    super();
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
        this.emit("matches", this._matches);
        this.emit("utxos", this._utxos);
      }
    } catch (_) {}
  };

  getMatches() {
    return this._matches;
  }

  getUTxOs() {
    return this._utxos;
  }
}
