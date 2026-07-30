"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/money";
import { Percent } from "lucide-react";
import { cn } from "@/lib/cn";

interface Row {
  itemId: string;
  name: string;
  unit: string;
  theoretical: number;
  actual: number;
  wastage: number;
  wastagePct: number;
}

export default function IngredientUsagePage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ingredient-usage")
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title={t("ingredientUsage.header")} />

      {loading ? (
        <div className="skeleton rounded-2xl h-64" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Percent} title={t("ingredientUsage.emptyState")} />
      ) : (
        <Card>
          <CardContent className="pt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-[11px] font-bold uppercase tracking-wide text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-3 text-start">{t("ingredientUsage.ingredient")}</th>
                  <th className="pb-3 text-end">{t("ingredientUsage.theoreticalUsage")}</th>
                  <th className="pb-3 text-end">{t("ingredientUsage.actualUsage")}</th>
                  <th className="pb-3 text-end">{t("ingredientUsage.wastage")}</th>
                  <th className="pb-3 text-end">{t("ingredientUsage.wastagePct")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.itemId} className="border-b border-[var(--card-border-soft)] last:border-0">
                    <td className="py-3 font-semibold">{r.name}</td>
                    <td className="py-3 text-end ltr-nums">
                      {formatNumber(r.theoretical)} {r.unit}
                    </td>
                    <td className="py-3 text-end ltr-nums">
                      {formatNumber(r.actual)} {r.unit}
                    </td>
                    <td className={cn("py-3 text-end ltr-nums font-semibold", r.wastage > 0 ? "text-shklet-red" : "text-shklet-green")}>
                      {formatNumber(r.wastage)} {r.unit}
                    </td>
                    <td className={cn("py-3 text-end ltr-nums font-semibold", r.wastagePct > 10 && "text-shklet-red")}>
                      {r.wastagePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
