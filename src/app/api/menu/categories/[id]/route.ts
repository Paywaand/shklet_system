import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const target = await prisma.category.findFirst({ where: { id: params.id, branch } });
  if (!target) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; sortOrder?: number } = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const category = await prisma.category.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated category "${category.name}"`);
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const cat = await prisma.category.findFirst({ where: { id: params.id, branch } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  await prisma.category.delete({ where: { id: params.id } }); // cascades to items
  await audit(guard.session.sub, `Deleted category "${cat?.name ?? params.id}"`);
  return new NextResponse(null, { status: 204 });
}
