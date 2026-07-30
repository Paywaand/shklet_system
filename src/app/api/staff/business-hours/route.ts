import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async () => {
  await requireUser();
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return NextResponse.json({ settings });
});

interface UpdateBody {
  openingHour: number;
  closingHour: number;
}

export const PATCH = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<UpdateBody>(req);

  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { openingHour: body.openingHour, closingHour: body.closingHour },
    create: { id: 1, openingHour: body.openingHour, closingHour: body.closingHour },
  });

  await logAudit(admin.id, "updated business hours", "AppSettings", "1");
  return NextResponse.json({ settings });
});
