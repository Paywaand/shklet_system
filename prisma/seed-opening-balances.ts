// One-time seed: Erbil's real opening balances as of Aug 1, 2026 for the POS,
// FIB, and Delivery money ledgers (see MoneyLedgerBaseline/MoneyLedgerEntry in
// schema.prisma). Reuses Erbil's existing Cash baseline instant (set from the
// Cash Tracking page) as the ledgers' baseline + opening-entry date, and
// subtracts any post-baseline order revenue already recorded for each bucket
// so nothing double-counts once these ledgers go live and start accruing from
// that same instant.
//
// Defaults to dry-run (prints what it would do, writes nothing).
//
//   tsx prisma/seed-opening-balances.ts          # dry-run
//   tsx prisma/seed-opening-balances.ts --apply  # writes
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BRANCH = "erbil";
type Bucket = "pos" | "fib" | "delivery";
const BUCKETS: Bucket[] = ["pos", "fib", "delivery"];
// Real balances as of Aug 1, 2026, given by the owner.
const TARGETS: Record<Bucket, number> = { pos: 10000, fib: 18000, delivery: 11000 };
const ORDER_PAYMENT_METHOD: Record<"pos" | "fib", string> = { pos: "pos", fib: "card" };

async function alreadyRecorded(bucket: Bucket, baseline: Date): Promise<number> {
  if (bucket === "delivery") {
    const agg = await prisma.deliveryOrder.aggregate({
      where: { branch: BRANCH, placedAt: { gte: baseline } },
      _sum: { netTotal: true },
    });
    return agg._sum.netTotal ?? 0;
  }
  const agg = await prisma.order.aggregate({
    where: {
      branch: BRANCH,
      paymentMethod: ORDER_PAYMENT_METHOD[bucket],
      placedAt: { gte: baseline },
      status: { not: "cancelled" },
    },
    _sum: { total: true },
  });
  return agg._sum.total ?? 0;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const cashSettings = await prisma.cashSettings.findUnique({ where: { branch: BRANCH } });
  if (!cashSettings?.baselineAt) {
    console.error(`No Cash baseline set for ${BRANCH} — set one from the Cash Tracking page first.`);
    process.exit(1);
  }
  const baseline = cashSettings.baselineAt;

  // Idempotency guard: abort if this has already run, rather than double-seeding.
  const existingOpening = await prisma.moneyLedgerEntry.findFirst({
    where: { branch: BRANCH, kind: "opening" },
  });
  if (existingOpening) {
    console.error(
      `An opening entry already exists for ${BRANCH} (bucket "${existingOpening.bucket}", ` +
        `${existingOpening.amount} IQD, dated ${existingOpening.date.toISOString()}) — ` +
        `this script has already run. Aborting to avoid double-seeding.`
    );
    process.exit(1);
  }

  console.log(`Baseline (from Cash Tracking, ${BRANCH}): ${baseline.toISOString()}`);
  console.log("");

  const plan: { bucket: Bucket; target: number; recorded: number; opening: number }[] = [];

  for (const bucket of BUCKETS) {
    const recorded = await alreadyRecorded(bucket, baseline);
    const target = TARGETS[bucket];
    const opening = target - recorded;
    plan.push({ bucket, target, recorded, opening });
    console.log(
      `${bucket.toUpperCase()}: target ${target} IQD − already recorded since baseline ${recorded} IQD = opening entry ${opening} IQD`
    );
    if (opening < 0) {
      console.error(
        `  Would need a NEGATIVE opening entry (${opening} IQD) for ${bucket} — the target figure is stale, or the baseline is wrong. Aborting without writing anything.`
      );
      process.exit(1);
    }
  }

  console.log("");
  if (!apply) {
    console.log("Dry run only — nothing written. Re-run with --apply once these numbers look right.");
    await prisma.$disconnect();
    return;
  }

  for (const { bucket, opening } of plan) {
    await prisma.moneyLedgerBaseline.upsert({
      where: { branch_bucket: { branch: BRANCH, bucket } },
      update: { baselineAt: baseline },
      create: { branch: BRANCH, bucket, baselineAt: baseline },
    });
    await prisma.moneyLedgerEntry.create({
      data: {
        branch: BRANCH,
        bucket,
        kind: "opening",
        amount: opening,
        date: baseline,
        note: "Opening balance seeded from real Aug 1, 2026 figures",
      },
    });
    console.log(`✓ ${bucket}: baseline set + opening entry of ${opening} IQD created`);
  }

  console.log("");
  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
