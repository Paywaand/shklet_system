// Server-side loader for the configurable operating hours. Kept separate from
// lib/businessDay.ts (which is pure and shared with the client) so the Prisma
// import never leaks into client bundles.
import { prisma } from "./prisma";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "./businessDay";

// The singleton row lives at id = 1 (see the BusinessHours model / migration).
const SINGLETON_ID = 1;

// Current operating hours, falling back to the defaults if the row (or the table,
// before the migration runs) isn't there yet. Never throws — reporting must keep
// working even if the setting hasn't been provisioned.
export async function getBusinessHours(): Promise<BusinessHours> {
  try {
    const row = await prisma.businessHours.findUnique({ where: { id: SINGLETON_ID } });
    if (row) return { openHour: row.openHour, closeHour: row.closeHour };
  } catch {
    // Table missing (pre-migration) or DB hiccup — fall through to defaults.
  }
  return DEFAULT_BUSINESS_HOURS;
}

// Persist new operating hours (upserts the singleton row). Callers must validate
// the hours first; this just clamps to whole 0–23 values as a final guard.
export async function setBusinessHours(hours: BusinessHours): Promise<BusinessHours> {
  const openHour = clampHour(hours.openHour);
  const closeHour = clampHour(hours.closeHour);
  const row = await prisma.businessHours.upsert({
    where: { id: SINGLETON_ID },
    update: { openHour, closeHour },
    create: { id: SINGLETON_ID, openHour, closeHour },
  });
  return { openHour: row.openHour, closeHour: row.closeHour };
}

function clampHour(h: number): number {
  const n = Math.trunc(Number(h));
  if (!Number.isFinite(n)) return 0;
  return Math.min(23, Math.max(0, n));
}
