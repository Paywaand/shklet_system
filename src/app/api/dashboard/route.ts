import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranchId, resolveBranchFilter } from "@/lib/branchScope";
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
async function monthTotals(branch: string | { in: string[] }, range: { gte: Date; lte: Date }) {
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
export async function GET(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const branchArg = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
  const branch: string | { in: string[] } = Array.isArray(branchArg) ? { in: branchArg } : branchArg;
  const branchId = await activeBranchId(guard.session);
  const businessHours = await getBusinessHours(branchId);

  // Month selector — "YYYY-MM", defaults to the current calendar month. Every
  // "month"/MoM/YoY/trend figure below is relative to THIS month, not
  // necessarily today's real month, so browsing an older month shows that
  // month's own comparisons.
  const monthParam = url.searchParams.get("month");
  const selectedMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? new Date(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1)
      : new Date();

  const today = currentBusinessDay(new Date(), businessHours);
  const todayRange = getBusinessDayBounds(today, businessHours);
  const monthRangeBounds = monthRange(selectedMonth, businessHours);
  const lastMonthRangeBounds = monthRange(selectedMonth, businessHours, -1);
  const sameMonthLastYearBounds = monthRange(selectedMonth, businessHours, -12);
  const branches = Array.isArray(branchArg) ? branchArg : [branchArg];
  const baselines = await Promise.all(branches.map((b) => getCashBaseline(b)));
  // Combined mode: the EARLIEST of the cities' baselines — a combined figure
  // can't apply one city's go-live cutoff to the other.
  const branchBaseline = baselines.some((b) => b === null)
    ? null
    : baselines.reduce((min, b) => (b! < min! ? b : min), baselines[0]);
  // MoM/YoY need the COMPARISON period to be fully after go-live — otherwise
  // "last month"/"same month last year" would mix in pre-cutover data.
  const momAvailable = !branchBaseline || lastMonthRangeBounds.gte >= branchBaseline;
  const yoyAvailable = !branchBaseline || sameMonthLastYearBounds.gte >= branchBaseline;

  const trendRanges = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const offset = -(TREND_MONTHS - 1 - i); // oldest first: e.g. -5..0
    return monthRange(selectedMonth, businessHours, offset);
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
    deliveryToday,
    deliveryMonth,
    voidedDeliveryMonth,
    revenueAdjustmentsMonth,
    loyaltyRedemptionsMonth,
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
    computeExpectedCashOnHand(branchArg, monthRangeBounds),
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
    // Delivery performance — absent from the dashboard until now despite being
    // a full revenue stream (item 3).
    prisma.deliveryOrder.aggregate({
      where: { branch, placedAt: { gte: todayRange.start, lte: todayRange.end }, status: { not: "cancelled" }, deletedAt: null },
      _sum: { grossTotal: true, netTotal: true },
      _count: true,
    }),
    prisma.deliveryOrder.aggregate({
      where: { branch, placedAt: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte }, status: { not: "cancelled" }, deletedAt: null },
      _sum: { grossTotal: true, netTotal: true },
      _count: true,
    }),
    // Corrections transparency (items 6 + 7): surfaced here so an admin notices
    // voids/adjustments happened without having to dig through Delivery/Sales.
    prisma.deliveryOrder.aggregate({
      where: { branch, placedAt: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte }, deletedAt: { not: null } },
      _sum: { grossTotal: true },
      _count: true,
    }),
    prisma.revenueAdjustment.aggregate({
      where: { branch, date: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte } },
      _sum: { amount: true },
      _count: true,
    }),
    // Loyalty (item 4): free-item redemptions this month, at a glance.
    prisma.loyaltyRedemption.count({
      where: { branch, redeemedAt: { gte: monthRangeBounds.gte, lte: monthRangeBounds.lte } },
    }),
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
    selectedMonth: `${monthRangeBounds.gte.getFullYear()}-${String(monthRangeBounds.gte.getMonth() + 1).padStart(2, "0")}`,
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
    delivery: {
      today: {
        orders: deliveryToday._count,
        gross: deliveryToday._sum.grossTotal ?? 0,
        net: deliveryToday._sum.netTotal ?? 0,
      },
      month: {
        orders: deliveryMonth._count,
        gross: deliveryMonth._sum.grossTotal ?? 0,
        net: deliveryMonth._sum.netTotal ?? 0,
      },
    },
    corrections: {
      voidedDeliveryCount: voidedDeliveryMonth._count,
      voidedDeliveryAmount: voidedDeliveryMonth._sum.grossTotal ?? 0,
      revenueAdjustmentCount: revenueAdjustmentsMonth._count,
      revenueAdjustmentNet: revenueAdjustmentsMonth._sum.amount ?? 0,
      loyaltyRedemptions: loyaltyRedemptionsMonth,
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
