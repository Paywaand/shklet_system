import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const where = scopeCityFilter(user, searchParams.get("cityId"));

  const withdrawals = await prisma.withdrawal.findMany({
    where,
    include: { user: { select: { fullName: true } } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ withdrawals });
});

interface CreateBody {
  cityId: string;
  amount: number;
  source: "SAFE" | "MANAGER";
  recipientName: string;
  date: string;
  note?: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const body = await safeJson<CreateBody>(req);
  if (user.role === "MANAGER" && body.cityId !== user.cityId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cap withdrawal at the current balance of its source.
  const [deposits, withdrawals, orders] = await Promise.all([
    prisma.safeDeposit.aggregate({ where: { cityId: body.cityId }, _sum: { amount: true } }),
    prisma.withdrawal.findMany({ where: { cityId: body.cityId } }),
    prisma.order.findMany({
      where: { branch: { cityId: body.cityId }, paymentMethod: "CASH", status: { not: "CANCELLED" } },
      select: { total: true },
    }),
  ]);
  const expenses = await prisma.expense.aggregate({ where: { cityId: body.cityId }, _sum: { amount: true } });

  const safeBalance =
    (deposits._sum.amount ?? 0) - withdrawals.filter((w) => w.source === "SAFE").reduce((s, w) => s + w.amount, 0);
  const cashSales = orders.reduce((s, o) => s + o.total, 0);
  const managerHolds =
    cashSales -
    (expenses._sum.amount ?? 0) -
    (deposits._sum.amount ?? 0) -
    withdrawals.filter((w) => w.source === "MANAGER").reduce((s, w) => s + w.amount, 0);

  const availableBalance = body.source === "SAFE" ? safeBalance : managerHolds;
  if (body.amount > availableBalance) {
    return NextResponse.json({ error: "EXCEEDS_BALANCE", availableBalance }, { status: 400 });
  }

  const withdrawal = await prisma.withdrawal.create({
    data: {
      cityId: body.cityId,
      amount: body.amount,
      source: body.source,
      recipientName: body.recipientName,
      date: new Date(body.date),
      note: body.note,
      userId: user.id,
    },
  });
  await logAudit(user.id, `recorded withdrawal of ${body.amount} to ${body.recipientName}`, "Withdrawal", withdrawal.id);
  return NextResponse.json({ withdrawal });
});
