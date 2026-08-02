// Shared "Expected Cash on Hand" computation — the Sales page card, the admin
// Dashboard, and (eventually) anywhere else that needs this figure must all
// agree to the last dinar, so the math lives in exactly one place.
//
//   Expected = cash sales in range − expenses in range − safe money − manager withdrawals
// where safe money = all safe deposits − safe-sourced expenses in range.
// This mirrors the admin Cash Tracking model so the figure equals "what the
// manager currently holds".
import { prisma } from "./prisma";
import { getCashBaseline, clampToBaseline } from "./cashSettings";

export type ExpectedCashResult = {
  cashSales: number;
  expenses: number;
  safeMoney: number;
  cashAdjustments: number;
  expectedCashOnHand: number;
  // The range actually applied, AFTER clamping to the cash baseline — callers
  // that report "as of" a period must use this, not their own unclamped input.
  range: { gte?: Date; lte?: Date };
};

export async function computeExpectedCashOnHand(
  branch: string,
  range: { gte?: Date; lte?: Date },
  eventId?: string | null
): Promise<ExpectedCashResult> {
  const baseline = await getCashBaseline(branch);
  const gte = clampToBaseline(range.gte, baseline);
  const { lte } = range;

  const [cashOrders, expensesBySource, safeEntries, managerWithdrawn, cashAdjustments] =
    await Promise.all([
      // Delivery platforms excluded (separate table). Cancelled orders never
      // took money and must not count as sales.
      prisma.order.aggregate({
        where: {
          branch,
          paymentMethod: "cash",
          placedAt: { gte, lte },
          status: { not: "cancelled" },
          ...(eventId !== undefined ? { eventId } : {}),
        },
        _sum: { total: true },
      }),
      prisma.expense.groupBy({
        by: ["source"],
        where: { branch, date: { gte, lte }, ...(eventId !== undefined ? { eventId } : {}) },
        _sum: { amount: true },
      }),
      // Safe is a running balance — all deposits since the baseline count.
      prisma.safeEntry.aggregate({
        where: { branch, ...(baseline ? { date: { gte: baseline } } : {}) },
        _sum: { amount: true },
      }),
      // Manager-sourced withdrawals leave the manager's drawer, so they draw
      // down Expected Cash on Hand. Safe-sourced withdrawals do NOT — that
      // money already left the manager when it went into the safe.
      prisma.cashWithdrawal.aggregate({
        where: { branch, source: "manager", ...(baseline ? { date: { gte: baseline } } : {}) },
        _sum: { amount: true },
      }),
      // Historical cash that never passed through the POS but is real cash
      // the manager received — all-time, same convention as the safe balance.
      prisma.cashAdjustment.aggregate({ where: { branch }, _sum: { amount: true } }),
    ]);

  const cashSales = cashOrders._sum.total ?? 0;
  const totalExpenses = expensesBySource.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const safeExpenses = expensesBySource.find((g) => g.source === "safe")?._sum.amount ?? 0;
  const safeDeposits = safeEntries._sum.amount ?? 0;
  const safeMoney = safeDeposits - safeExpenses;
  const managerWithdrawals = managerWithdrawn._sum.amount ?? 0;
  const cashAdjustmentsTotal = cashAdjustments._sum.amount ?? 0;
  const expectedCashOnHand =
    cashSales + cashAdjustmentsTotal - totalExpenses - safeMoney - managerWithdrawals;

  return {
    cashSales,
    expenses: totalExpenses,
    safeMoney,
    cashAdjustments: cashAdjustmentsTotal,
    expectedCashOnHand,
    range: { gte, lte },
  };
}
