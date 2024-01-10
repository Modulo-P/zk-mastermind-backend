/*
  Warnings:

  - Added the required column `outputIndex` to the `Turn` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txHash` to the `Turn` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "outputIndex" INTEGER NOT NULL,
ADD COLUMN     "txHash" TEXT NOT NULL;
