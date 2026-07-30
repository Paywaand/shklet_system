"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Eye, EyeOff, UtensilsCrossed, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

interface City {
  id: string;
  name: string;
  nameKu: string;
}

interface CityPrice {
  id: string;
  cityId: string;
  price: number;
  available: boolean;
  city: City;
}

interface ModifierOption {
  id: string;
  name: string;
  nameKu: string;
  extraPrice: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  nameKu: string;
  required: boolean;
  options: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  nameKu: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  cityPrices: CityPrice[];
  modifierGroups: ModifierGroup[];
}

interface Category {
  id: string;
  name: string;
  nameKu: string;
  items: MenuItem[];
}

const CATEGORY_ACCENTS = ["#EF3340", "#249E6B", "#FEDB00", "#AA8066", "#CBA3D8"];

export default function MenuManagementPage() {
  const { t, lang } = useLanguage();
  const { user } = useCurrentUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryNameKu, setNewCategoryNameKu] = useState("");

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    const [menuRes, citiesRes] = await Promise.all([
      fetch("/api/menu/categories"),
      fetch("/api/cities"),
    ]);
    const menuData = await menuRes.json();
    const citiesData = await citiesRes.json();
    setCategories(menuData.categories ?? []);
    setCities((citiesData.cities ?? []).map((c: City) => ({ id: c.id, name: c.name, nameKu: c.nameKu })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCategory() {
    if (!newCategoryName.trim() || !newCategoryNameKu.trim()) return;
    const res = await fetch("/api/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName, nameKu: newCategoryNameKu }),
    });
    if (res.ok) {
      toast.success(t("menu.categorySaved"));
      setNewCategoryName("");
      setNewCategoryNameKu("");
      setNewCategoryOpen(false);
      load();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm(t("menu.confirmDeleteCategory"))) return;
    const res = await fetch(`/api/menu/categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("common.success"));
      load();
    }
  }

  async function deleteItem(id: string) {
    if (!confirm(t("menu.confirmDeleteItem"))) return;
    const res = await fetch(`/api/menu/items/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("menu.itemDeleted"));
      load();
    }
  }

  async function toggleAvailability(item: MenuItem, cityId: string, current: boolean) {
    const res = await fetch(`/api/menu/items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId, available: !current }),
    });
    if (res.ok) load();
  }

  return (
    <div>
      <PageHeader
        title={t("menu.header")}
        actions={
          isAdmin && (
            <Button variant="outline" onClick={() => setNewCategoryOpen(true)}>
              <Plus size={16} /> {t("menu.addCategory")}
            </Button>
          )
        }
      />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : categories.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title={t("common.noResultsFound")} />
      ) : (
        <div className="space-y-6">
          {categories.map((cat, ci) => (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: ci * 0.03 }}>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_ACCENTS[ci % CATEGORY_ACCENTS.length] }}
                      />
                      <h2 className="text-[17px] font-bold tracking-[-0.01em]">{lang === "ku" ? cat.nameKu : cat.name}</h2>
                      <span className="text-xs font-semibold text-[var(--muted)] bg-black/[0.04] dark:bg-white/[0.06] rounded-full px-2 py-0.5">
                        {t("menu.itemsCount", { n: cat.items.length })}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingCategoryId(cat.id);
                            setEditingItem(null);
                            setShowItemForm(true);
                          }}
                        >
                          <Plus size={14} /> {t("menu.addItem")}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteCategory(cat.id)}>
                          <Trash2 size={14} className="text-shklet-red" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cat.items.map((item) => (
                      <div
                        key={item.id}
                        className="group rounded-xl border border-[var(--card-border)] p-3.5 hover:border-shklet-red/30 hover:shadow-elevation-1 transition-all duration-150"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold truncate">{lang === "ku" ? item.nameKu : item.name}</p>
                            <p className="text-xs text-[var(--muted)] truncate">
                              {lang === "ku" ? item.name : item.nameKu}
                            </p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditingCategoryId(cat.id);
                                  setShowItemForm(true);
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-shklet-red/10"
                              >
                                <Trash2 size={13} className="text-shklet-red" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 space-y-1.5">
                          {cities.map((city) => {
                            const cp = item.cityPrices.find((p) => p.cityId === city.id);
                            if (!cp) return null;
                            return (
                              <div key={city.id} className="flex items-center justify-between text-sm">
                                <span className="text-[var(--muted)] text-[13px]">
                                  {lang === "ku" ? city.nameKu : city.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "ltr-nums font-bold text-[13px]",
                                      !cp.available && "text-[var(--muted-soft)] line-through",
                                    )}
                                  >
                                    {formatMoney(cp.price)}
                                  </span>
                                  {isAdmin && (
                                    <button
                                      onClick={() => toggleAvailability(item, city.id, cp.available)}
                                      title={cp.available ? t("menu.available") : t("menu.hiddenFromCashier")}
                                      className="h-5 w-5 flex items-center justify-center"
                                    >
                                      {cp.available ? (
                                        <Eye size={13} className="text-shklet-green" />
                                      ) : (
                                        <EyeOff size={13} className="text-[var(--muted-soft)]" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {item.modifierGroups.length > 0 && (
                          <p className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)]">
                            <Sparkles size={11} /> {item.modifierGroups.length} {t("menu.modifiers").toLowerCase()}
                          </p>
                        )}
                      </div>
                    ))}
                    {cat.items.length === 0 && (
                      <p className="text-sm text-[var(--muted)] col-span-full py-6 text-center">
                        {t("common.noResultsFound")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={newCategoryOpen}
        onClose={() => setNewCategoryOpen(false)}
        title={t("menu.addCategory")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewCategoryOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={createCategory}>{t("common.save")}</Button>
          </>
        }
      >
        <div className="space-y-3 pb-2">
          <div>
            <Label>Name (English)</Label>
            <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          </div>
          <div>
            <Label>ناو (کوردی)</Label>
            <Input dir="rtl" value={newCategoryNameKu} onChange={(e) => setNewCategoryNameKu(e.target.value)} />
          </div>
        </div>
      </Modal>

      {showItemForm && editingCategoryId && (
        <ItemFormModal
          categoryId={editingCategoryId}
          item={editingItem}
          cities={cities}
          onClose={() => setShowItemForm(false)}
          onSaved={() => {
            setShowItemForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ItemFormModal({
  categoryId,
  item,
  cities,
  onClose,
  onSaved,
}: {
  categoryId: string;
  item: MenuItem | null;
  cities: City[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(item?.name ?? "");
  const [nameKu, setNameKu] = useState(item?.nameKu ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [prices, setPrices] = useState<Record<string, { price: string; available: boolean }>>(
    () => {
      const init: Record<string, { price: string; available: boolean }> = {};
      for (const city of cities) {
        const existing = item?.cityPrices.find((p) => p.cityId === city.id);
        init[city.id] = {
          price: existing ? String(existing.price) : "",
          available: existing?.available ?? true,
        };
      }
      return init;
    },
  );
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(
    item?.modifierGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) })) ?? [],
  );
  const [saving, setSaving] = useState(false);

  function addModifierGroup() {
    setModifierGroups((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        name: "",
        nameKu: "",
        required: false,
        options: [],
      },
    ]);
  }

  function addOption(groupIdx: number) {
    setModifierGroups((prev) =>
      prev.map((g, i) =>
        i === groupIdx
          ? {
              ...g,
              options: [
                ...g.options,
                { id: `tmp-${Date.now()}`, name: "", nameKu: "", extraPrice: 0 },
              ],
            }
          : g,
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    const cityPrices = cities
      .map((city) => ({
        cityId: city.id,
        price: Number(prices[city.id]?.price || 0),
        available: prices[city.id]?.available ?? true,
      }))
      .filter((cp) => cp.price > 0);

    const payload = {
      categoryId,
      name,
      nameKu,
      description: description || undefined,
      basePrice: cityPrices[0]?.price ?? 0,
      cityPrices,
      modifierGroups: modifierGroups.map((g) => ({
        name: g.name,
        nameKu: g.nameKu,
        required: g.required,
        options: g.options.map((o) => ({
          name: o.name,
          nameKu: o.nameKu,
          extraPrice: o.extraPrice,
        })),
      })),
    };

    const res = item
      ? await fetch(`/api/menu/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/menu/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (res.ok) {
      toast.success(t("menu.itemSaved"));
      onSaved();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? t("common.edit") : t("menu.addItem")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("menu.itemName")} (EN)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("menu.itemName")} (KU)</Label>
            <Input dir="rtl" value={nameKu} onChange={(e) => setNameKu(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("menu.descriptionOptional")}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <Label>{t("menu.perCityPricing")}</Label>
          <div className="space-y-2">
            {cities.map((city) => (
              <div key={city.id} className="flex items-center gap-2">
                <span className="w-28 text-sm text-[var(--muted)] shrink-0 font-medium">{city.name}</span>
                <Input
                  type="number"
                  placeholder={t("menu.price")}
                  value={prices[city.id]?.price ?? ""}
                  onChange={(e) =>
                    setPrices((prev) => ({
                      ...prev,
                      [city.id]: { ...prev[city.id], price: e.target.value },
                    }))
                  }
                />
                <label className="flex items-center gap-1.5 text-xs shrink-0 font-medium text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={prices[city.id]?.available ?? true}
                    onChange={(e) =>
                      setPrices((prev) => ({
                        ...prev,
                        [city.id]: { ...prev[city.id], available: e.target.checked },
                      }))
                    }
                  />
                  {t("menu.available")}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="mb-0">{t("menu.modifiers")}</Label>
            <Button size="sm" variant="ghost" onClick={addModifierGroup}>
              <Plus size={14} /> {t("menu.addOptionGroup")}
            </Button>
          </div>
          <div className="space-y-3">
            {modifierGroups.map((g, gi) => (
              <div key={g.id} className="rounded-xl border border-[var(--card-border)] p-3 bg-black/[0.015] dark:bg-white/[0.02]">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("menu.optionGroupNamePlaceholder")}
                    value={g.name}
                    onChange={(e) =>
                      setModifierGroups((prev) =>
                        prev.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    dir="rtl"
                    placeholder="ناوی کوردی"
                    value={g.nameKu}
                    onChange={(e) =>
                      setModifierGroups((prev) =>
                        prev.map((x, i) => (i === gi ? { ...x, nameKu: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] mt-2.5">
                  <input
                    type="checkbox"
                    checked={g.required}
                    onChange={(e) =>
                      setModifierGroups((prev) =>
                        prev.map((x, i) => (i === gi ? { ...x, required: e.target.checked } : x)),
                      )
                    }
                  />
                  {t("menu.required")}
                </label>

                <div className="mt-2.5 space-y-1.5">
                  {g.options.map((o, oi) => (
                    <div key={o.id} className="flex gap-1.5 items-center">
                      <Input
                        className="text-xs h-8"
                        placeholder={t("menu.optionName")}
                        value={o.name}
                        onChange={(e) =>
                          setModifierGroups((prev) =>
                            prev.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    options: x.options.map((y, oi2) =>
                                      oi2 === oi ? { ...y, name: e.target.value } : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <Input
                        className="text-xs h-8 w-24"
                        type="number"
                        placeholder={t("menu.extraPriceOptional")}
                        value={o.extraPrice}
                        onChange={(e) =>
                          setModifierGroups((prev) =>
                            prev.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    options: x.options.map((y, oi2) =>
                                      oi2 === oi
                                        ? { ...y, extraPrice: Number(e.target.value) }
                                        : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => addOption(gi)}>
                    <Plus size={12} /> {t("menu.addOption")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
