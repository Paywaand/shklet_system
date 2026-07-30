import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// GET /api/events/:id/evaluation — read-only profitability summary (admin only).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("events.evaluate");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const event = await prisma.event.findFirst({ where: { id: params.id, branch } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const [orders, movements, expenses] = await Promise.all([
    // Cancelled orders never took money and must not count toward event revenue.
    prisma.order.findMany({
      where: { eventId: params.id, status: { not: "cancelled" } },
      include: { items: true },
    }),
    prisma.stockMovement.findMany({
      where: { eventId: params.id, change: { lt: 0 } },
      include: { item: { select: { name: true, unit: true } } },
    }),
    prisma.expense.findMany({ where: { eventId: params.id } }),
  ]);

  // Revenue + top items.
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = itemMap.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.price * it.quantity;
      itemMap.set(it.name, cur);
    }
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty);

  // Warehouse usage cost + ingredient breakdown.
  let usageCost = 0;
  const ingMap = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
  for (const m of movements) {
    const cost = Math.abs(m.totalCost ?? 0);
    usageCost += cost;
    const key = m.item?.name ?? m.itemId;
    const cur = ingMap.get(key) || { name: m.item?.name ?? "?", unit: m.item?.unit ?? "", qty: 0, cost: 0 };
    cur.qty += Math.abs(m.change);
    cur.cost += cost;
    ingMap.set(key, cur);
  }
  const ingredients = [...ingMap.values()].sort((a, b) => b.cost - a.cost);

  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = Math.round(revenue - usageCost - expensesTotal);

  return NextResponse.json({
    event,
    revenue,
    orderCount: orders.length,
    usageCost: Math.round(usageCost),
    expensesTotal,
    grossProfit,
    profitable: grossProfit >= 0,
    ingredients,
    topItems,
  });
}
