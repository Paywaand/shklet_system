"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, TrendingUp, Wallet, Boxes, Receipt } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { useFetch } from "@/lib/client";
import { iqd, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PageHeader } from "@/components/PageHeader";
import { ChartCard } from "@/components/ChartCard";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

// Same 5 fixed categories as the Expenses page (see expenses/page.tsx).
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];
const CATEGORY_COLORS = ["#FEDB00", "#EF3340", "#00A29A", "#232222", "#CBA3D8"];

type MonthTotals = { revenue: number; expenses: number };
type MonthComparison = {
  available: boolean;
  thisMonth: MonthTotals;
  revenuePctChange: number | null;
  expensesPctChange: number | null;
};

type DashboardData = {
  today: { orders: number; revenue: number; unpaidCount: number; unpaidAmount: number };
  month: { netProfit: number; expectedCashOnHand: number };
  mom: MonthComparison & { lastMonth: MonthTotals };
  yoy: MonthComparison & { lastYear: MonthTotals };
  expensesByCategory: { category: string; amount: number }[];
  expensesByCategoryTrend: ({ month: string } & Record<string, number | string>)[];
  lowStock: {
    count: number;
    items: { name: string; quantity: number; unit: string; minThreshold: number }[];
  };
};

// Admin-only landing page — a handful of numbers pulled from Sales, Profit and
// Cash Tracking for the CURRENT active branch, plus the two things worth
// acting on today (unpaid orders, low stock). Deliberately narrow: each figure
// already has its own full page, so this exists to answer "does anything need
// my attention right now", not to duplicate those pages.
export default function DashboardPage() {
  const { user } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";

  const { data, loading, error, reload } = useFetch<DashboardData>(isAdmin ? "/api/dashboard" : null);

  if (!isAdmin) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
        <EmptyState title={t("dashboard.adminOnly")} />
      </>
    );
  }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { today, month, mom, yoy, expensesByCategory, expensesByCategoryTrend, lowStock } = data;

  return (
    <>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label={t("dashboard.todayOrders")} value={num(today.orders)} />
        <Stat label={t("dashboard.todayRevenue")} value={iqd(today.revenue)} accent />
        <Stat label={t("dashboard.monthProfit")} value={iqd(month.netProfit)} accent={month.netProfit >= 0} />
        <Stat label={t("dashboard.cashOnHand")} value={iqd(month.expectedCashOnHand)} />
      </div>

      {(today.unpaidCount > 0 || lowStock.count > 0) && (
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          {today.unpaidCount > 0 && (
            <div className="card p-4 border-red-500/30">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={18} className="text-red-500" />
                <h2 className="font-bold">{t("dashboard.unpaidToday")}</h2>
              </div>
              <p className="text-sm opacity-70">
                {t("dashboard.unpaidCount", { n: String(today.unpaidCount) })} — {iqd(today.unpaidAmount)}
              </p>
              <Link href="/analytics" className="text-sm font-semibold text-leaf mt-2 inline-block">
                {t("dashboard.viewSales")} →
              </Link>
            </div>
          )}

          {lowStock.count > 0 && (
            <div className="card p-4 border-corn/30">
              <div className="flex items-center gap-2 mb-1">
                <Boxes size={18} className="text-corn" />
                <h2 className="font-bold">{t("dashboard.lowStock")}</h2>
              </div>
              <ul className="text-sm opacity-70 space-y-0.5">
                {lowStock.items.map((i) => (
                  <li key={i.name}>
                    {i.name} — {num(i.quantity)} {i.unit}
                  </li>
                ))}
              </ul>
              {lowStock.count > lowStock.items.length && (
                <p className="text-xs opacity-50 mt-1">
                  {t("dashboard.andMore", { n: String(lowStock.count - lowStock.items.length) })}
                </p>
              )}
              <Link href="/inventory" className="text-sm font-semibold text-leaf mt-2 inline-block">
                {t("dashboard.viewInventory")} →
              </Link>
            </div>
          )}
        </div>
      )}

      <MomYoySection mom={mom} yoy={yoy} />
      <ExpensesByCategorySection byCategory={expensesByCategory} trend={expensesByCategoryTrend} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink href="/analytics" icon={<BarChart3 size={18} />} label={t("nav.sales")} />
        <QuickLink href="/profit" icon={<TrendingUp size={18} />} label="Profit" />
        <QuickLink href="/cash-tracking" icon={<Wallet size={18} />} label="Cash Tracking" />
        <QuickLink href="/expenses" icon={<Receipt size={18} />} label={t("nav.expenses")} />
      </div>
    </>
  );
}

// ---- Month-over-month / year-over-year revenue & expense comparison ----
function MomYoySection({
  mom,
  yoy,
}: {
  mom: DashboardData["mom"];
  yoy: DashboardData["yoy"];
}) {
  const { t } = useLanguage();
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-5">
      <div className="card p-4">
        <h2 className="font-bold mb-3">{t("dashboard.mom.title")}</h2>
        {mom.available ? (
          <div className="grid grid-cols-2 gap-3">
            <DeltaStat label={t("dashboard.mom.revenue")} value={iqd(mom.thisMonth.revenue)} pct={mom.revenuePctChange} />
            <DeltaStat
              label={t("dashboard.mom.expenses")}
              value={iqd(mom.thisMonth.expenses)}
              pct={mom.expensesPctChange}
              invert
            />
          </div>
        ) : (
          <EmptyState title={t("dashboard.mom.notEnoughData")} />
        )}
      </div>
      <div className="card p-4">
        <h2 className="font-bold mb-3">{t("dashboard.yoy.title")}</h2>
        {yoy.available ? (
          <div className="grid grid-cols-2 gap-3">
            <DeltaStat label={t("dashboard.yoy.revenue")} value={iqd(yoy.thisMonth.revenue)} pct={yoy.revenuePctChange} />
            <DeltaStat
              label={t("dashboard.yoy.expenses")}
              value={iqd(yoy.thisMonth.expenses)}
              pct={yoy.expensesPctChange}
              invert
            />
          </div>
        ) : (
          <EmptyState title={t("dashboard.yoy.notEnoughData")} />
        )}
      </div>
    </div>
  );
}

// A rising number is good for revenue but bad for expenses — `invert` flips
// which direction counts as "good" (leaf) vs "bad" (red).
function DeltaStat({
  label,
  value,
  pct,
  invert,
}: {
  label: string;
  value: string;
  pct: number | null;
  invert?: boolean;
}) {
  const isUp = pct != null && pct > 0;
  const isGood = pct == null ? null : invert ? !isUp : isUp;
  return (
    <div>
      <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-lg font-extrabold mt-0.5">{value}</p>
      {pct != null ? (
        <p className={`text-xs font-semibold mt-0.5 ${isGood ? "text-leaf" : "text-red-500"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
        </p>
      ) : (
        <p className="text-xs opacity-40 mt-0.5">—</p>
      )}
    </div>
  );
}

// ---- Expenses by category (current month) + trend over the last 6 months ----
function ExpensesByCategorySection({
  byCategory,
  trend,
}: {
  byCategory: DashboardData["expensesByCategory"];
  trend: DashboardData["expensesByCategoryTrend"];
}) {
  const { t } = useLanguage();
  const pieData = byCategory
    .filter((c) => c.amount > 0)
    .map((c) => ({
      name: c.category,
      value: c.amount,
      color: CATEGORY_COLORS[EXPENSE_CATEGORIES.indexOf(c.category) % CATEGORY_COLORS.length],
    }));

  return (
    <div className="grid lg:grid-cols-2 gap-4 mb-5">
      <ChartCard title={t("dashboard.expensesByCategory.title")}>
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
              <Tooltip formatter={(v: number) => iqd(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t("dashboard.expensesByCategory.trend")}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} fontSize={11} />
            <YAxis tickFormatter={(v) => num(v)} fontSize={11} width={60} />
            <Tooltip formatter={(v: number) => iqd(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {EXPENSE_CATEGORIES.map((category, i) => (
              <Bar key={category} dataKey={category} stackId="a" fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
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

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="card p-4 flex items-center gap-2 hover:ring-2 hover:ring-corn transition">
      {icon}
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  );
}
