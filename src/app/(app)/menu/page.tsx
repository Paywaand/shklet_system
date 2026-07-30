"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, FolderPlus, EyeOff, SlidersHorizontal } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd } from "@/lib/format";
import type { Category, MenuItem, ModifierGroup } from "@/lib/types";
import { ModifiersSchema, safeParseJson } from "@/lib/schemas";

function parseModifiers(json: string | null | undefined): ModifierGroup[] {
  // Bounded + schema-validated parse (size cap before JSON.parse) — see lib/schemas.ts.
  return safeParseJson(json, ModifiersSchema, []);
}
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function MenuPage() {
  const { data, loading, error, reload } = useFetch<{ categories: Category[] }>("/api/menu?all=1");
  const toast = useToast();
  const { t } = useLanguage();

  const [catModal, setCatModal] = useState<{ open: boolean; cat?: Category }>({ open: false });
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: MenuItem; categoryId?: string }>(
    { open: false }
  );

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const categories = data?.categories ?? [];

  async function deleteCategory(cat: Category) {
    if (!confirm(t("menu.confirm.deleteCategory", { name: cat.name }))) return;
    try {
      await apiSend(`/api/menu/categories/${cat.id}`, "DELETE");
      toast.show(t("menu.toast.categoryDeleted"));
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(t("menu.confirm.deleteItem", { name: item.name }))) return;
    try {
      await apiSend(`/api/menu/items/${item.id}`, "DELETE");
      toast.show(t("menu.toast.itemDeleted"));
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  async function toggleAvailable(item: MenuItem) {
    try {
      await apiSend(`/api/menu/items/${item.id}`, "PATCH", { available: !item.available });
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  return (
    <>
      <PageHeader
        title={t("menu.header.title")}
        subtitle={t("menu.header.subtitle")}
        action={
          <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setCatModal({ open: true })}>
            <FolderPlus size={18} /> {t("menu.header.newCategory")}
          </button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState title={t("menu.empty.title")} hint={t("menu.empty.hint")} />
      ) : (
        <div className="flex flex-col gap-5">
          {categories.map((cat) => (
            <section key={cat.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold">{cat.name}</h2>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost size-9 rounded-lg"
                    onClick={() => setCatModal({ open: true, cat })}
                    title={t("menu.category.rename")}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn-ghost size-9 rounded-lg text-red-500"
                    onClick={() => deleteCategory(cat)}
                    title={t("common.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border border-black/5 dark:border-white/5 p-3 flex items-start justify-between gap-2 ${
                      item.available ? "" : "opacity-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate flex items-center gap-1.5">
                        {item.name}
                        {!item.available && <EyeOff size={14} className="opacity-60" />}
                      </p>
                      {item.nameKu && (
                        <p className="text-xs opacity-60 truncate" dir="rtl">
                          {item.nameKu}
                        </p>
                      )}
                      <p className="text-sm text-leaf font-bold">{iqd(item.price)}</p>
                      {item.description && (
                        <p className="text-xs opacity-60 truncate">{item.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        className="btn-ghost size-8 rounded-lg"
                        onClick={() => setItemModal({ open: true, item, categoryId: cat.id })}
                        title={t("common.edit")}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-ghost size-8 rounded-lg"
                        onClick={() => toggleAvailable(item)}
                        title={item.available ? t("menu.item.hideFromPos") : t("menu.item.showOnPos")}
                      >
                        <EyeOff size={14} />
                      </button>
                      <button
                        className="btn-ghost size-8 rounded-lg text-red-500"
                        onClick={() => deleteItem(item)}
                        title={t("common.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  className="rounded-xl border-2 border-dashed border-black/10 dark:border-white/10 p-3 flex items-center justify-center gap-2 font-bold opacity-70 hover:opacity-100 hover:border-leaf min-h-[72px]"
                  onClick={() => setItemModal({ open: true, categoryId: cat.id })}
                >
                  <Plus size={18} /> {t("menu.item.addItem")}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {catModal.open && (
        <CategoryModal
          cat={catModal.cat}
          onClose={() => setCatModal({ open: false })}
          onSaved={() => {
            setCatModal({ open: false });
            reload();
          }}
        />
      )}

      {itemModal.open && (
        <ItemModal
          item={itemModal.item}
          categoryId={itemModal.categoryId!}
          categories={categories}
          onClose={() => setItemModal({ open: false })}
          onSaved={() => {
            setItemModal({ open: false });
            reload();
          }}
        />
      )}
    </>
  );
}

function CategoryModal({
  cat,
  onClose,
  onSaved,
}: {
  cat?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cat?.name ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLanguage();

  async function save() {
    setSaving(true);
    try {
      if (cat) await apiSend(`/api/menu/categories/${cat.id}`, "PATCH", { name });
      else await apiSend("/api/menu/categories", "POST", { name });
      toast.show(t("menu.toast.categorySaved"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={cat ? t("menu.categoryModal.rename") : t("menu.categoryModal.new")}>
      <label className="label">{t("common.name")}</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

function ItemModal({
  item,
  categoryId,
  categories,
  onClose,
  onSaved,
}: {
  item?: MenuItem;
  categoryId: string;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [nameKu, setNameKu] = useState(item?.nameKu ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [catId, setCatId] = useState(item?.categoryId ?? categoryId);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [groups, setGroups] = useState<ModifierGroup[]>(parseModifiers(item?.modifiers));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useLanguage();

  function addGroup() {
    setGroups((g) => [...g, { name: "Sauce", required: true, options: [] }]);
  }
  function updateGroup(idx: number, patch: Partial<ModifierGroup>) {
    setGroups((g) => g.map((grp, i) => (i === idx ? { ...grp, ...patch } : grp)));
  }
  function removeGroup(idx: number) {
    setGroups((g) => g.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    try {
      // Drop empty groups before saving.
      const cleanGroups = groups
        .map((g) => ({ ...g, name: g.name.trim(), options: g.options.filter((o) => o.trim()) }))
        .filter((g) => g.name && g.options.length);
      const payload = {
        name,
        nameKu,
        price,
        description,
        categoryId: catId,
        available,
        modifiers: cleanGroups,
      };
      if (item) await apiSend(`/api/menu/items/${item.id}`, "PATCH", payload);
      else await apiSend("/api/menu/items", "POST", payload);
      toast.show(t("menu.toast.itemSaved"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? t("menu.itemModal.editItem") : t("menu.itemModal.newItem")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">{t("common.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("menu.itemModal.nameKu")}</label>
          <input
            className="input"
            dir="rtl"
            value={nameKu}
            onChange={(e) => setNameKu(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{t("menu.itemModal.price")}</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{t("common.category")}</label>
          <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("menu.itemModal.descriptionOptional")}</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 font-semibold cursor-pointer">
          <input
            type="checkbox"
            className="size-5 accent-leaf"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          {t("menu.itemModal.availableOnPos")}
        </label>

        {/* Reusable modifiers (e.g. sauce choice). The cashier is prompted to pick
            one option per group when the item is added to an order. */}
        <div className="border-t border-black/5 dark:border-white/5 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label mb-0 flex items-center gap-1.5">
              <SlidersHorizontal size={15} /> {t("menu.itemModal.modifiers")}
            </span>
            <button type="button" onClick={addGroup} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Plus size={14} /> {t("menu.itemModal.addGroup")}
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-xs opacity-50">{t("menu.itemModal.noModifiers")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g, idx) => (
                <div key={idx} className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className="input py-1.5 flex-1"
                      placeholder={t("menu.itemModal.groupNamePlaceholder")}
                      value={g.name}
                      onChange={(e) => updateGroup(idx, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(idx)}
                      className="btn-ghost size-8 rounded-lg text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    className="input py-1.5"
                    placeholder={t("menu.itemModal.optionsPlaceholder")}
                    value={g.options.join(", ")}
                    onChange={(e) =>
                      updateGroup(idx, { options: e.target.value.split(",").map((o) => o.trim()) })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-leaf"
                      checked={g.required}
                      onChange={(e) => updateGroup(idx, { required: e.target.checked })}
                    />
                    {t("common.required")}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="btn-primary flex-1 py-2.5"
          onClick={save}
          disabled={saving || !name.trim() || !price}
        >
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
