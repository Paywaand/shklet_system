import { closesNextDay, DEFAULT_BUSINESS_HOURS, type BusinessHours } from "./businessDay";

// Format a whole-number amount as Iraqi Dinar with thousands separators.
export function iqd(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} IQD`;
}

// Format just the number with commas (no currency suffix).
export function num(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}

// Format a (possibly fractional) ingredient quantity for reports: thousands
// separators, up to 2 decimals, trailing zeros trimmed. e.g. 1340 → "1,340",
// 0.5 → "0.5", 2.25 → "2.25". Used by the monthly ingredient-usage report where
// quantities can be grams, ml, buckets, boxes, pieces, etc.
export function qty(amount: number): string {
  const rounded = Math.round((Number(amount) || 0) * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Human-readable duration from seconds, e.g. "3m 12s".
export function duration(seconds?: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// The device/server's own IANA timezone, resolved at runtime (e.g.
// "Asia/Baghdad"). Timestamps are stored in the database as UTC instants; every
// display helper below converts that UTC instant into this zone so times read
// as the local wall-clock rather than UTC. We never hardcode a fixed offset, so
// this follows DST and location changes automatically.
export const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Short time, e.g. "14:32".
export function shortTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SYSTEM_TIME_ZONE,
  });
}

// Date like "30 May 2026".
export function shortDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYSTEM_TIME_ZONE,
  });
}

// "31/05/2026" — day/month/year.
export function dateDDMM(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SYSTEM_TIME_ZONE,
  });
}

// "30/05/2025 — 14:32" — used on the printed receipt.
export function dateTimeDDMM(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SYSTEM_TIME_ZONE,
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SYSTEM_TIME_ZONE,
  });
  return `${day} — ${time}`;
}

// Full localized date + time, e.g. "30/05/2026, 14:32:07" — used for CSV
// exports and report "generated at" stamps. Rendered in the system timezone.
export function dateTimeFull(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", { timeZone: SYSTEM_TIME_ZONE });
}

// --- Aggregation helpers (local-time bucketing) ---
// These are the bucketing counterpart to the display helpers above. Like them,
// they resolve a stored UTC instant into the SYSTEM_TIME_ZONE wall-clock — so
// "orders by hour" / "by day" group by the local hour/day the customer
// experienced, exactly matching what the order list shows. Using raw
// getHours()/getDate()/toISOString() here would bucket by the server's runtime
// zone (UTC on the deploy host), shifting every order ~3h earlier.

// Local hour (0–23) of a stored timestamp, in the system timezone.
export function localHour(date: string | Date): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: SYSTEM_TIME_ZONE,
  }).formatToParts(d);
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
}

// Local calendar day key "YYYY-MM-DD" of a stored timestamp, in the system
// timezone. Sortable and used as a day-bucket map key.
export function localDateKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SYSTEM_TIME_ZONE,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Business-day key "YYYY-MM-DD" of a stored timestamp, in the system timezone.
// Same as localDateKey but a post-midnight order (before the close hour, when the
// branch closes after midnight) rolls back to the previous calendar day, so a
// single trading night (e.g. 18:00 → 00:30) buckets under ONE day rather than
// splitting across calendar midnight. Mirrors toBusinessDay so buckets line up
// exactly with the range filters. Used for "revenue by day" / prep-time-trend.
// (localHour stays the real clock hour — the "busiest hour" stat wants the actual
// time of day, not a shifted one.) Pass the configured operating hours.
export function businessDayKey(
  date: string | Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: SYSTEM_TIME_ZONE,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  // Roll back to the previous calendar day only for the post-midnight tail of the
  // session. Date arithmetic handles month/year underflow.
  const local = new Date(year, month - 1, day);
  if (closesNextDay(hours) && hour < hours.closeHour) local.setDate(local.getDate() - 1);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Local calendar month key "YYYY-MM" of a stored timestamp, in the system
// timezone. Sortable; used to bucket/filter records by calendar month (e.g. the
// "Withdrawals" month filter on the Cash Tracking page). Calendar months, not
// trading-night business days — a withdrawal carries an admin-chosen date.
export function localMonthKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: SYSTEM_TIME_ZONE,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

// Human label for a "YYYY-MM" month key, e.g. "June 2026". Built from a stable
// mid-month UTC date so no timezone/DST edge can shift the displayed month.
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y || 1970, (m || 1) - 1, 15));
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
