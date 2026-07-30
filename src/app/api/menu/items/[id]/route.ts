import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { ModifiersSchema } from "@/lib/schemas";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const existing = await prisma.menuItem.findFirst({ where: { id: params.id, category: { branch } } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0)
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    data.price = Math.round(p);
  }
  if (body.categoryId !== undefined) {
    // Moving between categories is allowed only within the same branch.
    const cat = await prisma.category.findFirst({ where: { id: String(body.categoryId), branch } });
    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });
    data.categoryId = body.categoryId;
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl?.trim() || null;
  if (typeof body.available === "boolean") data.available = body.available;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (body.modifiers !== undefined) {
    if (body.modifiers === null) {
      data.modifiers = null;
    } else {
      const parsed = ModifiersSchema.safeParse(body.modifiers);
      if (!parsed.success)
        return NextResponse.json({ error: "Invalid modifiers" }, { status: 400 });
      data.modifiers = parsed.data.length ? JSON.stringify(parsed.data) : null;
    }
  }

  const item = await prisma.menuItem.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated item "${item.name}"`);
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const item = await prisma.menuItem.findFirst({ where: { id: params.id, category: { branch } } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  await prisma.menuItem.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted item "${item?.name ?? params.id}"`);
  return new NextResponse(null, { status: 204 });
}
