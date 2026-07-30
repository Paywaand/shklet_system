"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, shortDate } from "@/lib/format";
import {
  currentBusinessDay,
  getBusinessDayBounds,
  businessDayRangeISO,
  type BusinessHours,
} from "@/lib/businessDay";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  eventId: string | null;
  createdBy?: { fullName: string } | null;
};

type RangeKey = "month" | "week" | "all" | "custom";

// Ranges are in BUSINESS days (configurable open → close).
function rangeDates(key: RangeKey, cFrom: string, cTo: string, hours: BusinessHours) {
  const today = currentBusinessDay(new Date(), hours);
  if (key === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return businessDayRangeISO(start, today, hours);
  }
  if (key === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return businessDayRangeISO(start, today, hours);
  }
  if (key === "custom")
    return {
      from: cFrom ? getBusinessDayBounds(new Date(cFrom + "T00:00:00"), hours).start.toISOString() : "",
      to: cTo ? getBusinessDayBounds(new Date(cTo + "T00:00:00"), hours).end.toISOString() : "",
    };
  return { from: "", to: "" }; // all
}

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Other"];

function categoryLabel(t: (key: string) => string, category: string): string {
  const key = category.toLowerCase();
  return CATEGORIES.some((c) => c.toLowerCase() === key) ? t(`expenses.categories.${key}`) : category;
}

export default function ExpensesPage() {
  const { user, businessHours } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";
  const [range, setRange] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [category, setCategory] = useState("all");

  const url = useMemo(() => {
    const { from, to } = rangeDates(range, cFrom, cTo, businessHours);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (category !== "all") qs.set("category", category);
    return `/api/expenses?${qs.toString()}`;
  }, [range, cFrom, cTo, category, businessHours]);

  const { data, loading, error, reload } = useFetch<{ expenses: Expense[]; total: number }>(url);

  const toast = useToast();
  const [modal, setModal] = useState<{ open: boolean; expense?: Expense }>({ open: false });

  async function remove(e: Expense) {
    if (!confirm(t("expenses.confirm.deleteExpense"))) return;
    try {
      await apiSend(`/api/expenses/${e.id}`, "DELETE");
      toast.show(t("expenses.toast.expenseDeleted"));
      reload();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t("common.failed"), "error");
    }
  }

  return (
    <>
      <PageHeader
        title={t("expenses.header.title")}
        subtitle={t("expenses.header.subtitle")}
        action={
          <button className="btn-primary px-3 py-2 text-sm" onClick={() => setModal({ open: true })}>
            <Plus size={18} /> {t("expenses.header.addExpense")}
          </button>
        }
      />

      {/* Total summary */}
      <div className="grid grid-cols-1 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">{t("expenses.summary.totalExpenses")}</p>
          <p className="text-2xl font-extrabold text-red-500 mt-1">{iqd(data?.total ?? 0)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["month", "week", "all", "custom"] as RangeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`btn px-4 py-2 text-sm capitalize ${
              range === k ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {k === "month"
              ? t("expenses.filters.thisMonth")
              : k === "week"
              ? t("expenses.filters.last7Days")
              : k === "all"
              ? t("expenses.filters.allTime")
              : t("expenses.filters.custom")}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 w-auto" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
            <span className="opacity-50">→</span>
            <input type="date" className="input py-2 w-auto" value={cTo} onChange={(e) => setCTo(e.target.value)} />
          </div>
        )}
        <select className="input py-2 w-auto ml-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">{t("expenses.filters.allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(t, c)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (data?.expenses.length ?? 0) === 0 ? (
        <EmptyState title={t("expenses.empty.title")} hint={t("expenses.empty.hint")} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                <th className="p-3">{t("expenses.table.date")}</th>
                <th className="p-3">{t("expenses.table.category")}</th>
                <th className="p-3">{t("expenses.table.description")}</th>
                <th className="p-3">{t("expenses.table.amount")}</th>
                <th className="p-3 text-right">{t("expenses.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data!.expenses.map((e) => (
                <tr key={e.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3 opacity-80">{shortDate(e.date)}</td>
                  <td className="p-3">
                    <span className="chip bg-black/10 dark:bg-white/10">{categoryLabel(t, e.category)}</span>
                  </td>
                  <td className="p-3 opacity-80 max-w-[280px] truncate">{e.description || "—"}</td>
                  <td className="p-3 font-bold">{iqd(e.amount)}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button className="btn-ghost size-8 rounded-lg" onClick={() => setModal({ open: true, expense: e })}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-ghost size-8 rounded-lg text-red-500" onClick={() => remove(e)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <ExpenseModal
          expense={modal.expense}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            reload();
          }}
        />
      )}
    </>
  );
}

function ExpenseModal({
  expense,
  onClose,
  onSaved,
}: {
  expense?: Expense;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(
    (expense?.date ?? new Date().toISOString()).slice(0, 10)
  );
  const [category, setCategory] = useState(expense?.category ?? "Supplies");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [linkedTo, setLinkedTo] = useState(expense?.eventId ?? ""); // "" = main 60 Street Branch
  const [source, setSource] = useState((expense as Record<string, unknown>)?.source === "safe" ? "safe" : "manager");
  const [saving, setSaving] = useState(false);
  const events = useFetch<{ events: { id: string; name: string }[] }>("/api/events/active");
  const toast = useToast();
  const { user } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { date, category, description, amount, eventId: linkedTo || null };
      // Only admin can choose the cash source; managers always default to "manager" server-side
      if (isAdmin) payload.source = source;
      if (expense) await apiSend(`/api/expenses/${expense.id}`, "PATCH", payload);
      else await apiSend("/api/expenses", "POST", payload);
      toast.show(t("expenses.toast.expenseSaved"));
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? t("expenses.modal.editExpense") : t("expenses.modal.addExpense")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">{t("common.date")}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("common.category")}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(t, c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("expenses.modal.descriptionOptional")}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("expenses.modal.amountIqd")}</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {/* Admin-only: choose whether to take money from manager or safe */}
        {isAdmin && (
          <div>
            <label className="label">{t("expenses.modal.cashSource")}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource("manager")}
                className={`btn py-2.5 text-sm ${source === "manager" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"}`}
              >
                {t("expenses.modal.managerWallet")}
              </button>
              <button
                type="button"
                onClick={() => setSource("safe")}
                className={`btn py-2.5 text-sm ${source === "safe" ? "bg-corn text-white" : "bg-black/5 dark:bg-white/10"}`}
              >
                {t("expenses.modal.safe")}
              </button>
            </div>
            <p className="text-xs opacity-50 mt-1">
              {source === "safe" ? t("expenses.modal.safeHint") : t("expenses.modal.managerHint")}
            </p>
          </div>
        )}
        <div>
          <label className="label">{t("expenses.modal.linkedTo")}</label>
          <select className="input" value={linkedTo} onChange={(e) => setLinkedTo(e.target.value)}>
            <option value="">{t("common.mainBranch")}</option>
            {(events.data?.events ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                📍 {ev.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !amount}>
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}
