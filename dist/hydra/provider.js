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
exports.HydraProvider = void 0;
class HydraProvider {
    constructor(manager) {
        this._manager = manager;
    }
    onTxConfirmed(txHash, callback, limit = 100) {
        let attempts = 0;
        const checkTx = setInterval(() => {
            if (attempts >= limit)
                clearInterval(checkTx);
            this.fetchTxInfo(txHash)
                .then((txInfo) => {
                this.fetchBlockInfo(txInfo.block)
                    .then((blockInfo) => {
                    if ((blockInfo === null || blockInfo === void 0 ? void 0 : blockInfo.confirmations) > 0) {
                        clearInterval(checkTx);
                        callback();
                    }
                })
                    .catch(() => {
                    attempts += 1;
                });
            })
                .catch(() => {
                attempts += 1;
            });
        }, 1000);
    }
    fetchAccountInfo(address) {
        throw new Error("Method not implemented.");
    }
    fetchAddressUTxOs(address, asset) {
        return __awaiter(this, void 0, void 0, function* () {
            let utxos = [];
            for (const utxo of this._manager.utxos) {
                if (utxo.output.address === address) {
                    if (asset && utxo.output.amount.some((a) => a.unit.startsWith(asset))) {
                        utxos.push(utxo);
                    }
                    else if (!asset) {
                        utxos.push(utxo);
                    }
                }
            }
            return utxos;
        });
    }
    fetchAssetAddresses(asset) {
        throw new Error("Method not implemented.");
    }
    fetchAssetMetadata(asset) {
        throw new Error("Method not implemented.");
    }
    fetchBlockInfo(hash) {
        throw new Error("Method not implemented.");
    }
    fetchCollectionAssets(policyId, cursor) {
        throw new Error("Method not implemented.");
    }
    fetchHandleAddress(handle) {
        throw new Error("Method not implemented.");
    }
    fetchProtocolParameters(epoch) {
        throw new Error("Method not implemented.");
    }
    fetchTxInfo(hash) {
        throw new Error("Method not implemented.");
    }
    fetchUTxOs(hash) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._manager.utxos.filter((utxo) => utxo.input.txHash === hash);
        });
    }
    submitTx(tx) {
        return this._manager.submitTx(tx);
    }
}
exports.HydraProvider = HydraProvider;
//# sourceMappingURL=provider.js.map