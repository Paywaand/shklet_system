-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "location" TEXT;

-- CreateIndex
CREATE INDEX "Order_branch_location_idx" ON "Order"("branch", "location");
