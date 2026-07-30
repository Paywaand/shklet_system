import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit, AuthError } from "@/lib/auth";
import { withApiError } from "@/lib/api";

/**
 * Closing an event computes and freezes a read-only evaluation: revenue,
 * ingredient/batch usage cost, tagged expenses, gross profit/loss, top items.
 */
export const POST = withApiError(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("ADMIN");
    const { id } = await params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new AuthError("Not found", 404);
    if (event.status === "CLOSED") throw new AuthError("Event already closed", 400);

    const orders = await prisma.order.findMany({
      where: { eventId: id, status: { not: "CANCELLED" } },
      include: { items: true },
    });
    const revenue = orders.reduce((sum, o) => sum + o.total, 0);

    const expenses = await prisma.expense.findMany({ where: { eventId: id } });
    const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

    const movements = await prisma.stockMovement.findMany({
      where: { eventId: id, type: "REMOVE" },
    });
    const usageCost = movements.reduce(
      (sum, m) => sum + Number(m.amount) * Number(m.unitCostAtTime),
      0,
    );

    const profit = revenue - expensesTotal - usageCost;

    const updated = await prisma.event.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        evalRevenue: revenue,
        evalExpenses: expensesTotal,
        evalUsageCost: usageCost,
        evalProfit: Math.round(profit),
      },
    });

    await logAudit(admin.id, `closed event "${event.name}"`, "Event", id);
    return NextResponse.json({ event: updated });
  },
);
