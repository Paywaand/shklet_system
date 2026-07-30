import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * Menu scoped to the current cashier's branch → city, filtered to items that
 * are available in that city. This is the endpoint the Cashier/POS screen
 * loads on login — no city/branch selector needed (module 1 spec): a
 * cashier account is locked to exactly one branch server-side.
 */
export const GET = withApiError(async () => {
  const user = await requireUser();
  if (user.role !== "CASHIER" && user.role !== "ADMIN") throw new AuthError("Forbidden", 403);

  let cityId = user.cityId;
  if (user.role === "CASHIER") {
    if (!user.branchId) throw new AuthError("Cashier has no assigned branch", 403);
    const branch = await prisma.branch.findUnique({ where: { id: user.branchId } });
    cityId = branch?.cityId ?? null;
  }
  if (!cityId) throw new AuthError("No city context", 400);

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          cityPrices: { where: { cityId } },
          modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  // Only surface items that have a priced+available entry for this city.
  const filtered = categories
    .map((cat) => ({
      ...cat,
      items: cat.items
        .filter((item) => item.cityPrices.length > 0 && item.cityPrices[0].available)
        .map((item) => ({ ...item, price: item.cityPrices[0].price })),
    }))
    .filter((cat) => cat.items.length > 0);

  return NextResponse.json({ categories: filtered, cityId });
});
