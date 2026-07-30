import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { getDeliverySettings } from "@/lib/delivery";
import { countsTowardPrepAvg } from "@/lib/prepTime";

// GET /api/delivery?from=ISO&to=ISO — admin-only delivery-platform revenue for
// the active branch (isolated from branch sales). Suli sees its Toters numbers,
// Erbil its Talabat numbers — never mixed.
export async function GET(req: Request) {
  const guard = await authorize("delivery.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const settings = await getDeliverySettings(branch);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const gte = from ? new Date(from) : undefined;
  const lte = to ? new Date(to) : undefined;

  const [orders, allForMonthly] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: { branch, placedAt: { gte, lte } },
      orderBy: { placedAt: "desc" },
      include: { items: true, staff: { select: { fullName: true } } },
    }),
    // Monthly breakdown spans all time, independent of the date filter.
    prisma.deliveryOrder.findMany({
      where: { branch },
      select: { placedAt: true, grossTotal: true, netTotal: true },
    }),
  ]);

  const gross = orders.reduce((s, o) => s + o.grossTotal, 0);
  const net = orders.reduce((s, o) => s + o.netTotal, 0);
  const commission = gross - net;

  // Timing averages (only where the relevant timestamps exist). Prep average
  // excludes "instant" items (prepSeconds < 30, e.g. water) so they don't skew
  // it; arrival time is a separate driver metric and keeps every order.
  const prep = orders.filter((o) => countsTowardPrepAvg(o.prepSeconds));
  const arrive = orders.filter((o) => o.arriveSeconds != null);
  const avgPrepSeconds = prep.length
    ? Math.round(prep.reduce((s, o) => s + (o.prepSeconds || 0), 0) / prep.length)
    : null;
  const avgArriveSeconds = arrive.length
    ? Math.round(arrive.reduce((s, o) => s + (o.arriveSeconds || 0), 0) / arrive.length)
    : null;

  // Monthly breakdown (YYYY-MM).
  const monthMap = new Map<string, { month: string; gross: number; net: number; count: number }>();
  for (const o of allForMonthly) {
    const key = new Date(o.placedAt).toISOString().slice(0, 7);
    const cur = monthMap.get(key) || { month: key, gross: 0, net: 0, count: 0 };
    cur.gross += o.grossTotal;
    cur.net += o.netTotal;
    cur.count += 1;
    monthMap.set(key, cur);
  }
  const monthly = [...monthMap.values()]
    .map((m) => ({ ...m, commission: m.gross - m.net }))
    .sort((a, b) => b.month.localeCompare(a.month));

  return NextResponse.json({
    platform: settings,
    summary: { gross, commission, net, orderCount: orders.length, avgPrepSeconds, avgArriveSeconds },
    orders,
    monthly,
  });
}
