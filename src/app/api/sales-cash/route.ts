import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import { activeBranchId, resolveBranchFilter } from "@/lib/branchScope";
import { monthRange } from "@/lib/cash";
import { getBusinessHours } from "@/lib/businessHours";
import { computeExpectedCashOnHand } from "@/lib/expectedCash";

// GET /api/sales-cash?from=ISO&to=ISO
//
// "Expected Cash on Hand" for the Sales page (manager + admin via analytics.view):
//   Expected = cash sales in range − expenses in range − safe money
// where safe money = all safe deposits − safe-sourced expenses in range. This mirrors
// the admin Cash Tracking model so the figure equals "Manager currently holds".
// Defaults to the current calendar month; honours an explicit from/to range.
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const branchId = await activeBranchId(guard.session);

  const url = new URL(req.url);
  const branch = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const eventIdParam = url.searchParams.get("eventId");
  const eventId =
    eventIdParam && eventIdParam !== "all" ? (eventIdParam === "main" ? null : eventIdParam) : undefined;
  const { gte, lte } =
    fromParam || toParam
      ? { gte: fromParam ? new Date(fromParam) : undefined, lte: toParam ? new Date(toParam) : undefined }
      : monthRange(new Date(), await getBusinessHours(branchId));

  const result = await computeExpectedCashOnHand(branch, { gte, lte }, eventId);
  const { range, ...figures } = result;

  return NextResponse.json({
    ...figures,
    period: {
      from: (range.gte ?? null)?.toISOString() ?? null,
      to: (range.lte ?? null)?.toISOString() ?? null,
    },
  });
}
