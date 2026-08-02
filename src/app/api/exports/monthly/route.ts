import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch, activeBranchId } from "@/lib/branchScope";
import { getBusinessHours } from "@/lib/businessHours";
import { getBusinessDayBounds } from "@/lib/businessDay";
import { businessDayKey, localDateKey, shortTime } from "@/lib/format";
import { orderScopeWhere } from "@/lib/orderScope";
import { toCsv, csvResponse, type CsvValue } from "@/lib/csv";
import type { PermissionKey } from "@/lib/permissions";

// GET /api/exports/monthly?month=YYYY-MM&dataset=sales|expenses|delivery
//
// Transaction-level bookkeeping export for one month, scoped to the active
// branch. One dataset per request, because sales, expenses and delivery share
// no columns — a single file with stacked sections would break Excel's
// autofilter, sort and pivot detection, so an accountant would have to split it
// by hand every month.
//
// Each dataset carries its OWN permission. Expense figures must never reach a
// role that cannot already see them on the Expenses page, and delivery
// gross/net is admin-only today. The gate is here on the server, not merely on
// whether the button rendered.
const DATASET_PERMISSION: Record<string, PermissionKey> = {
  sales: "analytics.view",
  expenses: "expenses.manage",
  delivery: "delivery.view",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") ?? "sales";
  const permission = DATASET_PERMISSION[dataset];
  if (!permission) {
    return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  }

  const guard = await authorize(permission);
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const branchId = await activeBranchId(guard.session);

  // month=YYYY-MM
  const month = url.searchParams.get("month") ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  // Business-day bounds, so the export reconciles exactly with the Sales page
  // charts: the month opens at the 1st's opening hour and closes at the last
  // day's closing hour (which lands after midnight, on the 1st of the next
  // month). A 00:30 sale files under the previous night, as it does everywhere
  // else in this system.
  const businessHours = await getBusinessHours(branchId);
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const gte = getBusinessDayBounds(firstDay, businessHours).start;
  const lte = getBusinessDayBounds(lastDay, businessHours).end;

  const filename = `shklet-${branch}-${dataset}-${month}.csv`;

  if (dataset === "sales") {
    const orders = await prisma.order.findMany({
      where: orderScopeWhere({
        branch,
        branchId: url.searchParams.get("branchId"),
        eventId: url.searchParams.get("eventId"),
        gte,
        lte,
        // Cancelled orders are included WITH their status, so the bookkeeper can
        // see and exclude them deliberately rather than silently missing rows.
        excludeCancelled: false,
      }),
      orderBy: { placedAt: "asc" },
      include: { items: true, staff: { select: { fullName: true } } },
    });

    const rows: CsvValue[][] = orders.map((o) => [
      o.shortId ?? "",
      localDateKey(o.placedAt),
      shortTime(o.placedAt),
      businessDayKey(o.placedAt, businessHours),
      o.orderType === "takeaway" ? "Take Away" : "Walk-in",
      // "card" is stored as-is in the database (unchanged, for historical
      // consistency) but displays as "FIB" everywhere in the app.
      o.paymentMethod === "card" ? "FIB" : o.paymentMethod === "cash" ? "Cash" : "POS",
      o.isPaid ? "Paid" : "Unpaid",
      o.status,
      o.total,
      o.items
        .map((i) => `${i.quantity}x ${i.name}${i.modifier ? ` (${i.modifier})` : ""}`)
        .join("; "),
      o.staff?.fullName ?? "",
    ]);

    return csvResponse(
      toCsv(
        [
          "Order Code",
          "Date",
          "Time",
          "Business Day",
          "Type",
          "Payment Method",
          "Paid",
          "Status",
          "Gross Amount (IQD)",
          "Items",
          "Cashier",
        ],
        rows
      ),
      filename
    );
  }

  if (dataset === "expenses") {
    const expenses = await prisma.expense.findMany({
      where: { branch, date: { gte, lte } },
      orderBy: { date: "asc" },
      include: { createdBy: { select: { fullName: true } }, event: { select: { name: true } } },
    });

    const rows: CsvValue[][] = expenses.map((e) => [
      localDateKey(e.date),
      businessDayKey(e.date, businessHours),
      e.category,
      e.description ?? "",
      e.source,
      e.event?.name ?? "",
      e.amount,
      e.createdBy?.fullName ?? "",
    ]);

    return csvResponse(
      toCsv(
        [
          "Date",
          "Business Day",
          "Category",
          "Description",
          "Cash Source",
          "Linked To",
          "Amount (IQD)",
          "Recorded By",
        ],
        rows
      ),
      filename
    );
  }

  // delivery — gross vs net both matter: the platform keeps commissionPct, so
  // net is what actually lands in the business account.
  const deliveries = await prisma.deliveryOrder.findMany({
    where: { branch, placedAt: { gte, lte } },
    orderBy: { placedAt: "asc" },
    include: { staff: { select: { fullName: true } } },
  });

  const rows: CsvValue[][] = deliveries.map((d) => [
    localDateKey(d.placedAt),
    shortTime(d.placedAt),
    businessDayKey(d.placedAt, businessHours),
    d.platformName,
    d.reference ?? "",
    d.grossTotal,
    d.commissionPct,
    d.netTotal,
    d.status,
    d.staff?.fullName ?? "",
  ]);

  return csvResponse(
    toCsv(
      [
        "Date",
        "Time",
        "Business Day",
        "Platform",
        "Reference",
        "Gross (IQD)",
        "Commission %",
        "Net (IQD)",
        "Status",
        "Staff",
      ],
      rows
    ),
    filename
  );
}
