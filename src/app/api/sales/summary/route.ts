import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter } from "@/lib/auth";
import { withApiError } from "@/lib/api";
import { localHour } from "@/lib/datetime";

/**
 * Sales summary for a date range. Walk-in orders only feed the main
 * aggregates (module 1: "Keep delivery revenue in a fully separate
 * table/report ... never blended into the main Sales/Profit figures") —
 * delivery orders are counted separately below.
 */
export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const cityFilter = scopeCityFilter(user, searchParams.get("cityId"));

  const branchWhere =
    "cityId" in cityFilter && cityFilter.cityId
      ? { branch: { cityId: cityFilter.cityId } }
      : {};

  const dateWhere =
    from || to
      ? {
          placedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const orders = await prisma.order.findMany({
    where: { ...branchWhere, ...dateWhere, status: { not: "CANCELLED" } },
    include: { items: true },
  });

  const walkIns = orders.filter((o) => o.type === "WALKIN");
  const deliveries = orders.filter((o) => o.type === "DELIVERY");

  const totalRevenue = walkIns.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = walkIns.length;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Prep time stats: exclude near-instant orders (a single bottled item —
  // approximated here as orders with exactly 1 line and quantity 1) and
  // exclude extreme outliers (> 3x the median) from the *average* only.
  const prepTimes = walkIns
    .filter((o) => o.readyAt && !(o.items.length === 1 && o.items[0].quantity === 1))
    .map((o) => (new Date(o.readyAt!).getTime() - new Date(o.placedAt).getTime()) / 60000);

  const sortedPrep = [...prepTimes].sort((a, b) => a - b);
  const median = sortedPrep.length > 0 ? sortedPrep[Math.floor(sortedPrep.length / 2)] : 0;
  const withoutOutliers = prepTimes.filter((t) => t <= median * 3 || median === 0);
  const averagePrepTime =
    withoutOutliers.length > 0
      ? Math.round(withoutOutliers.reduce((s, t) => s + t, 0) / withoutOutliers.length)
      : 0;
  const slowestOrder = prepTimes.length > 0 ? Math.round(Math.max(...prepTimes)) : 0;

  // Revenue by day
  const byDay = new Map<string, number>();
  for (const o of walkIns) {
    const key = o.placedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.total);
  }
  const revenueByDay = [...byDay.entries()].sort().map(([date, revenue]) => ({ date, revenue }));

  // Top-selling items
  const itemCounts = new Map<string, number>();
  for (const o of walkIns) {
    for (const item of o.items) {
      itemCounts.set(item.nameSnapshot, (itemCounts.get(item.nameSnapshot) ?? 0) + item.quantity);
    }
  }
  const topItems = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, qty]) => ({ name, qty }));

  // Orders by hour
  const byHour = new Array(24).fill(0);
  for (const o of walkIns) byHour[localHour(o.placedAt)]++;
  const ordersByHour = byHour.map((count, hour) => ({ hour, count }));
  const busiestHour = byHour.indexOf(Math.max(...byHour));

  // Payment method split
  const cashTotal = walkIns.filter((o) => o.paymentMethod === "CASH").reduce((s, o) => s + o.total, 0);
  const cardTotal = walkIns.filter((o) => o.paymentMethod === "CARD").reduce((s, o) => s + o.total, 0);

  // Delivery (separate)
  const deliveryRevenueGross = deliveries.reduce((s, o) => s + (o.deliveryGross ?? o.total), 0);
  const deliveryRevenueNet = deliveries.reduce((s, o) => s + (o.deliveryNet ?? o.total), 0);

  return NextResponse.json({
    totalOrders,
    totalRevenue,
    averageOrderValue,
    averagePrepTime,
    slowestOrder,
    busiestHour,
    revenueByDay,
    topItems,
    ordersByHour,
    paymentSplit: { cash: cashTotal, card: cardTotal },
    delivery: { count: deliveries.length, gross: deliveryRevenueGross, net: deliveryRevenueNet },
  });
});
