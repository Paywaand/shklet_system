import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  // Branch guard: the item must belong to the active branch.
  const existing = await prisma.inventoryItem.findFirst({ where: { id: params.id, branch } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.unit === "string") data.unit = body.unit.trim();
  if (body.minThreshold !== undefined) data.minThreshold = Number(body.minThreshold) || 0;
  if (body.unitSize !== undefined) data.unitSize = Number(body.unitSize) > 0 ? Number(body.unitSize) : null;
  if (body.unitsPerContainer !== undefined)
    data.unitsPerContainer = Number(body.unitsPerContainer) > 0 ? Number(body.unitsPerContainer) : null;
  if (body.contentPerUnit !== undefined)
    data.contentPerUnit = Number(body.contentPerUnit) > 0 ? Number(body.contentPerUnit) : null;
  if (body.categoryId !== undefined) {
    if (body.categoryId) {
      const cat = await prisma.inventoryCategory.findFirst({ where: { id: String(body.categoryId), branch } });
      if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });
      data.categoryId = String(body.categoryId);
    } else {
      data.categoryId = null;
    }
  }
  // Note: quantity is changed only through stock movements, not direct edits.

  const item = await prisma.inventoryItem.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated stock item "${item.name}"`);
  // Cost is admin-only — see the matching redaction in GET /api/inventory.
  const isAdmin = guard.session.role === "admin";
  return NextResponse.json({ item: isAdmin ? item : { ...item, lastUnitCost: null } });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const item = await prisma.inventoryItem.findFirst({ where: { id: params.id, branch } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  await prisma.inventoryItem.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted stock item "${item?.name ?? params.id}"`);
  return new NextResponse(null, { status: 204 });
}
