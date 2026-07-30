"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import toast from "react-hot-toast";
import { ClipboardList, Check } from "lucide-react";

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
  category: Category | null;
}

export default function DailyNeedsPage() {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState<Item[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/daily-needs")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function save() {
    setSaving(true);
    const entries = items.map((item) => ({ inventoryItemId: item.id, needsRestock: !!checked[item.id] }));
    const res = await fetch("/api/daily-needs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    setSaving(false);
    if (res.ok) toast.success(t("dailyNeeds.checklistSaved"));
  }

  function saveAsImage() {
    window.print();
  }

  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.category?.name ?? "uncategorized";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const today = new Date().toLocaleDateString();
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title={t("dailyNeeds.header")}
        description={t("dailyNeeds.checklistFor", { date: today })}
        actions={
          <>
            <Button variant="outline" className="no-print" onClick={saveAsImage}>
              {t("dailyNeeds.saveAsImage")}
            </Button>
            <Button className="no-print" onClick={save} loading={saving}>
              {t("dailyNeeds.saveChecklist")}
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="skeleton rounded-2xl h-64" />
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("dailyNeeds.noItemsYet")} />
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([catName, catItems], gi) => (
            <motion.div key={catName} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: gi * 0.03 }}>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-3.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: catItems[0].category?.color ?? "#8f8579" }}
                    />
                    <h3 className="font-bold text-[15px]">
                      {catItems[0].category
                        ? lang === "ku"
                          ? catItems[0].category.nameKu
                          : catItems[0].category.name
                        : t("warehouse.uncategorized")}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {catItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2.5 text-sm rounded-lg px-2.5 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                            checked[item.id] ? "bg-shklet-red border-shklet-red" : "border-[var(--card-border)]"
                          }`}
                        >
                          {checked[item.id] && <Check size={13} className="text-white" strokeWidth={3} />}
                        </span>
                        <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)} className="sr-only" />
                        <span className={checked[item.id] ? "line-through text-[var(--muted)]" : "font-medium"}>
                          {lang === "ku" ? item.nameKu : item.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {checkedCount > 0 && (
            <p className="text-sm text-[var(--muted)] text-center">
              {checkedCount} / {items.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
