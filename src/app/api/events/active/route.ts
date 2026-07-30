import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// GET /api/events/active — active events for the POS / warehouse / expenses selectors.
// Available to any signed-in user (cashiers need it for order attribution).
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const events = await prisma.event.findMany({
    where: { branch, status: "active" },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ events });
}
