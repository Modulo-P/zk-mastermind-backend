import { Request, Response } from "express";
import { PrismaClient } from "prisma/prisma-client";
import { findGameByTxHash } from "../../services/games";
import { client } from "../../db";

export async function createGame(req: Request, res: Response) {
  try {
    const data = req.body;

    if (await findGameByTxHash(data.txHash, data.outputIndex)) {
      return res.status(400).json({ message: "Game already exists" });
    }

    const game = await client.game.create({
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

    const turn = await client.turn.create({
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGame(req: Request, res: Response) {
  try {
    const data = req.body;

    await client.game.update({
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getGames(req: Request, res: Response) {
  if (req.query.id) {
    const game = await client.game.findUnique({
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

  return res.send(await client.game.findMany());
}
