import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { getBusinessHours } from "@/lib/businessHours";
import { getBusinessDayBounds, currentBusinessDay } from "@/lib/businessDay";
import { monthRange } from "@/lib/cash";
import { computeExpectedCashOnHand } from "@/lib/expectedCash";
import { getCashBaseline } from "@/lib/cashSettings";

// Same 5 fixed categories the Expenses page/API use (see expenses/route.ts) —
// duplicated rather than extracted since this route only needs the list to
// zero-fill months/categories with no expenses, not to validate input.
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];
const TREND_MONTHS = 6;

// Revenue + expenses for one month range — shared by "this month", "last
// month", and "same month last year" so the three figures use identical logic.
async function monthTotals(branch: string, range: { gte: Date; lte: Date }) {
  const [orders, expenses] = await Promise.all([
    prisma.order.aggregate({
      where: { branch, placedAt: { gte: range.gte, lte: range.lte }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: { branch, date: { gte: range.gte, lte: range.lte } },
      _sum: { amount: true },
    }),
  ]);
  return { revenue: orders._sum.total ?? 0, expenses: expenses._sum.amount ?? 0 };
}

// Percent change from `from` to `to`. null when there's no baseline to compare
// against (avoids a division-by-zero "Infinity%").
function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

// GET /api/dashboard — admin-only, at-a-glance summary for the current active
// branch: today's trading, this month's profit + cash position, month-over-
// month / year-over-year comparisons, expenses by category, and the two
// operational flags an admin actually needs to act on (low stock, unpaid
// orders). Everything here already exists on some other page — this route
// re-runs the same scoped queries with the same helpers used there
// (businessDay bounds, computeExpectedCashOnHand) so the numbers can never
// drift from what Sales/Profit/Cash Tracking show for the same period.
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);
  const businessHours = await getBusinessHours(branchId);

  const today = currentBusinessDay(new Date(), businessHours);
  const todayRange = getBusinessDayBounds(today, businessHours);
  const monthRangeBounds = monthRange(new Date(), businessHours);
  const lastMonthRangeBounds = monthRange(new Date(), businessHours, -1);
  const sameMonthLastYearBounds = monthRange(new Date(), businessHours, -12);
  const branchBaseline = await getCashBaseline(branch);
  // MoM/YoY need the COMPARISON period to be fully after go-live — otherwise
  // "last month"/"same month last year" would mix in pre-cutover data.
  const momAvailable = !branchBaseline || lastMonthRangeBounds.gte >= branchBaseline;
  const yoyAvailable = !branchBaseline || sameMonthLastYearBounds.gte >= branchBaseline;

  const trendRanges = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const offset = -(TREND_MONTHS - 1 - i); // oldest first: e.g. -5..0
    return monthRange(new Date(), businessHours, offset);
  });

  const [
    todayOrders,
    todayUnpaid,
    monthOrders,
    monthExpenses,
    monthUsage,
    expectedCash,
    lowStockItems,
    lastMonthTotals,
    sameMonthLastYearTotals,
    expensesByCategoryAgg,
    trendAgg,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { branch, placedAt: { gte: todayRange.start, lte: todayRange.end }, status: { not: "cancelled" } },
      _sum: { total: true },
      _count: true,
    }),
    // Orders taken but not yet paid — the one thing an admin can act on today.
    prisma.order.findMany({
      where: {
        branch,
        placedAt: { gte: todayRange.start, lte: todayRange.end },
        status: { not: "cancelled" },
        isPaid: false,
      },
      select: { total: true },
    }),
    prisma.order.aggregate({
      where: { branch, placedAt: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: { branch, date: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte } },
      _sum: { amount: true },
    }),
    // Ingredient cost = warehouse deductions with a recorded cost (negative totals),
    // same convention as /api/profit.
    prisma.stockMovement.aggregate({
      where: {
        item: { branch },
        createdAt: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte },
        change: { lt: 0 },
        totalCost: { not: null },
      },
      _sum: { totalCost: true },
    }),
    computeExpectedCashOnHand(branch, monthRangeBounds),
    prisma.inventoryItem.findMany({
      where: { branch },
      select: { name: true, quantity: true, unit: true, minThreshold: true },
    }),
    monthTotals(branch, lastMonthRangeBounds),
    monthTotals(branch, sameMonthLastYearBounds),
    prisma.expense.groupBy({
      by: ["category"],
      where: { branch, date: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte } },
      _sum: { amount: true },
    }),
    Promise.all(
      trendRanges.map((range) =>
        prisma.expense.groupBy({
          by: ["category"],
          where: { branch, date: { gte: range.gte, lte: range.lte } },
          _sum: { amount: true },
        })
      )
    ),
  ]);

  const totalSales = monthOrders._sum.total ?? 0;
  const totalExpenses = monthExpenses._sum.amount ?? 0;
  const ingredientCost = Math.abs(monthUsage._sum.totalCost ?? 0);
  const netProfit = Math.round(totalSales - totalExpenses - ingredientCost);

  const lowStock = lowStockItems
    .filter((i) => i.quantity <= i.minThreshold)
    .sort((a, b) => a.quantity / (a.minThreshold || 1) - b.quantity / (b.minThreshold || 1));

  const expensesByCategory = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: expensesByCategoryAgg.find((g) => g.category === category)?._sum.amount ?? 0,
  }));

  const expensesByCategoryTrend = trendRanges.map((range, i) => {
    const monthKey = `${range.gte.getFullYear()}-${String(range.gte.getMonth() + 1).padStart(2, "0")}`;
    const categoryTotals: Record<string, number> = {};
    for (const category of EXPENSE_CATEGORIES) {
      categoryTotals[category] = trendAgg[i].find((g) => g.category === category)?._sum.amount ?? 0;
    }
    return { month: monthKey, ...categoryTotals };
  });

  return NextResponse.json({
    today: {
      orders: todayOrders._count,
      revenue: todayOrders._sum.total ?? 0,
      unpaidCount: todayUnpaid.length,
      unpaidAmount: todayUnpaid.reduce((s, o) => s + o.total, 0),
    },
    month: {
      netProfit,
      expectedCashOnHand: expectedCash.expectedCashOnHand,
    },
    mom: {
      available: momAvailable,
      thisMonth: { revenue: totalSales, expenses: totalExpenses },
      lastMonth: lastMonthTotals,
      revenuePctChange: pctChange(lastMonthTotals.revenue, totalSales),
      expensesPctChange: pctChange(lastMonthTotals.expenses, totalExpenses),
    },
    yoy: {
      available: yoyAvailable,
      thisMonth: { revenue: totalSales, expenses: totalExpenses },
      lastYear: sameMonthLastYearTotals,
      revenuePctChange: pctChange(sameMonthLastYearTotals.revenue, totalSales),
      expensesPctChange: pctChange(sameMonthLastYearTotals.expenses, totalExpenses),
    },
    expensesByCategory,
    expensesByCategoryTrend,
    lowStock: {
      count: lowStock.length,
      items: lowStock.slice(0, 5).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        minThreshold: i.minThreshold,
      })),
    },
  });
}
