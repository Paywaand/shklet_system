import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { computeLedgerBalance } from "@/lib/moneyLedger";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];
const PAYMENT_METHODS = ["cash", "fib"] as const;

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("expenses.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

  const existing = await prisma.expense.findFirst({
    where: { id: params.id, branch },
    include: { ledgerEntry: true },
  });
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

  const newPaymentMethod = PAYMENT_METHODS.includes(body.paymentMethod)
    ? body.paymentMethod
    : existing.paymentMethod;
  const newAmount = (data.amount as number | undefined) ?? existing.amount;
  const newDate = (data.date as Date | undefined) ?? existing.date;
  const newCategory = (data.category as string | undefined) ?? existing.category;
  const newDescription =
    data.description !== undefined ? (data.description as string | null) : existing.description;
  if (newPaymentMethod !== existing.paymentMethod) data.paymentMethod = newPaymentMethod;

  // Keep the linked FIB settlement (if any) in sync with the expense — never let
  // them drift apart. Re-check the FIB balance whenever money newly leaves FIB
  // or a settlement amount grows.
  if (newPaymentMethod === "fib") {
    const businessHours = await getBusinessHours(branchId);
    const fibBalance = await computeLedgerBalance(branch, "fib", monthRange(new Date(), businessHours));
    // Undo the OLD settlement (if this expense was already FIB-paid) before
    // checking whether the new amount fits.
    const available = fibBalance.runningBalance + (existing.paymentMethod === "fib" ? existing.amount : 0);
    if (newAmount > available)
      return NextResponse.json(
        { error: `Amount exceeds the FIB balance (${available} IQD available)` },
        { status: 400 }
      );
  }

  const note = `Expense: ${newCategory}${newDescription ? ` — ${newDescription}` : ""}`;

  const expense = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({ where: { id: params.id }, data });

    if (existing.paymentMethod === "fib" && newPaymentMethod !== "fib" && existing.ledgerEntry) {
      // Switched off FIB — remove the settlement, it never should have applied.
      await tx.moneyLedgerEntry.delete({ where: { id: existing.ledgerEntry.id } });
    } else if (existing.paymentMethod !== "fib" && newPaymentMethod === "fib") {
      // Switched onto FIB — create the settlement now.
      await tx.moneyLedgerEntry.create({
        data: {
          branch,
          bucket: "fib",
          kind: "settlement",
          amount: newAmount,
          date: newDate,
          note,
          createdById: guard.session.sub,
          expenseId: updated.id,
        },
      });
    } else if (newPaymentMethod === "fib" && existing.ledgerEntry) {
      // Stayed FIB — keep the settlement's amount/date/note aligned.
      await tx.moneyLedgerEntry.update({
        where: { id: existing.ledgerEntry.id },
        data: { amount: newAmount, date: newDate, note },
      });
    }

    return updated;
  });

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
  // The linked FIB settlement (if any) cascades on delete — see
  // MoneyLedgerEntry.expense's onDelete: Cascade in the schema.
  const expense = await prisma.expense.delete({ where: { id: params.id } });
  await audit(
    guard.session.sub,
    `Deleted expense ${expense.amount} IQD${expense.paymentMethod === "fib" ? " (reversed FIB settlement)" : ""}`
  );
  return new NextResponse(null, { status: 204 });
}
