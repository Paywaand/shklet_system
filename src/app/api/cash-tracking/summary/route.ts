import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * Expected Cash on Hand (module 10) + safe/manager balances (module 12):
 * cash sales − expenses − safe deposits − manager-sourced withdrawals.
 */
export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const cityFilter = scopeCityFilter(user, searchParams.get("cityId"));
  const cityId = "cityId" in cityFilter ? cityFilter.cityId : undefined;

  const branchWhere = cityId ? { branch: { cityId } } : {};
  const cityWhere = cityId ? { cityId } : {};

  const [cashOrders, expenses, deposits, withdrawals] = await Promise.all([
    prisma.order.findMany({
      where: { ...branchWhere, paymentMethod: "CASH", status: { not: "CANCELLED" } },
      select: { total: true },
    }),
    prisma.expense.aggregate({ where: cityWhere, _sum: { amount: true } }),
    prisma.safeDeposit.aggregate({ where: cityWhere, _sum: { amount: true } }),
    prisma.withdrawal.findMany({ where: cityWhere }),
  ]);

  const cashSales = cashOrders.reduce((s, o) => s + o.total, 0);
  const expensesTotal = expenses._sum.amount ?? 0;
  const depositsTotal = deposits._sum.amount ?? 0;
  const safeWithdrawals = withdrawals.filter((w) => w.source === "SAFE").reduce((s, w) => s + w.amount, 0);
  const managerWithdrawals = withdrawals.filter((w) => w.source === "MANAGER").reduce((s, w) => s + w.amount, 0);

  const expectedCashOnHand = cashSales - expensesTotal - depositsTotal - managerWithdrawals;
  const safeBalance = depositsTotal - safeWithdrawals;

  const byPerson = new Map<string, number>();
  for (const w of withdrawals) {
    byPerson.set(w.recipientName, (byPerson.get(w.recipientName) ?? 0) + w.amount);
  }

  return NextResponse.json({
    expectedCashOnHand,
    safeBalance,
    managerHolds: expectedCashOnHand,
    withdrawalTotalsByPerson: [...byPerson.entries()].map(([name, total]) => ({ name, total })),
  });
});
