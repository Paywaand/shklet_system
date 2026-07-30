"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Info, Truck } from "lucide-react";
import { useFetch } from "@/lib/client";
import { iqd } from "@/lib/format";
import { currentBusinessDay, businessDayRangeISO, type BusinessHours } from "@/lib/businessDay";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState } from "@/components/ui";

type Profit = {
  totalSales: number;
  totalExpenses: number;
  ingredientCost: number;
  grossProfit: number;
  orderCount: number;
  delivery: {
    platformName: string;
    gross: number;
    commission: number;
    net: number;
    orderCount: number;
  };
};

const DELIVERY_COLOR = "#0fb79b";

type RangeKey = "day" | "week" | "month";

// Ranges are in BUSINESS days (configurable open → close, e.g. 17:00 → 01:00).
// "Today" is the business day currently in effect (before the open hour that is
// still last night's trading day).
function rangeDates(key: RangeKey, hours: BusinessHours) {
  const today = currentBusinessDay(new Date(), hours);
  if (key === "day") return businessDayRangeISO(today, today, hours);
  if (key === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return businessDayRangeISO(start, today, hours);
  }
  // this month, to date
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return businessDayRangeISO(start, today, hours);
}

export default function ProfitPage() {
  const { businessHours } = useSession();
  const [range, setRange] = useState<RangeKey>("day");

  const url = useMemo(() => {
    const { from, to } = rangeDates(range, businessHours);
    const qs = new URLSearchParams({ from, to });
    return `/api/profit?${qs.toString()}`;
  }, [range, businessHours]);

  const { data, loading, error, reload } = useFetch<Profit>(url);

  return (
    <>
      <PageHeader title="Profit Overview" subtitle="Gross profit for the selected period" />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(["day", "week", "month"] as RangeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`btn px-4 py-2 text-sm ${
              range === k ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {k === "day" ? "Today" : k === "week" ? "Last 7 days" : "This month"}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <div className="max-w-xl">
          <div className="card p-5">
            <Row label="Total sales" value={iqd(data.totalSales)} positive sub={`${data.orderCount} orders`} />
            <Row label="Expenses" value={`- ${iqd(data.totalExpenses)}`} negative />
            <Row
              label="Ingredient cost"
              value={`- ${iqd(data.ingredientCost)}`}
              negative
              sub="warehouse usage cost in the period"
            />
            <div className="border-t-2 border-black/10 dark:border-white/10 mt-3 pt-3 flex items-center justify-between">
              <span className="text-lg font-extrabold flex items-center gap-2">
                <TrendingUp size={20} className="text-leaf" /> Gross Profit
              </span>
              <span
                className={`text-2xl font-extrabold ${
                  data.grossProfit >= 0 ? "text-leaf" : "text-red-500"
                }`}
              >
                {iqd(data.grossProfit)}
              </span>
            </div>
          </div>

          <div className="card p-4 mt-4 flex items-start gap-2.5 bg-corn/10 border-corn/30">
            <Info size={18} className="text-corn-600 shrink-0 mt-0.5" />
            <p className="text-sm opacity-80">
              This is <b>gross profit, not net profit</b>. It does not account for salaries or other
              non-logged costs.
            </p>
          </div>

          {/* Delivery platform — separate, not part of the branch gross profit above */}
          <div className="card p-5 mt-4" style={{ borderColor: `${DELIVERY_COLOR}55` }}>
            <div className="flex items-center gap-2 mb-3">
              <Truck size={20} style={{ color: DELIVERY_COLOR }} />
              <h2 className="text-lg font-extrabold">{data.delivery.platformName} (separate)</h2>
            </div>
            <Row label={`Gross (${data.delivery.orderCount} orders)`} value={iqd(data.delivery.gross)} />
            <Row label="Commission" value={`- ${iqd(data.delivery.commission)}`} negative />
            <div className="border-t border-black/10 dark:border-white/10 mt-2 pt-2 flex items-center justify-between">
              <span className="font-extrabold">Net receivable</span>
              <span className="text-xl font-extrabold" style={{ color: DELIVERY_COLOR }}>
                {iqd(data.delivery.net)}
              </span>
            </div>
            <p className="text-xs opacity-60 mt-2">
              Delivery revenue is tracked separately and is <b>not</b> included in the gross profit above.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({
  label,
  value,
  sub,
  positive,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="font-semibold">{label}</p>
        {sub && <p className="text-xs opacity-50">{sub}</p>}
      </div>
      <span
        className={`font-bold ${positive ? "text-leaf" : negative ? "text-red-500" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
