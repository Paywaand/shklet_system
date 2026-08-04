import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// PATCH /api/orders/:id { action: "ready" | "collected" }
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("pos.use");
  if (!guard.ok) return guard.response;

  const { action } = await req.json().catch(() => ({}));
  const branch = await activeBranch(guard.session);
  const order = await prisma.order.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "ready") {
    const readyAt = new Date();
    const durationSeconds = Math.round((readyAt.getTime() - order.placedAt.getTime()) / 1000);
    const updated = await prisma.order.update({
      where: { id: params.id },
      data: { status: "ready", readyAt, durationSeconds },
    });
    await audit(guard.session.sub, `Marked order #${order.pagerNumber} ready (${durationSeconds}s)`);
    return NextResponse.json({ order: updated });
  }

  if (action === "collected") {
    const updated = await prisma.order.update({
      where: { id: params.id },
      data: { status: "collected", collectedAt: new Date() },
    });
    await audit(guard.session.sub, `Collected order #${order.pagerNumber} — pager freed`);
    return NextResponse.json({ order: updated });
  }

  if (action === "mark_paid") {
    const updated = await prisma.order.update({
      where: { id: params.id },
      data: { isPaid: true },
    });
    await audit(guard.session.sub, `Marked order #${order.pagerNumber} as paid`);
    return NextResponse.json({ order: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// DELETE /api/orders/:id — permanently remove an order. Admin/manager-only
// (enforced by role), so cashiers can't delete via the API even though they
// can reach order actions. Hard-delete matches the rest of the codebase;
// OrderItems cascade, so the order vanishes from every report, chart, total,
// and export automatically.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin" && guard.session.role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const branch = await activeBranch(guard.session);
  const order = await prisma.order.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await prisma.order.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted order #${order.pagerNumber} (${order.total} IQD)`);
  return new NextResponse(null, { status: 204 });
}
