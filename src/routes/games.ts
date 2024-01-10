import express, { Router } from "express";
import { createGame, getGames, updateGame } from "../controllers/games";
import { createTurn } from "../controllers/games/turns";

const router: Router = express.Router();

router.post("/games", createGame);

router.patch("/games", updateGame);

router.get("/games", getGames);

router.post("/games/turns", createTurn);

export default router;
