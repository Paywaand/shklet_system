"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Save, Zap } from "lucide-react";
import { apiSend } from "@/lib/client";
import { iqd } from "@/lib/format";
import { rawCostPerGram, lineTotal as calcLineTotal, gpPercent, gpColorClass, formatGp } from "@/lib/costing";
import { useToast } from "@/components/Toast";
import type { Recipe } from "@/lib/types";

type RawItem = { id: string; name: string; unit: string; lastUnitCost: number | null };

// One editable BOM line in local state.
type Line = {
  key: string;
  name: string;
  gramsPerServing: number;
  costPerGram: number; // manual value (used when no link is set)
  inventoryItemId: string | null;
};

let keySeq = 0;
const nextKey = () => `line-${keySeq++}`;

// Per-gram values are small fractional IQD — show up to 2 decimals.
function perGram(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} IQD/g`;
}

// Resolve a line's effective cost-per-gram: inventory link → manual.
function resolveCostPerGram(line: Line, inventory: RawItem[]): number {
  if (line.inventoryItemId) {
    const item = inventory.find((i) => i.id === line.inventoryItemId);
    if (item) {
      const raw = rawCostPerGram(item.unit, item.lastUnitCost);
      if (raw != null) return raw;
    }
  }
  return line.costPerGram;
}

export function RecipeBomTable({
  recipe,
  inventory,
  onSaved,
}: {
  recipe: Recipe;
  inventory: RawItem[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    recipe.ingredients.map((i) => ({
      key: nextKey(),
      name: i.name,
      gramsPerServing: i.gramsPerServing,
      costPerGram: i.costPerGram,
      inventoryItemId: i.inventoryItemId,
    }))
  );

  const resolved = useMemo(
    () =>
      lines.map((l) => {
        const cpg = resolveCostPerGram(l, inventory);
        return { line: l, costPerGram: cpg, total: calcLineTotal({ gramsPerServing: l.gramsPerServing, costPerGram: cpg }) };
      }),
    [lines, inventory]
  );

  const totalCost = resolved.reduce((s, r) => s + r.total, 0);
  const gross = recipe.salePrice - totalCost;
  const gp = gpPercent(recipe.salePrice, totalCost); // live GP%, recomputed as lines change

  function patch(key: string, change: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function setSource(key: string, value: string) {
    if (value === "manual") return patch(key, { inventoryItemId: null });
    if (value.startsWith("inv:")) {
      const id = value.slice(4);
      const item = inventory.find((i) => i.id === id);
      return setLines((prev) =>
        prev.map((l) =>
          l.key === key
            ? { ...l, inventoryItemId: id, name: l.name.trim() || item?.name || "" }
            : l
        )
      );
    }
  }

  function sourceValue(l: Line): string {
    if (l.inventoryItemId) return `inv:${l.inventoryItemId}`;
    return "manual";
  }

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey(), name: "", gramsPerServing: 0, costPerGram: 0, inventoryItemId: null }]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function save() {
    setSaving(true);
    try {
      await apiSend(`/api/recipes/${recipe.id}`, "PATCH", {
        notes,
        ingredients: lines.map((l) => ({
          name: l.name,
          gramsPerServing: l.gramsPerServing,
          costPerGram: l.costPerGram,
          inventoryItemId: l.inventoryItemId,
        })),
      });
      toast.show("Recipe saved");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
              <th className="p-2 min-w-[150px]">Ingredient</th>
              <th className="p-2 min-w-[150px]">Cost source</th>
              <th className="p-2 text-right">g / serving</th>
              <th className="p-2 text-right">Cost / g</th>
              <th className="p-2 text-right">Line total</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {resolved.map(({ line, costPerGram, total }) => {
              const dynamic = !!line.inventoryItemId;
              return (
                <tr key={line.key} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-2">
                    <input
                      className="input py-1.5"
                      value={line.name}
                      placeholder="e.g. Flour"
                      onChange={(e) => patch(line.key, { name: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <select className="input py-1.5" value={sourceValue(line)} onChange={(e) => setSource(line.key, e.target.value)}>
                      <option value="manual">Manual cost</option>
                      {inventory.length > 0 && (
                        <optgroup label="Warehouse item">
                          {inventory.map((i) => (
                            <option key={i.id} value={`inv:${i.id}`}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      className="input py-1.5 text-right w-24"
                      value={line.gramsPerServing || ""}
                      onChange={(e) => patch(line.key, { gramsPerServing: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="p-2 text-right">
                    {dynamic ? (
                      <span className="inline-flex items-center gap-1 justify-end opacity-80" title="Auto-calculated">
                        <Zap size={12} className="text-leaf" />
                        {perGram(costPerGram)}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input py-1.5 text-right w-24"
                        value={line.costPerGram || ""}
                        onChange={(e) => patch(line.key, { costPerGram: Number(e.target.value) || 0 })}
                      />
                    )}
                  </td>
                  <td className="p-2 text-right font-semibold whitespace-nowrap">{iqd(total)}</td>
                  <td className="p-2 text-right">
                    <button className="btn-ghost size-8 rounded-lg text-red-500" onClick={() => removeLine(line.key)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center opacity-50">
                  No ingredients yet — add the first line.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="btn-ghost px-3 py-2 text-sm mt-3" onClick={addLine}>
        <Plus size={16} /> Add ingredient
      </button>

      {/* Gross-profit summary */}
      <div className="card p-4 mt-4 bg-black/[0.02] dark:bg-white/[0.03]">
        <Row label="Sale price" value={iqd(recipe.salePrice)} />
        <Row label="Total ingredient cost" value={`- ${iqd(totalCost)}`} negative />
        <div className="border-t-2 border-black/10 dark:border-white/10 mt-2 pt-2 flex items-center justify-between">
          <span className="font-extrabold">Gross profit / serving</span>
          <span className={`text-xl font-extrabold ${gross >= 0 ? "text-leaf" : "text-red-500"}`}>{iqd(gross)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-semibold opacity-80">Gross profit margin (GP%)</span>
          <span className={`text-xl font-extrabold ${gpColorClass(gp)}`}>GP: {formatGp(gp)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Notes (optional)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prep notes…" />
      </div>

      <button className="btn-primary px-4 py-2.5 mt-4 w-full sm:w-auto" onClick={save} disabled={saving}>
        <Save size={18} /> {saving ? "Saving…" : "Save recipe"}
      </button>
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-semibold opacity-80">{label}</span>
      <span className={`font-bold ${negative ? "text-red-500" : ""}`}>{value}</span>
    </div>
  );
}
