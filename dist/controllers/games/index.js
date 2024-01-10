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
exports.getGames = exports.updateGame = exports.createGame = void 0;
const games_1 = require("../../services/games");
const db_1 = require("../../db");
function createGame(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = req.body;
            if (yield (0, games_1.findGameByTxHash)(data.txHash, data.outputIndex)) {
                return res.status(400).json({ message: "Game already exists" });
            }
            const game = yield db_1.client.game.create({
                data: {
                    codeMaster: data.codeMaster,
                    adaAmount: data.adaAmount,
                    solutionHash: data.solutionHash,
                    txHash: data.txHash,
                    outputIndex: data.outputIndex,
                    state: "CREATED",
                    currentTurn: 0,
                    currentDatum: data.currentDatum,
                },
            });
            const turn = yield db_1.client.turn.create({
                data: {
                    blackPegs: 0,
                    whitePegs: 0,
                    datum: data.currentDatum,
                    player: "CODEMASTER",
                    guessSequence: [],
                    turnNumber: 0,
                    gameId: game.id,
                    txHash: data.txHash,
                    outputIndex: data.outputIndex,
                },
            });
            res.status(200).json({ message: "Game created" });
        }
        catch (error) {
            console.log(error);
            res.status(500).json({ message: "Internal server error" });
        }
    });
}
exports.createGame = createGame;
function updateGame(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = req.body;
            yield db_1.client.game.update({
                data: {
                    codeMaster: data.codeMaster,
                    adaAmount: data.adaAmount,
                    solutionHash: data.solutionHash,
                    txHash: data.txHash,
                    outputIndex: data.outputIndex,
                    state: data.state,
                    currentTurn: data.currentTurn,
                    currentDatum: data.currentDatum,
                },
                where: {
                    id: Number(data.id),
                },
            });
            res.status(200).json({ message: "Game updated" });
        }
        catch (error) {
            console.log(error);
            res.status(500).json({ message: "Internal server error" });
        }
    });
}
exports.updateGame = updateGame;
function getGames(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.query.id) {
            const game = yield db_1.client.game.findUnique({
                where: {
                    id: Number(req.query.id),
                },
                include: { turns: true },
            });
            if (!game) {
                return res.status(404).json({ message: "Game not found" });
            }
            return res.send(game);
        }
        return res.send(yield db_1.client.game.findMany());
    });
}
exports.getGames = getGames;
//# sourceMappingURL=index.js.map