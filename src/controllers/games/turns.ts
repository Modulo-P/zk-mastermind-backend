import { Request, Response } from "express";
import { client } from "../../db";
import { Turn } from "../../types/game";

export async function createTurn(req: Request, res: Response) {
  try {
    const data = req.body;
    const game = await client.game.findUnique({
      where: {
        id: Number(data.gameId),
      },
    });
    if (!game) {
      return res.status(404).json({
        message: "Game not found",
      });
    }

    const turn = await client.turn.create({
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

    await client.game.update({ data: game, where: { id: game.id } });

    res.status(200).json({
      message: "Turn created",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
}
