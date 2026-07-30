// Server-side helpers for the production module (Recipe BOM only). Resolves
// dynamic ingredient costs from the warehouse and shapes the DTOs returned by
// the API. Imports Prisma → server only.
import type { Prisma } from "@prisma/client";
import { lineTotal, rawCostPerGram } from "./costing";
import type { Recipe } from "./types";

type RecipeWithRelations = Prisma.RecipeGetPayload<{
  include: {
    menuItem: { select: { name: true; price: true } };
    ingredients: {
      include: {
        inventoryItem: { select: { unit: true; lastUnitCost: true } };
      };
    };
  };
}>;

// Resolve each BOM line's cost-per-gram (inventory link → manual fallback),
// then compute line totals, total cost, and gross profit.
export function shapeRecipe(recipe: RecipeWithRelations, isAdmin = true): Recipe {
  const salePrice = recipe.menuItem.price;
  const ingredients = recipe.ingredients
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => {
      let costPerGram = i.costPerGram;
      let source: "manual" | "inventory" = "manual";
      if (i.inventoryItemId && i.inventoryItem) {
        const raw = rawCostPerGram(i.inventoryItem.unit, i.inventoryItem.lastUnitCost);
        if (raw != null) {
          costPerGram = raw;
          source = "inventory";
        }
      }
      return {
        id: i.id,
        recipeId: i.recipeId,
        name: i.name,
        gramsPerServing: i.gramsPerServing,
        costPerGram: isAdmin ? costPerGram : 0,
        inventoryItemId: i.inventoryItemId,
        sortOrder: i.sortOrder,
        lineTotal: isAdmin ? lineTotal({ gramsPerServing: i.gramsPerServing, costPerGram }) : 0,
        source,
      };
    });

  const totalCost = ingredients.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  return {
    id: recipe.id,
    menuItemId: recipe.menuItemId,
    menuItemName: recipe.menuItem.name,
    salePrice,
    notes: recipe.notes,
    ingredients,
    totalCost,
    grossProfit: salePrice - totalCost,
  };
}
