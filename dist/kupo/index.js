"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KupoMatchesPub = void 0;
const utils_1 = require("./utils");
class KupoMatchesPub {
    constructor(kupoUrl) {
        this._observers = [];
        this._checkTimer = null;
        this._matches = [];
        this._utxos = [];
        this._datums = new Map();
        this.checkMatches = () => __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${this._kupoUrl}/matches`);
            const matches = yield response.json();
            if (JSON.stringify(this._matches) !== JSON.stringify(matches)) {
                this._matches = matches;
                this._utxos = yield (0, utils_1.MatchesToUTxOs)(this._matches.filter((m) => !m.spent_at), this._datums);
                this.notify();
            }
        });
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
    subscribe(observer) {
        this._observers.push(observer);
    }
    unsubscribe(observer) {
        this._observers = this._observers.filter((o) => o !== observer);
    }
    notify() {
        this._observers.forEach((observer) => observer.update(this.clone()));
    }
    getMatches() {
        return this._matches;
    }
    getUTxOs() {
        return this._utxos;
    }
}
exports.KupoMatchesPub = KupoMatchesPub;
//# sourceMappingURL=index.js.map