import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch, resolveBranchFilter } from "@/lib/branchScope";

// GET /api/revenue-adjustments?from=ISO&to=ISO — Sales page.
// Returns the full all-time log (for the History view) plus `periodTotal`, the
// sum of adjustments whose `date` falls inside [from, to] (used to correct the
// displayed "Total revenue" figure for whatever range the page is showing).
export async function GET(req: Request) {
  const guard = await authorize("analytics.view");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const branchArg = await resolveBranchFilter(guard.session, url.searchParams.get("branch") === "all");
  const branch = Array.isArray(branchArg) ? { in: branchArg } : branchArg;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const gte = from ? new Date(from) : undefined;
  const lte = to ? new Date(to) : undefined;

  const [adjustments, periodAgg] = await Promise.all([
    prisma.revenueAdjustment.findMany({
      where: { branch },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { fullName: true } } },
    }),
    gte || lte
      ? prisma.revenueAdjustment.aggregate({
          where: { branch, date: { gte, lte } },
          _sum: { amount: true },
        })
      : null,
  ]);

  return NextResponse.json({
    adjustments,
    periodTotal: periodAgg?._sum.amount ?? 0,
  });
}

// POST /api/revenue-adjustments { amount, reason, date? } — manager/admin only.
// A signed correction to the DISPLAYED revenue total for a day/period when the
// system total and the actual counted total don't match — never touches any
// Order row. Always requires a reason; always attributed + timestamped.
export async function POST(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin" && guard.session.role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
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
      amount,
      reason,
      date: body.date ? new Date(body.date) : new Date(),
      createdById: guard.session.sub,
    },
  });
  await audit(
    guard.session.sub,
    `Revenue adjustment ${amount > 0 ? "+" : ""}${amount} IQD (${branch}) — ${reason}`
  );
  return NextResponse.json({ adjustment }, { status: 201 });
}
