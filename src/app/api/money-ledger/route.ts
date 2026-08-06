import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import { activeBranchId, resolveBranchFilter } from "@/lib/branchScope";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";
import { computeLedgerBalance, isMoneyLedgerBucket } from "@/lib/moneyLedger";

// GET /api/money-ledger?bucket=pos|fib|delivery&from=ISO&to=ISO&eventId=
//
// Running balance for one of the non-cash money buckets (POS, FIB, Delivery)
// for the Sales page — mirrors /api/sales-cash's Expected Cash on Hand.
// Defaults to the current business month (same as sales-cash) when no
// from/to is given; honours an explicit from/to range.
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const branchId = await activeBranchId(guard.session);

  const url = new URL(req.url);
  const branch = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
  const bucket = url.searchParams.get("bucket");
  if (!isMoneyLedgerBucket(bucket))
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const eventIdParam = url.searchParams.get("eventId");
  const eventId =
    eventIdParam && eventIdParam !== "all" ? (eventIdParam === "main" ? null : eventIdParam) : undefined;
  const { gte, lte } =
    fromParam || toParam
      ? { gte: fromParam ? new Date(fromParam) : undefined, lte: toParam ? new Date(toParam) : undefined }
      : monthRange(new Date(), await getBusinessHours(branchId));

  const result = await computeLedgerBalance(branch, bucket, { gte, lte }, eventId);
  const { range, ...figures } = result;

  return NextResponse.json({
    ...figures,
    period: {
      from: (range.gte ?? null)?.toISOString() ?? null,
      to: (range.lte ?? null)?.toISOString() ?? null,
    },
  });
}
