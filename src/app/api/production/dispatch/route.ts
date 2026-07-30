import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface DispatchBody {
  batchId: string;
  cityId: string;
  quantity: number;
}

export const POST = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<DispatchBody>(req);

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch) throw new AuthError("Batch not found", 404);

  const cost = Number(batch.costPerUnit) * body.quantity;

  const dispatch = await prisma.dispatch.create({
    data: { batchId: body.batchId, cityId: body.cityId, quantity: body.quantity, cost, userId: admin.id },
  });

  await logAudit(admin.id, `dispatched ${body.quantity} of "${batch.name}"`, "Dispatch", dispatch.id);
  return NextResponse.json({ dispatch });
});

export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const dispatches = await prisma.dispatch.findMany({
    include: { batch: true, city: true },
    orderBy: { dispatchedAt: "desc" },
  });
  return NextResponse.json({ dispatches });
});
