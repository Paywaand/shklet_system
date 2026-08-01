// SQL fragments that push business-day / local-hour bucketing down into
// Postgres, so reporting queries return one row per DAY instead of one row per
// ORDER.
//
// These are the SQL twins of `businessDayKey()` and `localHour()` in
// lib/format.ts, and they must stay behaviourally identical — a figure on the
// Sales page must never disagree with the same figure in a CSV export just
// because one was bucketed in JS and the other in SQL. See the equivalence note
// on `businessDayExpr` below.

import { Prisma } from "@prisma/client";
import { closesNextDay, type BusinessHours } from "./businessDay";

// `Order.placedAt` is `timestamp WITHOUT time zone` holding a UTC instant (this
// is what Prisma writes for `DateTime`). To read it as branch-local wall clock
// we must first label it UTC, then convert into the branch zone — a single
// `AT TIME ZONE` would silently treat the stored value as already-local and
// shift every timestamp by the UTC offset.
function localTimestamp(column: Prisma.Sql, timeZone: string): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})`;
}

// How many hours to shift back so a trading night buckets under the calendar
// date it OPENED on. Mirrors `businessDayKey`, which rolls the date back by one
// day when the local hour is below `closeHour` — subtracting `closeHour` hours
// achieves exactly that, and is GROUP-BY friendly:
//
//   open 17:00, close 01:00  →  offset 1h
//     00:30 local − 1h = 23:30 previous date  ✓ rolls back
//     01:30 local − 1h = 00:30 same date      ✓ stays
//     18:00 local − 1h = 17:00 same date      ✓ stays
//
// A same-day close (e.g. open 10:00, close 22:00) never spills past midnight,
// so the offset is 0 and the business day is just the calendar day.
export function businessDayOffsetHours(hours: BusinessHours): number {
  return closesNextDay(hours) ? hours.closeHour : 0;
}

// The business-day bucket of a timestamp column, as a `date`.
//
// Note this expression cannot back an expression index: `AT TIME ZONE` is
// STABLE, not IMMUTABLE, because the zone database can change. It doesn't need
// to — the range filter on `placedAt` is what the (branch, placedAt) index
// serves, and the bucketing then runs over an already-narrow row set.
export function businessDayExpr(
  column: Prisma.Sql,
  hours: BusinessHours,
  timeZone: string
): Prisma.Sql {
  const offset = businessDayOffsetHours(hours);
  // The ::int cast is required: Prisma binds JS numbers as bigint, and
  // make_interval only has an int overload for `hours`.
  return Prisma.sql`((${localTimestamp(column, timeZone)} - make_interval(hours => ${offset}::int))::date)`;
}

// The real local clock hour (0–23) of a timestamp column. Deliberately NOT
// business-day shifted — the "busiest hour" stat wants the actual time of day,
// matching `localHour()` in lib/format.ts.
export function localHourExpr(column: Prisma.Sql, timeZone: string): Prisma.Sql {
  return Prisma.sql`(EXTRACT(HOUR FROM ${localTimestamp(column, timeZone)})::int)`;
}

// Renders a `date` returned by Postgres back to the "YYYY-MM-DD" key the client
// charts expect. The driver hands back a JS Date at UTC midnight for a `date`
// column, so formatting it with local getters would shift it a day west of UTC.
export function dateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
