import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { isMoneyLedgerBucket } from "@/lib/moneyLedger";

// GET /api/money-ledger/baseline?bucket=pos|fib|delivery — the current city's
// go-live cutoff for that bucket (mirrors /api/cash-settings).
export async function GET(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const bucket = new URL(req.url).searchParams.get("bucket");
  if (!isMoneyLedgerBucket(bucket))
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });

  const row = await prisma.moneyLedgerBaseline.findUnique({ where: { branch_bucket: { branch, bucket } } });
  return NextResponse.json({ baselineAt: row?.baselineAt ?? null });
}

// PUT /api/money-ledger/baseline { bucket, baselineAt: ISOString | null } —
// admin only: sets (or clears) the go-live cutoff for this bucket in this city.
export async function PUT(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const bucket = body.bucket;
  if (!isMoneyLedgerBucket(bucket))
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });

  let baselineAt: Date | null = null;
  if (body.baselineAt) {
    baselineAt = new Date(body.baselineAt);
    if (isNaN(baselineAt.getTime()))
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const row = await prisma.moneyLedgerBaseline.upsert({
    where: { branch_bucket: { branch, bucket } },
    update: { baselineAt },
    create: { branch, bucket, baselineAt },
  });
  await audit(
    guard.session.sub,
    baselineAt
      ? `Reset ${bucket} balance for ${branch} — nothing before ${baselineAt.toISOString()} counts`
      : `Cleared ${bucket} balance baseline for ${branch}`
  );
  return NextResponse.json({ baselineAt: row.baselineAt });
}
