"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import toast from "react-hot-toast";
import { Trash2, Download, DollarSign, ShoppingBag, Gauge, Clock, Flame, Search, Receipt } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Summary {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averagePrepTime: number;
  slowestOrder: number;
  busiestHour: number;
  revenueByDay: { date: string; revenue: number }[];
  topItems: { name: string; qty: number }[];
  ordersByHour: { hour: number; count: number }[];
  paymentSplit: { cash: number; card: number };
  delivery: { count: number; gross: number; net: number };
}

interface OrderRow {
  id: string;
  code: string;
  pagerNumber: number | null;
  total: number;
  paymentMethod: string;
  status: string;
  placedAt: string;
  readyAt: string | null;
  items: { nameSnapshot: string; quantity: number }[];
}

const RED = "#EF3340";
const GREEN = "#249E6B";
const YELLOW = "#FEDB00";

const PRESETS = [
  { key: "today", labelKey: "common.today" },
  { key: "yesterday", labelKey: "common.yesterday" },
  { key: "7d", labelKey: "common.last7Days" },
  { key: "30d", labelKey: "common.last30Days" },
] as const;

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  }
  if (preset === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { from: y.toISOString(), to: today.toISOString() };
  }
  if (preset === "7d") {
    return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
  }
  return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
}

const chartTooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--card-border)",
  background: "var(--card)",
  fontSize: 13,
  boxShadow: "var(--shadow-elevation-2)",
};

export default function SalesPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<string>("7d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = presetRange(preset);
    const params = new URLSearchParams({ from, to });
    const [summaryRes, ordersRes] = await Promise.all([
      fetch(`/api/sales/summary?${params}`),
      fetch(`/api/sales/orders?${params}${search ? `&search=${search}` : ""}`),
    ]);
    setSummary(await summaryRes.json());
    setOrders((await ordersRes.json()).orders ?? []);
    setLoading(false);
  }, [preset, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteOrder(id: string) {
    if (!confirm(t("sales.confirmDeleteOrder"))) return;
    const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("common.success"));
      load();
    }
  }

  function exportCsv() {
    const rows = [
      ["Order", "Pager", "Items", "Total", "Payment", "Status", "Placed At"],
      ...orders.map((o) => [
        o.code,
        o.pagerNumber ?? "",
        o.items.map((i) => `${i.nameSnapshot} x${i.quantity}`).join("; "),
        o.total,
        o.paymentMethod,
        o.status,
        o.placedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shklet-sales-${preset}.csv`;
    a.click();
  }

  return (
    <div>
      <PageHeader
        title={t("sales.header")}
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download size={16} /> {t("sales.exportCsv")}
          </Button>
        }
      />

      <SegmentedControl
        options={PRESETS.map((p) => ({ value: p.key, label: t(p.labelKey) }))}
        value={preset}
        onChange={setPreset}
        className="mb-6"
      />

      {loading || !summary ? (
        <SkeletonGrid count={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <StatCard label={t("sales.totalOrders")} value={formatNumber(summary.totalOrders)} icon={ShoppingBag} />
            <StatCard label={t("sales.totalRevenue")} value={formatMoney(summary.totalRevenue)} icon={DollarSign} tone="red" />
            <StatCard label={t("sales.averageOrderValue")} value={formatMoney(summary.averageOrderValue)} icon={Gauge} tone="green" />
            <StatCard label={t("sales.busiestHour")} value={`${summary.busiestHour}:00`} icon={Flame} tone="yellow" />
            <StatCard label={t("sales.averagePrepTime")} value={`${summary.averagePrepTime} min`} icon={Clock} />
            <StatCard label={t("sales.slowestOrder")} value={`${summary.slowestOrder} min`} icon={Clock} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ChartCard title={t("sales.revenueByDay")}>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={summary.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatMoney(Number(v))} />
                  <Line type="monotone" dataKey="revenue" stroke={RED} strokeWidth={2.5} dot={{ r: 3, fill: RED }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("sales.topSellingItems")}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={summary.topItems} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--card-border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="qty" fill={GREEN} radius={[0, 8, 8, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("sales.ordersByHour")}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={summary.ordersByHour}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--card-border)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill={YELLOW} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("sales.paymentMethodSplit")}>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={[
                      { name: t("common.cash"), value: summary.paymentSplit.cash },
                      { name: t("common.card"), value: summary.paymentSplit.card },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    <Cell fill={RED} />
                    <Cell fill={GREEN} />
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatMoney(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <Card className="mb-4">
            <CardContent className="pt-5">
              <div className="relative max-w-xs">
                <Search size={15} className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-soft)]" />
                <Input
                  placeholder={t("sales.searchOrders")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 overflow-x-auto">
              {orders.length === 0 ? (
                <EmptyState icon={Receipt} title={t("common.noResultsFound")} />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-[11px] font-bold uppercase tracking-wide text-[var(--muted)] border-b border-[var(--card-border)]">
                      <th className="pb-3 text-start">{t("sales.order")}</th>
                      <th className="pb-3 text-start">{t("sales.pager")}</th>
                      <th className="pb-3 text-start">{t("sales.items")}</th>
                      <th className="pb-3 text-end">{t("sales.total")}</th>
                      <th className="pb-3 text-start">{t("sales.payment")}</th>
                      <th className="pb-3 text-start">{t("sales.status")}</th>
                      <th className="pb-3 text-start">{t("sales.placedAt")}</th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-[var(--card-border-soft)] last:border-0 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                        <td className="py-3 ltr-nums font-semibold">{o.code}</td>
                        <td className="py-3 ltr-nums">{o.pagerNumber ?? "—"}</td>
                        <td className="py-3 text-[var(--muted)] max-w-[220px] truncate">
                          {o.items.map((i) => `${i.nameSnapshot} ×${i.quantity}`).join(", ")}
                        </td>
                        <td className="py-3 text-end ltr-nums font-bold">{formatMoney(o.total)}</td>
                        <td className="py-3">{o.paymentMethod}</td>
                        <td className="py-3">{o.status}</td>
                        <td className="py-3 ltr-nums text-[var(--muted)]">{formatDateTime(o.placedAt)}</td>
                        <td className="py-3 text-end">
                          <button onClick={() => deleteOrder(o.id)} className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-shklet-red/10">
                            <Trash2 size={14} className="text-shklet-red" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card>
        <CardContent className="pt-5">
          <h3 className="font-bold text-[15px] mb-2">{title}</h3>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}
