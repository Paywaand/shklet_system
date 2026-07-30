import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/** Cities + branches list — used by many modules (staff assignment, dispatch, filters). */
export const GET = withApiError(async () => {
  await requireUser();
  const cities = await prisma.city.findMany({
    include: { branches: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ cities });
});
