"use client";

import { useMemo, useState } from "react";
import { TriangleAlert, Calculator, Package, BadgeCheck } from "lucide-react";
import { useFetch } from "@/lib/client";
import { iqd, num } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState } from "@/components/ui";
import type { EstimatedProfit } from "@/lib/types";

type DayKey = 1 | 7 | 30;
const RANGES: { key: DayKey; label: string }[] = [
  { key: 1, label: "1 day" },
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
];

function perGram(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function EstimatedProfitPage() {
  const [days, setDays] = useState<DayKey>(7);
  const url = useMemo(() => `/api/estimated-profit?days=${days}`, [days]);
  const { data, loading, error, reload } = useFetch<EstimatedProfit>(url);

  return (
    <>
      <PageHeader title="Estimated Profit" subtitle="Projected from sales × recipe gross profit" />

      {/* Prominent isolation banner */}
      <div className="card p-4 mb-5 flex items-start gap-3 bg-corn/15 border-corn/40">
        <TriangleAlert className="text-corn-600 shrink-0 mt-0.5" size={22} />
        <div>
          <p className="font-extrabold tracking-wide text-corn-600">ESTIMATED — NOT ACTUAL FINANCIALS</p>
          <p className="text-sm opacity-80 mt-0.5">
            A projection from units sold × each item&apos;s recipe gross profit. It ignores expenses,
            wastage, salaries, and real warehouse costs. For real numbers, use{" "}
            <b>Profit Overview</b>.
          </p>
        </div>
      </div>

      {/* Range filter */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setDays(r.key)}
            className={`btn px-4 py-2 text-sm ${days === r.key ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <>
          {/* Headline number */}
          <div className="card p-6 mb-4 bg-leaf/5 border-leaf/20">
            <div className="flex items-center gap-2 opacity-70 mb-1">
              <Calculator size={18} className="text-leaf" />
              <span className="text-sm font-bold uppercase tracking-wide">Estimated net (last {data.days} day{data.days > 1 ? "s" : ""})</span>
            </div>
            <p className={`text-4xl font-extrabold ${data.estimatedNet >= 0 ? "text-leaf" : "text-red-500"}`}>
              {iqd(data.estimatedNet)}
            </p>
            <p className="text-xs opacity-50 mt-1">Σ(units sold × gross profit per item)</p>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <Stat icon={<Package size={18} />} label="Units sold" value={num(data.unitsSold)} />
            <Stat icon={<BadgeCheck size={18} />} label="Items costed" value={num(data.itemsWithRecipe)} />
            <Stat
              icon={<TriangleAlert size={18} />}
              label="Sold without recipe"
              value={num(data.itemsMissingRecipe)}
              warn={data.itemsMissingRecipe > 0}
            />
          </div>

          {data.itemsMissingRecipe > 0 && (
            <div className="card p-3 mb-4 flex items-center gap-2 border-amber-500/30 bg-amber-500/5">
              <TriangleAlert className="text-amber-500 shrink-0" size={18} />
              <p className="text-sm">
                {data.itemsMissingRecipe} sold item{data.itemsMissingRecipe > 1 ? "s have" : " has"} no recipe yet,
                so {data.itemsMissingRecipe > 1 ? "they are" : "it is"} counted as <b>0</b> profit. Add a recipe in
                Production for a fuller estimate.
              </p>
            </div>
          )}

          {/* Per-item breakdown */}
          {data.rows.length === 0 ? (
            <EmptyState title="No sales in this period" hint="Estimates appear once orders are placed." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                    <th className="p-3">Item</th>
                    <th className="p-3 text-right">Units sold</th>
                    <th className="p-3 text-right">Gross profit / item</th>
                    <th className="p-3 text-right">Estimated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.menuItemId} className="border-b border-black/5 dark:border-white/5">
                      <td className="p-3 font-bold">
                        {r.name}
                        {!r.hasRecipe && <span className="chip bg-amber-500/20 text-amber-600 ml-2">no recipe</span>}
                      </td>
                      <td className="p-3 text-right">{num(r.unitsSold)}</td>
                      <td className="p-3 text-right opacity-70">
                        {r.hasRecipe ? `${perGram(r.grossProfitPerItem)} IQD` : "—"}
                      </td>
                      <td className={`p-3 text-right font-bold ${r.estimated >= 0 ? "" : "text-red-500"}`}>
                        {r.hasRecipe ? iqd(r.estimated) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function Stat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className={`card p-3 ${warn ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
      <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${warn ? "text-amber-600" : "opacity-60"}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
  );
}
