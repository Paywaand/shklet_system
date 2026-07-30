// One-off backfill: credit the cash sales made before the system went live
// (8 June) to "Manager currently holds", since that cash was real, the manager
// received it, and later spent it on purchases/expenses that ARE recorded —
// without this, Expected Cash on Hand looks permanently negative. Idempotent:
// skips any date that already has a note-matching entry, so it's safe to re-run.
// Run: npx tsx prisma/backfill-cash-adjustments.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NOTE = "Pre-system-activation cash sales (before 8 June)";

const ENTRIES: { date: string; amount: number }[] = [
  { date: "2026-06-01", amount: 153_000 },
  { date: "2026-06-02", amount: 192_000 },
  { date: "2026-06-03", amount: 207_000 },
  { date: "2026-06-04", amount: 200_000 },
  { date: "2026-06-05", amount: 190_000 },
  { date: "2026-06-06", amount: 194_000 },
  { date: "2026-06-07", amount: 212_000 },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const { date, amount } of ENTRIES) {
    const existing = await prisma.cashAdjustment.findFirst({
      where: { date: new Date(date), note: NOTE },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.cashAdjustment.create({ data: { date: new Date(date), amount, note: NOTE } });
    created++;
  }
  const total = ENTRIES.reduce((s, e) => s + e.amount, 0);
  console.log(`✓ Created ${created} adjustment(s), skipped ${skipped} already present (total ${total} IQD)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
