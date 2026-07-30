"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import toast from "react-hot-toast";
import { Plus, Trash2, Factory, Send } from "lucide-react";

interface WarehouseItem {
  id: string;
  name: string;
  unit: string;
  unitCost: string;
}
interface Batch {
  id: string;
  name: string;
  nameKu: string;
  unit: string;
  totalAmount: string;
  costPerUnit: string;
  ingredients: { id: string; warehouseItemId: string; amount: string; warehouseItem: WarehouseItem }[];
}
interface RecipeLine {
  id: string;
  sourceType: "WAREHOUSE_ITEM" | "BATCH" | "MANUAL";
  warehouseItemId: string | null;
  batchId: string | null;
  manualCost: string | null;
  amountPerServing: string;
  warehouseItem: WarehouseItem | null;
  batch: Batch | null;
}
interface MenuItem {
  id: string;
  name: string;
  nameKu: string;
  basePrice: number;
  cityPrices: { price: number; cityId: string }[];
}
interface Recipe {
  id: string;
  menuItemId: string;
  notes: string | null;
  menuItem: MenuItem;
  lines: RecipeLine[];
}
interface City {
  id: string;
  name: string;
}

export default function ProductionPage() {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<"recipes" | "batches" | "dispatch">("recipes");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRecipeFor, setEditingRecipeFor] = useState<MenuItem | null>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [recipesRes, batchesRes, warehouseRes, menuRes, citiesRes] = await Promise.all([
      fetch("/api/production/recipes"),
      fetch("/api/production/batches"),
      fetch("/api/warehouse/items"),
      fetch("/api/menu/categories"),
      fetch("/api/cities"),
    ]);
    setRecipes((await recipesRes.json()).recipes ?? []);
    setBatches((await batchesRes.json()).batches ?? []);
    setWarehouseItems((await warehouseRes.json()).items ?? []);
    const menuData = await menuRes.json();
    setMenuItems((menuData.categories ?? []).flatMap((c: { items: MenuItem[] }) => c.items));
    setCities((await citiesRes.json()).cities ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function makeBatch(batch: Batch) {
    if (!confirm(t("production.makeBatchConfirm", { n: Number(batch.totalAmount) }))) return;
    const res = await fetch(`/api/production/batches/${batch.id}/produce`, { method: "POST" });
    if (res.ok) {
      toast.success(t("production.batchMade"));
      load();
    }
  }

  async function deleteRecipe(id: string) {
    const res = await fetch(`/api/production/recipes/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("production.recipeDeleted"));
      load();
    }
  }

  function lineCost(line: RecipeLine): number {
    if (line.sourceType === "MANUAL") return Number(line.manualCost ?? 0);
    if (line.sourceType === "WAREHOUSE_ITEM" && line.warehouseItem)
      return Number(line.warehouseItem.unitCost) * Number(line.amountPerServing);
    if (line.sourceType === "BATCH" && line.batch) return Number(line.batch.costPerUnit) * Number(line.amountPerServing);
    return 0;
  }

  return (
    <div>
      <PageHeader title={t("sidebar.production")} />

      <SegmentedControl
        options={[
          { value: "recipes", label: t("production.tabRecipes") },
          { value: "batches", label: t("production.tabBatches") },
          { value: "dispatch", label: t("production.tabDispatch") },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-6"
      />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : (
        <>
          {tab === "recipes" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {menuItems.map((item, i) => {
                const recipe = recipes.find((r) => r.menuItemId === item.id);
                const bomCost = recipe ? recipe.lines.reduce((s, l) => s + lineCost(l), 0) : 0;
                const price = item.cityPrices[0]?.price ?? item.basePrice;
                const grossProfit = price - bomCost;
                const grossProfitPct = price > 0 ? (grossProfit / price) * 100 : 0;
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                    <Card>
                      <CardContent className="pt-5">
                        <p className="font-bold mb-1.5">{lang === "ku" ? item.nameKu : item.name}</p>
                        {recipe ? (
                          <>
                            <p className="text-xs text-[var(--muted)] mb-2">{recipe.lines.length} ingredient line(s)</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--muted)]">{t("production.grossProfit")}</span>
                                <span className={`ltr-nums font-bold ${grossProfit >= 0 ? "text-shklet-green" : "text-shklet-red"}`}>
                                  {formatMoney(Math.round(grossProfit))}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--muted)]">{t("production.grossProfitPct")}</span>
                                <span className="ltr-nums font-semibold">{Math.round(grossProfitPct)}%</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-[var(--muted)]">{t("common.noResultsFound")}</p>
                        )}
                        <div className="flex gap-2 mt-3.5">
                          <Button size="sm" className="flex-1" onClick={() => setEditingRecipeFor(item)}>
                            {t("common.edit")}
                          </Button>
                          {recipe && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteRecipe(recipe.id)}>
                              <Trash2 size={14} className="text-shklet-red" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {tab === "batches" && (
            <div>
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowBatchForm(true)}>
                  <Plus size={16} /> {t("common.addNew")}
                </Button>
              </div>
              {batches.length === 0 ? (
                <EmptyState icon={Factory} title={t("common.noResultsFound")} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {batches.map((batch, i) => (
                    <motion.div key={batch.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                      <Card>
                        <CardContent className="pt-5">
                          <p className="font-bold mb-2">{lang === "ku" ? batch.nameKu : batch.name}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--muted)]">{t("production.totalBatchAmount")}</span>
                              <span className="ltr-nums font-medium">
                                {Number(batch.totalAmount)} {batch.unit}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--muted)]">{t("production.costPerUnit")}</span>
                              <span className="ltr-nums font-bold">{formatMoney(Math.round(Number(batch.costPerUnit)))}</span>
                            </div>
                          </div>
                          <Button size="sm" className="w-full mt-3.5" onClick={() => makeBatch(batch)}>
                            {t("production.makeABatch")}
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "dispatch" && <DispatchTab batches={batches} cities={cities} onDone={load} />}
        </>
      )}

      {editingRecipeFor && (
        <RecipeFormModal
          menuItem={editingRecipeFor}
          recipe={recipes.find((r) => r.menuItemId === editingRecipeFor.id) ?? null}
          warehouseItems={warehouseItems}
          batches={batches}
          onClose={() => setEditingRecipeFor(null)}
          onSaved={() => {
            setEditingRecipeFor(null);
            load();
          }}
        />
      )}

      <BatchFormModal
        open={showBatchForm}
        warehouseItems={warehouseItems}
        onClose={() => setShowBatchForm(false)}
        onSaved={() => {
          setShowBatchForm(false);
          load();
        }}
      />
    </div>
  );
}

function RecipeFormModal({
  menuItem,
  recipe,
  warehouseItems,
  batches,
  onClose,
  onSaved,
}: {
  menuItem: MenuItem;
  recipe: Recipe | null;
  warehouseItems: WarehouseItem[];
  batches: Batch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [lines, setLines] = useState<
    { sourceType: "WAREHOUSE_ITEM" | "BATCH" | "MANUAL"; warehouseItemId: string; batchId: string; manualCost: string; amountPerServing: string }[]
  >(
    recipe?.lines.map((l) => ({
      sourceType: l.sourceType,
      warehouseItemId: l.warehouseItemId ?? "",
      batchId: l.batchId ?? "",
      manualCost: l.manualCost ?? "",
      amountPerServing: l.amountPerServing,
    })) ?? [],
  );
  const [saving, setSaving] = useState(false);

  function addLine() {
    setLines((prev) => [...prev, { sourceType: "WAREHOUSE_ITEM", warehouseItemId: "", batchId: "", manualCost: "", amountPerServing: "" }]);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/production/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menuItemId: menuItem.id,
        lines: lines.map((l) => ({
          sourceType: l.sourceType,
          warehouseItemId: l.sourceType === "WAREHOUSE_ITEM" ? l.warehouseItemId : undefined,
          batchId: l.sourceType === "BATCH" ? l.batchId : undefined,
          manualCost: l.sourceType === "MANUAL" ? Number(l.manualCost) : undefined,
          amountPerServing: Number(l.amountPerServing),
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("production.recipeSaved"));
      onSaved();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("production.recipeFor", { itemName: menuItem.name })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {lines.map((line, i) => (
          <div key={i} className="rounded-xl border border-[var(--card-border)] p-3 space-y-2 bg-black/[0.015] dark:bg-white/[0.02]">
            <Select
              value={line.sourceType}
              onChange={(e) =>
                setLines((prev) => prev.map((l, li) => (li === i ? { ...l, sourceType: e.target.value as typeof l.sourceType } : l)))
              }
            >
              <option value="WAREHOUSE_ITEM">{t("production.fromWarehouseItem")}</option>
              <option value="BATCH">{t("production.fromBatch")}</option>
              <option value="MANUAL">{t("production.manualCost")}</option>
            </Select>
            {line.sourceType === "WAREHOUSE_ITEM" && (
              <Select
                value={line.warehouseItemId}
                onChange={(e) => setLines((prev) => prev.map((l, li) => (li === i ? { ...l, warehouseItemId: e.target.value } : l)))}
              >
                <option value="">—</option>
                {warehouseItems.map((wi) => (
                  <option key={wi.id} value={wi.id}>
                    {wi.name}
                  </option>
                ))}
              </Select>
            )}
            {line.sourceType === "BATCH" && (
              <Select
                value={line.batchId}
                onChange={(e) => setLines((prev) => prev.map((l, li) => (li === i ? { ...l, batchId: e.target.value } : l)))}
              >
                <option value="">—</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
            {line.sourceType === "MANUAL" && (
              <Input
                type="number"
                placeholder={t("production.manualCost")}
                value={line.manualCost}
                onChange={(e) => setLines((prev) => prev.map((l, li) => (li === i ? { ...l, manualCost: e.target.value } : l)))}
              />
            )}
            <Input
              type="number"
              placeholder={t("production.amountPerServing")}
              value={line.amountPerServing}
              onChange={(e) => setLines((prev) => prev.map((l, li) => (li === i ? { ...l, amountPerServing: e.target.value } : l)))}
            />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={addLine}>
          <Plus size={14} /> {t("production.addIngredientLine")}
        </Button>
      </div>
    </Modal>
  );
}

function BatchFormModal({
  open,
  warehouseItems,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouseItems: WarehouseItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [nameKu, setNameKu] = useState("");
  const [unit, setUnit] = useState("litre");
  const [totalAmount, setTotalAmount] = useState("");
  const [ingredients, setIngredients] = useState<{ warehouseItemId: string; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);

  function addIngredient() {
    setIngredients((prev) => [...prev, { warehouseItemId: "", amount: "" }]);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/production/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        nameKu,
        unit,
        totalAmount: Number(totalAmount),
        ingredients: ingredients.map((i) => ({ warehouseItemId: i.warehouseItemId, amount: Number(i.amount) })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("production.batchSaved"));
      onSaved();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("production.batchName")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Name (EN)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input dir="rtl" placeholder="ناو (کوردی)" value={nameKu} onChange={(e) => setNameKu(e.target.value)} />
        </div>
        <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {["litre", "kg", "piece"].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          placeholder={t("production.totalBatchAmount")}
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
        />
        <Label>{t("production.ingredients")}</Label>
        {ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2">
            <Select
              value={ing.warehouseItemId}
              onChange={(e) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, warehouseItemId: e.target.value } : x)))}
            >
              <option value="">—</option>
              {warehouseItems.map((wi) => (
                <option key={wi.id} value={wi.id}>
                  {wi.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              placeholder={t("common.amount")}
              value={ing.amount}
              onChange={(e) => setIngredients((prev) => prev.map((x, xi) => (xi === i ? { ...x, amount: e.target.value } : x)))}
            />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={addIngredient}>
          <Plus size={14} /> {t("common.add")}
        </Button>
      </div>
    </Modal>
  );
}

function DispatchTab({ batches, cities, onDone }: { batches: Batch[]; cities: City[]; onDone: () => void }) {
  const { t } = useLanguage();
  const [batchId, setBatchId] = useState("");
  const [cityId, setCityId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    const res = await fetch("/api/production/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, cityId, quantity: Number(quantity) }),
    });
    setSending(false);
    if (res.ok) {
      toast.success(t("production.dispatchedSuccessfully"));
      setBatchId("");
      setCityId("");
      setQuantity("");
      onDone();
    }
  }

  return (
    <Card className="max-w-md">
      <CardContent className="pt-5 space-y-3">
        <div>
          <Label>{t("production.batch")}</Label>
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">—</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("production.location")}</Label>
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">—</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("production.quantity")}</Label>
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <Button onClick={send} className="w-full" loading={sending}>
          <Send size={15} /> {t("production.send")}
        </Button>
      </CardContent>
    </Card>
  );
}
