"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMoney } from "@/lib/money";

interface ProfitData {
  totalSales: number;
  totalExpenses: number;
  ingredientCost: number;
  grossProfit: number;
  grossMargin: number;
}

const PRESETS = [
  { key: "today", labelKey: "common.today" },
  { key: "week", labelKey: "common.thisWeek" },
  { key: "month", labelKey: "common.thisMonth" },
] as const;

function presetRange(preset: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  if (preset === "week") {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { from: monday.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  }
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: firstOfMonth.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
}

export default function ProfitPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = presetRange(preset);
    const res = await fetch(`/api/profit?from=${from}&to=${to}`);
    setData(await res.json());
    setLoading(false);
  }, [preset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title={t("profit.header")} />

      <SegmentedControl
        options={PRESETS.map((p) => ({ value: p.key, label: t(p.labelKey) }))}
        value={preset}
        onChange={setPreset}
        className="mb-6"
      />

      {loading || !data ? (
        <div className="skeleton rounded-2xl h-72" />
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-lg">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Row label={t("profit.totalSales")} value={formatMoney(data.totalSales)} />
              <Row label={t("profit.totalExpenses")} value={formatMoney(data.totalExpenses)} negative />
              <Row label={t("profit.ingredientBatchCost")} value={formatMoney(data.ingredientCost)} negative />
              <div className="border-t border-[var(--card-border)] pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[15px]">{t("profit.grossProfit")}</span>
                  <span
                    className={`ltr-nums text-2xl font-extrabold tracking-[-0.02em] ${
                      data.grossProfit >= 0 ? "text-shklet-green" : "text-shklet-red"
                    }`}
                  >
                    {formatMoney(data.grossProfit)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-[var(--muted)] text-sm font-medium">{t("profit.grossMargin")}</span>
                <span className="ltr-nums font-bold">{data.grossMargin}%</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[var(--muted)] text-sm font-medium">{label}</span>
      <span className={`ltr-nums font-semibold ${negative ? "text-shklet-red" : ""}`}>
        {negative && "− "}
        {value}
      </span>
    </div>
  );
}
