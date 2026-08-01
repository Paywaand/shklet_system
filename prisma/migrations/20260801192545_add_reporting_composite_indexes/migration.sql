-- CreateIndex
CREATE INDEX "Expense_branch_date_idx" ON "Expense"("branch", "date");

-- CreateIndex
CREATE INDEX "Order_branch_placedAt_idx" ON "Order"("branch", "placedAt");

-- CreateIndex
CREATE INDEX "Order_branchId_placedAt_idx" ON "Order"("branchId", "placedAt");
