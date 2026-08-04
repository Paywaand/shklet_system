import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// PATCH /api/delivery-orders/:id/cancel — cashier-facing cancel, distinct from
// the admin/manager-only hard DELETE. Mirrors /api/orders/:id/cancel exactly:
// allowed for any authenticated staff role, only while the order is still
// "pending" (not yet marked ready) — enforced server-side, not just a hidden
// UI button. Sets status to "cancelled" instead of deleting the row so the
// order stays in the audit trail; /api/orders/active's delivery query already
// whitelists ["pending","ready","driver_arrived"], so a cancelled order drops
// out of the active queue automatically.
export async function PATCH(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;

  const branch = await activeBranch(guard.session);
  const order = await prisma.deliveryOrder.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "pending")
    return NextResponse.json(
      { error: "Only pending orders can be cancelled — this one is already ready or further along" },
      { status: 400 }
    );

  const updated = await prisma.deliveryOrder.update({
    where: { id: params.id },
    data: { status: "cancelled" },
  });
  await audit(
    guard.session.sub,
    `Cancelled ${order.platformName} order${order.reference ? ` "${order.reference}"` : ""} (${order.grossTotal} IQD)`
  );
  return NextResponse.json({ order: updated });
}
