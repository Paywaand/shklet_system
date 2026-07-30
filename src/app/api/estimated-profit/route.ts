import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { shapeRecipe } from "@/lib/production";
import type { EstimatedProfitRow } from "@/lib/types";

// GET /api/estimated-profit?days=1|7|30
//
// estimated_net = Σ(units_sold × gross_profit_per_item)
// where gross_profit_per_item comes from each item's Recipe BOM.
//
// ISOLATED from actual financials: this reads only orders + recipes. It never
// touches expenses or recorded warehouse-usage costs. It is an ESTIMATE.
export async function GET(req: Request) {
  const guard = await authorize("estimated.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days: 1 | 7 | 30 = raw === 7 ? 7 : raw === 30 ? 30 : 1;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const [orderItems, recipes] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { branch, placedAt: { gte: from } } },
      select: { name: true, quantity: true },
    }),
    prisma.recipe.findMany({
      where: { menuItem: { category: { branch } } },
      include: {
        menuItem: { select: { name: true, price: true } },
        ingredients: { include: { inventoryItem: { select: { unit: true, lastUnitCost: true } } } },
      },
    }),
  ]);

  // units sold per menu-item name (OrderItem.name is the item-name snapshot)
  const soldByName = new Map<string, number>();
  for (const oi of orderItems) {
    soldByName.set(oi.name, (soldByName.get(oi.name) ?? 0) + oi.quantity);
  }

  // gross profit per item from the BOM (with live warehouse costs)
  const gpByName = new Map<string, { menuItemId: string; gp: number }>();
  for (const r of recipes) {
    const shaped = shapeRecipe(r);
    gpByName.set(shaped.menuItemName, { menuItemId: shaped.menuItemId, gp: shaped.grossProfit });
  }

  // Build a row for every item with a recipe OR that was sold in the window.
  const names = new Set<string>([...gpByName.keys(), ...soldByName.keys()]);
  const rows: EstimatedProfitRow[] = [];
  for (const name of names) {
    const unitsSold = soldByName.get(name) ?? 0;
    const recipe = gpByName.get(name);
    const hasRecipe = !!recipe;
    const grossProfitPerItem = recipe?.gp ?? 0;
    rows.push({
      menuItemId: recipe?.menuItemId ?? name,
      name,
      unitsSold,
      grossProfitPerItem,
      estimated: hasRecipe ? unitsSold * grossProfitPerItem : 0,
      hasRecipe,
    });
  }
  rows.sort((a, b) => b.estimated - a.estimated || b.unitsSold - a.unitsSold);

  const estimatedNet = rows.reduce((s, r) => s + r.estimated, 0);
  const unitsSold = rows.reduce((s, r) => s + r.unitsSold, 0);
  const itemsWithRecipe = rows.filter((r) => r.hasRecipe).length;
  const itemsMissingRecipe = rows.filter((r) => !r.hasRecipe && r.unitsSold > 0).length;

  return NextResponse.json({
    days,
    estimatedNet: Math.round(estimatedNet),
    unitsSold,
    itemsWithRecipe,
    itemsMissingRecipe,
    rows,
  });
}
