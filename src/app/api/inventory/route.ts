import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

export async function GET() {
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const isAdmin = guard.session.role === "admin";
  const branch = await activeBranch(guard.session);

  const [items, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { branch },
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true, color: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { item: { branch } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        item: { select: { name: true, unit: true } },
        staff: { select: { fullName: true } },
      },
    }),
  ]);

  if (isAdmin) return NextResponse.json({ items, movements });

  // Non-admins (e.g. branch managers) must not see what ANY item costs. We
  // redact SERVER-SIDE (not in the UI) so the data never reaches their browser:
  //   • hide unit cost on every item (owner requirement: cost is admin-only)
  //   • hide the cost on every movement (managers can still log a delivery's
  //     total cost when adding stock — they just never see the resulting figures)
  const safeItems = items.map((i) => ({ ...i, lastUnitCost: null }));
  const safeMovements = movements.map((m) => ({ ...m, unitCost: null, totalCost: null }));

  return NextResponse.json({ items: safeItems, movements: safeMovements });
}

export async function POST(req: Request) {
  const guard = await authorize("inventory.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const { name, unit, quantity, minThreshold, unitSize, unitsPerContainer, contentPerUnit, categoryId } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!unit?.trim()) return NextResponse.json({ error: "Unit is required" }, { status: 400 });

  // A category link must stay inside the same branch.
  if (categoryId) {
    const cat = await prisma.inventoryCategory.findFirst({ where: { id: String(categoryId), branch } });
    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      name: name.trim(),
      branch,
      unit: unit.trim(),
      quantity: Number(quantity) || 0,
      minThreshold: Number(minThreshold) || 0,
      unitSize: Number(unitSize) > 0 ? Number(unitSize) : null,
      unitsPerContainer: Number(unitsPerContainer) > 0 ? Number(unitsPerContainer) : null,
      contentPerUnit: Number(contentPerUnit) > 0 ? Number(contentPerUnit) : null,
      categoryId: categoryId ? String(categoryId) : null,
    },
  });
  await audit(guard.session.sub, `Created stock item "${item.name}" (${branch})`);
  return NextResponse.json({ item }, { status: 201 });
}
