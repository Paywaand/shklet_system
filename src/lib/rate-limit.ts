/**
 * Simple in-memory login rate limiter (per-process). Good enough for a
 * single-instance deployment (1-5 staff devices per branch); if Shklet ever
 * scales to multiple instances behind a load balancer, swap this for a
 * shared store (Redis) — the interface would stay the same.
 */
const attempts = new Map<string, { count: number; firstAttemptAt: number }>();

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMinutes: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    return { allowed: true, retryAfterMinutes: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.firstAttemptAt);
    return { allowed: false, retryAfterMinutes: Math.ceil(retryAfterMs / 60000) };
  }

  return { allowed: true, retryAfterMinutes: 0 };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
