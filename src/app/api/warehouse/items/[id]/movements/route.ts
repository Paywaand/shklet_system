import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new AuthError("Not found", 404);
    if (user.role === "MANAGER" && item.cityId !== user.cityId) throw new AuthError("Forbidden", 403);

    const movements = await prisma.stockMovement.findMany({
      where: { itemId: id },
      include: { user: { select: { fullName: true } }, event: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ movements });
  },
);

interface CreateMovementBody {
  type: "ADD" | "REMOVE";
  amount: number;
  totalCost?: number; // for ADD
  reason: "DELIVERY" | "DAILY_USAGE" | "WASTAGE" | "MANUAL_CORRECTION" | "OTHER";
  note?: string;
  eventId?: string;
}

export const POST = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new AuthError("Not found", 404);
    if (user.role === "MANAGER" && item.cityId !== user.cityId) throw new AuthError("Forbidden", 403);

    const body = await safeJson<CreateMovementBody>(req);

    if (body.reason === "OTHER" && !body.note?.trim()) {
      throw new AuthError("Note is required for reason 'Other'", 400);
    }

    let newQuantity = Number(item.quantity);
    let unitCostAtTime = Number(item.unitCost);

    if (body.type === "ADD") {
      const totalCost = body.totalCost ?? 0;
      unitCostAtTime = body.amount > 0 ? totalCost / body.amount : Number(item.unitCost);
      newQuantity += body.amount;
    } else {
      newQuantity -= body.amount;
      unitCostAtTime = Number(item.unitCost);
    }

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          itemId: id,
          type: body.type,
          amount: body.amount,
          totalCost: body.type === "ADD" ? body.totalCost : null,
          unitCostAtTime,
          reason: body.reason,
          note: body.note,
          eventId: body.eventId,
          userId: user.id,
        },
      }),
      prisma.inventoryItem.update({
        where: { id },
        data: {
          quantity: newQuantity,
          unitCost: body.type === "ADD" ? unitCostAtTime : item.unitCost,
        },
      }),
    ]);

    await logAudit(
      user.id,
      `${body.type === "ADD" ? "added" : "removed"} ${body.amount} ${item.unit} of "${item.name}"`,
      "StockMovement",
      movement.id,
    );

    return NextResponse.json({ movement });
  },
);
