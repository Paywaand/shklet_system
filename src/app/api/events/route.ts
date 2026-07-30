import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const events = await prisma.event.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ events });
});

interface CreateEventBody {
  name: string;
  nameKu: string;
  startDate: string;
  endDate?: string;
  locationLabel?: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<CreateEventBody>(req);

  const event = await prisma.event.create({
    data: {
      name: body.name,
      nameKu: body.nameKu,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      locationLabel: body.locationLabel,
    },
  });
  await logAudit(admin.id, `created event "${body.name}"`, "Event", event.id);
  return NextResponse.json({ event });
});
