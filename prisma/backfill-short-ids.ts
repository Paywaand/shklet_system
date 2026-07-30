// One-off backfill: assign a unique shortId to every existing Order that lacks
// one. Idempotent — safe to re-run; only fills nulls. Run: npx tsx prisma/backfill-short-ids.ts
import { PrismaClient } from "@prisma/client";
import { generateUniqueOrderShortId } from "../src/lib/shortId";

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: { shortId: null },
    select: { id: true },
  });
  console.log(`Backfilling ${orders.length} order(s)…`);
  for (const o of orders) {
    const shortId = await generateUniqueOrderShortId(prisma);
    await prisma.order.update({ where: { id: o.id }, data: { shortId } });
  }
  console.log("✓ Done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
