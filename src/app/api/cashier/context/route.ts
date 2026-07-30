import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/** Branch/pager-range context for the cashier's own branch, plus active events. */
export const GET = withApiError(async () => {
  const user = await requireUser();
  if (!user.branchId) throw new AuthError("No branch assigned", 403);

  const branch = await prisma.branch.findUnique({
    where: { id: user.branchId },
    include: { city: true },
  });
  if (!branch) throw new AuthError("Branch not found", 404);

  const activeEvents = await prisma.event.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, nameKu: true },
  });

  return NextResponse.json({ branch, activeEvents });
});
