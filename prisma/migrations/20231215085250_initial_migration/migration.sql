-- CreateTable
CREATE TABLE "UTxO" (
    "id" SERIAL NOT NULL,
    "txHash" TEXT NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "amount" JSONB NOT NULL,
    "dataHash" TEXT,
    "plutusData" TEXT,
    "scriptRef" TEXT,
    "scriptHash" TEXT,

    CONSTRAINT "UTxO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeOperation" (
    "id" SERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originTxHash" TEXT NOT NULL,
    "originOutputIndex" INTEGER NOT NULL,
    "amount" JSONB NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationTxHash" TEXT NOT NULL,
    "destinationOutputIndex" INTEGER NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "BridgeOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UTxO_txHash_outputIndex_key" ON "UTxO"("txHash", "outputIndex");
