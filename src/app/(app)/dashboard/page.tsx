"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, TrendingUp, Wallet, Boxes, Receipt } from "lucide-react";
import { useFetch } from "@/lib/client";
import { iqd, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type DashboardData = {
  today: { orders: number; revenue: number; unpaidCount: number; unpaidAmount: number };
  month: { netProfit: number; expectedCashOnHand: number };
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

  const { today, month, lowStock } = data;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink href="/analytics" icon={<BarChart3 size={18} />} label={t("nav.sales")} />
        <QuickLink href="/profit" icon={<TrendingUp size={18} />} label="Profit" />
        <QuickLink href="/cash-tracking" icon={<Wallet size={18} />} label="Cash Tracking" />
        <QuickLink href="/expenses" icon={<Receipt size={18} />} label={t("nav.expenses")} />
      </div>
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

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="card p-4 flex items-center gap-2 hover:ring-2 hover:ring-corn transition">
      {icon}
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  );
}
