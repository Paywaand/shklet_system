import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { isMoneyLedgerBucket } from "@/lib/moneyLedger";

// DELETE /api/money-ledger/entries/:id?bucket=pos|fib|delivery — admin-only.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const bucket = new URL(req.url).searchParams.get("bucket");
  if (!isMoneyLedgerBucket(bucket))
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });

  const row = await prisma.moneyLedgerEntry.findFirst({ where: { id: params.id, branch, bucket } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.moneyLedgerEntry.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted ${bucket} ${row.kind} entry (${row.amount} IQD, ${branch})`);
  return new NextResponse(null, { status: 204 });
}
