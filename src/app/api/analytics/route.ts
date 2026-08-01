import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { MIN_PREP_SECONDS, MAX_PREP_SECONDS } from "@/lib/prepTime";
import { SYSTEM_TIME_ZONE } from "@/lib/format";
import { getBusinessHours } from "@/lib/businessHours";
import { businessDayExpr, localHourExpr, dateKey } from "@/lib/reportingSql";
import { orderScopeSql } from "@/lib/orderScope";

// GET /api/analytics?from=ISO&to=ISO
//
// Returns AGGREGATES ONLY. Every figure is rolled up by Postgres, so the
// response is a few hundred rows regardless of range size — a full year returns
// ~365 day-rows instead of the ~45k hydrated orders (plus every line item) this
// route used to serialise. The order history table is served separately and
// paginated by /api/analytics/orders.
//
// `from`/`to` are required. An unbounded reporting query scans the whole orders
// table and pins a pooled connection for its duration, which starves the small
// Prisma pool that POS order writes also draw from — that is the real cost of
// the old "no dates = everything" behaviour, not just a slow chart.
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

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
  if (gte > lte) {
    return NextResponse.json({ error: "from must be before to" }, { status: 400 });
  }

  const businessHours = await getBusinessHours(branchId);

  const where = orderScopeSql({
    branch,
    branchId: url.searchParams.get("branchId"),
    eventId: url.searchParams.get("eventId"),
    gte,
    lte,
    excludeCancelled: true,
  });

  const bday = businessDayExpr(Prisma.sql`o."placedAt"`, businessHours, SYSTEM_TIME_ZONE);
  const hour = localHourExpr(Prisma.sql`o."placedAt"`, SYSTEM_TIME_ZONE);

  // One scan, four rollups. GROUPING SETS yields revenue-by-business-day,
  // orders-by-hour, the payment split and the grand total from a single pass;
  // the GROUPING() flags say which rollup each row belongs to.
  type RollupRow = {
    g_bday: number;
    g_hr: number;
    g_pm: number;
    bday: Date | null;
    hr: number | null;
    pm: string | null;
    cnt: bigint;
    revenue: bigint;
  };

  const [rollup, timing, slowest, topItems] = await Promise.all([
    prisma.$queryRaw<RollupRow[]>`
      WITH src AS (
        SELECT ${bday} AS bday, ${hour} AS hr, o."paymentMethod" AS pm, o."total" AS total
        FROM "Order" o
        WHERE ${where}
      )
      SELECT
        GROUPING(bday) AS g_bday,
        GROUPING(hr)   AS g_hr,
        GROUPING(pm)   AS g_pm,
        bday, hr, pm,
        COUNT(*)::bigint                AS cnt,
        COALESCE(SUM(total), 0)::bigint AS revenue
      FROM src
      GROUP BY GROUPING SETS ((bday), (hr), (pm), ())
    `,
    // Average prep time excludes "instant" items and runaway outliers — see
    // lib/prepTime.ts for why.
    prisma.$queryRaw<{ avg_dur: number | null }[]>`
      SELECT AVG(o."durationSeconds") FILTER (
               WHERE o."durationSeconds" BETWEEN ${MIN_PREP_SECONDS} AND ${MAX_PREP_SECONDS}
             )::float8 AS avg_dur
      FROM "Order" o
      WHERE ${where}
    `,
    // Slowest order is taken from ALL completed orders, unbounded — an instant
    // item is never the slowest anyway.
    prisma.$queryRaw<{ pagerNumber: number; durationSeconds: number }[]>`
      SELECT o."pagerNumber", o."durationSeconds"
      FROM "Order" o
      WHERE ${where} AND o."durationSeconds" IS NOT NULL
      ORDER BY o."durationSeconds" DESC
      LIMIT 1
    `,
    prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>`
      SELECT i."name",
             SUM(i."quantity")::bigint             AS qty,
             SUM(i."price" * i."quantity")::bigint AS revenue
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      WHERE ${where}
      GROUP BY i."name"
      ORDER BY qty DESC
      LIMIT 10
    `,
  ]);

  // Unpack the grouping sets: a GROUPING() flag of 1 means that column was
  // rolled up, so the rows belonging to a set are the ones with their own flag
  // at 0, and the grand total is the row where every flag is 1.
  const revenueByDay = rollup
    .filter((r) => r.g_bday === 0 && r.bday != null)
    .map((r) => ({ date: dateKey(r.bday as Date), revenue: Number(r.revenue) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hourCounts = new Map<number, number>();
  for (const r of rollup) {
    if (r.g_hr === 0 && r.hr != null) hourCounts.set(r.hr, Number(r.cnt));
  }
  const ordersByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourCounts.get(h) ?? 0,
  }));
  const busiest = ordersByHour.reduce((a, b) => (b.count > a.count ? b : a), ordersByHour[0]);
  const busiestHour = busiest.count > 0 ? busiest.hour : null;

  const paymentSplit = { cash: 0, card: 0, pos: 0 };
  for (const r of rollup) {
    if (r.g_pm === 0 && r.pm && r.pm in paymentSplit) {
      paymentSplit[r.pm as keyof typeof paymentSplit] = Number(r.cnt);
    }
  }

  const grand = rollup.find((r) => r.g_bday === 1 && r.g_hr === 1 && r.g_pm === 1);
  const totalOrders = grand ? Number(grand.cnt) : 0;
  const totalRevenue = grand ? Number(grand.revenue) : 0;
  const avgOrderValue = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;

  const avgDuration = timing[0]?.avg_dur;
  const avgDurationSeconds = avgDuration != null ? Math.round(avgDuration) : null;

  return NextResponse.json({
    summary: { totalOrders, totalRevenue, avgOrderValue, busiestHour },
    timing: {
      avgDurationSeconds,
      slowest: slowest[0]
        ? { pagerNumber: slowest[0].pagerNumber, durationSeconds: slowest[0].durationSeconds }
        : null,
    },
    revenueByDay,
    topItems: topItems.map((i) => ({
      name: i.name,
      qty: Number(i.qty),
      revenue: Number(i.revenue),
    })),
    ordersByHour,
    paymentSplit,
  });
}
