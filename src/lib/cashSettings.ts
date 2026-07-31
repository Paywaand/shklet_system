// Server-side loader for the per-city cash baseline (see CashSettings in
// schema.prisma). Kept separate from lib/cash.ts, which is deliberately
// Prisma-free.
import { prisma } from "./prisma";

// The instant before which cash activity never counts toward Expected Cash on
// Hand / Cash Tracking for this city. null = no floor (all-time).
export async function getCashBaseline(branch: string): Promise<Date | null> {
  const row = await prisma.cashSettings.findUnique({ where: { branch } });
  return row?.baselineAt ?? null;
}

// Clamp a query's lower date bound to the baseline (whichever is LATER wins),
// so no cash activity before go-live can ever leak into the figure — even if a
// custom date range is picked that spans further back.
export function clampToBaseline(gte: Date | undefined, baseline: Date | null): Date | undefined {
  if (!baseline) return gte;
  if (!gte || baseline > gte) return baseline;
  return gte;
}
