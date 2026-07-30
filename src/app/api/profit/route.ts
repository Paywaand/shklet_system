import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  await requireRole("ADMIN");
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateWhere =
    from || to
      ? { placedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {};

  const [orders, expenses, movements] = await Promise.all([
    prisma.order.findMany({ where: { ...dateWhere, type: "WALKIN", status: { not: "CANCELLED" } } }),
    prisma.expense.aggregate({
      where: from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {},
      _sum: { amount: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        type: "REMOVE",
        reason: { in: ["DAILY_USAGE", "WASTAGE"] },
        ...(from || to
          ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
    }),
  ]);

  const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
  const totalExpenses = expenses._sum.amount ?? 0;
  const ingredientCost = movements.reduce((sum, m) => sum + Number(m.amount) * Number(m.unitCostAtTime), 0);
  const grossProfit = totalSales - totalExpenses - ingredientCost;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  return NextResponse.json({
    totalSales,
    totalExpenses,
    ingredientCost: Math.round(ingredientCost),
    grossProfit: Math.round(grossProfit),
    grossMargin: Math.round(grossMargin * 10) / 10,
  });
});
