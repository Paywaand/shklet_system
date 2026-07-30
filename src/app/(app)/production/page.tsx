"use client";

import { useState } from "react";
import { Plus, ChefHat, Trash2, TrendingUp } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd } from "@/lib/format";
import { gpPercent, gpColorClass, formatGp } from "@/lib/costing";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { RecipeBomTable } from "@/components/RecipeBomTable";
import type { Recipe } from "@/lib/types";

type RawItem = { id: string; name: string; unit: string; lastUnitCost: number | null };
type MenuItemLite = { id: string; name: string; price: number };
type RecipesData = { recipes: Recipe[]; inventory: RawItem[]; menuItemsWithoutRecipe: MenuItemLite[] };

export default function ProductionPage() {
  const recipesQ = useFetch<RecipesData>("/api/recipes");
  const toast = useToast();

  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);

  if (recipesQ.loading) return <Loading />;
  if (recipesQ.error) return <ErrorState message={recipesQ.error} onRetry={recipesQ.reload} />;
  const data = recipesQ.data!;

  // ---- Recipe actions ----
  async function addRecipe(menuItemId: string) {
    try {
      await apiSend("/api/recipes", "POST", { menuItemId });
      toast.show("Recipe created — open it to add ingredients");
      recipesQ.reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function deleteRecipe(r: Recipe) {
    if (!confirm(`Delete the recipe for "${r.menuItemName}"?`)) return;
    try {
      await apiSend(`/api/recipes/${r.id}`, "DELETE");
      toast.show("Recipe deleted");
      recipesQ.reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <>
      <PageHeader title="Production" subtitle="Recipes — bill of materials (BOM) per menu item" />

      {(() => {
        const gps = data.recipes
          .map((r) => gpPercent(r.salePrice, r.totalCost))
          .filter((p): p is number => p != null);
        const avg = gps.length ? gps.reduce((s, p) => s + p, 0) / gps.length : null;
        return (
          <div className="card p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-60">Average GP%</p>
              <p className="text-xs opacity-50">
                Mean gross-profit margin across {gps.length} recipe{gps.length === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`text-3xl font-extrabold ${gpColorClass(avg)}`}>{formatGp(avg)}</span>
          </div>
        );
      })()}

      {data.menuItemsWithoutRecipe.length > 0 && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold opacity-70">Add recipe for:</span>
          {data.menuItemsWithoutRecipe.map((m) => (
            <button key={m.id} className="btn-ghost px-3 py-1.5 text-sm" onClick={() => addRecipe(m.id)}>
              <Plus size={14} /> {m.name}
            </button>
          ))}
        </div>
      )}

      {data.recipes.length === 0 ? (
        <EmptyState title="No recipes yet" hint="Add a recipe for a menu item to start building its BOM." icon={<ChefHat size={36} />} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.recipes.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{r.menuItemName}</p>
                  <p className="text-xs opacity-60">
                    {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"} · sale {iqd(r.salePrice)}
                  </p>
                </div>
                <button className="btn-ghost size-8 rounded-lg text-red-500" onClick={() => deleteRecipe(r)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-1">
                    <TrendingUp size={15} className="text-leaf" /> Gross / serving
                  </span>
                  <span className={`font-extrabold ${r.grossProfit >= 0 ? "text-leaf" : "text-red-500"}`}>{iqd(r.grossProfit)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm opacity-70">Gross profit margin</span>
                  {(() => {
                    const gp = gpPercent(r.salePrice, r.totalCost);
                    return <span className={`font-extrabold ${gpColorClass(gp)}`}>GP: {formatGp(gp)}</span>;
                  })()}
                </div>
              </div>
              <button className="btn-leaf px-3 py-2 text-sm mt-3 w-full" onClick={() => setEditRecipe(r)}>
                Edit BOM
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BOM editor modal */}
      {editRecipe && (
        <Modal open title={`Recipe — ${editRecipe.menuItemName}`} onClose={() => setEditRecipe(null)} wide>
          <RecipeBomTable
            recipe={editRecipe}
            inventory={data.inventory}
            onSaved={() => {
              setEditRecipe(null);
              recipesQ.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
