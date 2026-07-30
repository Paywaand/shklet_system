"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";
import { StatCard } from "@/components/ui/stat-card";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import {
  BarChart3,
  Receipt,
  Warehouse,
  ShoppingCart,
  ClipboardList,
  UtensilsCrossed,
  ArrowUpRight,
  DollarSign,
  ShoppingBag,
  Gauge,
} from "lucide-react";

interface Summary {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

const QUICK_LINKS = [
  { href: "/cashier", icon: ShoppingCart, labelKey: "sidebar.cashier" as const, tone: "red" as const },
  { href: "/sales", icon: BarChart3, labelKey: "sidebar.sales" as const, tone: "green" as const },
  { href: "/warehouse", icon: Warehouse, labelKey: "sidebar.warehouse" as const, tone: "yellow" as const },
  { href: "/expenses", icon: Receipt, labelKey: "sidebar.expenses" as const, tone: "purple" as const },
  { href: "/menu", icon: UtensilsCrossed, labelKey: "sidebar.menu" as const, tone: "red" as const },
  { href: "/daily-needs", icon: ClipboardList, labelKey: "sidebar.dailyNeeds" as const, tone: "green" as const },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { en: "Good morning", ku: "بەیانیت باش" };
  if (h < 18) return { en: "Good afternoon", ku: "نیوەڕۆت باش" };
  return { en: "Good evening", ku: "ئێوارەت باش" };
}

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const { user } = useCurrentUser();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    fetch(`/api/sales/summary?from=${start.toISOString()}&to=${new Date(start.getTime() + 86400000).toISOString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const greeting = getGreeting();
  const scopeLabel =
    user?.role === "ADMIN"
      ? null
      : user?.branchName
        ? `${lang === "ku" ? user.cityNameKu : user.cityName} — ${lang === "ku" ? user.branchNameKu : user.branchName}`
        : lang === "ku"
          ? user?.cityNameKu
          : user?.cityName;

  return (
    <div>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-shklet-red via-shklet-red to-[#c2242f] p-7 sm:p-9 mb-7 text-white shadow-[0_20px_50px_-20px_rgba(239,51,64,0.55)]"
      >
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl rtl:right-auto rtl:-left-10" />
        <div className="absolute right-20 bottom-0 h-40 w-40 rounded-full bg-shklet-yellow/20 blur-3xl rtl:right-auto rtl:left-20" />
        <div className="relative">
          <p className="text-white/70 text-sm font-medium mb-1">
            {lang === "ku" ? greeting.ku : greeting.en}
          </p>
          <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-[-0.02em]">{user?.fullName}</h1>
          {scopeLabel ? (
            <p className="text-white/75 text-sm mt-2 font-medium">{scopeLabel}</p>
          ) : (
            <p className="text-white/75 text-sm mt-2 font-medium">
              {lang === "ku" ? "دەسەڵاتی ئەدمینی گشتی" : "Global admin access"}
            </p>
          )}
        </div>
      </motion.div>

      {/* Today stats */}
      {loading ? (
        <SkeletonGrid count={3} />
      ) : summary ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
        >
          <StatCard label={t("sales.totalOrders")} value={String(summary.totalOrders)} icon={ShoppingBag} tone="neutral" />
          <StatCard label={t("sales.totalRevenue")} value={formatMoney(summary.totalRevenue)} icon={DollarSign} tone="red" />
          <StatCard
            label={t("sales.averageOrderValue")}
            value={formatMoney(summary.averageOrderValue)}
            icon={Gauge}
            tone="green"
          />
        </motion.div>
      ) : null}

      {/* Quick links */}
      <p className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">
        {lang === "ku" ? "دەستپێکردنی خێرا" : "Quick access"}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {QUICK_LINKS.map((link, i) => (
          <QuickLink key={link.href} {...link} label={t(link.labelKey)} delay={i * 0.03} />
        ))}
      </div>
    </div>
  );
}

const toneClasses: Record<string, string> = {
  red: "bg-shklet-red/10 text-shklet-red",
  green: "bg-shklet-green/12 text-shklet-green",
  yellow: "bg-shklet-yellow/20 text-[#8a6d00] dark:text-shklet-yellow",
  purple: "bg-shklet-purple/15 text-[#7b4f92] dark:text-shklet-purple",
};

function QuickLink({
  href,
  icon: Icon,
  label,
  tone,
  delay,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  tone: string;
  delay: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }}>
      <Link href={href} className="group block">
        <div className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-elevation-1 transition-all duration-200 hover:shadow-elevation-2 hover:border-shklet-red/30 hover:-translate-y-0.5 flex flex-col items-center text-center gap-2.5">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
            <Icon size={20} strokeWidth={2} />
          </div>
          <span className="text-[13px] font-semibold leading-tight">{label}</span>
          <ArrowUpRight
            size={13}
            className="absolute top-3 right-3 rtl:right-auto rtl:left-3 text-[var(--muted-soft)] opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
      </Link>
    </motion.div>
  );
}
