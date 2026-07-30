// Business-day boundaries — the single source of truth for "what day is it" in
// all reporting.
//
// The branch operates roughly 17:00 → 01:00 (5 PM to 1 AM), so one "business
// day" spans two calendar dates: it starts at the opening hour and runs until
// the closing hour, which — when it is at or before the opening hour — lands on
// the NEXT calendar day. An order placed at 00:30 therefore belongs to the
// PREVIOUS calendar date's business day, not the new calendar date.
//
// The opening/closing hours are CONFIGURABLE (admin → Staff page) and stored in
// the BusinessHours table; server code loads them via lib/businessHours.ts and
// the client receives them through the session context. Every function here
// takes the hours explicitly (defaulting to DEFAULT_BUSINESS_HOURS) so it stays
// a pure, testable function with no global/DB dependency.
//
// Time-zone note: like the calendar-midnight range helpers it replaces, this
// works in the runtime's LOCAL wall-clock. On the kiosk (browser) and the branch
// server that is the branch's own zone, so the hours mean local wall-clock hours
// — exactly what staff experience. Stored timestamps stay UTC instants; the Date
// objects returned here serialise back to the correct UTC instants when handed
// to Prisma or an API query string. This mirrors the existing assumption in
// lib/format.ts that the runtime zone is the branch's zone.

// Default operating hours, used as a fallback before the configured row loads
// (and by unit-level callers that don't care about configuration). 17 = 5 PM
// open, 1 = 1 AM close (next day).
export const DEFAULT_OPEN_HOUR = 17;
export const DEFAULT_CLOSE_HOUR = 1;

export type BusinessHours = { openHour: number; closeHour: number };

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  openHour: DEFAULT_OPEN_HOUR,
  closeHour: DEFAULT_CLOSE_HOUR,
};

// True when the closing hour falls on the calendar day AFTER the opening hour
// (e.g. open 17:00, close 01:00). This is what stops a 1 AM close being mistaken
// for a same-morning close: close <= open ⇒ it belongs to the next day.
export function closesNextDay(hours: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  return hours.closeHour <= hours.openHour;
}

// The bounds of the business day that the given date's CALENDAR day labels.
// With open 17:00 / close 01:00:
//   getBusinessDayBounds(June 10, …) →
//     start: June 10 17:00:00.000  (doors open)
//     end:   June 11 00:59:59.999  (last instant before the 01:00 close, next day)
// With a same-day close (e.g. open 10:00 / close 22:00) start and end sit on the
// same calendar date. Only the year/month/day of `date` are used; the time of
// day is ignored, so it is safe to pass either a business-day label (00:00) or a
// raw timestamp.
export function getBusinessDayBounds(
  date: Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS
): { start: Date; end: Date } {
  const { openHour, closeHour } = hours;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openHour, 0, 0, 0);
  // The close rolls to the next calendar day when it is at/before the open hour.
  const dayOffset = closesNextDay(hours) ? 1 : 0;
  // The close hour is exclusive (the branch shuts at exactly closeHour:00), so
  // the last instant that still counts is one millisecond earlier — e.g. a 01:00
  // close yields 00:59:59.999.
  const closeInstant = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + dayOffset,
    closeHour,
    0,
    0,
    0
  );
  const end = new Date(closeInstant.getTime() - 1);
  return { start, end };
}

// Which business day a timestamp belongs to, returned as that business day's
// labelling calendar date at local 00:00.
//
// A business day is LABELLED by the calendar date its session OPENS on. The
// session only spills past midnight into the early hours of the NEXT calendar
// date (when the branch closes after midnight) — and ONLY those post-midnight
// hours, up to the closing hour, belong to the previous date. Every other time —
// including the closed daytime before the branch reopens — is the current
// calendar date. So a 00:30 sale on June 11 still counts toward June 10's night,
// but checking at 11 AM on June 11 reads as June 11 (not rolled back to the 10th).
export function toBusinessDay(
  timestamp: Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS
): Date {
  const d = new Date(timestamp);
  if (closesNextDay(hours) && d.getHours() < hours.closeHour) {
    d.setDate(d.getDate() - 1);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// The business day in effect right now: the current calendar date, except during
// the post-midnight tail of last night's session (00:00 → the closing hour) when
// it is still yesterday. Used for the "today" default on the Sales Overview, so
// "today" reads as the actual date no matter the time of day — only the genuine
// after-midnight spillover counts toward the previous night.
export function currentBusinessDay(
  now: Date = new Date(),
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS
): Date {
  return toBusinessDay(now, hours);
}

// ISO { from, to } bounds covering the span of business days from `fromDate`'s
// business day through `toDate`'s business day, inclusive. The work-horse for the
// client range pickers (today / week / month / custom): pass the same date twice
// for a single business day, or two dates for a range.
export function businessDayRangeISO(
  fromDate: Date,
  toDate: Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS
): { from: string; to: string } {
  return {
    from: getBusinessDayBounds(fromDate, hours).start.toISOString(),
    to: getBusinessDayBounds(toDate, hours).end.toISOString(),
  };
}
