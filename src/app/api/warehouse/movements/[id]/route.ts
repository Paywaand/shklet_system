import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateMovementBody {
  amount?: number;
  totalCost?: number;
  note?: string;
}

/** Editing a movement re-derives the stock effect: reverse the old delta, apply the new one. */
export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    const movement = await prisma.stockMovement.findUnique({ where: { id }, include: { item: true } });
    if (!movement) throw new AuthError("Not found", 404);
    if (user.role === "MANAGER" && movement.item.cityId !== user.cityId) throw new AuthError("Forbidden", 403);

    const body = await safeJson<UpdateMovementBody>(req);
    const newAmount = body.amount ?? Number(movement.amount);
    const oldDelta = movement.type === "ADD" ? Number(movement.amount) : -Number(movement.amount);
    const newDelta = movement.type === "ADD" ? newAmount : -newAmount;
    const quantityAdjustment = newDelta - oldDelta;

    const newUnitCost =
      movement.type === "ADD" && body.totalCost != null && newAmount > 0
        ? body.totalCost / newAmount
        : Number(movement.unitCostAtTime);

    await prisma.$transaction([
      prisma.stockMovement.update({
        where: { id },
        data: {
          amount: newAmount,
          totalCost: body.totalCost ?? movement.totalCost,
          unitCostAtTime: newUnitCost,
          note: body.note ?? movement.note,
          edited: true,
        },
      }),
      prisma.inventoryItem.update({
        where: { id: movement.itemId },
        data: { quantity: { increment: quantityAdjustment } },
      }),
    ]);

    await logAudit(user.id, `edited a stock movement for "${movement.item.name}"`, "StockMovement", id);
    return NextResponse.json({ ok: true });
  },
);

/** Deleting a movement reverses its stock effect. */
export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    const movement = await prisma.stockMovement.findUnique({ where: { id }, include: { item: true } });
    if (!movement) throw new AuthError("Not found", 404);
    if (user.role === "MANAGER" && movement.item.cityId !== user.cityId) throw new AuthError("Forbidden", 403);

    const reverseDelta =
      movement.type === "ADD" ? -Number(movement.amount) : Number(movement.amount);

    await prisma.$transaction([
      prisma.stockMovement.delete({ where: { id } }),
      prisma.inventoryItem.update({
        where: { id: movement.itemId },
        data: { quantity: { increment: reverseDelta } },
      }),
    ]);

    await logAudit(user.id, `deleted a stock movement for "${movement.item.name}"`, "StockMovement", id);
    return NextResponse.json({ ok: true });
  },
);
