import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiError } from "@/lib/api";

export const GET = withApiError(async () => {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const [city, branch] = await Promise.all([
    user.cityId ? prisma.city.findUnique({ where: { id: user.cityId } }) : null,
    user.branchId
      ? prisma.branch.findUnique({ where: { id: user.branchId }, include: { city: true } })
      : null,
  ]);

  return NextResponse.json({
    user: {
      ...user,
      cityName: city?.name ?? branch?.city.name ?? null,
      cityNameKu: city?.nameKu ?? branch?.city.nameKu ?? null,
      branchName: branch?.name ?? null,
      branchNameKu: branch?.nameKu ?? null,
    },
  });
});
