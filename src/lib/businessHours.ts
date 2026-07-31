// Server-side loader for the configurable per-branch operating hours. Kept
// separate from lib/businessDay.ts (which is pure and shared with the client)
// so the Prisma import never leaks into client bundles.
import { prisma } from "./prisma";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "./businessDay";

// Current operating hours for one physical branch, falling back to defaults if
// the branch can't be found. Never throws — reporting must keep working even if
// the branch was deleted or hours haven't been provisioned.
export async function getBusinessHours(branchId: string): Promise<BusinessHours> {
  try {
    const row = await prisma.branch.findUnique({ where: { id: branchId } });
    if (row) return { openHour: row.openHour, closeHour: row.closeHour };
  } catch {
    // DB hiccup — fall through to defaults.
  }
  return DEFAULT_BUSINESS_HOURS;
}

// Persist new operating hours for one branch. Callers must validate the hours
// first; this just clamps to whole 0–23 values as a final guard.
export async function setBusinessHours(branchId: string, hours: BusinessHours): Promise<BusinessHours> {
  const openHour = clampHour(hours.openHour);
  const closeHour = clampHour(hours.closeHour);
  const row = await prisma.branch.update({
    where: { id: branchId },
    data: { openHour, closeHour },
  });
  return { openHour: row.openHour, closeHour: row.closeHour };
}

function clampHour(h: number): number {
  const n = Math.trunc(Number(h));
  if (!Number.isFinite(n)) return 0;
  return Math.min(23, Math.max(0, n));
}
