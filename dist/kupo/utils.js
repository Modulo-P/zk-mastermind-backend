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
exports.MatchesToUTxOs = void 0;
function MatchesToUTxOs(matches, datums) {
    return Promise.all(matches.map((match) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const assets = [];
        assets.push({
            unit: "lovelace",
            quantity: match.value.coins.toString(),
        });
        for (const asset in match.value.assets) {
            assets.push({
                unit: asset,
                quantity: match.value.assets[asset].toString(),
            });
        }
        let plutusData = undefined;
        if (match.datum_type === "inline" && match.datum_hash) {
            plutusData = datums.get(match.datum_hash);
            if (!plutusData) {
                const datumResponse = yield fetch("http://192.168.64.4:1442/datums/" + match.datum_hash);
                plutusData = (yield datumResponse.json()).datum;
                datums.set(match.datum_hash, plutusData);
            }
        }
        return {
            input: {
                txHash: match.transaction_id,
                outputIndex: match.output_index,
            },
            output: {
                address: match.address,
                amount: assets,
                dataHash: (_a = match.datum_hash) !== null && _a !== void 0 ? _a : undefined,
                plutusData: plutusData !== null && plutusData !== void 0 ? plutusData : undefined,
            },
        };
    })));
}
exports.MatchesToUTxOs = MatchesToUTxOs;
//# sourceMappingURL=utils.js.map