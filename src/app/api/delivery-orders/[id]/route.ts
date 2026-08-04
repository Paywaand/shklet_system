import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// PATCH /api/delivery-orders/:id { action: "ready" | "driver_arrived" | "collected" }
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("pos.use");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const { action } = await req.json().catch(() => ({}));
  const order = await prisma.deliveryOrder.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "ready") {
    const readyAt = new Date();
    const prepSeconds = Math.round((readyAt.getTime() - order.placedAt.getTime()) / 1000);
    const updated = await prisma.deliveryOrder.update({
      where: { id: params.id },
      data: { status: "ready", readyAt, prepSeconds },
    });
    await audit(guard.session.sub, `${order.platformName} order ready (${prepSeconds}s)`);
    return NextResponse.json({ order: updated });
  }

  if (action === "driver_arrived") {
    const driverArrivedAt = new Date();
    const base = order.readyAt ?? order.placedAt;
    const arriveSeconds = Math.round((driverArrivedAt.getTime() - base.getTime()) / 1000);
    const updated = await prisma.deliveryOrder.update({
      where: { id: params.id },
      data: { status: "driver_arrived", driverArrivedAt, arriveSeconds },
    });
    await audit(guard.session.sub, `${order.platformName} driver arrived (${arriveSeconds}s after ready)`);
    return NextResponse.json({ order: updated });
  }

  if (action === "collected") {
    const updated = await prisma.deliveryOrder.update({
      where: { id: params.id },
      data: { status: "collected", collectedAt: new Date() },
    });
    await audit(guard.session.sub, `${order.platformName} order collected`);
    return NextResponse.json({ order: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// DELETE /api/delivery-orders/:id — permanently remove a delivery order.
//
// ADMIN/MANAGER-ONLY by role (the same model as branch order deletion): even
// though all roles can *place* delivery orders, only an admin or manager may
// delete one. A cashier session hitting this endpoint directly — via the
// console or curl — gets a 403. Hard-delete; DeliveryOrderItem rows cascade
// (onDelete: Cascade in the schema), so no constraint errors.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin" && guard.session.role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const order = await prisma.deliveryOrder.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await prisma.deliveryOrder.delete({ where: { id: params.id } });
  await audit(
    guard.session.sub,
    `Deleted ${order.platformName} order ${order.reference ? `"${order.reference}" ` : ""}(${order.grossTotal} IQD)`
  );
  return new NextResponse(null, { status: 204 });
}
