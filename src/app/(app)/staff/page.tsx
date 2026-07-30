"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import toast from "react-hot-toast";
import { Plus, KeyRound, UserX, Users, Wallet } from "lucide-react";

interface City {
  id: string;
  name: string;
  nameKu: string;
}
interface Branch {
  id: string;
  name: string;
  nameKu: string;
  cityId: string;
  city: City;
}
interface Staff {
  id: string;
  username: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  active: boolean;
  monthlySalary: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  city: City | null;
  branch: Branch | null;
}

const ROLE_TONES: Record<Staff["role"], "red" | "purple" | "green"> = {
  ADMIN: "red",
  MANAGER: "purple",
  CASHIER: "green",
};

export default function StaffPage() {
  const { t } = useLanguage();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [cities, setCities] = useState<(City & { branches: Branch[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [settings, setSettings] = useState<{ openingHour: number; closingHour: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [staffRes, citiesRes, settingsRes] = await Promise.all([
      fetch("/api/staff"),
      fetch("/api/cities"),
      fetch("/api/staff/business-hours"),
    ]);
    setStaff((await staffRes.json()).staff ?? []);
    setCities((await citiesRes.json()).cities ?? []);
    setSettings((await settingsRes.json()).settings ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resetPassword(id: string) {
    const res = await fetch(`/api/staff/${id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      toast.success(t("staff.passwordReset", { password: data.newPassword }), { duration: 10000 });
    }
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (res.ok) {
      toast.success(t("staff.staffDeactivated"));
      load();
    }
  }

  async function saveHours(opening: number, closing: number) {
    const res = await fetch("/api/staff/business-hours", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingHour: opening, closingHour: closing }),
    });
    if (res.ok) {
      toast.success(t("common.success"));
      load();
    }
  }

  const totalPayroll = staff.reduce((sum, s) => sum + (s.monthlySalary ?? 0), 0);

  const roleLabel: Record<Staff["role"], string> = {
    ADMIN: t("staff.roleAdmin"),
    MANAGER: t("staff.roleManager"),
    CASHIER: t("staff.roleCashier"),
  };

  return (
    <div>
      <PageHeader
        title={t("staff.header")}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t("staff.addStaffMember")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <StatCard label={t("staff.totalPayroll")} value={formatMoney(totalPayroll)} icon={Wallet} tone="red" />
        <StatCard label={t("staff.header")} value={String(staff.length)} icon={Users} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-5">
          <h3 className="font-bold mb-1.5">{t("staff.businessHours")}</h3>
          <p className="text-xs text-[var(--muted)] mb-4">{t("staff.businessHoursHint")}</p>
          {settings && (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label>{t("staff.openingHour")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={settings.openingHour}
                  className="w-24"
                  onBlur={(e) => saveHours(Number(e.target.value), settings.closingHour)}
                />
              </div>
              <div>
                <Label>{t("staff.closingHour")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={settings.closingHour}
                  className="w-24"
                  onBlur={(e) => saveHours(settings.openingHour, Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="skeleton rounded-2xl h-64" />
      ) : (
        <Card>
          <CardContent className="pt-5 overflow-x-auto">
            {staff.length === 0 ? (
              <EmptyState icon={Users} title={t("common.noResultsFound")} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-[11px] font-bold uppercase tracking-wide text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="pb-3 text-start">{t("staff.tableName")}</th>
                    <th className="pb-3 text-start">{t("staff.tableUsername")}</th>
                    <th className="pb-3 text-start">{t("staff.tableRole")}</th>
                    <th className="pb-3 text-start">{t("staff.tableCityBranch")}</th>
                    <th className="pb-3 text-start">{t("staff.tableStatus")}</th>
                    <th className="pb-3 text-start">{t("staff.tableDateAdded")}</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-[var(--card-border-soft)] last:border-0 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-3 font-semibold">{s.fullName}</td>
                      <td className="py-3 text-[var(--muted)]">{s.username}</td>
                      <td className="py-3">
                        <Badge tone={ROLE_TONES[s.role]}>{roleLabel[s.role]}</Badge>
                      </td>
                      <td className="py-3 text-[var(--muted)]">
                        {s.branch ? `${s.branch.city.name} — ${s.branch.name}` : s.city?.name ?? "—"}
                      </td>
                      <td className="py-3">
                        <Badge tone={s.active ? "green" : "neutral"}>
                          {s.active ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </td>
                      <td className="py-3 ltr-nums text-[var(--muted)]">{formatDate(s.createdAt)}</td>
                      <td className="py-3 text-end whitespace-nowrap">
                        <button
                          onClick={() => resetPassword(s.id)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                          title={t("staff.resetPassword")}
                        >
                          <KeyRound size={14} />
                        </button>
                        {s.active && (
                          <button
                            onClick={() => deactivate(s.id)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-shklet-red/10"
                            title={t("staff.deactivateAccount")}
                          >
                            <UserX size={14} className="text-shklet-red" />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <StaffFormModal
        open={showForm}
        cities={cities}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          load();
        }}
      />
    </div>
  );
}

function StaffFormModal({
  open,
  cities,
  onClose,
  onSaved,
}: {
  open: boolean;
  cities: (City & { branches: Branch[] })[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "CASHIER">("CASHIER");
  const [cityId, setCityId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        username,
        password,
        role,
        cityId: role === "MANAGER" ? cityId : undefined,
        branchId: role === "CASHIER" ? branchId : undefined,
        monthlySalary: monthlySalary ? Number(monthlySalary) : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("staff.staffSaved"));
      onSaved();
    } else {
      const data = await res.json();
      toast.error(data.error ?? t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("staff.addStaffMember")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div>
          <Label>{t("staff.fullName")}</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("staff.username")}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>{t("staff.password")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("staff.role")}</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="ADMIN">{t("staff.roleAdmin")}</option>
            <option value="MANAGER">{t("staff.roleManager")}</option>
            <option value="CASHIER">{t("staff.roleCashier")}</option>
          </Select>
        </div>
        {role === "MANAGER" && (
          <div>
            <Label>{t("staff.assignedCity")}</Label>
            <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {role === "CASHIER" && (
          <div>
            <Label>{t("staff.assignedBranch")}</Label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">—</option>
              {cities.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {c.name} — {b.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>{t("staff.monthlySalary")}</Label>
          <Input type="number" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
