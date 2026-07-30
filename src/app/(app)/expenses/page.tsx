"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { useCurrentUser } from "@/hooks/use-current-user";
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
import { Plus, Trash2, Receipt as ReceiptIcon, Wallet } from "lucide-react";

interface Expense {
  id: string;
  category: "RENT" | "UTILITIES" | "SUPPLIES" | "STAFF" | "OTHER";
  amount: number;
  description: string | null;
  date: string;
  user: { fullName: string };
  event: { name: string } | null;
}

const CATEGORY_KEYS: Record<Expense["category"], string> = {
  RENT: "expenses.categoryRent",
  UTILITIES: "expenses.categoryUtilities",
  SUPPLIES: "expenses.categorySupplies",
  STAFF: "expenses.categoryStaff",
  OTHER: "expenses.categoryOther",
};

const CATEGORY_TONES: Record<Expense["category"], "red" | "green" | "yellow" | "brown" | "purple"> = {
  RENT: "purple",
  UTILITIES: "yellow",
  SUPPLIES: "green",
  STAFF: "brown",
  OTHER: "red",
};

export default function ExpensesPage() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    const res = await fetch(`/api/expenses?${params}`);
    const data = await res.json();
    setExpenses(data.expenses ?? []);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteExpense(id: string) {
    if (!confirm(t("expenses.confirmDeleteExpense"))) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("expenses.expenseDeleted"));
      load();
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <PageHeader
        title={t("expenses.header")}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t("expenses.addExpense")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <StatCard label={t("expenses.total")} value={formatMoney(total)} icon={Wallet} tone="red" />
        <div className="flex items-end">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="max-w-xs">
            <option value="">{t("common.all")}</option>
            {Object.entries(CATEGORY_KEYS).map(([key, labelKey]) => (
              <option key={key} value={key}>
                {t(labelKey as never)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="skeleton rounded-2xl h-64" />
      ) : (
        <Card>
          <CardContent className="pt-5 overflow-x-auto">
            {expenses.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title={t("common.noResultsFound")} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-[11px] font-bold uppercase tracking-wide text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="pb-3 text-start">{t("common.category")}</th>
                    <th className="pb-3 text-start">{t("common.description")}</th>
                    <th className="pb-3 text-start">{t("common.date")}</th>
                    <th className="pb-3 text-end">{t("common.amount")}</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, i) => (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-[var(--card-border-soft)] last:border-0 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-3">
                        <Badge tone={CATEGORY_TONES[e.category]}>{t(CATEGORY_KEYS[e.category] as never)}</Badge>
                      </td>
                      <td className="py-3 text-[var(--muted)]">{e.description ?? "—"}</td>
                      <td className="py-3 ltr-nums">{formatDate(e.date)}</td>
                      <td className="py-3 text-end ltr-nums font-bold">{formatMoney(e.amount)}</td>
                      <td className="py-3 text-end">
                        <button onClick={() => deleteExpense(e.id)} className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-shklet-red/10">
                          <Trash2 size={14} className="text-shklet-red" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <ExpenseFormModal
        open={showForm}
        userCityId={user?.cityId ?? null}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          load();
        }}
      />
    </div>
  );
}

function ExpenseFormModal({
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
  const [category, setCategory] = useState<Expense["category"]>("SUPPLIES");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cityId: userCityId,
        category,
        amount: Number(amount),
        description: description || undefined,
        date,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("expenses.expenseSaved"));
      setAmount("");
      setDescription("");
      onSaved();
    } else {
      toast.error(t("common.somethingWentWrong"));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("expenses.addExpense")}
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
          <Label>{t("common.category")}</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as Expense["category"])}>
            {Object.entries(CATEGORY_KEYS).map(([key, labelKey]) => (
              <option key={key} value={key}>
                {t(labelKey as never)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("expenses.amount")}</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>{t("expenses.descriptionOptional")}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>{t("expenses.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
