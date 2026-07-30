import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateStatusBody {
  status: "READY" | "DRIVER_ARRIVED" | "COLLECTED" | "CANCELLED";
  newPagerNumber?: number; // for resolving a pager conflict on sync
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = await safeJson<UpdateStatusBody>(req);

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new AuthError("Order not found", 404);

    // Cashiers can only touch orders in their own branch.
    if (user.role === "CASHIER" && order.branchId !== user.branchId) {
      throw new AuthError("Forbidden", 403);
    }

    const data: Record<string, unknown> = { status: body.status };
    const now = new Date();
    if (body.status === "READY") data.readyAt = now;
    if (body.status === "DRIVER_ARRIVED") data.driverArrivedAt = now;
    if (body.status === "COLLECTED") data.collectedAt = now;
    if (body.status === "CANCELLED") data.cancelledAt = now;
    if (body.newPagerNumber != null) data.pagerNumber = body.newPagerNumber;

    const updated = await prisma.order.update({ where: { id }, data });
    await logAudit(user.id, `marked order #${order.code} as ${body.status.toLowerCase()}`, "Order", id);

    return NextResponse.json({ order: updated });
  },
);
