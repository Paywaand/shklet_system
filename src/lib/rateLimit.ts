// Tiny in-memory fixed-window rate limiter for login brute-force protection.
//
// The app runs as a SINGLE Railway replica, so a per-process in-memory store is
// sufficient and avoids adding Redis. NOTE: if this is ever scaled to multiple
// replicas, the counter must move to a shared store (the DB or Redis) — otherwise
// each replica keeps its own count and the effective limit multiplies by N.
// The limiter is driven from the login *route* (Node runtime) rather than the
// Edge middleware because only the route knows whether an attempt actually
// failed — and counting *failed* attempts is the requirement (5 / 15 min).

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILS = 5; // max failed attempts per window per key

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export type RateLimitState = {
  blocked: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

// Check whether `key` is currently blocked, WITHOUT recording an attempt.
export function checkRateLimit(key: string): RateLimitState {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    return { blocked: false, remaining: MAX_FAILS, retryAfterSeconds: 0 };
  }
  const blocked = b.count >= MAX_FAILS;
  return {
    blocked,
    remaining: Math.max(0, MAX_FAILS - b.count),
    retryAfterSeconds: blocked ? Math.ceil((b.resetAt - now) / 1000) : 0,
  };
}

// Record one failed attempt for `key` and return the resulting state.
export function recordFailure(key: string): RateLimitState {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  const blocked = b.count >= MAX_FAILS;
  return {
    blocked,
    remaining: Math.max(0, MAX_FAILS - b.count),
    retryAfterSeconds: blocked ? Math.ceil((b.resetAt - now) / 1000) : 0,
  };
}

// Clear the counter for `key` (called on a successful login).
export function clearRateLimit(key: string) {
  buckets.delete(key);
}

// Derive a best-effort client IP from common proxy headers (Railway sets
// x-forwarded-for). Falls back to a constant so the limiter still works locally.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
