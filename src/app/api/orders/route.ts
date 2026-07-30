import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, AuthError } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";
import { generateOrderCode } from "@/lib/order-code";

interface OrderItemModifierInput {
  groupName: string;
  optionName: string;
  extraPrice: number;
}

interface OrderItemInput {
  menuItemId: string;
  nameSnapshot: string;
  nameKuSnapshot: string;
  unitPrice: number;
  quantity: number;
  modifiers: OrderItemModifierInput[];
}

interface CreateOrderBody {
  type: "WALKIN" | "DELIVERY";
  pagerNumber?: number;
  paymentMethod: "CASH" | "CARD" | "PLATFORM";
  items: OrderItemInput[];
  deliveryReference?: string;
  deliveryCommissionPct?: number;
  eventId?: string;
  offlineCreated?: boolean;
  clientPlacedAt?: string; // ISO — used when syncing an offline-queued order
}

/**
 * GET /api/orders — active-orders queue.
 * Cashiers: always scoped to their own branch (never a query param).
 * Admin/manager: can pass ?branchId= or see their whole city's branches.
 */
export const GET = withApiError(async (req: NextRequest) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status"); // "active" | "all"

  let branchFilter: { branchId?: string; branch?: { cityId: string } } = {};

  if (user.role === "CASHIER") {
    if (!user.branchId) throw new AuthError("Cashier has no assigned branch", 403);
    branchFilter = { branchId: user.branchId };
  } else if (user.role === "MANAGER") {
    if (!user.cityId) throw new AuthError("Manager has no assigned city", 403);
    branchFilter = { branch: { cityId: user.cityId } };
  } else {
    const requestedBranchId = searchParams.get("branchId");
    if (requestedBranchId) branchFilter = { branchId: requestedBranchId };
  }

  const statusFilter =
    statusParam === "all"
      ? {}
      : { status: { in: ["PLACED", "READY", "DRIVER_ARRIVED"] as ("PLACED" | "READY" | "DRIVER_ARRIVED")[] } };

  const orders = await prisma.order.findMany({
    where: { ...branchFilter, ...statusFilter },
    include: { items: { include: { modifiers: true } }, branch: true },
    orderBy: { placedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ orders });
});

export const POST = withApiError(async (req: NextRequest) => {
  const user = await requireUser();
  if (user.role !== "CASHIER" && user.role !== "ADMIN") {
    throw new AuthError("Forbidden", 403);
  }
  if (!user.branchId && user.role === "CASHIER") {
    throw new AuthError("Cashier has no assigned branch", 403);
  }

  const body = await safeJson<CreateOrderBody>(req);
  const branchId = user.branchId;
  if (!branchId) throw new AuthError("No branch context for this order", 400);

  // Pager collision check (walk-in only) — scoped to *this* branch's active orders.
  if (body.type === "WALKIN") {
    if (body.pagerNumber == null) throw new AuthError("Pager number required", 400);
    const clash = await prisma.order.findFirst({
      where: {
        branchId,
        pagerNumber: body.pagerNumber,
        status: { in: ["PLACED", "READY", "DRIVER_ARRIVED"] },
      },
    });
    if (clash) {
      return NextResponse.json({ error: "PAGER_CONFLICT", pagerNumber: body.pagerNumber }, { status: 409 });
    }
  }

  const subtotal = body.items.reduce((sum, item) => {
    const modsTotal = item.modifiers.reduce((s, m) => s + m.extraPrice, 0);
    return sum + (item.unitPrice + modsTotal) * item.quantity;
  }, 0);

  let deliveryGross: number | undefined;
  let deliveryNet: number | undefined;
  if (body.type === "DELIVERY" && body.deliveryCommissionPct != null) {
    deliveryGross = subtotal;
    deliveryNet = Math.round(subtotal * (1 - body.deliveryCommissionPct / 100));
  }

  let code = generateOrderCode();
  // Extremely unlikely collision guard.
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.order.findUnique({ where: { code } });
    if (!existing) break;
    code = generateOrderCode();
  }

  const order = await prisma.order.create({
    data: {
      code,
      branchId,
      cashierId: user.id,
      type: body.type,
      pagerNumber: body.type === "WALKIN" ? body.pagerNumber : null,
      paymentMethod: body.paymentMethod,
      subtotal,
      total: subtotal,
      deliveryReference: body.deliveryReference,
      deliveryCommissionPct: body.deliveryCommissionPct,
      deliveryGross,
      deliveryNet,
      eventId: body.eventId,
      offlineCreated: body.offlineCreated ?? false,
      placedAt: body.clientPlacedAt ? new Date(body.clientPlacedAt) : new Date(),
      items: {
        create: body.items.map((item) => ({
          menuItemId: item.menuItemId,
          nameSnapshot: item.nameSnapshot,
          nameKuSnapshot: item.nameKuSnapshot,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal:
            (item.unitPrice + item.modifiers.reduce((s, m) => s + m.extraPrice, 0)) *
            item.quantity,
          modifiers: {
            create: item.modifiers.map((m) => ({
              groupName: m.groupName,
              optionName: m.optionName,
              extraPrice: m.extraPrice,
            })),
          },
        })),
      },
    },
    include: { items: { include: { modifiers: true } } },
  });

  await logAudit(user.id, `placed order #${order.code}`, "Order", order.id);
  return NextResponse.json({ order });
});
