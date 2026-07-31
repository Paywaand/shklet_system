import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// GET /api/cash-settings — the current city's cash baseline (Expected Cash on
// Hand / Cash Tracking ignore everything before this instant).
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const row = await prisma.cashSettings.findUnique({ where: { branch } });
  return NextResponse.json({ baselineAt: row?.baselineAt ?? null });
}

// PUT /api/cash-settings { baselineAt: ISOString | null } — admin only: sets
// (or clears) the go-live cutoff for this city.
export async function PUT(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  let baselineAt: Date | null = null;
  if (body.baselineAt) {
    baselineAt = new Date(body.baselineAt);
    if (isNaN(baselineAt.getTime()))
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const row = await prisma.cashSettings.upsert({
    where: { branch },
    update: { baselineAt },
    create: { branch, baselineAt },
  });
  await audit(
    guard.session.sub,
    baselineAt
      ? `Reset Expected Cash on Hand for ${branch} — nothing before ${baselineAt.toISOString()} counts`
      : `Cleared Expected Cash on Hand baseline for ${branch}`
  );
  return NextResponse.json({ baselineAt: row.baselineAt });
}
