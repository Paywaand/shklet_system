"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import toast from "react-hot-toast";
import { Plus, Wallet, Lock, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

interface Deposit {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  user: { fullName: string };
}
interface Withdrawal {
  id: string;
  amount: number;
  source: "SAFE" | "MANAGER";
  recipientName: string;
  date: string;
  note: string | null;
  user: { fullName: string };
}

export default function CashTrackingPage() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [summary, setSummary] = useState<{
    safeBalance: number;
    managerHolds: number;
    withdrawalTotalsByPerson: { name: string; total: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [depRes, wRes, sRes] = await Promise.all([
      fetch("/api/cash-tracking/deposits"),
      fetch("/api/cash-tracking/withdrawals"),
      fetch("/api/cash-tracking/summary"),
    ]);
    setDeposits((await depRes.json()).deposits ?? []);
    setWithdrawals((await wRes.json()).withdrawals ?? []);
    setSummary(await sRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !summary) return <div className="skeleton rounded-2xl h-64" />;

  return (
    <div>
      <PageHeader
        title={t("cashTracking.header")}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowDepositForm(true)}>
              <Plus size={16} /> {t("cashTracking.moveCashToSafe")}
            </Button>
            <Button onClick={() => setShowWithdrawalForm(true)}>
              <Plus size={16} /> {t("cashTracking.recordWithdrawal")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <StatCard label={t("cashTracking.managerHolds")} value={formatMoney(summary.managerHolds)} icon={Wallet} tone="red" />
        <StatCard label={t("cashTracking.safeBalance")} value={formatMoney(summary.safeBalance)} icon={Lock} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <ArrowDownToLine size={16} className="text-shklet-green" /> {t("cashTracking.safeDeposits")}
            </h3>
            <div className="space-y-2.5">
              {deposits.map((d, i) => (
                <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="flex justify-between text-sm border-b border-[var(--card-border-soft)] pb-2.5 last:border-0">
                  <div>
                    <p className="ltr-nums font-bold">{formatMoney(d.amount)}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {d.user.fullName} · {formatDate(d.date)}
                    </p>
                  </div>
                </motion.div>
              ))}
              {deposits.length === 0 && <EmptyState title={t("common.noResultsFound")} className="py-8" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <ArrowUpFromLine size={16} className="text-shklet-red" /> {t("cashTracking.withdrawals")}
            </h3>
            <div className="space-y-2.5">
              {withdrawals.map((w, i) => (
                <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="flex justify-between text-sm border-b border-[var(--card-border-soft)] pb-2.5 last:border-0">
                  <div>
                    <p className="font-bold">{w.recipientName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {w.source} · {formatDate(w.date)}
                    </p>
                  </div>
                  <p className="ltr-nums font-bold">{formatMoney(w.amount)}</p>
                </motion.div>
              ))}
              {withdrawals.length === 0 && <EmptyState title={t("common.noResultsFound")} className="py-8" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="pt-5">
          <h3 className="font-bold mb-3">{t("cashTracking.withdrawalTotalsByPerson")}</h3>
          <div className="space-y-1.5">
            {summary.withdrawalTotalsByPerson.map((p) => (
              <div key={p.name} className="flex justify-between text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="ltr-nums font-bold">{formatMoney(p.total)}</span>
              </div>
            ))}
            {summary.withdrawalTotalsByPerson.length === 0 && (
              <p className="text-sm text-[var(--muted)]">{t("common.noResultsFound")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <DepositFormModal
        open={showDepositForm}
        userCityId={user?.cityId ?? null}
        onClose={() => setShowDepositForm(false)}
        onSaved={() => {
          setShowDepositForm(false);
          load();
        }}
      />
      <WithdrawalFormModal
        open={showWithdrawalForm}
        userCityId={user?.cityId ?? null}
        onClose={() => setShowWithdrawalForm(false)}
        onSaved={() => {
          setShowWithdrawalForm(false);
          load();
        }}
      />
    </div>
  );
}

function DepositFormModal({
  open,
  userCityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  userCityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/cash-tracking/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId: userCityId, amount: Number(amount), date, note: note || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("common.success"));
      onSaved();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("cashTracking.moveCashToSafe")}
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
          <Label>{t("cashTracking.amount")}</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>{t("cashTracking.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("cashTracking.noteOptional")}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function WithdrawalFormModal({
  open,
  userCityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  userCityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"SAFE" | "MANAGER">("SAFE");
  const [recipientName, setRecipientName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/cash-tracking/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cityId: userCityId,
        amount: Number(amount),
        source,
        recipientName,
        date,
        note: note || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("common.success"));
      onSaved();
    } else {
      const data = await res.json();
      if (data.error === "EXCEEDS_BALANCE") {
        toast.error(t("cashTracking.exceedsBalance"));
      } else {
        toast.error(t("common.somethingWentWrong"));
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("cashTracking.recordWithdrawal")}
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
          <Label>{t("cashTracking.amount")}</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>{t("cashTracking.source")}</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value as "SAFE" | "MANAGER")}>
            <option value="SAFE">{t("cashTracking.safe")}</option>
            <option value="MANAGER">{t("cashTracking.manager")}</option>
          </Select>
        </div>
        <div>
          <Label>{t("cashTracking.recipient")}</Label>
          <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </div>
        <div>
          <Label>{t("cashTracking.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("cashTracking.noteOptional")}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
