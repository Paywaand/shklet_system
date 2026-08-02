// The single definition of "which orders does this report cover".
//
// The Sales overview charts, the paginated order history and the monthly CSV
// export must all agree to the last dinar. They previously each rebuilt this
// filter by hand, which is how a CSV total drifts away from the chart above it.
// Both shapes are built from the same arguments here: `orderScopeSql` for raw
// aggregate queries, `orderScopeWhere` for the Prisma query API.

import { Prisma } from "@prisma/client";

export type OrderScope = {
  // City scope — always applied, never caller-controlled (see lib/branchScope).
  branch: string;
  // Physical branch selector from the query string: null/"all" spans the city.
  branchId?: string | null;
  // Event selector: null/"all" = every order, "main" = the branch itself
  // (eventId IS NULL), anything else = that event id.
  eventId?: string | null;
  gte: Date;
  lte: Date;
  // Cancelled orders never took money. Reporting excludes them; the history
  // table is a placement log and keeps them (marked "cancelled").
  excludeCancelled: boolean;
};

export function orderScopeSql(scope: OrderScope): Prisma.Sql {
  // `Order.placedAt` is `timestamp WITHOUT time zone`, but a bound JS `Date`
  // is sent as `timestamptz`. Postgres casts `timestamptz -> timestamp`
  // through the SESSION timezone, not UTC — on any server whose Postgres
  // session timezone isn't UTC (confirmed Asia/Baghdad locally), that silently
  // shifts the comparison window by the session's UTC offset. A narrow range
  // like "Today" can end up comparing against a window that no longer
  // contains the actual orders, undercounting or zeroing results. The
  // `AT TIME ZONE 'UTC'` cast forces the comparison to the naive-UTC wall
  // time the column actually stores, regardless of session timezone.
  const conds: Prisma.Sql[] = [
    Prisma.sql`o."branch" = ${scope.branch}`,
    Prisma.sql`o."placedAt" >= (${scope.gte}::timestamptz AT TIME ZONE 'UTC')`,
    Prisma.sql`o."placedAt" <= (${scope.lte}::timestamptz AT TIME ZONE 'UTC')`,
  ];
  if (scope.branchId && scope.branchId !== "all") {
    conds.push(Prisma.sql`o."branchId" = ${scope.branchId}`);
  }
  if (scope.eventId && scope.eventId !== "all") {
    conds.push(
      scope.eventId === "main"
        ? Prisma.sql`o."eventId" IS NULL`
        : Prisma.sql`o."eventId" = ${scope.eventId}`
    );
  }
  if (scope.excludeCancelled) {
    conds.push(Prisma.sql`o."status" <> 'cancelled'`);
  }
  return Prisma.join(conds, " AND ");
}

// Same scope expressed for the Prisma query API, used where we want hydrated
// rows (the paginated history table) rather than an aggregate.
export function orderScopeWhere(scope: OrderScope): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    branch: scope.branch,
    placedAt: { gte: scope.gte, lte: scope.lte },
  };
  if (scope.branchId && scope.branchId !== "all") where.branchId = scope.branchId;
  if (scope.eventId && scope.eventId !== "all") {
    where.eventId = scope.eventId === "main" ? null : scope.eventId;
  }
  if (scope.excludeCancelled) where.status = { not: "cancelled" };
  return where;
}
