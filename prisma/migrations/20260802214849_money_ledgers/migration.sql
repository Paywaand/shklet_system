-- CreateTable
CREATE TABLE "MoneyLedgerBaseline" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "baselineAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyLedgerBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyLedgerEntry" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyLedgerBaseline_branch_bucket_key" ON "MoneyLedgerBaseline"("branch", "bucket");

-- CreateIndex
CREATE INDEX "MoneyLedgerEntry_branch_bucket_idx" ON "MoneyLedgerEntry"("branch", "bucket");

-- CreateIndex
CREATE INDEX "MoneyLedgerEntry_date_idx" ON "MoneyLedgerEntry"("date");

-- AddForeignKey
ALTER TABLE "MoneyLedgerEntry" ADD CONSTRAINT "MoneyLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
