-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "shortId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'cash';

-- AlterTable
ALTER TABLE "MoneyLedgerEntry" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountPct" INTEGER;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "loyaltyCount" INTEGER NOT NULL DEFAULT 0,
    "discountPct" INTEGER,
    "discountNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyRedemption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "staffId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueAdjustment" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyRedemption_orderId_key" ON "LoyaltyRedemption"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_customerId_idx" ON "LoyaltyRedemption"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_branch_idx" ON "LoyaltyRedemption"("branch");

-- CreateIndex
CREATE INDEX "RevenueAdjustment_branch_date_idx" ON "RevenueAdjustment"("branch", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_shortId_key" ON "DeliveryOrder"("shortId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_deletedAt_idx" ON "DeliveryOrder"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyLedgerEntry_expenseId_key" ON "MoneyLedgerEntry"("expenseId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyLedgerEntry" ADD CONSTRAINT "MoneyLedgerEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueAdjustment" ADD CONSTRAINT "RevenueAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

