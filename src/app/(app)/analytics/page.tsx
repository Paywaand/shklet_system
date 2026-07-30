"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { Download, Search, Trash2, Wallet } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, num, duration, shortTime, shortDate, dateTimeFull } from "@/lib/format";
import {
  currentBusinessDay,
  getBusinessDayBounds,
  businessDayRangeISO,
  type BusinessHours,
} from "@/lib/businessDay";
import type { Order, ExpectedCash } from "@/lib/types";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type Analytics = {
  summary: { totalOrders: number; totalRevenue: number; avgOrderValue: number; busiestHour: number | null };
  timing: { avgDurationSeconds: number | null; slowest: { pagerNumber: number; durationSeconds: number } | null };
  revenueByDay: { date: string; revenue: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  ordersByHour: { hour: number; count: number }[];
  paymentSplit: { cash: number; card: number };
  orders: Order[];
};

type RangeKey = "today" | "yesterday" | "week" | "thisMonth" | "month" | "custom";

// All ranges are expressed in BUSINESS days (17:00 → 00:59 next day), so a single
// trading night is one unit. "today" is the business day currently in effect —
// before 17:00 that is still last night's trading day (the branch hasn't reopened).
function rangeToDates(key: RangeKey, customFrom: string, customTo: string, hours: BusinessHours) {
  const today = currentBusinessDay(new Date(), hours);
  if (key === "today") return businessDayRangeISO(today, today, hours);
  if (key === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return businessDayRangeISO(y, y, hours);
  }
  if (key === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return businessDayRangeISO(start, today, hours);
  }
  if (key === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return businessDayRangeISO(start, today, hours);
  }
  if (key === "month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return businessDayRangeISO(start, end, hours);
  }
  // custom — the picked dates are business days: from-date open → to-date+1 close.
  return {
    from: customFrom ? getBusinessDayBounds(new Date(customFrom + "T00:00:00"), hours).start.toISOString() : "",
    to: customTo ? getBusinessDayBounds(new Date(customTo + "T00:00:00"), hours).end.toISOString() : "",
  };
}

const CHART_COLORS = ["#FEDB00", "#AA8066", "#232222", "#EF3340", "#CBA3D8"];

export default function AnalyticsPage() {
  const { user, businessHours } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [eventId, setEventId] = useState("all");

  const { data: eventsData } = useFetch<{ events: { id: string; name: string }[] }>("/api/events/active");
  const events = eventsData?.events ?? [];

  // Build the fetch URL only when the filter inputs change. Without this memo,
  // rangeToDates() would produce a fresh `now` timestamp on every render, changing
  // the URL each time and causing useFetch to re-fetch in an endless loop.
  const url = useMemo(() => {
    const { from, to } = rangeToDates(range, customFrom, customTo, businessHours);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (eventId !== "all") qs.set("eventId", eventId);
    return `/api/analytics?${qs.toString()}`;
  }, [range, customFrom, customTo, businessHours, eventId]);
  const { data, loading, error, reload } = useFetch<Analytics>(url);

  // Expected Cash on Hand (manager + admin). Defaults to the current business
  // month; only follows the page range when a custom range is actively set.
  const cashUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (eventId !== "all") qs.set("eventId", eventId);
    if (range === "custom" && (customFrom || customTo)) {
      const { from, to } = rangeToDates("custom", customFrom, customTo, businessHours);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
    }
    const qsString = qs.toString();
    return qsString ? `/api/sales-cash?${qsString}` : "/api/sales-cash";
  }, [range, customFrom, customTo, businessHours, eventId]);
  const cash = useFetch<ExpectedCash>(cashUrl);

  const [query, setQuery] = useState("");
  const [pmFilter, setPmFilter] = useState<"all" | "cash" | "card">("all");
  const [otFilter, setOtFilter] = useState<"all" | "walk_in" | "takeaway">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");

  async function deleteOrder(o: Order) {
    const label = o.shortId ?? `#${o.pagerNumber}`;
    if (!confirm(t("sales.confirm.deleteOrder", { label }))) return;
    try {
      await apiSend(`/api/orders/${o.id}`, "DELETE");
      toast.show(t("sales.toast.orderDeleted"));
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  const filteredOrders = useMemo(() => {
    const orders = data?.orders ?? [];
    return orders.filter((o) => {
      if (pmFilter !== "all" && o.paymentMethod !== pmFilter) return false;
      if (otFilter !== "all" && o.orderType !== otFilter) return false;
      if (paidFilter === "paid" && !o.isPaid) return false;
      if (paidFilter === "unpaid" && o.isPaid) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (o.shortId?.toLowerCase().includes(q) ?? false) ||
        String(o.pagerNumber).includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q)) ||
        (o.staff?.fullName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, query, pmFilter, otFilter, paidFilter]);

  function exportCsv() {
    const rows = [
      ["Order", "Pager", "Type", "Items", "Total (IQD)", "Payment", "Paid", "Status", "Placed", "Ready in", "Staff"],
      ...filteredOrders.map((o) => [
        o.shortId ?? "",
        o.pagerNumber,
        o.orderType === "takeaway" ? "Take Away" : "Walk-in",
        o.items.map((i) => `${i.quantity}x ${i.name}`).join("; "),
        o.total,
        o.paymentMethod,
        o.isPaid ? "Paid" : "Unpaid",
        o.status,
        dateTimeFull(o.placedAt),
        o.durationSeconds != null ? duration(o.durationSeconds) : "",
        o.staff?.fullName ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shklet-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary, timing, revenueByDay, topItems, ordersByHour, paymentSplit } = data;
  const pieData = [
    { name: t("common.cash"), value: paymentSplit.cash },
    { name: t("common.card"), value: paymentSplit.card },
  ].filter((d) => d.value > 0);

  return (
    <>
      <PageHeader title={t("sales.header.title")} subtitle={t("sales.header.subtitle")} />

      {/* Range filter */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(["today", "yesterday", "week", "thisMonth", "month", "custom"] as RangeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`btn px-4 py-2 text-sm capitalize ${
              range === k ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {k === "week"
              ? t("sales.filters.last7Days")
              : k === "thisMonth"
              ? t("sales.filters.thisMonth")
              : k === "month"
              ? t("sales.filters.lastMonth")
              : t(`sales.filters.${k}`)}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="opacity-50">→</span>
            <input type="date" className="input py-2 w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
        <select
          className="input py-2 w-auto"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="all">{t("sales.filters.allBranches")}</option>
          <option value="main">{t("sales.filters.mainBranch")}</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </div>

      {/* Expected Cash on Hand (manager + admin). The detailed admin-only Cash
          Tracking (safe + withdrawals) now lives on its own /cash-tracking page. */}
      {cash.data && <ExpectedCashCard data={cash.data} />}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label={t("sales.stats.orders")} value={num(summary.totalOrders)} />
        <Stat label={t("sales.stats.revenue")} value={iqd(summary.totalRevenue)} accent />
        <Stat label={t("sales.stats.avgOrder")} value={iqd(summary.avgOrderValue)} />
        <Stat
          label={t("sales.stats.busiestHour")}
          value={summary.busiestHour != null ? `${String(summary.busiestHour).padStart(2, "0")}:00` : "—"}
        />
        <Stat label={t("sales.stats.avgPrepTime")} value={duration(timing.avgDurationSeconds)} />
        <Stat
          label={t("sales.stats.slowestOrder")}
          value={timing.slowest ? `#${timing.slowest.pagerNumber} · ${duration(timing.slowest.durationSeconds)}` : "—"}
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <ChartCard title={t("sales.charts.revenueByDay")}>
          {revenueByDay.length === 0 ? (
            <EmptyState title={t("sales.charts.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis tickFormatter={(v) => num(v)} fontSize={11} width={60} />
                <Tooltip formatter={(v: number) => iqd(v)} />
                <Bar dataKey="revenue" fill="#AA8066" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("sales.charts.ordersByHour")}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ordersByHour}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="hour" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={30} />
              <Tooltip />
              <Bar dataKey="count" fill="#FCCB02" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("sales.charts.topSellingItems")}>
          {topItems.length === 0 ? (
            <EmptyState title={t("sales.charts.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topItems} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="name" width={120} fontSize={11} />
                <Tooltip />
                <Bar dataKey="qty" fill="#FEDB00" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("sales.charts.paymentMethod")}>
          {pieData.length === 0 ? (
            <EmptyState title={t("sales.charts.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* History table */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-extrabold text-lg">{t("sales.orderHistory.title")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                className="input py-2 pl-9 w-48"
                placeholder={t("sales.orderHistory.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="input py-2 w-auto"
              value={pmFilter}
              onChange={(e) => setPmFilter(e.target.value as typeof pmFilter)}
            >
              <option value="all">{t("sales.orderHistory.allPayments")}</option>
              <option value="cash">{t("common.cash")}</option>
              <option value="card">{t("common.card")}</option>
            </select>
            <select
              className="input py-2 w-auto"
              value={otFilter}
              onChange={(e) => setOtFilter(e.target.value as typeof otFilter)}
            >
              <option value="all">{t("sales.orderHistory.allTypes")}</option>
              <option value="walk_in">{t("cashier.cart.walkIn")}</option>
              <option value="takeaway">{t("cashier.cart.takeAway")}</option>
            </select>
            <select
              className="input py-2 w-auto"
              value={paidFilter}
              onChange={(e) => setPaidFilter(e.target.value as typeof paidFilter)}
            >
              <option value="all">{t("sales.orderHistory.allPaidStatus")}</option>
              <option value="paid">{t("cashier.cart.paid")}</option>
              <option value="unpaid">{t("cashier.activeOrders.unpaid")}</option>
            </select>
            <button onClick={exportCsv} className="btn-ghost px-3 py-2 text-sm">
              <Download size={16} /> {t("sales.orderHistory.csv")}
            </button>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <EmptyState title={t("sales.orderHistory.noOrders")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-3">{t("sales.table.order")}</th>
                  <th className="py-2 pr-3">{t("sales.table.pager")}</th>
                  <th className="py-2 pr-3">{t("sales.table.type")}</th>
                  <th className="py-2 pr-3">{t("sales.table.items")}</th>
                  <th className="py-2 pr-3">{t("sales.table.total")}</th>
                  <th className="py-2 pr-3">{t("sales.table.payment")}</th>
                  <th className="py-2 pr-3">{t("sales.table.paidStatus")}</th>
                  <th className="py-2 pr-3">{t("sales.table.status")}</th>
                  <th className="py-2 pr-3">{t("sales.table.placed")}</th>
                  <th className="py-2 pr-3">{t("sales.table.prep")}</th>
                  <th className="py-2">{t("sales.table.staff")}</th>
                  {isAdmin && <th className="py-2 text-right">{t("sales.table.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-3 font-mono font-bold tracking-wider">{o.shortId ?? "—"}</td>
                    <td className="py-2 pr-3 font-bold">{o.pagerNumber}</td>
                    <td className="py-2 pr-3">
                      {o.orderType === "takeaway" ? (
                        <span className="chip bg-cocoa/15 text-cocoa text-[10px]">{t("cashier.cart.takeAway")}</span>
                      ) : (
                        <span className="chip bg-black/10 dark:bg-white/10 text-[10px]">{t("cashier.cart.walkIn")}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 max-w-[220px] truncate">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </td>
                    <td className="py-2 pr-3 font-bold">{num(o.total)}</td>
                    <td className="py-2 pr-3 capitalize">
                      {o.paymentMethod === "cash" ? t("common.cash") : t("common.card")}
                    </td>
                    <td className="py-2 pr-3">
                      {o.isPaid ? (
                        <span className="chip bg-leaf/20 text-leaf text-[10px]">{t("cashier.cart.paid")}</span>
                      ) : (
                        <span className="chip bg-red-500/15 text-red-500 text-[10px]">{t("cashier.activeOrders.unpaid")}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`chip ${
                          o.status === "collected"
                            ? "bg-leaf/20 text-leaf"
                            : o.status === "ready"
                            ? "bg-corn/30 text-cocoa"
                            : o.status === "cancelled"
                            ? "bg-red-500/15 text-red-500"
                            : "bg-black/10 dark:bg-white/10"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 opacity-70">
                      {shortDate(o.placedAt)} {shortTime(o.placedAt)}
                    </td>
                    <td className="py-2 pr-3 opacity-70">{duration(o.durationSeconds)}</td>
                    <td className="py-2 opacity-70">{o.staff?.fullName ?? "—"}</td>
                    {isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          className="btn-ghost size-8 rounded-lg text-red-500"
                          title={t("sales.table.deleteOrder")}
                          onClick={() => deleteOrder(o)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-extrabold mt-1 ${accent ? "text-leaf" : ""}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ---- Item 6: Expected Cash on Hand (manager + admin) ----
function ExpectedCashCard({ data }: { data: ExpectedCash }) {
  const { t } = useLanguage();
  return (
    <div className="card p-5 mb-5 border-leaf/40 bg-leaf-50 dark:bg-leaf/10">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={20} className="text-leaf" />
        <h2 className="text-lg font-extrabold">{t("sales.expectedCash.title")}</h2>
      </div>
      <p className="text-3xl font-extrabold text-leaf">{iqd(data.expectedCashOnHand)}</p>
      <p className="text-xs opacity-50 mt-1">{t("sales.expectedCash.hint")}</p>
    </div>
  );
}
