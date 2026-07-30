import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

/** Recipes are admin-only (recipe/cost secrecy — module 14). */
export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const recipes = await prisma.recipe.findMany({
    include: {
      menuItem: { include: { cityPrices: true } },
      lines: { include: { warehouseItem: true, batch: true } },
    },
  });
  return NextResponse.json({ recipes });
});

interface RecipeLineInput {
  sourceType: "WAREHOUSE_ITEM" | "BATCH" | "MANUAL";
  warehouseItemId?: string;
  batchId?: string;
  manualCost?: number;
  amountPerServing: number;
}

interface CreateRecipeBody {
  menuItemId: string;
  notes?: string;
  lines: RecipeLineInput[];
}

export const POST = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<CreateRecipeBody>(req);

  const recipe = await prisma.recipe.upsert({
    where: { menuItemId: body.menuItemId },
    update: {
      notes: body.notes,
      lines: { deleteMany: {}, create: body.lines },
    },
    create: {
      menuItemId: body.menuItemId,
      notes: body.notes,
      lines: { create: body.lines },
    },
    include: { lines: true },
  });

  await logAudit(admin.id, "saved a recipe", "Recipe", recipe.id);
  return NextResponse.json({ recipe });
});
