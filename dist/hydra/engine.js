"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydraEngine = void 0;
const CSL = __importStar(require("@emurgo/cardano-serialization-lib-nodejs"));
const core_1 = require("@meshsdk/core");
const axios_1 = __importStar(require("axios"));
const blake2_1 = __importDefault(require("blake2"));
const cbor_1 = __importDefault(require("cbor"));
const prisma_client_1 = require("prisma/prisma-client");
const observer_js_1 = require("./observer.js");
const utils_js_1 = require("./utils.js");
const websocket_js_1 = require("./websocket.js");
class HydraEngine {
    constructor() {
        this.ws = websocket_js_1.HydraWebsocketClient.getInstance();
        this.promises = [];
        this.status = "NotStarted";
        this.utxos = [];
        this.txPub = new HyrdaTxPub();
        this._cardanoProvider = new core_1.BlockfrostProvider(process.env.BLOCKFROST_PROJECT_ID);
        this.ws.subscribe(new HydraUTxOsObserver(this));
        this.ws.subscribe(new HydraStatusObserver(this));
        this.ws.subscribe(new HydraErrorObserver(this));
        this.ws.subscribe(new HyrdaNewTxObserver(this));
    }
    static getInstance() {
        return this._instance || (this._instance = new HydraEngine());
    }
    start() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            while (!this.ws.isOpen()) {
                yield new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (["NotStarted", "Idle", "Final", "Initializing"].includes(this.status)) {
                const response = new Promise((resolve, reject) => {
                    this.promises.push({
                        command: { tag: "Init" },
                        resolve,
                        reject,
                    });
                });
                this.ws.sendCommand({ tag: "Init", contestationPeriod: 120 });
                try {
                    yield response;
                }
                catch (e) {
                    if (this.status !== "Initializing") {
                        console.error(e);
                        throw e;
                    }
                    else {
                        console.log("Head is already initializing");
                    }
                }
                const privateKey = CSL.PrivateKey.from_hex(process.env.FUNDS_WALLET_PRIVATE_KEY);
                const publicKey = privateKey.to_public();
                const address = CSL.EnterpriseAddress.new(0, CSL.StakeCredential.from_keyhash(publicKey.hash()));
                console.log("Funds address: ", address.to_address().to_bech32());
                const utxos = yield this._cardanoProvider.fetchAddressUTxOs(address.to_address().to_bech32());
                let commitTxUTxOs = {};
                if (utxos.length > 0) {
                    commitTxUTxOs = this.transformUTxO(utxos[0]);
                }
                else {
                    throw new Error("No UTxOs found");
                }
                console.log("UTXOS: ", JSON.stringify(commitTxUTxOs, null, 2));
                try {
                    let commitTx = (yield axios_1.default.post(`http://${process.env.HYDRA_NODE_1_HOST}/commit`, commitTxUTxOs)).data;
                    const tx = CSL.Transaction.from_hex(commitTx.cborHex);
                    const txJS = cbor_1.default.decode(Buffer.from(commitTx.cborHex, "hex"));
                    const txBodyCbor = cbor_1.default.encode(txJS[0]).toString("hex");
                    const h = blake2_1.default.createHash("blake2b", { digestLength: 32 });
                    h.update(Buffer.from(txBodyCbor, "hex"));
                    const hash = h.digest("hex");
                    const witnesses = tx.witness_set();
                    const vkeyWitnesses = witnesses.vkeys();
                    const vkeyWitness = CSL.make_vkey_witness(CSL.TransactionHash.from_hex(hash), privateKey);
                    vkeyWitnesses.add(vkeyWitness);
                    witnesses.set_vkeys(vkeyWitnesses);
                    const signedTx = commitTx.cborHex.replace(tx.witness_set().to_hex(), witnesses.to_hex());
                    let txHash = yield this._cardanoProvider.submitTx(signedTx);
                    console.log("Tx hash: ", txHash);
                    commitTx = (yield axios_1.default.post(`http://${process.env.HYDRA_NODE_2_HOST}/commit`, {})).data;
                    txHash = yield this._cardanoProvider.submitTx(commitTx.cborHex);
                    console.log("Tx hash: ", txHash);
                }
                catch (e) {
                    if (e instanceof axios_1.AxiosError) {
                        console.log("Error: ", (_a = e.response) === null || _a === void 0 ? void 0 : _a.data);
                    }
                    else {
                        console.log("Error: ", e);
                    }
                }
            }
        });
    }
    submitTx(transaction) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = new Promise((resolve, reject) => {
                const txHash = (0, core_1.resolveTxHash)(transaction);
                this.promises.push({
                    command: { tag: "NewTx" },
                    id: txHash,
                    resolve,
                    reject,
                });
            });
            this.ws.sendCommand({ tag: "NewTx", transaction });
            return response;
        });
    }
    transformUTxO(utxo) {
        const value = { lovelace: 0 };
        utxo.output.amount.forEach((amount) => {
            if (amount.unit === "lovelace") {
                value.lovelace = Number(amount.quantity);
            }
            else {
                const policyId = amount.unit.substring(0, 56);
                const assetId = amount.unit.substring(56);
                if (!value[policyId]) {
                    value[policyId] = { [assetId]: Number(amount.quantity) };
                }
                else {
                    if (typeof value[policyId] === "object") {
                        const policyIdObj = value[policyId];
                        policyIdObj[assetId] = Number(amount.quantity);
                    }
                }
            }
        });
        return {
            [utxo.input.txHash + "#" + utxo.input.outputIndex]: {
                address: utxo.output.address,
                value,
            },
        };
    }
}
exports.HydraEngine = HydraEngine;
function saveUTxOs(utxos) {
    const client = new prisma_client_1.PrismaClient();
    utxos.forEach((utxo) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        client.uTxO.create({
            data: {
                txHash: utxo.input.txHash,
                outputIndex: utxo.input.outputIndex,
                address: utxo.output.address,
                amount: utxo.output.amount,
                dataHash: (_a = utxo.output.dataHash) !== null && _a !== void 0 ? _a : null,
                plutusData: (_b = utxo.output.plutusData) !== null && _b !== void 0 ? _b : null,
                scriptRef: (_c = utxo.output.scriptRef) !== null && _c !== void 0 ? _c : null,
                scriptHash: (_d = utxo.output.scriptHash) !== null && _d !== void 0 ? _d : null,
            },
        });
    }));
}
class HydraUTxOsObserver extends observer_js_1.HydraMessageObserver {
    update(message) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (message.tag) {
                case "Greetings":
                    if (message.snapshotUtxo) {
                        this._hydraEngine.utxos = yield (0, utils_js_1.convertHydraToMeshUTxOs)(message.snapshotUtxo);
                    }
                    break;
                case "HeadIsOpen":
                    if (message.utxo) {
                        this._hydraEngine.utxos = yield (0, utils_js_1.convertHydraToMeshUTxOs)(message.utxo);
                    }
                case "SnapshotConfirmed":
                    const utxos = yield (0, utils_js_1.convertHydraToMeshUTxOs)(message.snapshot.utxo);
                    saveUTxOs(utxos);
                    this._hydraEngine.utxos = utxos;
                    break;
            }
        });
    }
}
class HydraStatusObserver extends observer_js_1.HydraMessageObserver {
    update(message) {
        let status;
        if ((status = this.getStatus(message))) {
            this._hydraEngine.status = status;
            console.log("Head status: ", status);
        }
        if (message.tag === "HeadIsInitializing") {
            this._hydraEngine.promises.forEach((p) => {
                if (p.command.tag === "Init") {
                    p.resolve();
                    this._hydraEngine.promises.splice(this._hydraEngine.promises.indexOf(p), 1);
                }
            });
        }
        if (message.tag === "HeadIsAborted") {
            this._hydraEngine.start();
        }
    }
    getStatus(data) {
        switch (data.tag) {
            case "Greetings":
                return data.headStatus;
            case "HeadIsInitializing":
                return "Initializing";
            case "HeadIsOpen":
                return "Open";
            case "HeadIsClosed":
                return "Closed";
            case "ReadyToFanout":
                return "FanoutPossible";
            case "HeadIsFinalized":
                return "Final";
            default:
                return null;
        }
    }
}
class HydraErrorObserver extends observer_js_1.HydraMessageObserver {
    update(message) {
        if (message.tag === "CommandFailed") {
            this._hydraEngine.promises.forEach((p) => {
                if (p.command.tag === message.clientInput.tag) {
                    p.reject(message);
                    this._hydraEngine.promises.splice(this._hydraEngine.promises.indexOf(p), 1);
                }
            });
        }
    }
}
class HyrdaNewTxObserver extends observer_js_1.HydraMessageObserver {
    update(message) {
        switch (message.tag) {
            case "TxValid":
                const txCborValid = message.transaction.slice(6);
                const txHash = (0, core_1.resolveTxHash)(txCborValid);
                this._hydraEngine.txPub.notify(txCborValid);
                for (const promise of this._hydraEngine.promises) {
                    if (promise.id === txHash && promise.command.tag === "NewTx") {
                        promise.resolve(txHash);
                        this._hydraEngine.promises.splice(this._hydraEngine.promises.indexOf(promise), 1);
                    }
                }
                break;
            case "TxInvalid":
                const txCborInvalid = message.transaction.slice(6);
                const txHashInvalid = (0, core_1.resolveTxHash)(txCborInvalid);
                for (const promise of this._hydraEngine.promises) {
                    if (promise.id === txHashInvalid && promise.command.tag === "NewTx") {
                        promise.reject(message.validationError.reason);
                        this._hydraEngine.promises.splice(this._hydraEngine.promises.indexOf(promise), 1);
                    }
                }
                break;
        }
    }
}
class HyrdaTxPub {
    constructor() {
        this._observers = [];
    }
    subscribe(observer) {
        this._observers.push(observer);
    }
    unsubcribe(observer) {
        this._observers.filter((o) => o !== observer);
    }
    notify(transaction) {
        this._observers.forEach((observer) => observer.update(transaction));
    }
}
//# sourceMappingURL=engine.js.map