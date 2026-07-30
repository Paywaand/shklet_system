"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { DollarSign, TrendingDown, TrendingUp, Percent } from "lucide-react";

interface Data {
  estimatedRevenue: number;
  estimatedIngredientCost: number;
  estimatedGrossProfit: number;
  estimatedMargin: number;
}

const PRESETS = [
  { key: "today", labelKey: "common.today" },
  { key: "7d", labelKey: "common.last7Days" },
  { key: "30d", labelKey: "common.last30Days" },
] as const;

function presetRange(preset: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  if (preset === "7d") return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
}

export default function EstimatedProfitPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = presetRange(preset);
    const res = await fetch(`/api/estimated-profit?from=${from}&to=${to}`);
    setData(await res.json());
    setLoading(false);
  }, [preset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title={t("estimatedProfit.header")}
        actions={<Badge tone="yellow">{t("estimatedProfit.disclaimer")}</Badge>}
      />

      <SegmentedControl
        options={PRESETS.map((p) => ({ value: p.key, label: t(p.labelKey) }))}
        value={preset}
        onChange={setPreset}
        className="mb-6"
      />

      {loading || !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton rounded-2xl h-24" />
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t("estimatedProfit.estimatedRevenue")} value={formatMoney(data.estimatedRevenue)} icon={DollarSign} />
          <StatCard label={t("estimatedProfit.estimatedIngredientCost")} value={formatMoney(data.estimatedIngredientCost)} icon={TrendingDown} tone="yellow" />
          <StatCard label={t("estimatedProfit.estimatedGrossProfit")} value={formatMoney(data.estimatedGrossProfit)} icon={TrendingUp} tone="red" />
          <StatCard label={t("estimatedProfit.estimatedMargin")} value={`${data.estimatedMargin}%`} icon={Percent} tone="green" />
        </motion.div>
      )}
    </div>
  );
}
