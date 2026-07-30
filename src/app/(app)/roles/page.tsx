"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { rolesFor, MODULE_KEYS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/datetime";
import type { DictPath } from "@/i18n";
import { Check, Minus, ShieldCheck, Activity } from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  createdAt: string;
  user: { fullName: string };
}

const MODULE_LABEL_KEYS: Record<string, DictPath> = {
  cashier: "sidebar.cashier",
  dailyNeeds: "sidebar.dailyNeeds",
  menu: "sidebar.menu",
  warehouse: "sidebar.warehouse",
  ingredientUsage: "sidebar.ingredientUsage",
  production: "sidebar.production",
  estimatedProfit: "sidebar.estimatedProfit",
  sales: "sidebar.sales",
  expenses: "sidebar.expenses",
  profit: "sidebar.profit",
  cashTracking: "sidebar.cashTracking",
  events: "sidebar.events",
  staff: "sidebar.staff",
  roles: "sidebar.roles",
  reports: "sidebar.reports",
};

export default function RolesPage() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audit-log")
      .then((r) => r.json())
      .then((data) => setLogs(data.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title={t("roles.header")} />

      <Card className="mb-6">
        <CardContent className="pt-5 overflow-x-auto">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={16} className="text-shklet-red" />
            <h3 className="font-bold text-[15px]">{t("roles.permission")}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-[11px] font-bold uppercase tracking-wide text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="pb-3 text-start">{t("roles.permission")}</th>
                <th className="pb-3 text-center">{t("roles.admin")}</th>
                <th className="pb-3 text-center">{t("roles.manager")}</th>
                <th className="pb-3 text-center">{t("roles.cashier")}</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_KEYS.map((key) => {
                const roles = rolesFor(key);
                return (
                  <tr key={key} className="border-b border-[var(--card-border-soft)] last:border-0">
                    <td className="py-2.5 font-medium">{t(MODULE_LABEL_KEYS[key])}</td>
                    <td className="py-2.5 text-center">
                      <PermCell has={roles.includes("ADMIN")} />
                    </td>
                    <td className="py-2.5 text-center">
                      <PermCell has={roles.includes("MANAGER")} />
                    </td>
                    <td className="py-2.5 text-center">
                      <PermCell has={roles.includes("CASHIER")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-[var(--muted)] mt-4">
            This matrix controls module access only — city/branch data scoping is a separate, always-on server-side
            filter applied on top (see module 0).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-shklet-red" />
            <h3 className="font-bold text-[15px]">{t("roles.recentActivity")}</h3>
          </div>
          {loading ? (
            <div className="skeleton rounded-xl h-40" />
          ) : logs.length === 0 ? (
            <EmptyState title={t("roles.noActivityYet")} className="py-8" />
          ) : (
            <div className="space-y-2.5">
              {logs.map((log) => (
                <div key={log.id} className="flex justify-between text-sm border-b border-[var(--card-border-soft)] pb-2.5 last:border-0">
                  <span>{t("roles.activityLine", { staffName: log.user.fullName, action: log.action })}</span>
                  <span className="text-xs text-[var(--muted)] ltr-nums shrink-0 ms-3">{formatDateTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PermCell({ has }: { has: boolean }) {
  return has ? (
    <Check size={15} className="inline text-shklet-green" />
  ) : (
    <Minus size={15} className="inline text-[var(--muted-soft)]" />
  );
}
