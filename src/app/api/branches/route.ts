import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { closesNextDay } from "@/lib/businessDay";

// GET /api/branches — physical branches in the current city (any signed-in
// user; used by the staff-assignment picker, the POS branch indicator, and the
// Manage Branches admin settings card).
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const city = await activeBranch(guard.session);

  const branches = await prisma.branch.findMany({
    where: { city },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({
    branches: branches.map((b) => ({ ...b, closesNextDay: closesNextDay(b) })),
  });
}

// POST /api/branches — create a new physical branch in the current city.
// Admin only: adding a branch changes staff-assignment options and order
// scoping for the whole city.
export async function POST(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const city = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });

  const count = await prisma.branch.count({ where: { city } });
  const branch = await prisma.branch.create({
    data: { name, city, sortOrder: count },
  });
  await audit(guard.session.sub, `Created branch "${name}" in ${city}`);
  return NextResponse.json({ branch }, { status: 201 });
}
