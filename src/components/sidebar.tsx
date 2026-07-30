"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingCart,
  ClipboardList,
  UtensilsCrossed,
  Warehouse,
  Percent,
  Factory,
  TrendingUp,
  BarChart3,
  Receipt,
  PiggyBank,
  Wallet,
  CalendarDays,
  Users,
  ShieldCheck,
  FileText,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Menu as MenuIcon,
  X,
  Languages,
} from "lucide-react";
import { useLanguage, type DictPath } from "@/i18n";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/cn";
import type { CurrentUser } from "@/hooks/use-current-user";
import { canAccess, type ModuleKey } from "@/lib/permissions";

interface NavItem {
  key: ModuleKey;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  labelKey: DictPath;
}

interface NavGroup {
  labelKey: DictPath;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "sidebar.groupOperations",
    items: [
      { key: "cashier", href: "/cashier", icon: ShoppingCart, labelKey: "sidebar.cashier" },
      { key: "dailyNeeds", href: "/daily-needs", icon: ClipboardList, labelKey: "sidebar.dailyNeeds" },
      { key: "menu", href: "/menu", icon: UtensilsCrossed, labelKey: "sidebar.menu" },
    ],
  },
  {
    labelKey: "sidebar.groupInventory",
    items: [
      { key: "warehouse", href: "/warehouse", icon: Warehouse, labelKey: "sidebar.warehouse" },
      { key: "ingredientUsage", href: "/ingredient-usage", icon: Percent, labelKey: "sidebar.ingredientUsage" },
      { key: "production", href: "/production", icon: Factory, labelKey: "sidebar.production" },
      { key: "estimatedProfit", href: "/estimated-profit", icon: TrendingUp, labelKey: "sidebar.estimatedProfit" },
    ],
  },
  {
    labelKey: "sidebar.groupFinance",
    items: [
      { key: "sales", href: "/sales", icon: BarChart3, labelKey: "sidebar.sales" },
      { key: "expenses", href: "/expenses", icon: Receipt, labelKey: "sidebar.expenses" },
      { key: "profit", href: "/profit", icon: PiggyBank, labelKey: "sidebar.profit" },
      { key: "cashTracking", href: "/cash-tracking", icon: Wallet, labelKey: "sidebar.cashTracking" },
    ],
  },
  {
    labelKey: "sidebar.groupAdmin",
    items: [
      { key: "events", href: "/events", icon: CalendarDays, labelKey: "sidebar.events" },
      { key: "staff", href: "/staff", icon: Users, labelKey: "sidebar.staff" },
      { key: "roles", href: "/roles", icon: ShieldCheck, labelKey: "sidebar.roles" },
      { key: "reports", href: "/reports", icon: FileText, labelKey: "sidebar.reports" },
    ],
  },
];

const ROLE_LABEL: Record<CurrentUser["role"], DictPath> = {
  ADMIN: "staff.roleAdmin",
  MANAGER: "staff.roleManager",
  CASHIER: "staff.roleCashier",
};

export function Sidebar({ user }: { user: CurrentUser }) {
  const { t, lang, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const ChevronCollapse = lang === "ku" ? ChevronRight : ChevronLeft;
  const ChevronExpand = lang === "ku" ? ChevronLeft : ChevronRight;

  const scopeLabel =
    user.role === "ADMIN"
      ? null
      : user.branchName
        ? `${lang === "ku" ? user.cityNameKu : user.cityName} — ${lang === "ku" ? user.branchNameKu : user.branchName}`
        : lang === "ku"
          ? user.cityNameKu
          : user.cityName;

  const content = (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 shrink-0 border-b border-[var(--sidebar-border)]",
          collapsed ? "h-14 justify-center px-2" : "h-14",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-shklet-red flex items-center justify-center shadow-[0_4px_14px_-4px_rgba(239,51,64,0.6)]">
            <span className="text-white font-black text-base">S</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-extrabold text-[15px] tracking-[-0.01em] text-[var(--sidebar-text)] leading-tight truncate">
                Shklet
              </p>
              <p className="text-[11px] text-[var(--sidebar-text-muted)] leading-tight truncate">
                {t(ROLE_LABEL[user.role])}
              </p>
            </div>
          )}
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden ms-auto p-1.5 rounded-lg hover:bg-white/10 text-[var(--sidebar-text)]"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scope badge */}
      {!collapsed && scopeLabel && (
        <div className="px-4 pt-2.5 pb-0.5 shrink-0">
          <div className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-[var(--sidebar-text-muted)] font-medium truncate border border-white/[0.05]">
            {scopeLabel}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2.5 px-2.5 space-y-2 sidebar-scroll">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => canAccess(user.role, item.key));
          if (items.length === 0) return null;
          return (
            <div key={group.labelKey}>
              {!collapsed && (
                <div className="px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--sidebar-text-muted)]/70 mb-1">
                  {t(group.labelKey)}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname?.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-semibold transition-all duration-150",
                        active
                          ? "bg-shklet-red text-white shadow-[0_4px_14px_-4px_rgba(239,51,64,0.55)]"
                          : "text-[var(--sidebar-text-muted)] hover:bg-white/[0.06] hover:text-[var(--sidebar-text)]",
                        collapsed && "justify-center px-0",
                      )}
                      title={collapsed ? t(item.labelKey) : undefined}
                    >
                      <Icon size={17} strokeWidth={2} className="shrink-0" />
                      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer controls */}
      <div className="border-t border-[var(--sidebar-border)] p-2 space-y-0.5 shrink-0">
        <button
          onClick={toggleLang}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-[var(--sidebar-text-muted)] hover:bg-white/[0.06] hover:text-[var(--sidebar-text)] transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <Languages size={17} className="shrink-0" />
          {!collapsed && <span>{lang === "en" ? "کوردی" : "English"}</span>}
        </button>
        <button
          onClick={toggleTheme}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-[var(--sidebar-text-muted)] hover:bg-white/[0.06] hover:text-[var(--sidebar-text)] transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          {theme === "light" ? <Moon size={17} className="shrink-0" /> : <Sun size={17} className="shrink-0" />}
          {!collapsed && <span>{theme === "light" ? t("common.darkMode") : t("common.lightMode")}</span>}
        </button>
        <button
          onClick={handleSignOut}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-shklet-red/90 hover:bg-shklet-red/10 hover:text-shklet-red transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>{t("sidebar.signOut")}</span>}
        </button>

        <div className="pt-1 mt-1 border-t border-[var(--sidebar-border)] flex items-center gap-2.5 px-2.5">
          <div className="h-7 w-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[var(--sidebar-text)] text-[11px] font-bold">
            {user.fullName.slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <p className="text-[12px] font-semibold text-[var(--sidebar-text)] truncate">{user.fullName}</p>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex ms-auto h-7 w-7 items-center justify-center rounded-lg text-[var(--sidebar-text-muted)] hover:bg-white/10 hover:text-[var(--sidebar-text)] transition-colors"
          >
            {collapsed ? <ChevronExpand size={15} /> : <ChevronCollapse size={15} />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar trigger */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between bg-[var(--card)]/90 backdrop-blur-md border-b border-[var(--card-border)] px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ms-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
          <MenuIcon size={22} />
        </button>
        <span className="font-extrabold tracking-[-0.01em]">Shklet</span>
        <div className="w-8" />
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-64",
        )}
        style={{ background: "var(--sidebar-bg)" }}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-72 max-w-[80vw] h-full shadow-2xl"
              style={{ background: "var(--sidebar-bg)" }}
              initial={{ x: lang === "ku" ? 320 : -320 }}
              animate={{ x: 0 }}
              exit={{ x: lang === "ku" ? 320 : -320 }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            >
              {content}
            </motion.div>
            <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
