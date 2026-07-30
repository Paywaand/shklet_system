"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney, formatNumber } from "@/lib/money";
import toast from "react-hot-toast";
import { Plus, AlertTriangle, History, Warehouse as WarehouseIcon, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface Category {
  id: string;
  name: string;
  nameKu: string;
  color: string;
}
interface Item {
  id: string;
  name: string;
  nameKu: string;
  unit: string;
  quantity: string;
  minThreshold: string;
  unitCost: string;
  category: Category | null;
}
interface Movement {
  id: string;
  type: "ADD" | "REMOVE";
  amount: string;
  totalCost: number | null;
  unitCostAtTime: string;
  reason: string;
  note: string | null;
  edited: boolean;
  createdAt: string;
  user: { fullName: string };
}

export default function WarehousePage() {
  const { t, lang } = useLanguage();
  const { user } = useCurrentUser();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [stockModalItem, setStockModalItem] = useState<{ item: Item; type: "ADD" | "REMOVE" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [itemsRes, catsRes] = await Promise.all([
      fetch("/api/warehouse/items"),
      fetch("/api/warehouse/categories"),
    ]);
    const itemsData = await itemsRes.json();
    const catsData = await catsRes.json();
    setItems(itemsData.items ?? []);
    setCategories(catsData.categories ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openMovements(item: Item) {
    setSelectedItem(item);
    const res = await fetch(`/api/warehouse/items/${item.id}/movements`);
    const data = await res.json();
    setMovements(data.movements ?? []);
  }

  async function deleteMovement(id: string) {
    if (!confirm(t("warehouse.confirmDeleteMovement"))) return;
    const res = await fetch(`/api/warehouse/movements/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("warehouse.movementDeleted"));
      load();
      if (selectedItem) openMovements(selectedItem);
    }
  }

  const lowStockCount = items.filter((i) => Number(i.quantity) <= Number(i.minThreshold)).length;

  return (
    <div>
      <PageHeader
        title={t("warehouse.header")}
        description={
          lowStockCount > 0
            ? `${lowStockCount} ${t("warehouse.lowStockBadge").toLowerCase()}`
            : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setShowCategoryForm(true)}>
              <Plus size={16} /> {t("warehouse.addCategory")}
            </Button>
            <Button onClick={() => setShowItemForm(true)}>
              <Plus size={16} /> {t("warehouse.addItem")}
            </Button>
          </>
        }
      />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={WarehouseIcon} title={t("common.noResultsFound")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, i) => {
            const low = Number(item.quantity) <= Number(item.minThreshold);
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                <Card className={cn(low && "border-shklet-yellow/60 shadow-[0_0_0_1px_rgba(254,219,0,0.3)]")}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold">{lang === "ku" ? item.nameKu : item.name}</p>
                        {item.category && (
                          <span
                            className="text-[11px] font-bold px-2 py-0.5 rounded-full mt-1.5 inline-block"
                            style={{ backgroundColor: `${item.category.color}20`, color: item.category.color }}
                          >
                            {lang === "ku" ? item.category.nameKu : item.category.name}
                          </span>
                        )}
                      </div>
                      {low && (
                        <Badge tone="yellow">
                          <AlertTriangle size={11} /> {t("warehouse.lowStockBadge")}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1.5 mb-4">
                      <Row label={t("warehouse.inStock")} value={`${formatNumber(Number(item.quantity))} ${item.unit}`} strong />
                      <Row label={t("warehouse.minimumThreshold")} value={`${formatNumber(Number(item.minThreshold))} ${item.unit}`} />
                      <Row label={t("warehouse.unitCost")} value={formatMoney(Number(item.unitCost))} />
                    </div>

                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1" onClick={() => setStockModalItem({ item, type: "ADD" })}>
                        <ArrowUp size={13} /> {t("common.add")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setStockModalItem({ item, type: "REMOVE" })}
                      >
                        <ArrowDown size={13} /> {t("warehouse.removeStock").split(" ")[0]}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openMovements(item)}>
                        <History size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <CategoryFormModal
        open={showCategoryForm}
        userCityId={user?.cityId ?? null}
        onClose={() => setShowCategoryForm(false)}
        onSaved={() => {
          setShowCategoryForm(false);
          load();
        }}
      />

      {showItemForm && (
        <ItemFormModal
          categories={categories}
          onClose={() => setShowItemForm(false)}
          onSaved={() => { setShowItemForm(false); load(); }}
          userCityId={user?.cityId ?? null}
        />
      )}
      {stockModalItem && (
        <StockMovementModal
          item={stockModalItem.item}
          type={stockModalItem.type}
          onClose={() => setStockModalItem(null)}
          onSaved={() => { setStockModalItem(null); load(); }}
        />
      )}
      {selectedItem && (
        <MovementsModal
          item={selectedItem}
          movements={movements}
          onClose={() => setSelectedItem(null)}
          onDelete={deleteMovement}
        />
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={cn("ltr-nums", strong && "font-bold")}>{value}</span>
    </div>
  );
}

// A simple pattern: form component holds its own state, exposes a hidden
// submit button referenced by the footer via id — avoided here for
// simplicity; instead these small forms manage save button inline.

function CategoryFormModal({
  open,
  userCityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  userCityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [nameKu, setNameKu] = useState("");
  const [color, setColor] = useState("#AA8066");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/warehouse/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId: userCityId, name, nameKu, color }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("common.success"));
      setName("");
      setNameKu("");
      onSaved();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("warehouse.addCategory")}
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
        <div>
          <Label>{t("warehouse.categoryName")} (EN)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>{t("warehouse.categoryName")} (KU)</Label>
          <Input dir="rtl" value={nameKu} onChange={(e) => setNameKu(e.target.value)} />
        </div>
        <div>
          <Label>{t("warehouse.color")}</Label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded-lg cursor-pointer" />
        </div>
      </div>
    </Modal>
  );
}

function ItemFormModal({
  categories,
  onClose,
  onSaved,
  userCityId,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  userCityId: string | null;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [nameKu, setNameKu] = useState("");
  const [unit, setUnit] = useState("kg");
  const [categoryId, setCategoryId] = useState("");
  const [minThreshold, setMinThreshold] = useState("0");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/warehouse/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cityId: userCityId,
        categoryId: categoryId || undefined,
        name,
        nameKu,
        unit,
        minThreshold: Number(minThreshold),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("warehouse.itemSaved"));
      onSaved();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("warehouse.addItem")}
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
          <div>
            <Label>{t("common.name")} (EN)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.name")} (KU)</Label>
            <Input dir="rtl" value={nameKu} onChange={(e) => setNameKu(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("common.unit")}</Label>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {["kg", "g", "litre", "ml", "piece", "box"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("common.category")}</Label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("warehouse.uncategorized")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("warehouse.minimumThreshold")}</Label>
          <Input type="number" value={minThreshold} onChange={(e) => setMinThreshold(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function StockMovementModal({
  item,
  type,
  onClose,
  onSaved,
}: {
  item: Item;
  type: "ADD" | "REMOVE";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [reason, setReason] = useState<"DELIVERY" | "DAILY_USAGE" | "WASTAGE" | "MANUAL_CORRECTION" | "OTHER">(
    type === "ADD" ? "DELIVERY" : "DAILY_USAGE",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (reason === "OTHER" && !note.trim()) {
      toast.error(t("warehouse.noteRequiredForOther"));
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/warehouse/items/${item.id}/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        amount: Number(amount),
        totalCost: type === "ADD" ? Number(totalCost) : undefined,
        reason: type === "ADD" ? "DELIVERY" : reason,
        note: note || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("warehouse.stockUpdated"));
      onSaved();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={type === "ADD" ? t("warehouse.addStock") : t("warehouse.removeStock")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving} variant={type === "ADD" ? "primary" : "danger"}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div>
          <Label>{t("warehouse.amount")} ({item.unit})</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        {type === "ADD" ? (
          <div>
            <Label>{t("warehouse.totalDeliveryCost")}</Label>
            <Input type="number" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
          </div>
        ) : (
          <div>
            <Label>{t("warehouse.reason")}</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              <option value="DAILY_USAGE">{t("warehouse.reasonDailyUsage")}</option>
              <option value="WASTAGE">{t("warehouse.reasonWastage")}</option>
              <option value="MANUAL_CORRECTION">{t("warehouse.reasonManualCorrection")}</option>
              <option value="OTHER">{t("warehouse.reasonOther")}</option>
            </Select>
          </div>
        )}
        <div>
          <Label>{t("common.note")}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function MovementsModal({
  item,
  movements,
  onClose,
  onDelete,
}: {
  item: Item;
  movements: Movement[];
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { t, lang } = useLanguage();
  return (
    <Modal open onClose={onClose} title={t("warehouse.stockMovements")} description={lang === "ku" ? item.nameKu : item.name}>
      <div className="space-y-2 pb-4">
        {movements.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm border-b border-[var(--card-border-soft)] pb-2.5 last:border-0">
            <div>
              <span className={cn("font-bold", m.type === "ADD" ? "text-shklet-green" : "text-shklet-red")}>
                {m.type === "ADD" ? t("warehouse.added") : t("warehouse.removed")}
              </span>{" "}
              <span className="ltr-nums font-semibold">{Number(m.amount)}</span> {item.unit}
              {m.edited && <span className="ms-1 text-xs text-[var(--muted)]">({t("warehouse.editedBadge")})</span>}
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {m.user.fullName} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
            <button onClick={() => onDelete(m.id)} className="text-xs font-semibold text-shklet-red hover:underline shrink-0">
              {t("common.delete")}
            </button>
          </div>
        ))}
        {movements.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-6">{t("common.noResultsFound")}</p>
        )}
      </div>
    </Modal>
  );
}
