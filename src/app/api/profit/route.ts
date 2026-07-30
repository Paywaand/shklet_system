import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { getDeliverySettings } from "@/lib/delivery";

// GET /api/profit?from=ISO&to=ISO — scoped to the active branch.
// Gross profit = sales revenue - expenses - warehouse usage cost (all within the range).
export async function GET(req: Request) {
  const guard = await authorize("profit.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const gte = from ? new Date(from) : undefined;
  const lte = to ? new Date(to) : undefined;

  const [orders, expenses, usage, delivery, settings] = await Promise.all([
    // Sum + count pushed to the DB (avoids streaming every row back just to add
    // them up in JS — matters once a range spans thousands of orders). Cancelled
    // orders never took money and must not count as sales.
    prisma.order.aggregate({
      where: { branch, placedAt: { gte, lte }, status: { not: "cancelled" } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { branch, date: { gte, lte } },
      _sum: { amount: true },
    }),
    // Deductions (change < 0) that have a recorded cost. `totalCost` is stored
    // negative on deductions, so the summed magnitude is taken below. Scoped to
    // the branch through the movement's warehouse item.
    prisma.stockMovement.aggregate({
      where: {
        item: { branch },
        createdAt: { gte, lte },
        change: { lt: 0 },
        totalCost: { not: null },
      },
      _sum: { totalCost: true },
    }),
    // Delivery-platform revenue shown separately — NOT included in branch gross profit.
    prisma.deliveryOrder.aggregate({
      where: { branch, placedAt: { gte, lte } },
      _sum: { grossTotal: true, netTotal: true },
      _count: true,
    }),
    getDeliverySettings(branch),
  ]);

  const totalSales = orders._sum.total ?? 0;
  const totalExpenses = expenses._sum.amount ?? 0;
  // totalCost on deductions is negative — take the magnitude.
  const ingredientCost = Math.abs(usage._sum.totalCost ?? 0);
  const grossProfit = totalSales - totalExpenses - ingredientCost;

  // Delivery figures (kept entirely separate from the branch gross-profit calc above).
  const deliveryGross = delivery._sum.grossTotal ?? 0;
  const deliveryNet = delivery._sum.netTotal ?? 0;

  return NextResponse.json({
    totalSales,
    totalExpenses,
    ingredientCost: Math.round(ingredientCost),
    grossProfit: Math.round(grossProfit),
    orderCount: orders._count,
    delivery: {
      platformName: settings.platformName,
      gross: deliveryGross,
      commission: deliveryGross - deliveryNet,
      net: deliveryNet,
      orderCount: delivery._count,
    },
  });
}
