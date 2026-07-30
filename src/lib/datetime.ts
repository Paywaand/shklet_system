/**
 * Central date/time formatting.
 *
 * Timestamps are always stored as UTC instants in the DB. Every display in
 * the app must go through these helpers rather than calling raw
 * `toLocaleString()` / `getHours()` directly on a `Date`, because those
 * silently use the JS runtime's local timezone — which, on a server, is the
 * *server's* timezone, not the kiosk's. We resolve one explicit IANA zone
 * here so displayed times are consistent regardless of where Node runs.
 */

export const SHKLET_TIMEZONE = "Asia/Baghdad";

export function formatDateTime(date: Date | string, locale: "en" | "ku" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === "ku" ? "en-GB" : "en-US", {
    timeZone: SHKLET_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHKLET_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHKLET_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function localHour(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: SHKLET_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return parseInt(hourStr, 10) % 24;
}

/**
 * Resolves which "business day" a UTC instant belongs to, given a
 * configurable opening hour. If closingHour <= openingHour, the business day
 * is treated as crossing midnight (e.g. open 17:00, close 01:00) — an order
 * placed at 00:30 local time counts toward the *previous* business day.
 * Returns a YYYY-MM-DD key in the Shklet timezone.
 */
export function businessDayKey(date: Date | string, openingHour: number): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const hour = localHour(d);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHKLET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // en-CA gives YYYY-MM-DD

  if (hour < openingHour) {
    // Belongs to the previous business day.
    const [y, m, day] = dateStr.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 1, day - 1));
    return prev.toISOString().slice(0, 10);
  }
  return dateStr;
}
