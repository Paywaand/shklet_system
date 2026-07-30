import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { ModifiersSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const { name, price, categoryId, description, imageUrl, available, modifiers } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });
  // The category must belong to the active branch (menus are per-branch).
  const cat = await prisma.category.findFirst({ where: { id: String(categoryId), branch } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 400 });
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0)
    return NextResponse.json({ error: "Valid price is required" }, { status: 400 });

  // Strict validation of the modifiers JSON before it's stored (bounds group /
  // option counts and string lengths — see lib/schemas.ts).
  let modifiersJson: string | null = null;
  if (modifiers !== undefined && modifiers !== null) {
    const parsed = ModifiersSchema.safeParse(modifiers);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid modifiers" }, { status: 400 });
    modifiersJson = parsed.data.length ? JSON.stringify(parsed.data) : null;
  }

  const count = await prisma.menuItem.count({ where: { categoryId } });
  const item = await prisma.menuItem.create({
    data: {
      name: name.trim(),
      price: Math.round(priceNum),
      categoryId,
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      available: available !== false,
      modifiers: modifiersJson,
      sortOrder: count,
    },
  });
  await audit(guard.session.sub, `Created item "${item.name}"`);
  return NextResponse.json({ item }, { status: 201 });
}
