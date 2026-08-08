-- DropIndex
DROP INDEX "RevenueAdjustment_branch_date_idx";

-- AlterTable
ALTER TABLE "RevenueAdjustment" ADD COLUMN     "bucket" TEXT NOT NULL DEFAULT 'total';

-- CreateIndex
CREATE INDEX "RevenueAdjustment_branch_bucket_date_idx" ON "RevenueAdjustment"("branch", "bucket", "date");

