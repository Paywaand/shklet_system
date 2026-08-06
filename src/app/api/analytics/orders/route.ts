import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { resolveBranchFilter } from "@/lib/branchScope";
import { orderScopeWhere } from "@/lib/orderScope";
import { isPaymentMethod } from "@/lib/paymentMethods";

// GET /api/analytics/orders?from=ISO&to=ISO&page=1&pageSize=50&q=&payment=&type=&paid=
//
// The Sales page order history, paginated. This used to ride along on the
// /api/analytics payload as an unbounded array — a year-long range shipped ~45k
// orders and every line item to the browser, which was the bulk of the 30–60s
// load. Search and the payment/type/paid filters moved here from the client for
// the same reason: filtering can no longer assume the whole range is in memory.
//
// Cancelled orders are KEPT here (marked "cancelled"): the history table is a
// placement log, even though such orders never count toward revenue.

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const branch = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
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

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
  );

  const where: Prisma.OrderWhereInput = orderScopeWhere({
    branch,
    branchId: url.searchParams.get("branchId"),
    eventId: url.searchParams.get("eventId"),
    gte,
    lte,
    excludeCancelled: false,
  });

  const payment = url.searchParams.get("payment");
  if (payment && payment !== "all" && isPaymentMethod(payment)) {
    where.paymentMethod = payment;
  }

  const type = url.searchParams.get("type");
  if (type === "walk_in" || type === "takeaway") where.orderType = type;

  const paid = url.searchParams.get("paid");
  if (paid === "paid") where.isPaid = true;
  else if (paid === "unpaid") where.isPaid = false;

  // Mirrors the previous client-side search: order code, pager number, any item
  // name, or the cashier's name.
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    const or: Prisma.OrderWhereInput[] = [
      { shortId: contains },
      { items: { some: { name: contains } } },
      { staff: { fullName: contains } },
    ];
    // pagerNumber is an int, so it only participates when the query is numeric.
    const asNumber = Number(q);
    if (Number.isInteger(asNumber)) or.push({ pagerNumber: asNumber });
    where.OR = or;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, staff: { select: { fullName: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
