import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const batches = await prisma.batch.findMany({
    include: { ingredients: { include: { warehouseItem: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ batches });
});

interface BatchIngredientInput {
  warehouseItemId: string;
  amount: number;
}

interface CreateBatchBody {
  name: string;
  nameKu: string;
  unit: string;
  totalAmount: number;
  ingredients: BatchIngredientInput[];
}

export const POST = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<CreateBatchBody>(req);

  // Derive cost-per-unit from the ingredient lines' current warehouse unit costs.
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: body.ingredients.map((i) => i.warehouseItemId) } },
  });
  const totalCost = body.ingredients.reduce((sum, ing) => {
    const item = items.find((i) => i.id === ing.warehouseItemId);
    return sum + (item ? Number(item.unitCost) * ing.amount : 0);
  }, 0);
  const costPerUnit = body.totalAmount > 0 ? totalCost / body.totalAmount : 0;

  const batch = await prisma.batch.create({
    data: {
      name: body.name,
      nameKu: body.nameKu,
      unit: body.unit,
      totalAmount: body.totalAmount,
      costPerUnit,
      ingredients: { create: body.ingredients },
    },
    include: { ingredients: true },
  });

  await logAudit(admin.id, `created batch "${body.name}"`, "Batch", batch.id);
  return NextResponse.json({ batch });
});
