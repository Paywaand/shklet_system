import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const GET = withApiError(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole("ADMIN");
    const { id } = await params;
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        orders: { include: { items: true } },
        expenses: true,
        stockMovements: true,
      },
    });
    if (!event) throw new AuthError("Not found", 404);

    // Top items sold at this event.
    const itemCounts = new Map<string, number>();
    for (const order of event.orders) {
      for (const item of order.items) {
        itemCounts.set(item.nameSnapshot, (itemCounts.get(item.nameSnapshot) ?? 0) + item.quantity);
      }
    }
    const topItems = [...itemCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    return NextResponse.json({ event, topItems });
  },
);
