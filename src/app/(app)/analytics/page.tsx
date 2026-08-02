"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Download, Search, Trash2, Wallet } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, num, duration, shortTime, shortDate } from "@/lib/format";
import {
  currentBusinessDay,
  getBusinessDayBounds,
  businessDayRangeISO,
  type BusinessHours,
} from "@/lib/businessDay";
import type { Order, ExpectedCash, MoneyLedgerBalance } from "@/lib/types";
import type { PaymentMethod } from "@/lib/paymentMethods";
import type { MoneyLedgerBucket } from "@/lib/moneyLedger";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PageHeader } from "@/components/PageHeader";
import { ChartCard } from "@/components/ChartCard";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type Analytics = {
  summary: { totalOrders: number; totalRevenue: number; avgOrderValue: number; busiestHour: number | null };
  timing: { avgDurationSeconds: number | null; slowest: { pagerNumber: number; durationSeconds: number } | null };
  revenueByDay: { date: string; revenue: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  ordersByHour: { hour: number; count: number }[];
  paymentSplit: { cash: number; card: number; pos: number };
};

// The order history is fetched separately and paginated — it used to ride along
// on the analytics payload, which meant a year-long range shipped every order
// and every line item to the browser.
type OrderPage = {
  orders: Order[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

const CHART_COLORS = ["#FEDB00", "#EF3340", "#232222", "#EF3340", "#CBA3D8"];
// FIB (First Iraqi Bank) brand teal — kept as a literal hex here because
// Recharts' `fill` prop takes a real color string, not a Tailwind class (the
// `fib` Tailwind token in tailwind.config.ts is the same value, used wherever
// a class works instead, e.g. the POS payment button).
const FIB_COLOR = "#00A29A";

// The order-history search hits the server now, so it has to settle before
// firing rather than issuing a request per keystroke.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function AnalyticsPage() {
  const { user, businessHours } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [eventId, setEventId] = useState("all");
  const [branchId, setBranchId] = useState("all");

  const { data: eventsData } = useFetch<{ events: { id: string; name: string }[] }>("/api/events/active");
  const events = eventsData?.events ?? [];
  const { data: branchesData } = useFetch<{ branches: { id: string; name: string }[] }>("/api/branches");
  const branches = branchesData?.branches ?? [];

  // The active range, or null while a custom range is still half-picked.
  //
  // This memo is what stops the "custom" tab from querying all of history: with
  // both custom dates empty, rangeToDates() returns empty strings, and the old
  // code simply omitted from/to from the query string — which the API read as
  // "every order ever". A custom range is only real once BOTH ends are chosen,
  // so the first click of a two-click selection now fetches nothing at all.
  //
  // The memo also keeps rangeToDates() from producing a fresh `now` on every
  // render, which would change the URL each time and re-fetch in a loop.
  const activeRange = useMemo(() => {
    if (range === "custom" && !(customFrom && customTo)) return null;
    const { from, to } = rangeToDates(range, customFrom, customTo, businessHours);
    if (!from || !to) return null;
    return { from, to };
  }, [range, customFrom, customTo, businessHours]);

  // Shared scope params (range + event + branch) for every request this page makes.
  const scopeParams = useMemo(() => {
    if (!activeRange) return null;
    const qs = new URLSearchParams();
    qs.set("from", activeRange.from);
    qs.set("to", activeRange.to);
    if (eventId !== "all") qs.set("eventId", eventId);
    if (branchId !== "all") qs.set("branchId", branchId);
    return qs.toString();
  }, [activeRange, eventId, branchId]);

  // useFetch skips entirely on a null URL, so nothing is requested until the
  // range is bounded.
  const url = scopeParams ? `/api/analytics?${scopeParams}` : null;
  const { data, loading, error, reload } = useFetch<Analytics>(url);

  // Expected Cash on Hand (manager + admin). Defaults to the current business
  // month; only follows the page range when a custom range is actively set.
  const cashUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (eventId !== "all") qs.set("eventId", eventId);
    // Only follows the page range when a custom range is fully picked — a
    // half-picked range would otherwise send an open-ended bound.
    if (range === "custom" && activeRange) {
      qs.set("from", activeRange.from);
      qs.set("to", activeRange.to);
    }
    const qsString = qs.toString();
    return qsString ? `/api/sales-cash?${qsString}` : "/api/sales-cash";
  }, [range, activeRange, eventId]);
  const cash = useFetch<ExpectedCash>(cashUrl);

  // POS / FIB / Delivery running balances — same scope rules as cashUrl (event
  // filter always applies; the picked date range only applies once "custom" is
  // fully chosen), just parameterized per bucket.
  const ledgerBaseQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (eventId !== "all") qs.set("eventId", eventId);
    if (range === "custom" && activeRange) {
      qs.set("from", activeRange.from);
      qs.set("to", activeRange.to);
    }
    return qs;
  }, [range, activeRange, eventId]);

  function ledgerUrl(bucket: MoneyLedgerBucket): string {
    const qs = new URLSearchParams(ledgerBaseQs);
    qs.set("bucket", bucket);
    return `/api/money-ledger?${qs.toString()}`;
  }

  const posLedger = useFetch<MoneyLedgerBalance>(ledgerUrl("pos"));
  const fibLedger = useFetch<MoneyLedgerBalance>(ledgerUrl("fib"));
  const deliveryLedger = useFetch<MoneyLedgerBalance>(ledgerUrl("delivery"));
  const { data: deliverySettings } = useFetch<{
    settings: { platformName: string; color: string };
  }>("/api/delivery/settings");

  const [query, setQuery] = useState("");
  const [pmFilter, setPmFilter] = useState<"all" | PaymentMethod>("all");
  const [otFilter, setOtFilter] = useState<"all" | "walk_in" | "takeaway">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [page, setPage] = useState(1);

  // Debounce the search box: it now hits the server, so firing per keystroke
  // would queue a request per character.
  const debouncedQuery = useDebounced(query, 300);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, pmFilter, otFilter, paidFilter, scopeParams]);

  const ordersUrl = useMemo(() => {
    if (!scopeParams) return null;
    const qs = new URLSearchParams(scopeParams);
    qs.set("page", String(page));
    if (debouncedQuery.trim()) qs.set("q", debouncedQuery.trim());
    if (pmFilter !== "all") qs.set("payment", pmFilter);
    if (otFilter !== "all") qs.set("type", otFilter);
    if (paidFilter !== "all") qs.set("paid", paidFilter);
    return `/api/analytics/orders?${qs.toString()}`;
  }, [scopeParams, page, debouncedQuery, pmFilter, otFilter, paidFilter]);

  const {
    data: orderPage,
    loading: ordersLoading,
    reload: reloadOrders,
  } = useFetch<OrderPage>(ordersUrl);

  async function deleteOrder(o: Order) {
    const label = o.shortId ?? `#${o.pagerNumber}`;
    if (!confirm(t("sales.confirm.deleteOrder", { label }))) return;
    try {
      await apiSend(`/api/orders/${o.id}`, "DELETE");
      toast.show(t("sales.toast.orderDeleted"));
      reload();
      reloadOrders();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  const orders = orderPage?.orders ?? [];

  // A half-picked custom range fetches nothing, so prompt instead of spinning.
  if (!activeRange) {
    return (
      <>
        <PageHeader title={t("sales.header.title")} subtitle={t("sales.header.subtitle")} />
        <RangeFilter
          range={range}
          setRange={setRange}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          eventId={eventId}
          setEventId={setEventId}
          events={events}
          branchId={branchId}
          setBranchId={setBranchId}
          branches={branches}
          t={t}
        />
        <EmptyState title={t("sales.filters.pickRange")} />
      </>
    );
  }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary, timing, revenueByDay, topItems, ordersByHour, paymentSplit } = data;
  // Colors are assigned per payment method explicitly, not by position — with
  // positional CHART_COLORS[i], the FIB slice's color depended on which OTHER
  // segments happened to be zero (and get filtered out) that day.
  const pieData = [
    { name: t("common.cash"), value: paymentSplit.cash, color: CHART_COLORS[0] },
    { name: t("common.card"), value: paymentSplit.card, color: FIB_COLOR },
    { name: t("common.pos"), value: paymentSplit.pos, color: CHART_COLORS[2] },
  ].filter((d) => d.value > 0);

  return (
    <>
      <PageHeader title={t("sales.header.title")} subtitle={t("sales.header.subtitle")} />

      <RangeFilter
        range={range}
        setRange={setRange}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        eventId={eventId}
        setEventId={setEventId}
        events={events}
        branchId={branchId}
        setBranchId={setBranchId}
        branches={branches}
        t={t}
      />

      <MonthExport branchId={branchId} eventId={eventId} />

      {/* Four money buckets (manager + admin): Cash, POS, FIB, Delivery. Detailed
          admin-only ledger management (opening balances, settlements) lives on
          the /cash-tracking page — this is the at-a-glance running balance. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {cash.data && <ExpectedCashCard data={cash.data} />}
        {posLedger.data && (
          <LedgerBalanceCard label={t("sales.pos.title")} data={posLedger.data} />
        )}
        {fibLedger.data && (
          <LedgerBalanceCard label={t("sales.fib.title")} data={fibLedger.data} />
        )}
        {deliveryLedger.data && (
          <LedgerBalanceCard
            label={deliverySettings?.settings.platformName ?? t("sales.delivery.title")}
            data={deliveryLedger.data}
          />
        )}
      </div>

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
                <Bar dataKey="revenue" fill="#EF3340" radius={[6, 6, 0, 0]} />
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
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
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
              <option value="pos">{t("common.pos")}</option>
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
          </div>
        </div>

        {orders.length === 0 ? (
          ordersLoading ? <Loading /> : <EmptyState title={t("sales.orderHistory.noOrders")} />
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
                {orders.map((o) => (
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
                      {o.paymentMethod === "card" ? (
                        <span className="chip bg-fib/15 text-fib text-[10px]">{t("common.card")}</span>
                      ) : o.paymentMethod === "cash" ? (
                        t("common.cash")
                      ) : (
                        t("common.pos")
                      )}
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

        {orderPage && orderPage.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-black/10 dark:border-white/10">
            <p className="text-xs opacity-60">
              {t("sales.orderHistory.showing", {
                from: String((orderPage.page - 1) * orderPage.pageSize + 1),
                to: String(Math.min(orderPage.page * orderPage.pageSize, orderPage.total)),
                total: num(orderPage.total),
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost px-3 py-2 text-sm disabled:opacity-40"
                disabled={orderPage.page <= 1 || ordersLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} /> {t("common.previous")}
              </button>
              <span className="text-xs opacity-60 tabular-nums">
                {orderPage.page} / {orderPage.totalPages}
              </span>
              <button
                className="btn-ghost px-3 py-2 text-sm disabled:opacity-40"
                disabled={orderPage.page >= orderPage.totalPages || ordersLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

// ---- Range filter (shared by the "pick a range" prompt and the loaded page) ----
type RangeFilterProps = {
  range: RangeKey;
  setRange: (k: RangeKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  eventId: string;
  setEventId: (v: string) => void;
  events: { id: string; name: string }[];
  branchId: string;
  setBranchId: (v: string) => void;
  branches: { id: string; name: string }[];
  t: (key: string, vars?: Record<string, string>) => string;
};

function RangeFilter({
  range,
  setRange,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  eventId,
  setEventId,
  events,
  branchId,
  setBranchId,
  branches,
  t,
}: RangeFilterProps) {
  return (
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
          <input
            type="date"
            aria-label={t("sales.filters.from")}
            className="input py-2 w-auto"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className="opacity-50">→</span>
          <input
            type="date"
            aria-label={t("sales.filters.to")}
            className="input py-2 w-auto"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}
      <select className="input py-2 w-auto" value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="all">{t("sales.filters.allBranches")}</option>
        <option value="main">{t("sales.filters.mainBranch")}</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
      {branches.length > 1 && (
        <select className="input py-2 w-auto" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="all">{t("sales.filters.allPhysicalBranches")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---- Monthly bookkeeping export ----
// Sales, expenses and delivery are three separate files: they share no columns,
// and a single file with stacked sections breaks Excel's autofilter, sort and
// pivot detection. Each button is rendered only when the session already holds
// the matching permission — and the API re-checks it, so hiding the button is
// presentation, not the control.
function MonthExport({ branchId, eventId }: { branchId: string; eventId: string }) {
  const { can } = useSession();
  const { t } = useLanguage();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  function href(dataset: string) {
    const qs = new URLSearchParams({ month, dataset });
    if (branchId !== "all") qs.set("branchId", branchId);
    if (eventId !== "all") qs.set("eventId", eventId);
    return `/api/exports/monthly?${qs.toString()}`;
  }

  const datasets: { key: string; label: string; allowed: boolean }[] = [
    { key: "sales", label: t("sales.export.sales"), allowed: can("analytics.view") },
    { key: "expenses", label: t("sales.export.expenses"), allowed: can("expenses.manage") },
    { key: "delivery", label: t("sales.export.delivery"), allowed: can("delivery.view") },
  ];

  return (
    <section className="card p-4 mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-bold">{t("sales.export.title")}</h2>
          <p className="text-xs opacity-60">{t("sales.export.hint")}</p>
        </div>
        <input
          type="month"
          aria-label={t("sales.export.month")}
          className="input py-2 w-auto"
          value={month}
          max={new Date().toISOString().slice(0, 7)}
          onChange={(e) => setMonth(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 ms-auto">
          {datasets
            .filter((d) => d.allowed)
            .map((d) => (
              <a key={d.key} href={href(d.key)} download className="btn-ghost px-3 py-2 text-sm">
                <Download size={16} /> {d.label}
              </a>
            ))}
        </div>
      </div>
    </section>
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

// ---- Four money buckets (manager + admin): Cash, POS, FIB, Delivery ----
function ExpectedCashCard({ data }: { data: ExpectedCash }) {
  const { t } = useLanguage();
  return (
    <div className="card p-4 border-leaf/40 bg-leaf-50 dark:bg-leaf/10">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={18} className="text-leaf" />
        <h2 className="font-extrabold">{t("sales.expectedCash.title")}</h2>
      </div>
      <p className="text-2xl font-extrabold text-leaf">{iqd(data.expectedCashOnHand)}</p>
      <p className="text-xs opacity-50 mt-1">{t("sales.expectedCash.hint")}</p>
    </div>
  );
}

// Running balance card for the POS / FIB / Delivery buckets — same shape as
// ExpectedCashCard but generic across bucket, since the underlying figure
// (opening + period accrual − settlements) is identical math for all three.
function LedgerBalanceCard({ label, data }: { label: string; data: MoneyLedgerBalance }) {
  const { t } = useLanguage();
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={18} className="opacity-60" />
        <h2 className="font-extrabold">{label}</h2>
      </div>
      <p className="text-2xl font-extrabold">{iqd(data.runningBalance)}</p>
      <p className="text-xs opacity-50 mt-1">
        {t("sales.ledger.periodAccrual", { amount: iqd(data.accrual) })}
      </p>
    </div>
  );
}
