/*
  Warnings:

  - A unique constraint covering the columns `[txHash]` on the table `Games` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Games_txHash_key" ON "Games"("txHash");
