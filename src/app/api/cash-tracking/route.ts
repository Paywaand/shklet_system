import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import type { Branch } from "@/lib/branches";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";
import { WithdrawalInputSchema } from "@/lib/schemas";

// Admin-only cash reconciliation for the Sales page. Two kinds of record live here:
//
//   • SafeEntry      — admin moves cash into the safe; each deposit is automatically
//                      taken from the manager's wallet (no separate "collect" step).
//   • CashWithdrawal — money actually LEAVING the business to a named person, sourced
//                      from either the safe or the manager directly.
//
// Money model (safe deposits + withdrawals are all-time running balances; sales and
// expenses are scoped to the current calendar month, matching the existing behaviour):
//   expectedCashOnHand = cashSales − totalExpenses                       (pre-safe)
//   safeTotal          = safeDeposits − safeExpenses − safeWithdrawals
//   managerHolds       = expectedCashOnHand − safeDeposits + safeExpenses − managerWithdrawals
//                      = cashSales − managerExpenses − safeDeposits − managerWithdrawals
//
// A "safe" withdrawal only draws down the safe; a "manager" withdrawal only draws down
// what the manager holds (and therefore Expected Cash on Hand). They never cross over.
function ensureAdmin(role: string) {
  return role === "admin";
}

function loadSafeEntries(branch: Branch) {
  // Safe is a running balance — all deposits count. The full list is returned to the
  // client (the ledger UI), so this stays a findMany.
  return prisma.safeEntry.findMany({
    where: { branch },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
}

function loadWithdrawals(branch: Branch) {
  // All-time list, same convention as safeEntries. Totals + per-source sums are
  // derived from this one query in JS (the list is small).
  return prisma.cashWithdrawal.findMany({
    where: { branch },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
}

function loadCashAdjustments(branch: Branch) {
  // All-time list, same convention as safeEntries/withdrawals — a historical
  // correction stays true regardless of which calendar month is "current".
  return prisma.cashAdjustment.findMany({
    where: { branch },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
}

type CashState = {
  safeEntries: Awaited<ReturnType<typeof loadSafeEntries>>;
  withdrawals: Awaited<ReturnType<typeof loadWithdrawals>>;
  cashAdjustments: Awaited<ReturnType<typeof loadCashAdjustments>>;
  safeDeposits: number;
  safeExpenses: number;
  safeWithdrawals: number;
  managerWithdrawals: number;
  cashAdjustmentsTotal: number;
  expectedCashOnHand: number; // pre-safe (cashSales + cashAdjustments − totalExpenses)
  safeTotal: number;
  managerHolds: number;
  withdrawalTotals: Record<string, number>;
};

// Single source of truth for the four reconciliation figures, shared by GET (to
// render) and POST (to enforce the per-source max before creating a withdrawal).
async function computeCashState(branch: Branch): Promise<CashState> {
  const { gte, lte } = monthRange(new Date(), await getBusinessHours());

  const [safeEntries, withdrawals, cashAdjustments, cashOrders, expensesBySource] = await Promise.all([
    loadSafeEntries(branch),
    loadWithdrawals(branch),
    loadCashAdjustments(branch),
    // Cancelled orders never took money and must not count as sales.
    prisma.order.aggregate({
      where: { branch, paymentMethod: "cash", placedAt: { gte, lte }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    prisma.expense.groupBy({
      by: ["source"],
      where: { branch, date: { gte, lte } },
      _sum: { amount: true },
    }),
  ]);

  const safeDeposits = safeEntries.reduce((s, e) => s + e.amount, 0);
  const cashSales = cashOrders._sum.total ?? 0;
  const cashAdjustmentsTotal = cashAdjustments.reduce((s, a) => s + a.amount, 0);
  const totalExpenses = expensesBySource.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const safeExpenses =
    expensesBySource.find((g) => g.source === "safe")?._sum.amount ?? 0;

  const safeWithdrawals = withdrawals
    .filter((w) => w.source === "safe")
    .reduce((s, w) => s + w.amount, 0);
  const managerWithdrawals = withdrawals
    .filter((w) => w.source === "manager")
    .reduce((s, w) => s + w.amount, 0);

  // Per-person totals, grouped dynamically from the actual withdrawal rows
  // (recipients are free text — each branch has its own people).
  const withdrawalTotals: Record<string, number> = {};
  for (const w of withdrawals) {
    withdrawalTotals[w.recipient] = (withdrawalTotals[w.recipient] ?? 0) + w.amount;
  }

  // cashAdjustmentsTotal is all-time, same as safeDeposits/managerWithdrawals —
  // a historical correction (e.g. pre-system-activation cash sales) permanently
  // offsets those all-time drains instead of resetting every "current month".
  const expectedCashOnHand = cashSales + cashAdjustmentsTotal - totalExpenses;
  const safeTotal = safeDeposits - safeExpenses - safeWithdrawals;
  const managerHolds = expectedCashOnHand - safeDeposits + safeExpenses - managerWithdrawals;

  return {
    safeEntries,
    withdrawals,
    cashAdjustments,
    safeDeposits,
    safeExpenses,
    safeWithdrawals,
    managerWithdrawals,
    cashAdjustmentsTotal,
    expectedCashOnHand,
    safeTotal,
    managerHolds,
    withdrawalTotals,
  };
}

// GET /api/cash-tracking
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (!ensureAdmin(guard.session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const state = await computeCashState(branch);

  return NextResponse.json({
    safeEntries: state.safeEntries,
    safeDeposits: state.safeDeposits,
    safeExpenses: state.safeExpenses,
    safeTotal: state.safeTotal,
    expectedCashOnHand: state.expectedCashOnHand,
    managerHolds: state.managerHolds,
    withdrawals: state.withdrawals,
    withdrawalTotals: state.withdrawalTotals,
    cashAdjustments: state.cashAdjustments,
    cashAdjustmentsTotal: state.cashAdjustmentsTotal,
  });
}

// POST /api/cash-tracking
//   kind:"withdrawal"  { amount, source, recipient, date?, note? } → record money
//                       leaving the business to a named person; returns { withdrawal }.
//   kind:"adjustment"  { amount, date?, note? }                    → credit historical
//                       cash that never passed through the POS (e.g. pre-activation
//                       sales) to the manager; returns { adjustment }.
//   otherwise          { date?, amount, note? }                    → add cash to the
//                       safe (auto-taken from the manager); returns { entry }.
export async function POST(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (!ensureAdmin(guard.session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));

  if (body.kind === "adjustment") {
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });

    const adjustment = await prisma.cashAdjustment.create({
      data: {
        amount,
        branch,
        note: body.note?.trim() || null,
        date: body.date ? new Date(body.date) : new Date(),
        createdById: guard.session.sub,
      },
    });
    await audit(guard.session.sub, `Cash adjustment +${amount} IQD (historical, credited to manager)`);
    return NextResponse.json({ adjustment }, { status: 201 });
  }

  if (body.kind === "withdrawal") {
    const parsed = WithdrawalInputSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid withdrawal" },
        { status: 400 }
      );
    const { amount, source, recipient, date, note } = parsed.data;

    // Enforce the per-source max so a withdrawal can never drive a balance negative.
    const state = await computeCashState(branch);
    const available = source === "safe" ? state.safeTotal : state.managerHolds;
    if (amount > available)
      return NextResponse.json(
        { error: `Amount exceeds the ${source} balance (${available} IQD available)` },
        { status: 400 }
      );

    const withdrawal = await prisma.cashWithdrawal.create({
      data: {
        amount,
        branch,
        source,
        recipient,
        note: note || null,
        date: date ? new Date(date) : new Date(),
        createdById: guard.session.sub,
      },
    });
    await audit(
      guard.session.sub,
      `Withdrew ${amount} IQD from ${source} to ${recipient}`
    );
    return NextResponse.json({ withdrawal }, { status: 201 });
  }

  // Default: add cash to the safe (automatically taken from the manager's wallet).
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });

  const entry = await prisma.safeEntry.create({
    data: {
      amount,
      branch,
      note: body.note?.trim() || null,
      date: body.date ? new Date(body.date) : new Date(),
      createdById: guard.session.sub,
    },
  });
  await audit(guard.session.sub, `Safe deposit ${amount} IQD (taken from manager)`);
  return NextResponse.json({ entry }, { status: 201 });
}
