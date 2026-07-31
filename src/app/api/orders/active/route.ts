import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";

// GET /api/orders/active — pending + ready orders for the live queue, scoped to
// the active physical branch. ?eventId= follows the app-wide convention:
// "main" = the branch itself (null), an event id = that event, omitted =
// unfiltered.
export async function GET(req: Request) {
  const guard = await authorize("pos.use");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

  const url = new URL(req.url);
  const eventIdParam = url.searchParams.get("eventId");
  const eventId = eventIdParam ? (eventIdParam === "main" ? null : eventIdParam) : undefined;

  const [orders, deliveryOrders, pagerHolders] = await Promise.all([
    prisma.order.findMany({
      where: {
        branchId,
        status: { in: ["pending", "ready"] },
        ...(eventId !== undefined ? { eventId } : {}),
      },
      orderBy: { placedAt: "asc" },
      include: { items: true, staff: { select: { fullName: true } } },
    }),
    // Active delivery-platform orders shown in the same operational queue
    // (separate table, per-city, since delivery stays city-scoped).
    prisma.deliveryOrder.findMany({
      where: { branch, status: { in: ["pending", "ready", "driver_arrived"] } },
      orderBy: { placedAt: "asc" },
      include: { items: true, staff: { select: { fullName: true } } },
    }),
    // Pagers are unique per physical branch (see POST /api/orders), so this
    // must stay event-unfiltered even when `orders` above is scoped to one event.
    eventId !== undefined
      ? prisma.order.findMany({
          where: { branchId, status: { in: ["pending", "ready"] } },
          select: { pagerNumber: true },
        })
      : null,
  ]);

  // Pager numbers currently taken (1–30) — delivery orders don't use pagers.
  const usedPagers = (pagerHolders ?? orders).map((o) => o.pagerNumber);

  return NextResponse.json({ orders, deliveryOrders, usedPagers });
}
