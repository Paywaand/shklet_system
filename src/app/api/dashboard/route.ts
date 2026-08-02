import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { getBusinessHours } from "@/lib/businessHours";
import { getBusinessDayBounds, currentBusinessDay } from "@/lib/businessDay";
import { monthRange } from "@/lib/cash";
import { computeExpectedCashOnHand } from "@/lib/expectedCash";

// GET /api/dashboard — admin-only, at-a-glance summary for the current active
// branch: today's trading, this month's profit + cash position, and the two
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

  const [
    todayOrders,
    todayUnpaid,
    monthOrders,
    monthExpenses,
    monthUsage,
    expectedCash,
    lowStockItems,
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
  ]);

  const totalSales = monthOrders._sum.total ?? 0;
  const totalExpenses = monthExpenses._sum.amount ?? 0;
  const ingredientCost = Math.abs(monthUsage._sum.totalCost ?? 0);
  const netProfit = Math.round(totalSales - totalExpenses - ingredientCost);

  const lowStock = lowStockItems
    .filter((i) => i.quantity <= i.minThreshold)
    .sort((a, b) => a.quantity / (a.minThreshold || 1) - b.quantity / (b.minThreshold || 1));

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
