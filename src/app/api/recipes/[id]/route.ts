import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// Shape of one BOM line coming from the editor.
type LineInput = {
  name?: string;
  gramsPerServing?: number;
  costPerGram?: number;
  inventoryItemId?: string | null;
};

// PATCH /api/recipes/:id — replace the recipe's ingredient lines (and notes).
// Lines are fully replaced (delete + recreate) so the editor can add/remove/reorder
// freely in a single atomic write.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("recipes.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  // Branch guard: the recipe must belong to the active branch's menu.
  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, menuItem: { category: { branch } } },
    include: { menuItem: { select: { name: true } } },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const lines: LineInput[] = Array.isArray(body.ingredients) ? body.ingredients : [];

  const data = lines
    .filter((l) => (l.name ?? "").trim().length > 0)
    .map((l, idx) => ({
      name: String(l.name).trim(),
      gramsPerServing: Math.max(0, Number(l.gramsPerServing) || 0),
      costPerGram: Math.max(0, Number(l.costPerGram) || 0),
      inventoryItemId: l.inventoryItemId || null,
      sortOrder: idx,
    }));

  await prisma.$transaction([
    prisma.recipeIngredient.deleteMany({ where: { recipeId: params.id } }),
    prisma.recipe.update({
      where: { id: params.id },
      data: {
        notes: typeof body.notes === "string" ? body.notes : recipe.notes,
        ingredients: { create: data },
      },
    }),
  ]);

  await audit(guard.session.sub, `Updated recipe for "${recipe.menuItem.name}" (${branch})`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/recipes/:id
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("recipes.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, menuItem: { category: { branch } } },
    include: { menuItem: { select: { name: true } } },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  await prisma.recipe.delete({ where: { id: params.id } });
  await audit(guard.session.sub, `Deleted recipe for "${recipe.menuItem.name}" (${branch})`);
  return new NextResponse(null, { status: 204 });
}
