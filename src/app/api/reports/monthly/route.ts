import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { branchLabel } from "@/lib/branches";
import { getDeliverySettings } from "@/lib/delivery";
import { MIN_PREP_SECONDS, MAX_PREP_SECONDS } from "@/lib/prepTime";
import { localHour, businessDayKey } from "@/lib/format";
import { getBusinessHours } from "@/lib/businessHours";
import type { MonthlyReport } from "@/lib/reportDoc";

// GET /api/reports/monthly?from=ISO&to=ISO
// Admin-only. Assembles the full monthly report for the ACTIVE BRANCH: sales
// summary, expenses, financials (ingredient cost = warehouse deductions), orders
// by hour, prep/ready timing, and top items. No ingredient-usage section — that
// module doesn't exist in this system.
export async function GET(req: Request): Promise<NextResponse> {
  const guard = await authorize("reports.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  const gte = new Date(from);
  const lte = new Date(to);
  if (isNaN(gte.getTime()) || isNaN(lte.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const [orders, expenses, deliveryOrders, usage, settings, businessHours] = await Promise.all([
    // Cancelled orders never took money and must not count as sales.
    prisma.order.findMany({
      where: { branch, placedAt: { gte, lte }, status: { not: "cancelled" } },
      select: {
        total: true,
        paymentMethod: true,
        pagerNumber: true,
        placedAt: true,
        readyAt: true,
        collectedAt: true,
        items: { select: { name: true, price: true, quantity: true } },
      },
    }),
    prisma.expense.findMany({
      where: { branch, date: { gte, lte } },
      select: { category: true, amount: true },
    }),
    prisma.deliveryOrder.findMany({
      where: { branch, placedAt: { gte, lte } },
      select: { grossTotal: true, netTotal: true },
    }),
    // Ingredient cost = warehouse deductions with a recorded cost (negative totals).
    prisma.stockMovement.aggregate({
      where: {
        item: { branch },
        createdAt: { gte, lte },
        change: { lt: 0 },
        totalCost: { not: null },
      },
      _sum: { totalCost: true },
    }),
    getDeliverySettings(branch),
    getBusinessHours(),
  ]);

  // ---- Sales summary ----
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const orderCount = orders.length;
  const cash = orders.filter((o) => o.paymentMethod === "cash");
  const card = orders.filter((o) => o.paymentMethod === "card");
  const pos = orders.filter((o) => o.paymentMethod === "pos");
  const payment = {
    cash: { count: cash.length, amount: cash.reduce((s, o) => s + o.total, 0) },
    card: { count: card.length, amount: card.reduce((s, o) => s + o.total, 0) },
    pos: { count: pos.length, amount: pos.reduce((s, o) => s + o.total, 0) },
  };

  // ---- Delivery platform (kept entirely separate from branch sales) ----
  const deliveryGross = deliveryOrders.reduce((s, o) => s + o.grossTotal, 0);
  const deliveryNet = deliveryOrders.reduce((s, o) => s + o.netTotal, 0);

  // ---- Expenses breakdown ----
  const expByCat = new Map<string, { amount: number; count: number }>();
  for (const e of expenses) {
    const cur = expByCat.get(e.category) || { amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += 1;
    expByCat.set(e.category, cur);
  }
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = [...expByCat.entries()]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // ---- Financials ----
  const ingredientCostIQD = Math.abs(usage._sum.totalCost ?? 0);

  // ---- Orders by hour (0–23) ----
  const ordersByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const o of orders) ordersByHour[localHour(o.placedAt)].count++;

  // ---- Prep & ready timing ----
  const prep: number[] = []; // placed -> ready
  const wait: number[] = []; // ready -> collected
  const totalT: number[] = []; // placed -> collected
  const trendMap = new Map<string, { sum: number; n: number }>();
  let slowest: { pagerNumber: number; seconds: number } | null = null;
  for (const o of orders) {
    const placed = new Date(o.placedAt).getTime();
    if (o.readyAt) {
      const p = Math.max(0, Math.round((new Date(o.readyAt).getTime() - placed) / 1000));
      // Exclude "instant" items (prep < 30s) and outliers (prep > 40 min) from
      // the prep average and daily trend so they don't skew the figures.
      if (p >= MIN_PREP_SECONDS && p <= MAX_PREP_SECONDS) {
        prep.push(p);
        const key = businessDayKey(o.placedAt, businessHours);
        const t = trendMap.get(key) || { sum: 0, n: 0 };
        t.sum += p;
        t.n += 1;
        trendMap.set(key, t);
      }
      if (o.collectedAt) {
        wait.push(Math.max(0, Math.round((new Date(o.collectedAt).getTime() - new Date(o.readyAt).getTime()) / 1000)));
      }
    }
    if (o.collectedAt) {
      const tot = Math.max(0, Math.round((new Date(o.collectedAt).getTime() - placed) / 1000));
      totalT.push(tot);
      if (!slowest || tot > slowest.seconds) slowest = { pagerNumber: o.pagerNumber, seconds: tot };
    }
  }
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null);
  const trend = [...trendMap.entries()]
    .map(([date, v]) => ({ date, avgPrepSeconds: Math.round(v.sum / v.n), orders: v.n }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- Top items ----
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = itemMap.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.price * it.quantity;
      itemMap.set(it.name, cur);
    }
  }
  const allItems = [...itemMap.values()];
  const topByQuantity = [...allItems].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topByRevenue = [...allItems].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const report: MonthlyReport = {
    meta: {
      fromISO: gte.toISOString(),
      toISO: lte.toISOString(),
      generatedAt: new Date().toISOString(),
      branch: branchLabel(branch),
    },
    sales: { revenue, orderCount, avgOrderValue: orderCount ? Math.round(revenue / orderCount) : 0, payment },
    delivery: {
      platformName: settings.platformName,
      gross: deliveryGross,
      commission: deliveryGross - deliveryNet,
      net: deliveryNet,
      orderCount: deliveryOrders.length,
    },
    expenses: { total: expenseTotal, byCategory },
    financials: {
      ingredientCostIQD: Math.round(ingredientCostIQD),
      netProfit: Math.round(revenue - expenseTotal - ingredientCostIQD),
    },
    ordersByHour,
    timing: {
      avgPrepSeconds: avg(prep),
      avgWaitSeconds: avg(wait),
      avgTotalSeconds: avg(totalT),
      slowest,
      trend,
    },
    topByQuantity,
    topByRevenue,
  };

  return NextResponse.json(report);
}
