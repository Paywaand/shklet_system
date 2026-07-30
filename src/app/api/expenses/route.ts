import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, scopeCityFilter, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = scopeCityFilter(user, searchParams.get("cityId"));

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  const category = searchParams.get("category");
  if (category) where.category = category;

  const expenses = await prisma.expense.findMany({
    where,
    include: { user: { select: { fullName: true } }, city: true, event: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ expenses });
});

interface CreateExpenseBody {
  cityId: string;
  category: "RENT" | "UTILITIES" | "SUPPLIES" | "STAFF" | "OTHER";
  amount: number;
  description?: string;
  date: string;
  eventId?: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireRole("ADMIN", "MANAGER");
  const body = await safeJson<CreateExpenseBody>(req);

  if (user.role === "MANAGER" && body.cityId !== user.cityId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expense = await prisma.expense.create({
    data: {
      cityId: body.cityId,
      category: body.category,
      amount: body.amount,
      description: body.description,
      date: new Date(body.date),
      eventId: body.eventId,
      userId: user.id,
    },
  });
  await logAudit(user.id, `logged expense of ${body.amount} (${body.category})`, "Expense", expense.id);
  return NextResponse.json({ expense });
});
