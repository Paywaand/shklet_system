// Server-side loader for the per-branch, per-bucket money-ledger baselines
// (see MoneyLedgerBaseline in schema.prisma) — the same "go-live floor"
// concept as getCashBaseline() in cashSettings.ts, generalized to the
// pos/fib/delivery buckets. clampToBaseline() is reused as-is from there,
// since it's already bucket-agnostic (just Date | null in, Date | undefined out).
import { prisma } from "./prisma";
import type { MoneyLedgerBucket } from "./moneyLedger";

export async function getLedgerBaseline(
  branch: string,
  bucket: MoneyLedgerBucket
): Promise<Date | null> {
  const row = await prisma.moneyLedgerBaseline.findUnique({
    where: { branch_bucket: { branch, bucket } },
  });
  return row?.baselineAt ?? null;
}
