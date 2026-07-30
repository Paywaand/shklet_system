import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// PATCH /api/orders/:id/cancel — cashier-facing cancel, distinct from the admin-only
// hard DELETE. Allowed for any authenticated staff role (admin/manager/cashier) — this
// is intentionally NOT gated behind the RolePermission matrix like other actions, so it
// can't be disabled for staff and doesn't depend on a seed/migration having populated a
// permission row. Only allowed while the order is still "pending" (not yet marked
// ready) — that's the server-side enforcement, not just a hidden UI button. Sets status
// to "cancelled" instead of deleting the row so the order stays in the audit/reporting
// trail; pagerNumber is freed the same way collectedAt frees it (both statuses are
// excluded from /api/orders/active's pending/ready filter).
export async function PATCH(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;

  const branch = await activeBranch(guard.session);
  const order = await prisma.order.findFirst({ where: { id: params.id, branch } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "pending")
    return NextResponse.json(
      { error: "Only pending orders can be cancelled — this one is already ready or collected" },
      { status: 400 }
    );

  const updated = await prisma.order.update({
    where: { id: params.id },
    data: { status: "cancelled" },
  });
  await audit(guard.session.sub, `Cancelled order #${order.shortId ?? order.pagerNumber} (${order.total} IQD)`);
  return NextResponse.json({ order: updated });
}
