/*
  Warnings:

  - You are about to drop the `Games` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Games";

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "codeBreaker" TEXT NOT NULL,
    "codeMaker" TEXT,
    "solutionHash" TEXT NOT NULL,
    "adaAmount" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "currentTurn" INTEGER NOT NULL,
    "currentDatum" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_txHash_outputIndex_key" ON "Game"("txHash", "outputIndex");

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
