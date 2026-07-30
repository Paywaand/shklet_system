// Shared rule for average preparation-time calculations.
//
// Orders that complete in under MIN_PREP_SECONDS are "instant" items (e.g. a
// bottle of water) that have no real preparation step. Including them drags the
// average prep time down and misrepresents how long real food takes, so they are
// excluded from every average prep-time calculation (dashboards, reports,
// analytics). Orders over MAX_PREP_SECONDS are outliers (e.g. forgotten orders,
// system errors) that skew the average upward and are excluded for the same
// reason. Neither bound is applied to individual order listings or "slowest
// order" stats — only to averages.

export const MIN_PREP_SECONDS = 30;
export const MAX_PREP_SECONDS = 2400;

// True when an order's prep/duration seconds should count toward an average
// prep-time figure (present, at least MIN_PREP_SECONDS, and at most MAX_PREP_SECONDS).
export function countsTowardPrepAvg(seconds: number | null | undefined): boolean {
  return seconds != null && seconds >= MIN_PREP_SECONDS && seconds <= MAX_PREP_SECONDS;
}
