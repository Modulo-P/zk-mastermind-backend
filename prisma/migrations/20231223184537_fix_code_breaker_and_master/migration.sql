/*
  Warnings:

  - You are about to drop the column `codeMaker` on the `Game` table. All the data in the column will be lost.
  - Added the required column `codeMaster` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "codeMaker",
ADD COLUMN     "codeMaster" TEXT NOT NULL,
ALTER COLUMN "codeBreaker" DROP NOT NULL;
