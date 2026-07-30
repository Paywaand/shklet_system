import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface CityPriceInput {
  cityId: string;
  price: number;
  available: boolean;
}

interface ModifierOptionInput {
  name: string;
  nameKu: string;
  extraPrice: number;
}

interface ModifierGroupInput {
  name: string;
  nameKu: string;
  required: boolean;
  options: ModifierOptionInput[];
}

interface UpdateItemBody {
  name?: string;
  nameKu?: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice?: number;
  cityPrices?: CityPriceInput[];
  modifierGroups?: ModifierGroupInput[];
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN");
    const { id } = await params;
    const body = await safeJson<UpdateItemBody>(req);

    await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id },
        data: {
          name: body.name,
          nameKu: body.nameKu,
          description: body.description,
          imageUrl: body.imageUrl,
          basePrice: body.basePrice,
        },
      });

      if (body.cityPrices) {
        for (const cp of body.cityPrices) {
          await tx.menuItemCityPrice.upsert({
            where: { menuItemId_cityId: { menuItemId: id, cityId: cp.cityId } },
            update: { price: cp.price, available: cp.available },
            create: { menuItemId: id, cityId: cp.cityId, price: cp.price, available: cp.available },
          });
        }
      }

      if (body.modifierGroups) {
        // Full replace — simplest correct approach for a modifier editor.
        await tx.modifierGroup.deleteMany({ where: { menuItemId: id } });
        for (const [gi, g] of body.modifierGroups.entries()) {
          await tx.modifierGroup.create({
            data: {
              menuItemId: id,
              name: g.name,
              nameKu: g.nameKu,
              required: g.required,
              sortOrder: gi,
              options: {
                create: g.options.map((o, oi) => ({
                  name: o.name,
                  nameKu: o.nameKu,
                  extraPrice: o.extraPrice,
                  sortOrder: oi,
                })),
              },
            },
          });
        }
      }
    });

    const item = await prisma.menuItem.findUnique({
      where: { id },
      include: { cityPrices: true, modifierGroups: { include: { options: true } } },
    });

    await logAudit(user.id, `updated menu item "${item?.name}"`, "MenuItem", id);
    return NextResponse.json({ item });
  },
);

export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN");
    const { id } = await params;
    const item = await prisma.menuItem.findUnique({ where: { id } });
    await prisma.menuItem.delete({ where: { id } });
    await logAudit(user.id, `deleted menu item "${item?.name ?? id}"`, "MenuItem", id);
    return NextResponse.json({ ok: true });
  },
);

/** Quick toggle for "hidden from cashier" at a specific city (available flag). */
export const PUT = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    if (user.role === "CASHIER") throw Object.assign(new Error("Forbidden"), { status: 403 });
    const { id } = await params;
    const { cityId, available } = await safeJson<{ cityId: string; available: boolean }>(req);

    const cityScopeOk = user.role === "ADMIN" || user.cityId === cityId;
    if (!cityScopeOk) throw Object.assign(new Error("Forbidden"), { status: 403 });

    const updated = await prisma.menuItemCityPrice.update({
      where: { menuItemId_cityId: { menuItemId: id, cityId } },
      data: { available },
    });
    return NextResponse.json({ cityPrice: updated });
  },
);
