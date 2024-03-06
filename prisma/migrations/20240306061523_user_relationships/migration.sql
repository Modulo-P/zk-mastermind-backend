/*
  Warnings:

  - You are about to drop the column `codeBreaker` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `codeMaster` on the `Game` table. All the data in the column will be lost.
  - Added the required column `codeMasterAddress` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Turn" DROP CONSTRAINT "Turn_gameId_fkey";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "codeBreaker",
DROP COLUMN "codeMaster",
ADD COLUMN     "codeBreakerAddress" TEXT,
ADD COLUMN     "codeMasterAddress" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_codeMasterAddress_fkey" FOREIGN KEY ("codeMasterAddress") REFERENCES "User"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_codeBreakerAddress_fkey" FOREIGN KEY ("codeBreakerAddress") REFERENCES "User"("address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
