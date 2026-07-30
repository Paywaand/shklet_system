import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * Estimated Profit (module 7) — projected margins from recipes × units sold,
 * fully isolated from real expenses/financials. Admin only (exposes recipe
 * cost data).
 */
export const GET = withApiError(async (req: NextRequest) => {
  await requireRole("ADMIN");
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateWhere =
    from || to
      ? { placedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {};

  const orders = await prisma.order.findMany({
    where: { ...dateWhere, status: { not: "CANCELLED" } },
    include: { items: true },
  });

  const revenue = orders.reduce((sum, o) => sum + o.total, 0);

  const unitsSold = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!item.menuItemId) continue;
      unitsSold.set(item.menuItemId, (unitsSold.get(item.menuItemId) ?? 0) + item.quantity);
    }
  }

  const recipes = await prisma.recipe.findMany({
    include: { lines: { include: { warehouseItem: true, batch: true } } },
  });

  let ingredientCost = 0;
  for (const recipe of recipes) {
    const sold = unitsSold.get(recipe.menuItemId) ?? 0;
    if (sold === 0) continue;
    for (const line of recipe.lines) {
      let unitCost = 0;
      if (line.sourceType === "WAREHOUSE_ITEM" && line.warehouseItem) unitCost = Number(line.warehouseItem.unitCost);
      else if (line.sourceType === "BATCH" && line.batch) unitCost = Number(line.batch.costPerUnit);
      else if (line.sourceType === "MANUAL") unitCost = Number(line.manualCost ?? 0);
      ingredientCost += unitCost * Number(line.amountPerServing) * sold;
    }
  }

  const grossProfit = revenue - ingredientCost;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return NextResponse.json({
    estimatedRevenue: revenue,
    estimatedIngredientCost: Math.round(ingredientCost),
    estimatedGrossProfit: Math.round(grossProfit),
    estimatedMargin: Math.round(margin * 10) / 10,
  });
});
