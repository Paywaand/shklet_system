import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { CATEGORY_COLORS } from "@/lib/categories";
import { activeBranch } from "@/lib/branchScope";

// GET /api/inventory-categories — list categories with their item counts.
export async function GET() {
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const categories = await prisma.inventoryCategory.findMany({
    where: { branch },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
      itemCount: c._count.items,
    })),
  });
}

// POST /api/inventory-categories — create a custom category (Admin+).
export async function POST(req: Request) {
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const color = CATEGORY_COLORS.includes(body.color) ? body.color : "gray";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const existing = await prisma.inventoryCategory.findFirst({ where: { branch, name } });
  if (existing)
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });

  const count = await prisma.inventoryCategory.count({ where: { branch } });
  const category = await prisma.inventoryCategory.create({
    data: { name, branch, color, sortOrder: count },
  });
  await audit(guard.session.sub, `Created inventory category "${name}" (${branch})`);
  return NextResponse.json({ category }, { status: 201 });
}
