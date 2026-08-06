import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { computeLedgerBalance } from "@/lib/moneyLedger";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];
const PAYMENT_METHODS = ["cash", "fib"] as const;

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
  const branchId = await activeBranchId(guard.session);

  const body = await req.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  const category = body.category;
  if (!CATEGORIES.includes(category))
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });

  const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : "cash";

  // Cash source is an admin-only choice (manager vs safe); managers' expenses are
  // always "manager". Only meaningful when paymentMethod is "cash". Defaults to "manager".
  const source =
    guard.session.role === "admin" && body.source === "safe" ? "safe" : "manager";

  // An event link must belong to the same branch.
  if (body.eventId) {
    const ev = await prisma.event.findFirst({ where: { id: String(body.eventId), branch } });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 400 });
  }

  const date = body.date ? new Date(body.date) : new Date();
  const description = body.description?.trim() || null;

  // FIB-paid expenses draw straight from the branch's FIB running balance — same
  // "never exceed the available balance" rule as a Cash Tracking withdrawal.
  if (paymentMethod === "fib") {
    const businessHours = await getBusinessHours(branchId);
    const fibBalance = await computeLedgerBalance(branch, "fib", monthRange(new Date(), businessHours));
    if (amount > fibBalance.runningBalance)
      return NextResponse.json(
        { error: `Amount exceeds the FIB balance (${fibBalance.runningBalance} IQD available)` },
        { status: 400 }
      );
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        amount,
        branch,
        category,
        paymentMethod,
        source,
        description,
        date,
        createdById: guard.session.sub,
        eventId: body.eventId || null, // "Linked to": null = the branch itself
      },
    });
    if (paymentMethod === "fib") {
      await tx.moneyLedgerEntry.create({
        data: {
          branch,
          bucket: "fib",
          kind: "settlement",
          amount,
          date,
          note: `Expense: ${category}${description ? ` — ${description}` : ""}`,
          createdById: guard.session.sub,
          expenseId: created.id,
        },
      });
    }
    return created;
  });

  await audit(
    guard.session.sub,
    paymentMethod === "fib"
      ? `Added expense ${amount} IQD (${category}, from FIB)`
      : `Added expense ${amount} IQD (${category}, from ${source})`
  );
  return NextResponse.json({ expense }, { status: 201 });
}
