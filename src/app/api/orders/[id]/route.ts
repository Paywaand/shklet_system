import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/** Admin-only permanent delete — removes an order from every report/chart. */
export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN");
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });
    await prisma.order.delete({ where: { id } });
    await logAudit(user.id, `deleted order #${order?.code ?? id} permanently`, "Order", id);
    return NextResponse.json({ ok: true });
  },
);
