import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
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

interface CreateItemBody {
  categoryId: string;
  name: string;
  nameKu: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  cityPrices: CityPriceInput[];
  modifierGroups: ModifierGroupInput[];
}

/**
 * Menu structure (categories/items/modifiers) is admin-owned globally, but
 * pricing/availability is per-city per module 0/2 — a manager could arguably
 * be allowed to adjust their own city's price, but creating/deleting items
 * outright is kept admin-only to avoid one city's manager silently deleting
 * an item another city depends on.
 */
export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN");
  const body = await safeJson<CreateItemBody>(req);

  const maxSort = await prisma.menuItem.aggregate({
    where: { categoryId: body.categoryId },
    _max: { sortOrder: true },
  });

  const item = await prisma.menuItem.create({
    data: {
      categoryId: body.categoryId,
      name: body.name,
      nameKu: body.nameKu,
      description: body.description,
      imageUrl: body.imageUrl,
      basePrice: body.basePrice,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      cityPrices: {
        create: body.cityPrices.map((cp) => ({
          cityId: cp.cityId,
          price: cp.price,
          available: cp.available,
        })),
      },
      modifierGroups: {
        create: body.modifierGroups.map((g, gi) => ({
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
        })),
      },
    },
    include: { cityPrices: true, modifierGroups: { include: { options: true } } },
  });

  await logAudit(user.id, `created menu item "${body.name}"`, "MenuItem", item.id);
  return NextResponse.json({ item });
});
