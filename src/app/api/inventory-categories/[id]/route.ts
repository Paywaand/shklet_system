import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { CATEGORY_COLORS } from "@/lib/categories";
import { activeBranch } from "@/lib/branchScope";

// PATCH /api/inventory-categories/[id] — rename or recolor (Admin+).
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const target = await prisma.inventoryCategory.findFirst({ where: { id: params.id, branch } });
  if (!target) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; color?: string } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const clash = await prisma.inventoryCategory.findFirst({
      where: { branch, name, id: { not: params.id } },
    });
    if (clash)
      return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
    data.name = name;
  }
  if (typeof body.color === "string" && CATEGORY_COLORS.includes(body.color)) data.color = body.color;

  const category = await prisma.inventoryCategory.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated inventory category "${category.name}"`);
  return NextResponse.json({ category });
}

// DELETE /api/inventory-categories/[id] — remove a category. Items in it fall back
// to "Uncategorized" (categoryId set null via the schema's onDelete: SetNull).
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const category = await prisma.inventoryCategory.findFirst({ where: { id: params.id, branch } });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  await prisma.inventoryCategory.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted inventory category "${category?.name ?? params.id}"`);
  return new NextResponse(null, { status: 204 });
}
