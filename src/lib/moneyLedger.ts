// Running-balance computation for the POS/FIB/Delivery money ledgers — the
// non-cash counterpart to computeExpectedCashOnHand() in expectedCash.ts.
// Unlike Cash (which splits into Safe vs Manager), each of these three
// buckets is a single running balance:
//   runningBalance = period order revenue (accrual) + opening entries − settlement entries
// "Period order revenue" is the same Order/DeliveryOrder aggregate Sales
// already computes; opening/settlement entries are MoneyLedgerEntry rows,
// summed all-time since the bucket's baseline (same convention SafeEntry
// uses in expectedCash.ts).
import { prisma } from "./prisma";
import { getLedgerBaseline } from "./moneyLedgerSettings";
import { clampToBaseline } from "./cashSettings";

export const MONEY_LEDGER_BUCKETS = ["pos", "fib", "delivery"] as const;
export type MoneyLedgerBucket = (typeof MONEY_LEDGER_BUCKETS)[number];

export function isMoneyLedgerBucket(v: unknown): v is MoneyLedgerBucket {
  return typeof v === "string" && (MONEY_LEDGER_BUCKETS as readonly string[]).includes(v);
}

// Order.paymentMethod values backing the "pos" and "fib" buckets (see
// paymentMethods.ts — "card" displays as "FIB" everywhere in the app).
const ORDER_PAYMENT_METHOD: Record<"pos" | "fib", string> = { pos: "pos", fib: "card" };

export type MoneyLedgerResult = {
  accrual: number;
  openingTotal: number;
  settlementTotal: number;
  runningBalance: number;
  range: { gte?: Date; lte?: Date };
};

async function computeAccrual(
  bucket: MoneyLedgerBucket,
  branch: string,
  gte: Date | undefined,
  lte: Date | undefined,
  eventId?: string | null
): Promise<number> {
  if (bucket === "delivery") {
    // DeliveryOrder has no eventId column — delivery orders aren't linked to events.
    const agg = await prisma.deliveryOrder.aggregate({
      where: { branch, placedAt: { gte, lte } },
      _sum: { netTotal: true },
    });
    return agg._sum.netTotal ?? 0;
  }
  // Cancelled orders never took money and must not count (same rule as Cash).
  const agg = await prisma.order.aggregate({
    where: {
      branch,
      paymentMethod: ORDER_PAYMENT_METHOD[bucket],
      placedAt: { gte, lte },
      status: { not: "cancelled" },
      ...(eventId !== undefined ? { eventId } : {}),
    },
    _sum: { total: true },
  });
  return agg._sum.total ?? 0;
}

export async function computeLedgerBalance(
  branch: string,
  bucket: MoneyLedgerBucket,
  range: { gte?: Date; lte?: Date },
  eventId?: string | null
): Promise<MoneyLedgerResult> {
  const baseline = await getLedgerBaseline(branch, bucket);
  const gte = clampToBaseline(range.gte, baseline);
  const { lte } = range;

  const [accrual, openingAgg, settlementAgg] = await Promise.all([
    computeAccrual(bucket, branch, gte, lte, eventId),
    prisma.moneyLedgerEntry.aggregate({
      where: { branch, bucket, kind: "opening", ...(baseline ? { date: { gte: baseline } } : {}) },
      _sum: { amount: true },
    }),
    prisma.moneyLedgerEntry.aggregate({
      where: { branch, bucket, kind: "settlement", ...(baseline ? { date: { gte: baseline } } : {}) },
      _sum: { amount: true },
    }),
  ]);

  const openingTotal = openingAgg._sum.amount ?? 0;
  const settlementTotal = settlementAgg._sum.amount ?? 0;
  const runningBalance = accrual + openingTotal - settlementTotal;

  return { accrual, openingTotal, settlementTotal, runningBalance, range: { gte, lte } };
}
