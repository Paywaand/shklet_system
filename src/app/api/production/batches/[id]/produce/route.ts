import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * "Make a batch" — deducts each ingredient's raw stock (reason: DAILY_USAGE-
 * equivalent internal consumption) and adds the batch's finished yield to a
 * running production log used for costing.
 */
export const POST = withApiError(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("ADMIN");
    const { id } = await params;

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: { ingredients: { include: { warehouseItem: true } } },
    });
    if (!batch) throw new AuthError("Not found", 404);

    let totalCost = 0;
    const ops = [];
    for (const ing of batch.ingredients) {
      const cost = Number(ing.warehouseItem.unitCost) * Number(ing.amount);
      totalCost += cost;
      ops.push(
        prisma.stockMovement.create({
          data: {
            itemId: ing.warehouseItemId,
            type: "REMOVE",
            amount: ing.amount,
            unitCostAtTime: ing.warehouseItem.unitCost,
            reason: "DAILY_USAGE",
            note: `Used to produce batch "${batch.name}"`,
            userId: admin.id,
          },
        }),
        prisma.inventoryItem.update({
          where: { id: ing.warehouseItemId },
          data: { quantity: { decrement: Number(ing.amount) } },
        }),
      );
    }

    ops.push(
      prisma.batchProduction.create({
        data: { batchId: id, quantityMade: batch.totalAmount, totalCost, userId: admin.id },
      }),
    );

    await prisma.$transaction(ops);
    await logAudit(admin.id, `made a batch of "${batch.name}"`, "Batch", id);

    return NextResponse.json({ ok: true });
  },
);
