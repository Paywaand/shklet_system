import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const where = scopeCityFilter(user, searchParams.get("cityId"));

  const categories = await prisma.inventoryCategory.findMany({
    where,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ categories });
});

interface CreateCategoryBody {
  cityId: string;
  name: string;
  nameKu: string;
  color: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const body = await safeJson<CreateCategoryBody>(req);

  if (user.role === "MANAGER" && body.cityId !== user.cityId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const category = await prisma.inventoryCategory.create({ data: body });
  await logAudit(user.id, `created inventory category "${body.name}"`, "InventoryCategory", category.id);
  return NextResponse.json({ category });
});
