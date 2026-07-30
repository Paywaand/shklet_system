import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const cityFilter = scopeCityFilter(user, searchParams.get("cityId"));
  const branchWhere =
    "cityId" in cityFilter && cityFilter.cityId ? { branch: { cityId: cityFilter.cityId } } : {};

  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { ...branchWhere };
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { pagerNumber: isNaN(Number(search)) ? undefined : Number(search) },
    ];
  }
  if (from || to) {
    where.placedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: true, branch: true },
    orderBy: { placedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ orders });
});
