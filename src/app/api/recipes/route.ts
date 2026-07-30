import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { shapeRecipe } from "@/lib/production";

// GET /api/recipes — all recipes for the active branch (with resolved costs),
// plus the data the BOM editor needs: menu items still missing a recipe and raw
// warehouse items. Everything is scoped to ONE branch (menu + warehouse are
// per-branch).
export async function GET() {
  const guard = await authorize("recipes.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const [recipes, menuItems, inventory] = await Promise.all([
    prisma.recipe.findMany({
      where: { menuItem: { category: { branch } } },
      include: {
        menuItem: { select: { name: true, price: true } },
        ingredients: {
          include: {
            inventoryItem: { select: { unit: true, lastUnitCost: true } },
          },
        },
      },
      orderBy: { menuItem: { name: "asc" } },
    }),
    prisma.menuItem.findMany({
      where: { category: { branch } },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { branch },
      select: { id: true, name: true, unit: true, lastUnitCost: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isAdmin = guard.session.role === "admin";
  const shapedRecipes = recipes.map((r) => shapeRecipe(r, isAdmin));

  const withRecipe = new Set(recipes.map((r) => r.menuItemId));
  const menuItemsWithoutRecipe = menuItems.filter((m) => !withRecipe.has(m.id));

  return NextResponse.json({
    recipes: shapedRecipes,
    inventory,
    menuItemsWithoutRecipe,
  });
}

// POST /api/recipes — create an (empty) recipe for a menu item in the active branch.
export async function POST(req: Request) {
  const guard = await authorize("recipes.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  const menuItemId = String(body.menuItemId || "");
  if (!menuItemId) return NextResponse.json({ error: "Pick a menu item" }, { status: 400 });

  // The menu item must belong to the active branch — a manager can never attach
  // a recipe to the other city's menu.
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, category: { branch } },
  });
  if (!menuItem) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });

  const existing = await prisma.recipe.findUnique({ where: { menuItemId } });
  if (existing)
    return NextResponse.json({ error: "That item already has a recipe" }, { status: 409 });

  const recipe = await prisma.recipe.create({ data: { menuItemId } });
  await audit(guard.session.sub, `Created recipe for "${menuItem.name}" (${branch})`);
  return NextResponse.json({ recipe }, { status: 201 });
}
