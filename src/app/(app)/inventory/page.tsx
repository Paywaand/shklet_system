"use client";

import { Fragment, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  History,
  Tags,
  Save,
} from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { num, iqd, qty, shortDate, shortTime } from "@/lib/format";
import { computeCostPerUnit } from "@/lib/costing";
import { badgeClass, swatchClass, CATEGORY_COLORS } from "@/lib/categories";
import type { InventoryItem, StockMovement, InventoryCategory, CategoryColor } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const UNITS = ["kg", "g", "litre", "ml", "piece", "box"];

const REASON_KEYS = ["delivery", "daily_usage", "wastage", "correction", "other", "conversion"];
function reasonLabel(t: (key: string) => string, r: string): string {
  return REASON_KEYS.includes(r) ? t(`warehouse.reasons.${r}`) : r;
}

// Whole-or-fractional unit count, e.g. 0.66 units.
function fmtUnits(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Small colored category badge.
function CategoryBadge({ name, color }: { name: string; color: string }) {
  return <span className={`chip ${badgeClass(color)}`}>{name}</span>;
}

const UNCATEGORIZED = "__none__";

export default function InventoryPage() {
  const { user } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";
  const { data, loading, error, reload } = useFetch<{ items: InventoryItem[]; movements: StockMovement[] }>(
    "/api/inventory"
  );
  const catsQ = useFetch<{ categories: InventoryCategory[] }>("/api/inventory-categories");
  const toast = useToast();
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [adjustModal, setAdjustModal] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [moveModal, setMoveModal] = useState<{ open: boolean; movement?: StockMovement }>({ open: false });
  const [manageOpen, setManageOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("all"); // "all" | categoryId | UNCATEGORIZED

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const items = data?.items ?? [];
  const movements = data?.movements ?? [];
  const categories = catsQ.data?.categories ?? [];
  const lowCount = items.filter((i) => i.quantity <= i.minThreshold).length;

  // Counts per tab (computed from the live item list, not the cached category counts).
  const countFor = (catId: string) =>
    catId === "all"
      ? items.length
      : catId === UNCATEGORIZED
        ? items.filter((i) => !i.categoryId).length
        : items.filter((i) => i.categoryId === catId).length;
  const hasUncategorized = items.some((i) => !i.categoryId);

  const filtered =
    activeCat === "all"
      ? items
      : activeCat === UNCATEGORIZED
        ? items.filter((i) => !i.categoryId)
        : items.filter((i) => i.categoryId === activeCat);

  // For the "All" view, group items by category (in category sort order, then Uncategorized last).
  const groups: { id: string; name: string; color: string; items: InventoryItem[] }[] = [];
  if (activeCat === "all") {
    for (const c of categories) {
      const groupItems = items.filter((i) => i.categoryId === c.id);
      if (groupItems.length) groups.push({ id: c.id, name: c.name, color: c.color, items: groupItems });
    }
    const uncategorized = items.filter((i) => !i.categoryId);
    if (uncategorized.length)
      groups.push({ id: UNCATEGORIZED, name: t("warehouse.tabs.uncategorized"), color: "gray", items: uncategorized });
  }

  async function deleteItem(item: InventoryItem) {
    if (!confirm(t("warehouse.confirm.deleteItem", { name: item.name }))) return;
    try {
      await apiSend(`/api/inventory/${item.id}`, "DELETE");
      toast.show(t("warehouse.toast.itemDeleted"));
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  async function deleteMovement(m: StockMovement) {
    if (!confirm(t("warehouse.confirm.deleteMovement"))) return;
    try {
      await apiSend(`/api/stock-movements/${m.id}`, "DELETE");
      toast.show(t("warehouse.toast.movementDeleted"));
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  function rowFor(item: InventoryItem) {
    const low = item.quantity <= item.minThreshold;
    return (
      <tr
        key={item.id}
        className={`border-b border-black/5 dark:border-white/5 ${low ? "bg-red-500/5" : ""}`}
      >
        <td className="p-3 font-bold">
          <div className="flex items-center gap-2 flex-wrap">
            {item.name}
            {item.category && <CategoryBadge name={item.category.name} color={item.category.color} />}
          </div>
        </td>
        <td className="p-3">
          {num(item.quantity)} <span className="opacity-50">{item.unit}</span>
          {item.unitSize ? (
            <div className="text-xs opacity-50">
              ≈ {fmtUnits(item.quantity / item.unitSize)} units · {num(item.unitSize)} {item.unit}/unit
            </div>
          ) : null}
        </td>
        <td className="p-3 opacity-70">
          {num(item.minThreshold)} {item.unit}
        </td>
        {isAdmin && (
          <td className="p-3 opacity-70">
            {item.lastUnitCost != null ? `${iqd(item.lastUnitCost)}/${item.unit}` : "—"}
          </td>
        )}
        <td className="p-3">
          {low ? (
            <span className="chip bg-red-500 text-white">{t("warehouse.table.low")}</span>
          ) : (
            <span className="chip bg-leaf/20 text-leaf">{t("warehouse.table.ok")}</span>
          )}
        </td>
        <td className="p-3">
          <div className="flex gap-1 justify-end">
            <button className="btn-leaf px-3 py-1.5 text-xs" onClick={() => setAdjustModal({ open: true, item })}>
              {t("warehouse.table.adjust")}
            </button>
            <button className="btn-ghost size-8 rounded-lg" onClick={() => setItemModal({ open: true, item })}>
              <Pencil size={14} />
            </button>
            <button className="btn-ghost size-8 rounded-lg text-red-500" onClick={() => deleteItem(item)}>
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <PageHeader
        title={t("warehouse.header.title")}
        subtitle={lowCount > 0 ? t("warehouse.header.lowOnStock", { n: lowCount }) : t("warehouse.header.allStockHealthy")}
        action={
          <div className="flex gap-2">
            <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setManageOpen(true)}>
              <Tags size={18} /> {t("warehouse.header.manageCategories")}
            </button>
            <button className="btn-primary px-3 py-2 text-sm" onClick={() => setItemModal({ open: true })}>
              <Plus size={18} /> {t("warehouse.header.newItem")}
            </button>
          </div>
        }
      />

      {lowCount > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-2 border-red-500/30 bg-red-500/5">
          <AlertTriangle className="text-red-500 shrink-0" size={20} />
          <p className="text-sm font-semibold">{t("warehouse.banner.belowThreshold", { n: lowCount })}</p>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <CatTab label={t("common.all")} count={countFor("all")} active={activeCat === "all"} onClick={() => setActiveCat("all")} />
        {categories.map((c) => (
          <CatTab
            key={c.id}
            label={c.name}
            color={c.color}
            count={countFor(c.id)}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
          />
        ))}
        {hasUncategorized && (
          <CatTab
            label={t("warehouse.tabs.uncategorized")}
            count={countFor(UNCATEGORIZED)}
            active={activeCat === UNCATEGORIZED}
            onClick={() => setActiveCat(UNCATEGORIZED)}
          />
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title={t("warehouse.empty.noItemsTitle")} hint={t("warehouse.empty.noItemsHint")} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("warehouse.empty.noItemsInCategoryTitle")} hint={t("warehouse.empty.noItemsInCategoryHint")} />
      ) : (
        <div className="card overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                <th className="p-3">{t("warehouse.table.item")}</th>
                <th className="p-3">{t("warehouse.table.inStock")}</th>
                <th className="p-3">{t("warehouse.table.min")}</th>
                {isAdmin && <th className="p-3">{t("warehouse.table.unitCost")}</th>}
                <th className="p-3">{t("warehouse.table.status")}</th>
                <th className="p-3 text-right">{t("warehouse.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {activeCat === "all"
                ? groups.map((g) => (
                    <Fragment key={g.id}>
                      <tr className="bg-black/[0.03] dark:bg-white/[0.04]">
                        <td colSpan={isAdmin ? 6 : 5} className="px-3 py-2">
                          <CategoryBadge name={g.name} color={g.color} />
                          <span className="ml-2 text-xs opacity-50">{g.items.length}</span>
                        </td>
                      </tr>
                      {g.items.map(rowFor)}
                    </Fragment>
                  ))
                : filtered.map(rowFor)}
            </tbody>
          </table>
        </div>
      )}

      {/* Movement log */}
      <section className="card p-4">
        <h2 className="font-extrabold text-lg flex items-center gap-2 mb-3">
          <History size={20} className="text-leaf" /> {t("warehouse.movements.title")}
        </h2>
        {movements.length === 0 ? (
          <EmptyState title={t("warehouse.empty.noMovements")} />
        ) : (
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                    m.change > 0 ? "bg-leaf/20 text-leaf" : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {m.change > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate flex items-center gap-1.5">
                    <span className="truncate">
                      {m.change > 0 ? "+" : ""}
                      {num(m.change)} {m.item?.unit} · {m.item?.name}
                    </span>
                    {m.editedAt && (
                      <span className="chip bg-corn/30 text-cocoa text-[10px] py-0 px-1.5 shrink-0">
                        {t("warehouse.movements.edited")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs opacity-60 truncate">
                    {reasonLabel(t, m.reason)}
                    {m.note ? ` — ${m.note}` : ""} · {m.staff?.fullName ?? "—"}
                  </p>
                </div>
                <div className="text-xs text-right shrink-0">
                  {m.totalCost != null && (
                    <p className={`font-bold ${m.change > 0 ? "text-leaf" : "text-red-500"}`}>
                      {m.change > 0
                        ? t("warehouse.movements.cost", { amount: iqd(m.totalCost) })
                        : t("warehouse.movements.usage", { amount: iqd(Math.abs(m.totalCost)) })}
                    </p>
                  )}
                  {m.unitCost != null && (
                    <p className="opacity-50">
                      {iqd(Math.round(m.unitCost))}/{m.item?.unit}
                    </p>
                  )}
                  <p className="opacity-50">
                    {shortDate(m.createdAt)} {shortTime(m.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    className="btn-ghost size-8 rounded-lg"
                    title={t("warehouse.movements.editMovement")}
                    onClick={() => setMoveModal({ open: true, movement: m })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-ghost size-8 rounded-lg text-red-500"
                    title={t("warehouse.movements.deleteMovement")}
                    onClick={() => deleteMovement(m)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {itemModal.open && (
        <ItemModal
          item={itemModal.item}
          categories={categories}
          onClose={() => setItemModal({ open: false })}
          onSaved={() => {
            setItemModal({ open: false });
            reload();
            catsQ.reload();
          }}
        />
      )}
      {adjustModal.open && adjustModal.item && (
        <AdjustModal
          item={adjustModal.item}
          onClose={() => setAdjustModal({ open: false })}
          onSaved={() => {
            setAdjustModal({ open: false });
            reload();
          }}
        />
      )}
      {moveModal.open && moveModal.movement && (
        <MovementModal
          movement={moveModal.movement}
          onClose={() => setMoveModal({ open: false })}
          onSaved={() => {
            setMoveModal({ open: false });
            reload();
          }}
        />
      )}
      {manageOpen && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            catsQ.reload();
            reload();
          }}
        />
      )}
    </>
  );
}

function CatTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`btn px-3 py-1.5 text-sm ${active ? "bg-corn text-white" : "bg-black/5 dark:bg-white/10"}`}
    >
      {color && <span className={`size-2.5 rounded-full ${swatchClass(color as CategoryColor)}`} />}
      {label}
      <span className={`chip ${active ? "bg-cocoa/15 text-cocoa" : "bg-black/10 dark:bg-white/15"}`}>{count}</span>
    </button>
  );
}

function ItemModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item?: InventoryItem;
  categories: InventoryCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? "0");
  const [minThreshold, setMinThreshold] = useState(item?.minThreshold?.toString() ?? "0");
  const [unitSize, setUnitSize] = useState(item?.unitSize?.toString() ?? "");
  const [unitsPerContainer, setUnitsPerContainer] = useState(item?.unitsPerContainer?.toString() ?? "");
  const [contentPerUnit, setContentPerUnit] = useState(item?.contentPerUnit?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLanguage();

  const hasContainer = Number(unitSize) > 0;
  // Live cost-per-smallest-unit preview from what's typed in the form.
  const costPreview = computeCostPerUnit({
    lastUnitCost: item?.lastUnitCost ?? null,
    unitsPerContainer: Number(unitsPerContainer) || null,
    contentPerUnit: Number(contentPerUnit) || null,
  });
  const totalContent =
    Number(unitsPerContainer) > 0 && Number(contentPerUnit) > 0
      ? Number(unitsPerContainer) * Number(contentPerUnit)
      : null;

  async function save() {
    setSaving(true);
    try {
      const sizePayload = {
        unitSize: Number(unitSize) > 0 ? Number(unitSize) : 0,
        unitsPerContainer: hasContainer && Number(unitsPerContainer) > 0 ? Number(unitsPerContainer) : 0,
        contentPerUnit: hasContainer && Number(contentPerUnit) > 0 ? Number(contentPerUnit) : 0,
      };
      const catPayload = { categoryId: categoryId || null };
      if (item)
        await apiSend(`/api/inventory/${item.id}`, "PATCH", {
          name,
          unit,
          minThreshold,
          ...sizePayload,
          ...catPayload,
        });
      else
        await apiSend("/api/inventory", "POST", {
          name,
          unit,
          quantity,
          minThreshold,
          ...sizePayload,
          ...catPayload,
        });
      toast.show(t("warehouse.toast.saved"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? t("warehouse.itemModal.editItem") : t("warehouse.itemModal.newItem")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">{t("common.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("common.category")}</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("warehouse.tabs.uncategorized")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("warehouse.itemModal.unit")}</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          {!item && (
            <div>
              <label className="label">{t("warehouse.itemModal.startingQty")}</label>
              <input
                className="input"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}
          <div className={item ? "col-span-2" : ""}>
            <label className="label">{t("warehouse.itemModal.minThreshold")}</label>
            <input
              className="input"
              type="number"
              value={minThreshold}
              onChange={(e) => setMinThreshold(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="label">{t("warehouse.itemModal.amountPerUnit")}</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder={t("warehouse.itemModal.amountPerUnitPlaceholder", { unit })}
              value={unitSize}
              onChange={(e) => setUnitSize(e.target.value)}
            />
            <p className="text-xs opacity-60 mt-1">{t("warehouse.itemModal.amountPerUnitHint", { unit })}</p>
          </div>

          {hasContainer && (
            <>
              <div>
                <label className="label">{t("warehouse.itemModal.unitsPerContainer")}</label>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  placeholder={t("warehouse.itemModal.unitsPerContainerPlaceholder")}
                  value={unitsPerContainer}
                  onChange={(e) => setUnitsPerContainer(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t("warehouse.itemModal.contentPerUnit")}</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    placeholder={t("warehouse.itemModal.contentPerUnitPlaceholder")}
                    value={contentPerUnit}
                    onChange={(e) => setContentPerUnit(e.target.value)}
                  />
                  <span className="text-sm opacity-50 shrink-0">{unit}/unit</span>
                </div>
              </div>
              <div className="col-span-2 -mt-1">
                {totalContent != null ? (
                  <p className="text-xs text-leaf font-semibold">
                    {num(Number(unitsPerContainer))} × {num(Number(contentPerUnit))} {unit} ={" "}
                    {num(totalContent)} {unit}/container
                    {costPreview != null ? ` → ${qty(costPreview)} IQD/${unit}` : ""}
                  </p>
                ) : (
                  <p className="text-xs opacity-60">{t("warehouse.itemModal.deriveHint", { unit })}</p>
                )}
              </div>
            </>
          )}
        </div>
        {item && <p className="text-xs opacity-60">{t("warehouse.itemModal.useAdjustHint")}</p>}
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !name.trim()}>
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

function ManageCategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: InventoryCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { t } = useLanguage();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<CategoryColor>("gray");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.show(ok);
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  function addCategory() {
    if (!newName.trim()) return;
    run(async () => {
      await apiSend("/api/inventory-categories", "POST", { name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor("gray");
    }, t("warehouse.toast.categoryAdded"));
  }

  function deleteCategory(c: InventoryCategory) {
    const n = c.itemCount ?? 0;
    const msg =
      n > 0
        ? t("warehouse.confirm.deleteCategoryWithItems", { name: c.name, n })
        : t("warehouse.confirm.deleteCategoryEmpty", { name: c.name });
    if (!confirm(msg)) return;
    run(() => apiSend(`/api/inventory-categories/${c.id}`, "DELETE"), t("warehouse.toast.categoryDeleted"));
  }

  return (
    <Modal open onClose={onClose} title={t("warehouse.manageCategoriesModal.title")} wide>
      <div className="flex flex-col gap-2">
        {categories.length === 0 && (
          <p className="text-sm opacity-60">{t("warehouse.manageCategoriesModal.empty")}</p>
        )}
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} busy={busy} onSave={run} onDelete={() => deleteCategory(c)} />
        ))}
      </div>

      <div className="border-t border-black/5 dark:border-white/5 mt-4 pt-4">
        <label className="label">{t("warehouse.manageCategoriesModal.addCategory")}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1 min-w-[160px]"
            placeholder={t("warehouse.manageCategoriesModal.addCategoryPlaceholder")}
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button className="btn-primary px-3 py-2.5" onClick={addCategory} disabled={busy || !newName.trim()}>
            <Plus size={16} /> {t("common.add")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CategoryRow({
  category,
  busy,
  onSave,
  onDelete,
}: {
  category: InventoryCategory;
  busy: boolean;
  onSave: (fn: () => Promise<unknown>, ok: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<CategoryColor>(category.color);
  const dirty = name.trim() !== category.name || color !== category.color;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-2">
      <input
        className="input flex-1 min-w-[140px] py-2"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
      />
      <ColorPicker value={color} onChange={setColor} />
      <span className="text-xs opacity-50 w-16 text-center">
        {t("warehouse.manageCategoriesModal.itemCount", { n: category.itemCount ?? 0 })}
      </span>
      <button
        className="btn-leaf px-3 py-2 text-sm"
        disabled={busy || !dirty || !name.trim()}
        onClick={() =>
          onSave(
            () => apiSend(`/api/inventory-categories/${category.id}`, "PATCH", { name: name.trim(), color }),
            t("warehouse.toast.categoryUpdated")
          )
        }
      >
        <Save size={14} /> {t("common.save")}
      </button>
      <button className="btn-ghost size-9 rounded-lg text-red-500" disabled={busy} onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: CategoryColor; onChange: (c: CategoryColor) => void }) {
  return (
    <div className="flex items-center gap-1">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full ${swatchClass(c)} ${
            value === c ? "ring-2 ring-offset-1 ring-corn ring-offset-[var(--surface)]" : "opacity-60"
          }`}
        />
      ))}
    </div>
  );
}

function AdjustModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [byUnits, setByUnits] = useState(!!item.unitSize); // containers default to entry-by-units
  const [reason, setReason] = useState("delivery");
  const [note, setNote] = useState("");
  const [totalCost, setTotalCost] = useState(""); // delivery batch cost
  const [destination, setDestination] = useState(""); // "" = main 60 Street Branch
  const [saving, setSaving] = useState(false);
  const events = useFetch<{ events: { id: string; name: string }[] }>("/api/events/active");
  const toast = useToast();
  const { user } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";

  const entered = Number(amount);
  const canByUnits = !!item.unitSize;
  // The base amount applied to stock, always in the item's own unit.
  const baseAmt = canByUnits && byUnits ? entered * (item.unitSize ?? 1) : entered;
  // Live cost previews (per the item's base unit).
  const unitCostPreview =
    direction === "add" && baseAmt > 0 && Number(totalCost) > 0 ? Number(totalCost) / baseAmt : null;
  const usageCostPreview =
    direction === "remove" && baseAmt > 0 && item.lastUnitCost != null ? item.lastUnitCost * baseAmt : null;

  async function save() {
    if (!entered || entered <= 0) return toast.show(t("warehouse.toast.enterAmount"), "error");
    if (reason === "other" && !note.trim()) return toast.show(t("warehouse.toast.describeReason"), "error");
    setSaving(true);
    try {
      await apiSend(`/api/inventory/${item.id}/movement`, "POST", {
        change: direction === "add" ? baseAmt : -baseAmt,
        reason,
        note,
        totalCost: direction === "add" && Number(totalCost) > 0 ? Number(totalCost) : undefined,
        eventId: direction === "remove" ? destination || null : null,
      });
      toast.show(t("warehouse.toast.stockUpdated"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("warehouse.adjustModal.titlePrefix", { itemName: item.name })}>
      <p className="text-sm opacity-60 mb-3">
        {t("warehouse.adjustModal.currently")} {num(item.quantity)} {item.unit} {t("warehouse.adjustModal.inStock")}
        {item.unitSize
          ? ` ${t("warehouse.adjustModal.approxUnitsOf", {
              units: fmtUnits(item.quantity / item.unitSize),
              unitSize: num(item.unitSize),
              unit: item.unit,
            })}`
          : ""}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          className={`btn py-2.5 ${direction === "add" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"}`}
          onClick={() => {
            setDirection("add");
            setReason("delivery");
          }}
        >
          <ArrowUp size={18} /> {t("common.add")}
        </button>
        <button
          className={`btn py-2.5 ${direction === "remove" ? "bg-red-500 text-white" : "bg-black/5 dark:bg-white/10"}`}
          onClick={() => {
            setDirection("remove");
            setReason("daily_usage");
          }}
        >
          <ArrowDown size={18} /> {t("warehouse.adjustModal.remove")}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="label mb-0">
              {t("warehouse.adjustModal.amountLabel", { unit: byUnits && canByUnits ? t("warehouse.adjustModal.unitsLower") : item.unit })}
            </label>
            {canByUnits && (
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setByUnits(true)}
                  className={`px-2 py-1 rounded-lg font-bold ${byUnits ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"}`}
                >
                  {t("warehouse.adjustModal.unitsToggle")}
                </button>
                <button
                  type="button"
                  onClick={() => setByUnits(false)}
                  className={`px-2 py-1 rounded-lg font-bold ${!byUnits ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"}`}
                >
                  {item.unit}
                </button>
              </div>
            )}
          </div>
          <input
            className="input mt-1.5"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          {canByUnits && byUnits && entered > 0 && (
            <p className="text-xs opacity-60 mt-1">
              {t("warehouse.adjustModal.convertedAmount", { amount: num(baseAmt), unit: item.unit })}
            </p>
          )}
        </div>

        {direction === "add" && (
          <div>
            <label className="label">{t("warehouse.adjustModal.totalCostLabel")}</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder={t("warehouse.adjustModal.wholeBatchCostPlaceholder")}
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
            />
            {isAdmin && unitCostPreview != null && (
              <p className="text-xs text-leaf font-semibold mt-1">
                {t("warehouse.adjustModal.unitCostPreview", { value: iqd(Math.round(unitCostPreview)), unit: item.unit })}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="label">{t("common.reason")}</label>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {direction === "add" ? (
              <>
                <option value="delivery">{t("warehouse.reasons.delivery")}</option>
                <option value="correction">{t("warehouse.reasons.correction")}</option>
              </>
            ) : (
              <>
                <option value="daily_usage">{t("warehouse.reasons.daily_usage")}</option>
                <option value="wastage">{t("warehouse.reasons.wastage")}</option>
                <option value="correction">{t("warehouse.reasons.correction")}</option>
                <option value="other">{t("warehouse.reasons.other")}</option>
              </>
            )}
          </select>
        </div>

        {direction === "remove" && (
          <div>
            <label className="label">{t("warehouse.adjustModal.destinationLabel")}</label>
            <select className="input" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">{t("common.mainBranch")}</option>
              {(events.data?.events ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  📍 {ev.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {direction === "remove" && usageCostPreview != null && (
          <p className="text-xs text-red-500 font-semibold -mt-1">
            {t("warehouse.adjustModal.usageCostPreview", {
              value: iqd(Math.round(usageCostPreview)),
              lastPrice: iqd(Math.round(item.lastUnitCost!)),
              unit: item.unit,
            })}
          </p>
        )}

        <div>
          <label className="label">
            {t("common.note")} {reason === "other" ? t("warehouse.adjustModal.noteRequired") : t("warehouse.adjustModal.noteOptional")}
          </label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving}>
          {t("warehouse.adjustModal.saveAdjustment")}
        </button>
      </div>
    </Modal>
  );
}

// Edit an existing stock movement: quantity, reason, note, date. The quantity is
// entered as a positive magnitude — the original direction (added vs removed) is
// preserved. Changing it recalculates cost server-side and re-adjusts current stock.
function MovementModal({
  movement,
  onClose,
  onSaved,
}: {
  movement: StockMovement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isAddition = movement.change > 0;
  const unit = movement.item?.unit ?? "";
  const [amount, setAmount] = useState(Math.abs(movement.change).toString());
  const [reason, setReason] = useState(movement.reason);
  const [note, setNote] = useState(movement.note ?? "");
  const [date, setDate] = useState(movement.createdAt.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLanguage();

  async function save() {
    const magnitude = Number(amount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) return toast.show(t("warehouse.toast.enterAmount"), "error");
    if (reason === "other" && !note.trim()) return toast.show(t("warehouse.toast.describeReason"), "error");
    setSaving(true);
    try {
      await apiSend(`/api/stock-movements/${movement.id}`, "PATCH", {
        change: magnitude, // sign is preserved server-side
        reason,
        note,
        date,
      });
      toast.show(t("warehouse.toast.movementUpdated"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("warehouse.movementModal.titlePrefix", { itemName: movement.item?.name ?? "" })}>
      <p className="text-sm opacity-60 mb-3">
        {isAddition ? t("warehouse.movementModal.addedHint") : t("warehouse.movementModal.removedHint")}
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">{t("warehouse.movementModal.quantityLabel", { unit })}</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">{t("common.reason")}</label>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {isAddition ? (
              <>
                <option value="delivery">{t("warehouse.reasons.delivery")}</option>
                <option value="correction">{t("warehouse.reasons.correction")}</option>
              </>
            ) : (
              <>
                <option value="daily_usage">{t("warehouse.reasons.daily_usage")}</option>
                <option value="wastage">{t("warehouse.reasons.wastage")}</option>
                <option value="correction">{t("warehouse.reasons.correction")}</option>
                <option value="other">{t("warehouse.reasons.other")}</option>
              </>
            )}
          </select>
        </div>
        <div>
          <label className="label">{t("common.date")}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">
            {t("common.note")} {reason === "other" ? t("warehouse.adjustModal.noteRequired") : t("warehouse.adjustModal.noteOptional")}
          </label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving}>
          {t("warehouse.movementModal.saveChanges")}
        </button>
      </div>
    </Modal>
  );
}
