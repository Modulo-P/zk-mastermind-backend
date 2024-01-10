"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const games_1 = require("../controllers/games");
const turns_1 = require("../controllers/games/turns");
const router = express_1.default.Router();
router.post("/games", games_1.createGame);
router.patch("/games", games_1.updateGame);
router.get("/games", games_1.getGames);
router.post("/games/turns", turns_1.createTurn);
exports.default = router;
//# sourceMappingURL=games.js.map