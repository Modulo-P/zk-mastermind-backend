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
exports.createTurn = void 0;
const db_1 = require("../../db");
function createTurn(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = req.body;
            const game = yield db_1.client.game.findUnique({
                where: {
                    id: Number(data.gameId),
                },
            });
            if (!game) {
                return res.status(404).json({
                    message: "Game not found",
                });
            }
            const turn = yield db_1.client.turn.create({
                data: {
                    blackPegs: data.blackPegs,
                    whitePegs: data.whitePegs,
                    datum: data.datum,
                    player: data.player,
                    guessSequence: data.guessSequence,
                    turnNumber: data.turnNumber,
                    gameId: game.id,
                    txHash: data.txHash,
                    outputIndex: data.outputIndex,
                },
            });
            if (turn.turnNumber === 1) {
                game.codeBreaker = data.codeBreaker;
                game.state = "STARTED";
            }
            game.currentTurn = turn.turnNumber;
            game.currentDatum = turn.datum;
            game.txHash = turn.txHash;
            game.outputIndex = turn.outputIndex;
            yield db_1.client.game.update({ data: game, where: { id: game.id } });
            res.status(200).json({
                message: "Turn created",
            });
        }
        catch (error) {
            console.log(error);
            res.status(500).json({
                message: "Internal server error",
            });
        }
    });
}
exports.createTurn = createTurn;
//# sourceMappingURL=turns.js.map