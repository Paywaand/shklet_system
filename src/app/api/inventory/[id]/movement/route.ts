import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// Sentinel thrown inside the transaction when an atomic deduction can't be
// satisfied (would drive stock below zero). Lets us map it to a 409.
const INSUFFICIENT = "INSUFFICIENT_STOCK";

// POST /api/inventory/:id/movement
//   Addition (change > 0):  { change, reason, note, totalCost }  -> unit cost = totalCost / change
//   Deduction (change < 0): { change, reason, note }            -> usage cost = lastUnitCost * |change|
//
// Stock is mutated with ATOMIC Prisma operations (increment / guarded decrement)
// so concurrent movements can't race on a read-modify-write of `quantity`.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const change = Number(body.change);
  const reason = body.reason || "correction";
  const note = body.note?.trim() || null;

  if (!Number.isFinite(change) || change === 0)
    return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });

  // Branch guard: the item must belong to the active branch.
  const item = await prisma.inventoryItem.findFirst({ where: { id: params.id, branch } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  let unitCost: number | null = null;
  let totalCost: number | null = null;
  let newLastUnitCost = item.lastUnitCost;

  if (change > 0) {
    // Delivery: total batch cost provided; derive per-unit cost.
    const batchCost = Number(body.totalCost);
    if (Number.isFinite(batchCost) && batchCost > 0) {
      totalCost = Math.round(batchCost);
      unitCost = batchCost / change;
      newLastUnitCost = unitCost; // most recent purchase price
    }
  } else {
    // Usage / wastage: cost based on the most recent known unit price.
    if (item.lastUnitCost != null) {
      unitCost = item.lastUnitCost;
      totalCost = Math.round(item.lastUnitCost * change); // negative
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (change > 0) {
        // Atomic increment; refresh lastUnitCost to the latest purchase price.
        await tx.inventoryItem.update({
          where: { id: params.id },
          data: { quantity: { increment: change }, lastUnitCost: newLastUnitCost },
        });
      } else {
        // Atomic guarded decrement: only succeeds if enough stock is on hand, so
        // two concurrent deductions can never push `quantity` below zero.
        const deduct = -change;
        const res = await tx.inventoryItem.updateMany({
          where: { id: params.id, quantity: { gte: deduct } },
          data: { quantity: { decrement: deduct } },
        });
        if (res.count === 0) throw new Error(INSUFFICIENT);
      }

      await tx.stockMovement.create({
        data: {
          itemId: params.id,
          change,
          reason,
          note,
          unitCost,
          totalCost,
          staffId: guard.session.sub,
          // Destination of usage: null = the branch itself (no event).
          eventId: change < 0 ? body.eventId || null : null,
        },
      });

      return tx.inventoryItem.findUnique({ where: { id: params.id } });
    });

    await audit(
      guard.session.sub,
      `Stock ${change > 0 ? "+" : ""}${change} ${item.unit} on "${item.name}" (${reason})`
    );
    // Cost is admin-only — see the matching redaction in GET /api/inventory.
    const isAdmin = guard.session.role === "admin";
    return NextResponse.json({ item: isAdmin || !updated ? updated : { ...updated, lastUnitCost: null } });
  } catch (e) {
    if (e instanceof Error && e.message === INSUFFICIENT) {
      return NextResponse.json(
        {
          error: `Not enough ${item.name} in stock: only ${item.quantity} ${item.unit} available`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to record movement" }, { status: 500 });
  }
}
