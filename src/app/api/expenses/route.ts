import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];

// GET /api/expenses?from=ISO&to=ISO&category=Rent
export async function GET(req: Request) {
  const guard = await authorize("expenses.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");

  const where: { branch: string; date?: { gte?: Date; lte?: Date }; category?: string } = { branch };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  if (category && category !== "all") where.category = category;

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({ expenses, total, categories: CATEGORIES });
}

// POST /api/expenses
export async function POST(req: Request) {
  const guard = await authorize("expenses.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  const category = body.category;
  if (!CATEGORIES.includes(category))
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });

  // Cash source is an admin-only choice (manager vs safe); managers' expenses are
  // always "manager". Defaults to "manager".
  const source =
    guard.session.role === "admin" && body.source === "safe" ? "safe" : "manager";

  // An event link must belong to the same branch.
  if (body.eventId) {
    const ev = await prisma.event.findFirst({ where: { id: String(body.eventId), branch } });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      amount,
      branch,
      category,
      source,
      description: body.description?.trim() || null,
      date: body.date ? new Date(body.date) : new Date(),
      createdById: guard.session.sub,
      eventId: body.eventId || null, // "Linked to": null = the branch itself
    },
  });
  await audit(guard.session.sub, `Added expense ${amount} IQD (${category}, from ${source})`);
  return NextResponse.json({ expense }, { status: 201 });
}
