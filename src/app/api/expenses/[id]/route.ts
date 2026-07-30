import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateExpenseBody {
  category?: "RENT" | "UTILITIES" | "SUPPLIES" | "STAFF" | "OTHER";
  amount?: number;
  description?: string;
  date?: string;
}

async function assertCityAccess(role: string, userCityId: string | null, expenseId: string) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new AuthError("Not found", 404);
  if (role === "MANAGER" && expense.cityId !== userCityId) throw new AuthError("Forbidden", 403);
  return expense;
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    await assertCityAccess(user.role, user.cityId, id);
    const body = await safeJson<UpdateExpenseBody>(req);

    const expense = await prisma.expense.update({
      where: { id },
      data: { ...body, date: body.date ? new Date(body.date) : undefined },
    });
    await logAudit(user.id, `updated expense`, "Expense", id);
    return NextResponse.json({ expense });
  },
);

export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN", "MANAGER");
    const { id } = await params;
    await assertCityAccess(user.role, user.cityId, id);

    await prisma.expense.delete({ where: { id } });
    await logAudit(user.id, `deleted expense`, "Expense", id);
    return NextResponse.json({ ok: true });
  },
);
