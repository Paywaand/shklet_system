"use client";

import { use } from "react";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useFetch } from "@/lib/client";
import { iqd, num, shortDate } from "@/lib/format";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type Evaluation = {
  event: { name: string; startDate: string; endDate: string | null; status: string };
  revenue: number;
  orderCount: number;
  usageCost: number;
  expensesTotal: number;
  grossProfit: number;
  profitable: boolean;
  ingredients: { name: string; unit: string; qty: number; cost: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
};

export default function EvaluationPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { data, loading, error, reload } = useFetch<Evaluation>(`/api/events/${params.id}/evaluation`);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { event } = data;
  const dates = event.endDate
    ? `${shortDate(event.startDate)} → ${shortDate(event.endDate)}`
    : shortDate(event.startDate);

  return (
    <div className="max-w-2xl">
      <Link href="/events" className="btn-ghost px-3 py-1.5 text-sm mb-4">
        <ArrowLeft size={16} /> Back to events
      </Link>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">Event evaluation</p>
            <h1 className="text-2xl font-extrabold">{event.name}</h1>
            <p className="opacity-60">{dates}</p>
          </div>
          <span className={`chip ${event.status === "active" ? "bg-leaf text-white" : "bg-black/10 dark:bg-white/10"}`}>
            {event.status}
          </span>
        </div>

        {/* Verdict */}
        <div
          className={`rounded-xl p-4 my-4 flex items-center gap-3 ${
            data.profitable ? "bg-leaf/15 text-leaf" : "bg-red-500/15 text-red-500"
          }`}
        >
          {data.profitable ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
          <div>
            <p className="font-extrabold text-lg">{data.profitable ? "Profitable" : "Loss"}</p>
            <p className="text-sm opacity-80">Gross {data.grossProfit >= 0 ? "profit" : "loss"} of {iqd(Math.abs(data.grossProfit))}</p>
          </div>
        </div>

        {/* Breakdown */}
        <h2 className="font-bold mb-1">Revenue</h2>
        <Row label={`Total orders tagged (${data.orderCount})`} value={iqd(data.revenue)} positive />

        <h2 className="font-bold mt-4 mb-1">Costs</h2>
        <Row label="Warehouse items used" value={`- ${iqd(data.usageCost)}`} negative />
        <Row label="Expenses tagged" value={`- ${iqd(data.expensesTotal)}`} negative />

        <div className="border-t-2 border-black/10 dark:border-white/10 mt-3 pt-3 flex items-center justify-between">
          <span className="text-lg font-extrabold">Gross Profit / Loss</span>
          <span className={`text-2xl font-extrabold ${data.grossProfit >= 0 ? "text-leaf" : "text-red-500"}`}>
            {iqd(data.grossProfit)}
          </span>
        </div>
      </div>

      {/* Ingredient breakdown */}
      <div className="card p-4 mt-4">
        <h2 className="font-bold mb-3">Ingredient usage</h2>
        {data.ingredients.length === 0 ? (
          <EmptyState title="No warehouse usage tagged to this event" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-3">Ingredient</th>
                  <th className="py-2 pr-3">Qty used</th>
                  <th className="py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((i) => (
                  <tr key={i.name} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-3 font-semibold">{i.name}</td>
                    <td className="py-2 pr-3">
                      {num(i.qty)} {i.unit}
                    </td>
                    <td className="py-2">{iqd(i.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top items */}
      <div className="card p-4 mt-4">
        <h2 className="font-bold mb-3">Top selling items during event</h2>
        {data.topItems.length === 0 ? (
          <EmptyState title="No orders tagged to this event" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty sold</th>
                  <th className="py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((i) => (
                  <tr key={i.name} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-3 font-semibold">{i.name}</td>
                    <td className="py-2 pr-3">{num(i.qty)}</td>
                    <td className="py-2">{iqd(i.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-semibold">{label}</span>
      <span className={`font-bold ${positive ? "text-leaf" : negative ? "text-red-500" : ""}`}>{value}</span>
    </div>
  );
}
