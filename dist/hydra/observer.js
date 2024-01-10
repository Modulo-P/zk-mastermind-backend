"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydraTxObserver = exports.HydraMessageObserver = exports.HydraMessagePub = void 0;
class HydraMessagePub {
    constructor() {
        this._observers = [];
    }
    subscribe(observer) {
        this._observers.push(observer);
    }
    unsubcribe(observer) {
        this._observers.filter((o) => o !== observer);
    }
}
exports.HydraMessagePub = HydraMessagePub;
class HydraMessageObserver {
    constructor(hydraEngine) {
        this._hydraEngine = hydraEngine;
    }
}
exports.HydraMessageObserver = HydraMessageObserver;
class HydraTxObserver {
    constructor(hydraEngine) {
        this._hydraEngine = hydraEngine;
    }
}
exports.HydraTxObserver = HydraTxObserver;
//# sourceMappingURL=observer.js.map