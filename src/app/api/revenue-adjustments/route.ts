import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch, resolveBranchFilter } from "@/lib/branchScope";

const BUCKETS = ["total", "cash", "pos", "fib"] as const;
const BUCKET_LABEL: Record<string, string> = { total: "Total revenue", cash: "Cash", pos: "POS", fib: "FIB" };

function parseBucket(v: string | null): (typeof BUCKETS)[number] {
  return v && (BUCKETS as readonly string[]).includes(v) ? (v as (typeof BUCKETS)[number]) : "total";
}

// GET /api/revenue-adjustments?bucket=total|cash|pos|fib&from=ISO&to=ISO — Sales page.
// Returns the full all-time log for that bucket (for the History view) plus
// `periodTotal`, the sum of adjustments whose `date` falls inside [from, to]
// (used to correct that box's displayed figure for whatever range is shown).
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const branchArg = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
  const branch = Array.isArray(branchArg) ? { in: branchArg } : branchArg;
  const bucket = parseBucket(url.searchParams.get("bucket"));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const gte = from ? new Date(from) : undefined;
  const lte = to ? new Date(to) : undefined;

  const [adjustments, periodAgg] = await Promise.all([
    prisma.revenueAdjustment.findMany({
      where: { branch, bucket },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { fullName: true } } },
    }),
    gte || lte
      ? prisma.revenueAdjustment.aggregate({
          where: { branch, bucket, date: { gte, lte } },
          _sum: { amount: true },
        })
      : null,
  ]);

  return NextResponse.json({
    adjustments,
    periodTotal: periodAgg?._sum.amount ?? 0,
  });
}

// POST /api/revenue-adjustments { bucket?, amount, reason, date? } — manager/admin
// only. A signed correction to one of the Sales page's boxes (default "total")
// for a day/period when the system total and the actual counted total don't
// match — never touches any Order/DeliveryOrder row. Always requires a reason;
// always attributed + timestamped.
export async function POST(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin" && guard.session.role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const bucket = parseBucket(typeof body.bucket === "string" ? body.bucket : null);
  const amount = Math.round(Number(body.amount));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Number.isFinite(amount) || amount === 0)
    return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });
  if (!reason)
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  if (reason.length > 500)
    return NextResponse.json({ error: "Reason is too long" }, { status: 400 });

  const adjustment = await prisma.revenueAdjustment.create({
    data: {
      branch,
      bucket,
      amount,
      reason,
      date: body.date ? new Date(body.date) : new Date(),
      createdById: guard.session.sub,
    },
  });
  await audit(
    guard.session.sub,
    `${BUCKET_LABEL[bucket]} adjustment ${amount > 0 ? "+" : ""}${amount} IQD (${branch}) — ${reason}`
  );
  return NextResponse.json({ adjustment }, { status: 201 });
}
