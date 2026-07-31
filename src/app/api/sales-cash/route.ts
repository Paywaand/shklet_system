import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";
import { getCashBaseline, clampToBaseline } from "@/lib/cashSettings";

// GET /api/sales-cash?from=ISO&to=ISO
//
// "Expected Cash on Hand" for the Sales page (manager + admin via analytics.view):
//   Expected = cash sales in range − expenses in range − safe money
// where safe money = all safe deposits − safe-sourced expenses in range. This mirrors
// the admin Cash Tracking model so the figure equals "Manager currently holds".
// Defaults to the current calendar month; honours an explicit from/to range.
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const eventIdParam = url.searchParams.get("eventId");
  const eventId =
    eventIdParam && eventIdParam !== "all" ? (eventIdParam === "main" ? null : eventIdParam) : undefined;
  const { gte: rawGte, lte } =
    fromParam || toParam
      ? { gte: fromParam ? new Date(fromParam) : undefined, lte: toParam ? new Date(toParam) : undefined }
      : monthRange(new Date(), await getBusinessHours(branchId));
  // Never let cash activity before the go-live baseline count, even for a
  // custom range that spans further back.
  const baseline = await getCashBaseline(branch);
  const gte = clampToBaseline(rawGte, baseline);

  const [cashOrders, expensesBySource, safeEntries, managerWithdrawn, cashAdjustments] = await Promise.all([
    // Branch orders paid by cash (delivery platforms excluded — separate tables). Cancelled
    // orders never took money and must not count as sales.
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
    // One row per source ("manager" | "safe") with its summed amount — lets us
    // get the total and the safe-only slice from a single grouped query.
    prisma.expense.groupBy({
      by: ["source"],
      where: { branch, date: { gte, lte }, ...(eventId !== undefined ? { eventId } : {}) },
      _sum: { amount: true },
    }),
    // Safe is a running balance — all deposits since the baseline count (matches Cash Tracking).
    prisma.safeEntry.aggregate({
      where: { branch, ...(baseline ? { date: { gte: baseline } } : {}) },
      _sum: { amount: true },
    }),
    // Manager-sourced withdrawals (cash handed directly to a person) leave the
    // manager's drawer, so they draw down Expected Cash on Hand. Since the
    // baseline, matching the safe running balance. Safe-sourced withdrawals do
    // NOT affect this figure — that money already left the manager when it
    // went into the safe.
    prisma.cashWithdrawal.aggregate({
      where: { branch, source: "manager", ...(baseline ? { date: { gte: baseline } } : {}) },
      _sum: { amount: true },
    }),
    // Historical cash that never passed through the POS (e.g. pre-system-activation
    // sales) but is real cash the manager received — all-time, same convention as
    // the safe balance above (see CashAdjustment in schema.prisma).
    prisma.cashAdjustment.aggregate({ where: { branch }, _sum: { amount: true } }),
  ]);

  const cashSales = cashOrders._sum.total ?? 0;
  const totalExpenses = expensesBySource.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const safeExpenses =
    expensesBySource.find((g) => g.source === "safe")?._sum.amount ?? 0;
  const safeDeposits = safeEntries._sum.amount ?? 0;
  const safeMoney = safeDeposits - safeExpenses;
  const managerWithdrawals = managerWithdrawn._sum.amount ?? 0;
  const cashAdjustmentsTotal = cashAdjustments._sum.amount ?? 0;
  const expectedCashOnHand = cashSales + cashAdjustmentsTotal - totalExpenses - safeMoney - managerWithdrawals;

  return NextResponse.json({
    cashSales,
    expenses: totalExpenses,
    safeMoney,
    cashAdjustments: cashAdjustmentsTotal,
    expectedCashOnHand,
    period: { from: (gte ?? null)?.toISOString() ?? null, to: (lte ?? null)?.toISOString() ?? null },
  });
}
