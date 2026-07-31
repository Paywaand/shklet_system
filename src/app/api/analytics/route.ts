import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { countsTowardPrepAvg } from "@/lib/prepTime";
import { localHour, businessDayKey } from "@/lib/format";
import { getBusinessHours } from "@/lib/businessHours";

// GET /api/analytics?from=ISO&to=ISO
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const eventId = url.searchParams.get("eventId");
  // Optional branch selector — "all" (default) spans every branch in the
  // current city; a specific branch id scopes to just that branch.
  const branchIdParam = url.searchParams.get("branchId");

  const where: {
    branch: string;
    branchId?: string;
    placedAt?: { gte?: Date; lte?: Date };
    eventId?: string | null;
  } = { branch };
  if (branchIdParam && branchIdParam !== "all") where.branchId = branchIdParam;
  if (from || to) {
    where.placedAt = {};
    if (from) where.placedAt.gte = new Date(from);
    if (to) where.placedAt.lte = new Date(to);
  }
  if (eventId && eventId !== "all") {
    where.eventId = eventId === "main" ? null : eventId;
  }

  // Fetch every order placed in range, cancelled included — the Sales page's
  // order history is a placement log, so a cancelled order should still show
  // up there (marked "cancelled"), it just never counts toward revenue/stats.
  const [orders, businessHours] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      include: { items: true, staff: { select: { fullName: true } } },
    }),
    getBusinessHours(branchId),
  ]);

  // Cancelled orders never took money and must not count as sales.
  const soldOrders = orders.filter((o) => o.status !== "cancelled");

  const totalOrders = soldOrders.length;
  const totalRevenue = soldOrders.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;

  // Orders by hour (0–23)
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const o of soldOrders) byHour[localHour(o.placedAt)].count++;
  const busiest = byHour.reduce((a, b) => (b.count > a.count ? b : a), byHour[0]);
  const busiestHour = busiest.count > 0 ? busiest.hour : null;

  // Timing. The average excludes "instant" items (durationSeconds < 30, e.g.
  // water) so they don't skew it; the slowest order is still taken from all
  // completed orders (an instant item is never the slowest anyway).
  const withDuration = soldOrders.filter((o) => o.durationSeconds != null);
  const forAvg = soldOrders.filter((o) => countsTowardPrepAvg(o.durationSeconds));
  const avgDurationSeconds = forAvg.length
    ? Math.round(forAvg.reduce((s, o) => s + (o.durationSeconds || 0), 0) / forAvg.length)
    : null;
  const slowest = withDuration.reduce<typeof withDuration[number] | null>(
    (a, o) => (!a || (o.durationSeconds || 0) > (a.durationSeconds || 0) ? o : a),
    null
  );

  // Revenue by business day (a trading night buckets under one day, not split at
  // calendar midnight).
  const dayMap = new Map<string, number>();
  for (const o of soldOrders) {
    const key = businessDayKey(o.placedAt, businessHours);
    dayMap.set(key, (dayMap.get(key) || 0) + o.total);
  }
  const revenueByDay = [...dayMap.entries()]
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top items
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of soldOrders) {
    for (const it of o.items) {
      const cur = itemMap.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.price * it.quantity;
      itemMap.set(it.name, cur);
    }
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Payment split
  const paymentSplit = {
    cash: soldOrders.filter((o) => o.paymentMethod === "cash").length,
    card: soldOrders.filter((o) => o.paymentMethod === "card").length,
    pos: soldOrders.filter((o) => o.paymentMethod === "pos").length,
  };

  return NextResponse.json({
    summary: { totalOrders, totalRevenue, avgOrderValue, busiestHour },
    timing: {
      avgDurationSeconds,
      slowest: slowest
        ? { pagerNumber: slowest.pagerNumber, durationSeconds: slowest.durationSeconds }
        : null,
    },
    revenueByDay,
    topItems,
    ordersByHour: byHour,
    paymentSplit,
    orders,
  });
}
