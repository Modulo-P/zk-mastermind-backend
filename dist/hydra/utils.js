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
exports.convertHydraToMeshUTxOs = void 0;
function convertHydraToMeshUTxOs(utxo) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const keys = Object.getOwnPropertyNames(utxo);
        const result = [];
        for (const key of keys) {
            const value = utxo[key];
            result.push({
                input: {
                    txHash: key.split("#")[0],
                    outputIndex: Number(key.split("#")[1]),
                },
                output: {
                    address: value.address,
                    dataHash: value.datumhash === null ? undefined : value.datumhash,
                    plutusData: (_a = value.inlineDatum) !== null && _a !== void 0 ? _a : undefined,
                    scriptRef: value.referenceScript === null ? undefined : value.referenceScript,
                    amount: Object.getOwnPropertyNames(value.value).flatMap((k) => {
                        if (k === "lovelace") {
                            return {
                                unit: k,
                                quantity: value.value[k].toString(),
                            };
                        }
                        else {
                            return Object.getOwnPropertyNames(value.value[k]).map((kk) => {
                                return {
                                    unit: k + kk,
                                    quantity: value.value[k][kk].toString(),
                                };
                            });
                        }
                    }),
                },
            });
        }
        return result;
    });
}
exports.convertHydraToMeshUTxOs = convertHydraToMeshUTxOs;
//# sourceMappingURL=utils.js.map