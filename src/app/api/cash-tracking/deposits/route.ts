import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const where = scopeCityFilter(user, searchParams.get("cityId"));

  const deposits = await prisma.safeDeposit.findMany({
    where,
    include: { user: { select: { fullName: true } } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ deposits });
});

interface CreateBody {
  cityId: string;
  amount: number;
  date: string;
  note?: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const body = await safeJson<CreateBody>(req);
  if (user.role === "MANAGER" && body.cityId !== user.cityId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deposit = await prisma.safeDeposit.create({
    data: { cityId: body.cityId, amount: body.amount, date: new Date(body.date), note: body.note, userId: user.id },
  });
  await logAudit(user.id, `moved ${body.amount} to the safe`, "SafeDeposit", deposit.id);
  return NextResponse.json({ deposit });
});
