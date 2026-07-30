import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * Theoretical usage (recipe amount-per-item × units sold) vs. actual
 * deductions logged in Warehouse, per warehouse item. Admin only, since it
 * exposes recipe amounts (cost-adjacent data).
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
    include: { items: { include: { menuItem: { include: { recipe: { include: { lines: true } } } } } } },
  });

  // units sold per menu item
  const unitsSold = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!item.menuItemId) continue;
      unitsSold.set(item.menuItemId, (unitsSold.get(item.menuItemId) ?? 0) + item.quantity);
    }
  }

  // theoretical usage per warehouse item
  const theoretical = new Map<string, number>();
  const recipes = await prisma.recipe.findMany({ include: { lines: true, menuItem: true } });
  for (const recipe of recipes) {
    const sold = unitsSold.get(recipe.menuItemId) ?? 0;
    if (sold === 0) continue;
    for (const line of recipe.lines) {
      if (line.sourceType !== "WAREHOUSE_ITEM" || !line.warehouseItemId) continue;
      const amount = Number(line.amountPerServing) * sold;
      theoretical.set(line.warehouseItemId, (theoretical.get(line.warehouseItemId) ?? 0) + amount);
    }
  }

  // actual usage from stock movements
  const movements = await prisma.stockMovement.findMany({
    where: {
      type: "REMOVE",
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
  });
  const actual = new Map<string, number>();
  for (const m of movements) {
    actual.set(m.itemId, (actual.get(m.itemId) ?? 0) + Number(m.amount));
  }

  const itemIds = new Set([...theoretical.keys(), ...actual.keys()]);
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: [...itemIds] } } });

  const rows = [...itemIds].map((itemId) => {
    const item = items.find((i) => i.id === itemId);
    const theo = theoretical.get(itemId) ?? 0;
    const act = actual.get(itemId) ?? 0;
    const wastage = act - theo;
    const wastagePct = theo > 0 ? (wastage / theo) * 100 : 0;
    return {
      itemId,
      name: item?.name ?? "Unknown",
      unit: item?.unit ?? "",
      theoretical: Math.round(theo * 100) / 100,
      actual: Math.round(act * 100) / 100,
      wastage: Math.round(wastage * 100) / 100,
      wastagePct: Math.round(wastagePct * 10) / 10,
    };
  });

  return NextResponse.json({ rows });
});
