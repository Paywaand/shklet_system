import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const where = scopeCityFilter(user, searchParams.get("cityId"));

  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items });
});

interface CreateItemBody {
  cityId: string;
  categoryId?: string;
  name: string;
  nameKu: string;
  unit: string;
  minThreshold: number;
  subUnitFactor?: number;
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const body = await safeJson<CreateItemBody>(req);

  if (user.role === "MANAGER" && body.cityId !== user.cityId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      cityId: body.cityId,
      categoryId: body.categoryId,
      name: body.name,
      nameKu: body.nameKu,
      unit: body.unit,
      minThreshold: body.minThreshold,
      subUnitFactor: body.subUnitFactor,
    },
  });
  await logAudit(user.id, `created warehouse item "${body.name}"`, "InventoryItem", item.id);
  return NextResponse.json({ item });
});
