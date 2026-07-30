import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("expenses.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const existing = await prisma.expense.findFirst({ where: { id: params.id, branch } });
  if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category))
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    data.category = body.category;
  }
  if (body.amount !== undefined) {
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    data.amount = amount;
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.date !== undefined) data.date = new Date(body.date);
  // Cash source is admin-only; ignore the field for non-admins.
  if (body.source !== undefined && guard.session.role === "admin")
    data.source = body.source === "safe" ? "safe" : "manager";

  const expense = await prisma.expense.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated expense ${expense.amount} IQD`);
  return NextResponse.json({ expense });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("expenses.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const target = await prisma.expense.findFirst({ where: { id: params.id, branch } });
  if (!target) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  const expense = await prisma.expense.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted expense ${expense.amount} IQD`);
  return new NextResponse(null, { status: 204 });
}
