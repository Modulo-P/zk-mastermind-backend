/*
  Warnings:

  - You are about to drop the column `createdBy` on the `Games` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[txHash,outputIndex]` on the table `Games` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `codeBreaker` to the `Games` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentDatum` to the `Games` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentTurn` to the `Games` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outputIndex` to the `Games` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Games_txHash_key";

-- AlterTable
ALTER TABLE "Games" DROP COLUMN "createdBy",
ADD COLUMN     "codeBreaker" TEXT NOT NULL,
ADD COLUMN     "codeMaker" TEXT,
ADD COLUMN     "currentDatum" TEXT NOT NULL,
ADD COLUMN     "currentTurn" INTEGER NOT NULL,
ADD COLUMN     "outputIndex" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Turn" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "guessSequence" JSONB NOT NULL,
    "blackPegs" INTEGER NOT NULL,
    "whitePegs" INTEGER NOT NULL,
    "datum" TEXT NOT NULL,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Games_txHash_outputIndex_key" ON "Games"("txHash", "outputIndex");
