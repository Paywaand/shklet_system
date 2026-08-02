// Shared helpers for the Sales-page cash sections (Expected Cash on Hand + admin
// Cash Tracking). Server-only (no Prisma import here so it's safe to reuse).
import {
  getBusinessDayBounds,
  currentBusinessDay,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHours,
} from "./businessDay";

// Current month (or an offset month, e.g. -1 for last month, -12 for the same
// month last year) as a Prisma date filter { gte, lte }, aligned to business
// days: it runs from the start of the 1st's business day to the end of the
// last day's business day. This keeps the trading night that straddles each
// month boundary attributed to the correct month (a 00:30 sale on the 1st
// counts toward the previous month, where its business day began). Pass the
// configured hours so the alignment matches the rest of the app.
export function monthRange(
  now = new Date(),
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  monthOffset = 0
): { gte: Date; lte: Date } {
  const today = currentBusinessDay(now, hours);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0);
  return {
    gte: getBusinessDayBounds(firstOfMonth, hours).start,
    lte: getBusinessDayBounds(lastOfMonth, hours).end,
  };
}

// Recipients for cash withdrawals (money leaving the business to a named person)
// are FREE TEXT in Shklet — each branch has its own people, so a fixed list makes
// no sense. Per-person totals are grouped dynamically from the actual rows.

// Where a withdrawal draws its cash from. "safe" reduces the safe balance; "manager"
// reduces what the manager currently holds (Expected Cash on Hand).
export const WITHDRAWAL_SOURCES = ["safe", "manager"] as const;
export type WithdrawalSource = (typeof WITHDRAWAL_SOURCES)[number];
