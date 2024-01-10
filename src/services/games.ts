import { PrismaClient } from "prisma/prisma-client";
import { client } from "../db";

export async function findGameByTxHash(txHash: string, outputIndex: number) {
  const game = await client.game.findUnique({
    where: {
      txHash_outputIndex: {
        txHash,
        outputIndex,
      },
    },
  });
  return game;
}
