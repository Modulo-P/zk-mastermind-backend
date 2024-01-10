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
exports.findGameByTxHash = void 0;
const db_1 = require("../db");
function findGameByTxHash(txHash, outputIndex) {
    return __awaiter(this, void 0, void 0, function* () {
        const game = yield db_1.client.game.findUnique({
            where: {
                txHash_outputIndex: {
                    txHash,
                    outputIndex,
                },
            },
        });
        return game;
    });
}
exports.findGameByTxHash = findGameByTxHash;
//# sourceMappingURL=games.js.map