-- CreateTable
CREATE TABLE "Games" (
    "id" SERIAL NOT NULL,
    "createdBy" TEXT NOT NULL,
    "solutionHash" TEXT NOT NULL,
    "adaAmount" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "Games_pkey" PRIMARY KEY ("id")
);
