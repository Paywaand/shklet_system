-- CreateTable
CREATE TABLE "CashSettings" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "baselineAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSettings_branch_key" ON "CashSettings"("branch");

