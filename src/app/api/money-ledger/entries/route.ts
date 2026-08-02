import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { isMoneyLedgerBucket } from "@/lib/moneyLedger";
import { MoneyLedgerEntryInputSchema } from "@/lib/schemas";

const BUCKET_LABEL: Record<string, string> = { pos: "POS", fib: "FIB", delivery: "Delivery" };

// GET /api/money-ledger/entries?bucket=pos|fib|delivery — admin-only log of
// opening/settlement entries for one bucket (Cash Tracking page).
export async function GET(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const bucket = new URL(req.url).searchParams.get("bucket");
  if (!isMoneyLedgerBucket(bucket))
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });

  const entries = await prisma.moneyLedgerEntry.findMany({
    where: { branch, bucket },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  return NextResponse.json({ entries });
}

// POST /api/money-ledger/entries { bucket, kind: "opening"|"settlement", amount, date?, note? }
// — admin-only. "opening" credits the running balance; "settlement" debits it
// (money paid out / transferred out of the bucket).
export async function POST(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const parsed = MoneyLedgerEntryInputSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid entry" },
      { status: 400 }
    );
  const { bucket, kind, amount, date, note } = parsed.data;

  const entry = await prisma.moneyLedgerEntry.create({
    data: {
      branch,
      bucket,
      kind,
      amount,
      note: note || null,
      date: date ? new Date(date) : new Date(),
      createdById: guard.session.sub,
    },
  });
  await audit(
    guard.session.sub,
    `${BUCKET_LABEL[bucket]} ${kind} ${kind === "settlement" ? "-" : "+"}${amount} IQD (${branch})`
  );
  return NextResponse.json({ entry }, { status: 201 });
}
