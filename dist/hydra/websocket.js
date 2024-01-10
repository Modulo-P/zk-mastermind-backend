"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydraWebsocketClient = void 0;
const ws_1 = require("ws");
const observer_1 = require("./observer");
class HydraWebsocketClient extends observer_1.HydraMessagePub {
    constructor() {
        super();
        this._hydraNodes = [];
        this._callbacks = [];
        this._isOpen = false;
        this._hydraNodes.push(new ws_1.WebSocket(`ws://${process.env.HYDRA_NODE_1_HOST}/?history=no&tx-output=cbor`));
        this._hydraNodes.push(new ws_1.WebSocket(`ws://${process.env.HYDRA_NODE_2_HOST}/?history=no&tx-output=cbor`));
        this._mainNode = this._hydraNodes[0];
        this._mainNode.on("open", () => {
            this._isOpen = true;
        });
        this._mainNode.on("close", () => {
            this._isOpen = false;
        });
        this._mainNode.on("message", (data) => {
            const dataJson = JSON.parse(data.toString());
            this.notify(dataJson);
        });
    }
    static getInstance() {
        return (HydraWebsocketClient._instance ||
            (HydraWebsocketClient._instance = new HydraWebsocketClient()));
    }
    isOpen() {
        return this._isOpen;
    }
    addCallback(callback) {
        this._callbacks.push(callback);
    }
    sendCommand(command, hydraNodeId = 0) {
        const commandJson = JSON.stringify(command);
        if (hydraNodeId === 0) {
            this._mainNode.send(commandJson);
        }
        else {
            this._hydraNodes[hydraNodeId].send(commandJson);
        }
    }
    notify(message) {
        this._observers.forEach((observer) => observer.update(message));
    }
}
exports.HydraWebsocketClient = HydraWebsocketClient;
//# sourceMappingURL=websocket.js.map