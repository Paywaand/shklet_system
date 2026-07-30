import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, scopeCityFilter, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

/**
 * Daily Needs is reachable by cashier + manager + admin (module 14: "cashier
 * (Cashier + Daily Needs only)"). Cashiers use their branch's city.
 */
async function resolveCityId(user: Awaited<ReturnType<typeof requireUser>>, requestedCityId?: string | null) {
  if (user.role === "ADMIN") return requestedCityId ?? null;
  if (user.role === "MANAGER") return user.cityId;
  if (user.role === "CASHIER" && user.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: user.branchId } });
    return branch?.cityId ?? null;
  }
  return null;
}

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const cityId = await resolveCityId(user, searchParams.get("cityId"));
  if (!cityId) throw new AuthError("No city context", 400);

  const items = await prisma.inventoryItem.findMany({
    where: { cityId },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const latestChecklist = await prisma.dailyNeedsChecklist.findFirst({
    where: { cityId },
    orderBy: { businessDate: "desc" },
    include: { entries: true },
  });

  return NextResponse.json({ items, latestChecklist });
});

interface SaveChecklistBody {
  entries: { inventoryItemId: string; needsRestock: boolean; note?: string }[];
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireUser();
  const cityId = await resolveCityId(user);
  if (!cityId) throw new AuthError("No city context", 400);

  const body = await safeJson<SaveChecklistBody>(req);
  const businessDate = new Date();
  businessDate.setHours(0, 0, 0, 0);

  const checklist = await prisma.dailyNeedsChecklist.create({
    data: {
      cityId,
      businessDate,
      completedBy: user.id,
      entries: { create: body.entries },
    },
    include: { entries: true },
  });

  await logAudit(user.id, "saved a daily needs checklist", "DailyNeedsChecklist", checklist.id);
  return NextResponse.json({ checklist });
});
