/*
  Warnings:

  - You are about to alter the column `expirationTime` on the `Game` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to alter the column `expirationTime` on the `Turn` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "expirationTime" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Turn" ALTER COLUMN "expirationTime" SET DATA TYPE INTEGER;
