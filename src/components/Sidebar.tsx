"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingCart,
  ClipboardCheck,
  UtensilsCrossed,
  Boxes,
  Receipt,
  CalendarDays,
  BarChart3,
  TrendingUp,
  FileText,
  Factory,
  Calculator,
  Truck,
  Users,
  ShieldCheck,
  Wallet,
  LogOut,
  Menu as MenuIcon,
  X,
  Moon,
  Sun,
  Languages,
} from "lucide-react";
import clsx from "clsx";
import { useSession } from "@/lib/session";
import { apiSend } from "@/lib/client";
import type { PermissionKey } from "@/lib/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ACTIVE_BRANCH_COOKIE, BRANCHES, BRANCH_LABELS, isBranch, type Branch } from "@/lib/branches";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Either gated by a permission key, or admin-only (no permission key needed,
  // e.g. Cash Tracking which is hard-locked to admins).
  perm?: PermissionKey;
  adminOnly?: boolean;
  badge?: number;
};

type NavGroup = { title: string; items: NavItem[] };

export function Sidebar({ lowStockCount, activeBranch }: { lowStockCount?: number; activeBranch?: Branch }) {
  const { user, can } = useSession();
  const { lang, setLang, t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  // Lock background scroll while the mobile drawer is open so touch scrolling
  // stays inside the drawer (and can reach Sign out / Roles at the bottom).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isAdmin = user.role === "admin";
  // Super admin (no fixed branch) can switch the branch being viewed. The choice
  // is stored in a plain cookie the server reads on every request.
  const isSuperAdmin = isAdmin && !isBranch(user.branch);

  function switchBranch(next: Branch) {
    document.cookie = `${ACTIVE_BRANCH_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setOpen(false);
    router.refresh();
    // Full reload so every fetched dataset (menu, queue, analytics…) re-scopes.
    window.location.reload();
  }

  // Grouped navigation. Each item is shown only if the user can access it
  // (permission grant, or admin for admin-only items); groups with no visible
  // items are dropped entirely.
  const groups: NavGroup[] = (
    [
      {
        title: t("nav.groupOperations"),
        items: [
          { href: "/pos", label: t("nav.cashier"), icon: <ShoppingCart size={20} />, perm: "pos.use" },
          { href: "/daily-needs", label: t("nav.dailyNeeds"), icon: <ClipboardCheck size={20} />, perm: "daily.view" },
          { href: "/menu", label: t("nav.menu"), icon: <UtensilsCrossed size={20} />, perm: "menu.manage" },
          { href: "/events", label: "Events", icon: <CalendarDays size={20} />, perm: "events.manage" },
        ],
      },
      {
        title: t("nav.groupInventoryProduction"),
        items: [
          {
            href: "/inventory",
            label: t("nav.warehouse"),
            icon: <Boxes size={20} />,
            perm: "inventory.manage",
            badge: lowStockCount,
          },
          { href: "/production", label: "Production", icon: <Factory size={20} />, perm: "recipes.manage" },
        ],
      },
      {
        title: t("nav.groupFinance"),
        items: [
          { href: "/analytics", label: t("nav.sales"), icon: <BarChart3 size={20} />, perm: "analytics.view" },
          { href: "/cash-tracking", label: "Cash Tracking", icon: <Wallet size={20} />, adminOnly: true },
          { href: "/expenses", label: t("nav.expenses"), icon: <Receipt size={20} />, perm: "expenses.manage" },
          { href: "/profit", label: "Profit", icon: <TrendingUp size={20} />, perm: "profit.view" },
          { href: "/estimated", label: "Est. Profit", icon: <Calculator size={20} />, perm: "estimated.view" },
          { href: "/reports", label: "Reports", icon: <FileText size={20} />, perm: "reports.view" },
          { href: "/delivery", label: "Delivery", icon: <Truck size={20} />, perm: "delivery.view" },
        ],
      },
      {
        title: "Admin",
        items: [
          { href: "/staff", label: "Staff", icon: <Users size={20} />, perm: "staff.manage" },
          { href: "/permissions", label: "Roles", icon: <ShieldCheck size={20} />, perm: "permissions.manage" },
        ],
      },
    ] as NavGroup[]
  )
    .map((g) => ({
      ...g,
      items: g.items.filter((n) => (n.adminOnly ? isAdmin : n.perm ? can(n.perm) : false)),
    }))
    .filter((g) => g.items.length > 0);

  function toggleTheme() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    localStorage.theme = next ? "dark" : "light";
    setDark(next);
  }

  async function logout() {
    await apiSend("/api/auth/logout", "POST");
    router.push("/login");
    router.refresh();
  }

  const NavLinks = () => (
    <nav className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider opacity-40">
            {group.title}
          </p>
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition",
                  active
                    ? "bg-corn text-white"
                    : "text-[var(--text)]/80 hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {!!item.badge && item.badge > 0 && (
                  <span className="chip bg-red-500 text-white">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const Inner = () => (
    <div className="flex flex-col min-h-full">
      <div className="flex flex-col items-center gap-2 px-2 py-2 mb-2">
        <Image
          src="/brand/logo_icon.png"
          alt="Shklet"
          width={160}
          height={160}
          priority
          className="w-24 h-auto"
        />
        <Image src="/brand/logo_text.png" alt="Shklet" width={140} height={40} className="h-7 w-auto" />
      </div>

      {/* Branch indicator / switcher */}
      <div className="mb-4">
        {isSuperAdmin ? (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 dark:bg-white/10 p-1">
            {BRANCHES.map((b) => (
              <button
                key={b}
                onClick={() => activeBranch !== b && switchBranch(b)}
                className={clsx(
                  "rounded-lg px-2 py-1.5 text-xs font-bold transition",
                  activeBranch === b ? "bg-corn text-white" : "opacity-60 hover:opacity-100"
                )}
              >
                {BRANCH_LABELS[b]}
              </button>
            ))}
          </div>
        ) : (
          isBranch(user.branch) && (
            <p className="text-center text-xs font-bold uppercase tracking-wider opacity-50">
              {BRANCH_LABELS[user.branch]}
            </p>
          )
        )}
      </div>

      <NavLinks />

      <div className="mt-auto pt-4 flex flex-col gap-1">
        <button
          onClick={() => setLang(lang === "en" ? "ku" : "en")}
          className="btn-ghost px-3 py-2.5 justify-start font-bold"
        >
          <Languages size={20} />
          {lang === "en" ? "کوردی" : "English"}
        </button>
        <button onClick={toggleTheme} className="btn-ghost px-3 py-2.5 justify-start font-bold">
          {dark ? <Sun size={20} /> : <Moon size={20} />}
          {dark ? t("nav.lightMode") : t("nav.darkMode")}
        </button>
        <div className="rounded-xl px-3 py-2.5 bg-black/5 dark:bg-white/5">
          <p className="font-bold text-sm truncate">{user.fullName}</p>
          <p className="text-xs opacity-60 capitalize">{user.role}</p>
        </div>
        <button onClick={logout} className="btn-ghost px-3 py-2.5 justify-start font-bold text-red-500">
          <LogOut size={20} />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[var(--surface)] border-b border-black/5 dark:border-white/5">
        <Image src="/brand/logo_icon.png" alt="Shklet" width={48} height={48} className="w-10 h-auto" />
        <button onClick={() => setOpen(true)} className="btn-ghost size-10 rounded-xl">
          <MenuIcon size={22} />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)}>
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 bg-[var(--surface)] p-4 overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setOpen(false)} className="btn-ghost size-9 min-h-0 rounded-full mb-2 ml-auto block">
              <X size={18} />
            </button>
            <Inner />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 p-4 bg-[var(--surface)] border-r border-black/5 dark:border-white/5 h-screen sticky top-0 overflow-y-auto">
        <Inner />
      </aside>
    </>
  );
}
