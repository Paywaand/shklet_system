import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("events.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const target = await prisma.event.findFirst({ where: { id: params.id, branch } });
  if (!target) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.location !== undefined) data.location = body.location?.trim() || null;
  if (body.status === "active" || body.status === "closed") {
    data.status = body.status;
    data.closedAt = body.status === "closed" ? new Date() : null;
  }

  const event = await prisma.event.update({ where: { id: params.id }, data });
  await audit(
    guard.session.sub,
    body.status ? `Set event "${event.name}" to ${body.status}` : `Updated event "${event.name}"`
  );
  return NextResponse.json({ event });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("events.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const target = await prisma.event.findFirst({ where: { id: params.id, branch } });
  if (!target) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Detach tagged records first so history is preserved (they revert to the branch itself).
  await prisma.$transaction([
    prisma.order.updateMany({ where: { eventId: params.id }, data: { eventId: null } }),
    prisma.stockMovement.updateMany({ where: { eventId: params.id }, data: { eventId: null } }),
    prisma.expense.updateMany({ where: { eventId: params.id }, data: { eventId: null } }),
    prisma.event.delete({ where: { id: params.id } }),
  ]);
  await audit(guard.session.sub, `Deleted event ${params.id}`);
  return new NextResponse(null, { status: 204 });
}
