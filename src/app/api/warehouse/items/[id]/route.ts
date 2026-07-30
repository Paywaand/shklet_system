import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateItemBody {
  name?: string;
  nameKu?: string;
  categoryId?: string | null;
  unit?: string;
  minThreshold?: number;
  subUnitFactor?: number | null;
}

async function assertCityAccess(userCityId: string | null, itemId: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new AuthError("Not found", 404);
  if (userCityId && item.cityId !== userCityId) throw new AuthError("Forbidden", 403);
  return item;
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    await assertCityAccess(user.role === "MANAGER" ? user.cityId : null, id);
    const body = await safeJson<UpdateItemBody>(req);

    const item = await prisma.inventoryItem.update({ where: { id }, data: body });
    await logAudit(user.id, `updated warehouse item "${item.name}"`, "InventoryItem", id);
    return NextResponse.json({ item });
  },
);

export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    const item = await assertCityAccess(user.role === "MANAGER" ? user.cityId : null, id);

    await prisma.inventoryItem.delete({ where: { id } });
    await logAudit(user.id, `deleted warehouse item "${item.name}"`, "InventoryItem", id);
    return NextResponse.json({ ok: true });
  },
);
