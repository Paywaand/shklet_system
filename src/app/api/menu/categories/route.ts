import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

/** Full menu tree: categories → items → per-city prices → modifier groups. */
export const GET = withApiError(async () => {
  await requireUser();
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          cityPrices: { include: { city: true } },
          modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  return NextResponse.json({ categories });
});

interface CreateCategoryBody {
  name: string;
  nameKu: string;
}

/** Admin-only: category structure is global, not city-scoped. */
export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN");
  const body = await safeJson<CreateCategoryBody>(req);

  const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.category.create({
    data: {
      name: body.name,
      nameKu: body.nameKu,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit(user.id, `created menu category "${body.name}"`, "Category", category.id);
  return NextResponse.json({ category });
});
