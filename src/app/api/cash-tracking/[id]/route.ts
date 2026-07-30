import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// DELETE /api/cash-tracking/:id?kind=safe|withdrawal|adjustment — admin-only.
//   kind=safe (default) — removes a safe deposit (returns that cash conceptually to
//                         the manager).
//   kind=withdrawal     — removes a withdrawal (restores that cash to whichever source
//                         it was taken from; the balances recompute on next GET).
//   kind=adjustment     — removes a historical cash adjustment.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const branch = await activeBranch(guard.session);
  const kind = new URL(req.url).searchParams.get("kind");

  if (kind === "withdrawal") {
    const row = await prisma.cashWithdrawal.findFirst({ where: { id: params.id, branch } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.cashWithdrawal.delete({ where: { id: params.id } });
    await audit(guard.session.sub, `Deleted withdrawal`);
    return new NextResponse(null, { status: 204 });
  }

  if (kind === "adjustment") {
    const row = await prisma.cashAdjustment.findFirst({ where: { id: params.id, branch } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.cashAdjustment.delete({ where: { id: params.id } });
    await audit(guard.session.sub, `Deleted cash adjustment`);
    return new NextResponse(null, { status: 204 });
  }

  const row = await prisma.safeEntry.findFirst({ where: { id: params.id, branch } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.safeEntry.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted safe deposit`);
  return new NextResponse(null, { status: 204 });
}
