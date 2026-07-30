// Human-facing short order codes. A 2-digit year prefix plus 5 uppercase
// alphanumeric characters drawn from an unambiguous alphabet (no 0/O or 1/I),
// e.g. "26-A3F9K", "26-BX72M".
//
// Why the date prefix: the random suffix space scopes uniqueness/collision
// checks to a *day's* worth of orders rather than the whole table's lifetime, so
// the generator stays fast and collision-free as the orders table grows for
// years (it never has to scan an ever-larger global keyspace).
import type { PrismaClient } from "@prisma/client";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_LENGTH = 5;

// Two-digit local year, e.g. 2026 → "26".
export function datePrefix(d: Date = new Date()): string {
  return String(d.getFullYear()).slice(-2);
}

// The random portion (no prefix).
export function randomPart(length = DEFAULT_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Generate a single random short id WITH the date prefix, e.g. "26-A3F9K".
// Math.random() is fine here — these are display codes, not security tokens, and
// uniqueness is enforced by the DB + the collision check below.
export function generateShortId(length = DEFAULT_LENGTH): string {
  return `${datePrefix()}-${randomPart(length)}`;
}

// Generate a short id that isn't already used by an Order. Regenerates on the
// (rare) event of a collision; widens the random part after many tries as a
// safety net.
export async function generateUniqueOrderShortId(prisma: PrismaClient): Promise<string> {
  const prefix = datePrefix();
  for (let attempt = 0; attempt < 20; attempt++) {
    const length = DEFAULT_LENGTH + Math.floor(attempt / 5); // 5 → 6 → … if very saturated
    const candidate = `${prefix}-${randomPart(length)}`;
    const existing = await prisma.order.findUnique({ where: { shortId: candidate } });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback: append more entropy.
  return `${prefix}-${randomPart(8)}`;
}
