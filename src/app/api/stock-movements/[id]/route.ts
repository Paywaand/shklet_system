import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// Edit / delete an individual StockMovement. Guarded by inventory.manage (admin +
// manager). Both operations keep the item's running quantity consistent with the
// movement log: a movement records a `change` (+added / −removed), so editing the
// quantity or deleting the row must re-apply the delta to InventoryItem.quantity.

// PATCH /api/stock-movements/:id { change?, reason?, note?, date? }
//   Changing `change` recomputes the movement's cost and shifts the item stock by
//   the difference between the old and new change.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const movement = await prisma.stockMovement.findUnique({
    where: { id: params.id },
    include: { item: true },
  });
  if (!movement || movement.item.branch !== branch)
    return NextResponse.json({ error: "Movement not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // Quantity edit: keep the sign of the original movement (addition vs deduction).
  let newChange = movement.change;
  if (body.change !== undefined) {
    const magnitude = Math.abs(Number(body.change));
    if (!Number.isFinite(magnitude) || magnitude === 0)
      return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });
    newChange = movement.change < 0 ? -magnitude : magnitude;
    data.change = newChange;

    // Recompute cost from the new quantity, mirroring the creation logic:
    //   • addition: unitCost = totalCost / change (batch cost stays as paid)
    //   • deduction: totalCost = unitCost × change (unit price stays)
    if (movement.totalCost != null) {
      if (newChange > 0 && movement.totalCost > 0) {
        data.unitCost = movement.totalCost / newChange;
      } else if (newChange < 0 && movement.unitCost != null) {
        data.totalCost = Math.round(movement.unitCost * newChange); // negative
      }
    }
  }

  if (body.reason !== undefined) data.reason = String(body.reason);
  if (body.note !== undefined) data.note = body.note?.trim() || null;
  if (body.date !== undefined) data.createdAt = new Date(body.date);

  // Mark as edited so the UI can show an "edited" indicator.
  data.editedAt = new Date();

  // Apply the stock delta (difference between new and old change) atomically with
  // the movement update.
  const delta = newChange - movement.change;
  const newQty = Math.max(0, movement.item.quantity + delta);

  const [, updated] = await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: movement.itemId },
      data: { quantity: newQty },
    }),
    prisma.stockMovement.update({ where: { id: params.id }, data }),
  ]);

  await audit(
    guard.session.sub,
    `Edited stock movement on "${movement.item.name}" (${movement.change} → ${newChange} ${movement.item.unit})`
  );
  // Cost is admin-only — see the matching redaction in GET /api/inventory.
  const isAdmin = guard.session.role === "admin";
  return NextResponse.json({
    movement: isAdmin ? updated : { ...updated, unitCost: null, totalCost: null },
  });
}

// DELETE /api/stock-movements/:id
//   Removes the movement and reverses its effect on stock: deleting a usage
//   (negative change) returns that amount to stock; deleting an addition removes it.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const movement = await prisma.stockMovement.findUnique({
    where: { id: params.id },
    include: { item: true },
  });
  if (!movement || movement.item.branch !== branch)
    return NextResponse.json({ error: "Movement not found" }, { status: 404 });

  // Reverse the movement's contribution to current stock.
  const newQty = Math.max(0, movement.item.quantity - movement.change);

  await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: movement.itemId },
      data: { quantity: newQty },
    }),
    prisma.stockMovement.delete({ where: { id: params.id } }),
  ]);

  await audit(
    guard.session.sub,
    `Deleted stock movement on "${movement.item.name}" (${movement.change > 0 ? "+" : ""}${movement.change} ${movement.item.unit})`
  );
  return new NextResponse(null, { status: 204 });
}
