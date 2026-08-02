"use client";

import { useMemo, useState } from "react";
import { Lock, Trash2, Plus, ArrowUpFromLine, Users, History, RotateCcw, Wallet } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, shortDate, localMonthKey, monthLabel } from "@/lib/format";
import type { CashTracking, CashLogEntry, WithdrawalLogEntry, MoneyLedgerBalance, MoneyLedgerLogEntry } from "@/lib/types";
import { WITHDRAWAL_SOURCES, type WithdrawalSource } from "@/lib/cash";
import { MONEY_LEDGER_BUCKETS, type MoneyLedgerBucket } from "@/lib/moneyLedger";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, Modal } from "@/components/ui";

const BUCKET_LABEL: Record<MoneyLedgerBucket, string> = { pos: "POS", fib: "FIB", delivery: "Delivery" };

// Admin-only Cash Tracking — moved off the Sales (Analytics) page into its own
// section. "Expected Cash on Hand" stays on the Sales page; this page holds the
// safe ledger + withdrawals (manager-holds reconciliation), which is admin-only.
export default function CashTrackingPage() {
  const { user } = useSession();
  const isAdmin = user.role === "admin";

  // null url → not fetched (non-admins never trigger the request).
  const { data, loading, error, reload } = useFetch<CashTracking>(
    isAdmin ? "/api/cash-tracking" : null
  );
  // Real platform name (Toters/Talabat) for the Delivery bucket's label, same
  // convention as the Sales page's balance card.
  const { data: deliverySettings } = useFetch<{ settings: { platformName: string } }>(
    isAdmin ? "/api/delivery/settings" : null
  );
  const bucketLabel: Record<MoneyLedgerBucket, string> = {
    ...BUCKET_LABEL,
    delivery: deliverySettings?.settings.platformName ?? BUCKET_LABEL.delivery,
  };

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Cash Tracking" subtitle="Safe balance & withdrawals" />
        <div className="card p-10 text-center">
          <Lock size={36} className="mx-auto text-corn-600 mb-3" />
          <p className="font-extrabold text-lg">Admin only</p>
          <p className="text-sm opacity-60 mt-1">Cash tracking is restricted to administrators.</p>
        </div>
      </>
    );
  }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Cash Tracking" subtitle="Safe balance & withdrawals — admin only" />
      <CashBaselineCard />
      <CashTrackingSection data={data} onChanged={reload} />
      {MONEY_LEDGER_BUCKETS.map((bucket) => (
        <MoneyLedgerSection key={bucket} bucket={bucket} label={bucketLabel[bucket]} />
      ))}
    </>
  );
}

// Reset point for "Expected Cash on Hand" — cash activity (sales, expenses,
// safe entries, withdrawals) before this instant never counts, regardless of
// what date range is picked. Use this once at go-live so historical/imported
// orders don't inflate the figure.
function CashBaselineCard() {
  const { data, reload } = useFetch<{ baselineAt: string | null }>("/api/cash-settings");
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const baselineAt = data?.baselineAt ?? null;

  async function resetFromNow() {
    if (!confirm("Reset Expected Cash on Hand from right now? Nothing before this moment will count anymore.")) return;
    setSaving(true);
    try {
      await apiSend("/api/cash-settings", "PUT", { baselineAt: new Date().toISOString() });
      toast.show("Expected Cash on Hand reset");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function clearBaseline() {
    setSaving(true);
    try {
      await apiSend("/api/cash-settings", "PUT", { baselineAt: null });
      toast.show("Baseline cleared — back to all-time");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <RotateCcw size={18} className="text-leaf" />
        <h2 className="font-extrabold">Expected Cash on Hand baseline</h2>
      </div>
      <p className="text-xs opacity-60 mb-3">
        {baselineAt
          ? `Cash activity before ${shortDate(baselineAt)} is excluded from Expected Cash on Hand.`
          : "No baseline set — Expected Cash on Hand counts all-time cash activity."}
      </p>
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-2 text-sm" onClick={resetFromNow} disabled={saving}>
          <RotateCcw size={14} /> Reset from today
        </button>
        {baselineAt && (
          <button className="btn-ghost px-3 py-2 text-sm" onClick={clearBaseline} disabled={saving}>
            Clear baseline
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Admin-only Cash Tracking (safe only — adding to safe auto-deducts from manager) ----
function CashTrackingSection({ data, onChanged }: { data: CashTracking; onChanged: () => void }) {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  // Withdrawals view filter: "all" (all-time) or a "YYYY-MM" month key. Only scopes
  // the Withdrawals summary + log — the Safe/Manager balance cards stay all-time.
  const [period, setPeriod] = useState<string>("all");

  async function remove(entry: CashLogEntry) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    try {
      await apiSend(`/api/cash-tracking/${entry.id}?kind=safe`, "DELETE");
      toast.show("Entry deleted");
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function removeWithdrawal(w: WithdrawalLogEntry) {
    if (!confirm(`Delete the ${iqd(w.amount)} withdrawal to ${w.recipient}? This returns that cash to the ${w.source}.`))
      return;
    try {
      await apiSend(`/api/cash-tracking/${w.id}?kind=withdrawal`, "DELETE");
      toast.show("Withdrawal deleted");
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function removeAdjustment(entry: CashLogEntry) {
    if (!confirm("Delete this cash adjustment? This cannot be undone.")) return;
    try {
      await apiSend(`/api/cash-tracking/${entry.id}?kind=adjustment`, "DELETE");
      toast.show("Adjustment deleted");
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  // Distinct months present in the withdrawal log (newest first), for the filter.
  const availableMonths = useMemo(() => {
    const keys = new Set(data.withdrawals.map((w) => localMonthKey(w.date)));
    return Array.from(keys).sort().reverse();
  }, [data.withdrawals]);

  // Withdrawals scoped to the selected period ("all" or a "YYYY-MM" month).
  const filteredWithdrawals = useMemo(
    () =>
      period === "all"
        ? data.withdrawals
        : data.withdrawals.filter((w) => localMonthKey(w.date) === period),
    [data.withdrawals, period]
  );

  // Per-person totals (grouped from the actual rows — recipients are free text)
  // + grand total for the selected period.
  const periodTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const w of filteredWithdrawals) totals[w.recipient] = (totals[w.recipient] ?? 0) + w.amount;
    return totals;
  }, [filteredWithdrawals]);

  const periodTotal = useMemo(
    () => filteredWithdrawals.reduce((s, w) => s + w.amount, 0),
    [filteredWithdrawals]
  );
  const periodLabel = period === "all" ? "all time" : monthLabel(period);

  return (
    <section className="card p-5 mb-5 border-corn/40">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={18} className="text-corn-600" />
        <h2 className="text-lg font-extrabold">Cash Tracking</h2>
        <span className="chip bg-corn/20 text-cocoa text-[11px]">Admin only</span>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4">
          <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">Manager currently holds</p>
          <p className="text-2xl font-extrabold mt-1">{iqd(data.managerHolds)}</p>
          <p className="text-xs opacity-50 mt-0.5">
            Cash sales + historical adjustments − expenses − safe deposits − manager withdrawals
          </p>
        </div>
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4">
          <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">Safe balance</p>
          <p className="text-2xl font-extrabold mt-1 text-leaf">{iqd(data.safeTotal)}</p>
          <p className="text-xs opacity-50 mt-0.5">Sum of all safe deposits</p>
        </div>
      </div>

      {/* Safe Balance log — only section (adding to safe auto-deducts from manager) */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5">
            <Lock size={16} className="text-corn-600" /> Safe Balance
          </h3>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setModal(true)}>
            <Plus size={14} /> Add to safe
          </button>
        </div>
        <p className="text-xs opacity-60">Current safe total</p>
        <p className="text-xl font-extrabold mb-2">{iqd(data.safeTotal)}</p>
        <p className="text-xs opacity-50 mb-2">Adding money to the safe automatically takes it from the manager&apos;s wallet.</p>
        {data.safeEntries.length === 0 ? (
          <p className="text-xs opacity-50 py-2">No safe deposits logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 max-h-56 overflow-y-auto">
            {data.safeEntries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{iqd(e.amount)}</p>
                  <p className="text-xs opacity-60 truncate">
                    {shortDate(e.date)}
                    {e.note ? ` — ${e.note}` : ""}
                  </p>
                </div>
                <button
                  className="btn-ghost size-7 rounded-lg text-red-500 shrink-0"
                  title="Delete entry"
                  onClick={() => remove(e)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historical cash adjustments — income that never passed through the POS
          (e.g. pre-system-activation sales) but is real cash the manager holds. */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5">
            <History size={16} className="text-corn-600" /> Historical Cash Adjustments
          </h3>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setAdjustOpen(true)}>
            <Plus size={14} /> Add adjustment
          </button>
        </div>
        <p className="text-xs opacity-60">Total credited</p>
        <p className="text-xl font-extrabold mb-2">{iqd(data.cashAdjustmentsTotal)}</p>
        <p className="text-xs opacity-50 mb-2">
          Cash the manager genuinely received but that never went through the POS (e.g. sales
          from before the system went live) — credited straight to &quot;Manager currently holds&quot;.
        </p>
        {data.cashAdjustments.length === 0 ? (
          <p className="text-xs opacity-50 py-2">No adjustments logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 max-h-56 overflow-y-auto">
            {data.cashAdjustments.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{iqd(e.amount)}</p>
                  <p className="text-xs opacity-60 truncate">
                    {shortDate(e.date)}
                    {e.note ? ` — ${e.note}` : ""}
                  </p>
                </div>
                <button
                  className="btn-ghost size-7 rounded-lg text-red-500 shrink-0"
                  title="Delete entry"
                  onClick={() => removeAdjustment(e)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Withdrawals — money leaving the business to a named person */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-3 mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-bold flex items-center gap-1.5">
            <ArrowUpFromLine size={16} className="text-corn-600" /> Withdrawals
          </h3>
          <div className="flex items-center gap-2">
            {/* Month / all-time filter (scopes the summary + log below only) */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input py-1.5 text-xs w-auto"
              aria-label="Filter withdrawals by month"
            >
              <option value="all">All time</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setWithdrawOpen(true)}>
              <ArrowUpFromLine size={14} /> Withdraw
            </button>
          </div>
        </div>

        {/* Period total */}
        <div className="rounded-lg bg-corn/10 px-3 py-2 mb-3 flex items-baseline justify-between">
          <span className="text-xs opacity-70">Total withdrawn ({periodLabel})</span>
          <span className="font-extrabold">{iqd(periodTotal)}</span>
        </div>

        {/* By-person summary — grouped from the recorded withdrawals */}
        {Object.keys(periodTotals).length > 0 && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs opacity-60">
              <Users size={13} /> Withdrawals by person ({periodLabel})
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {Object.entries(periodTotals)
                .sort((a, b) => b[1] - a[1])
                .map(([name, totalAmt]) => (
                  <li key={name} className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2">
                    <p className="text-xs opacity-60 truncate">{name}</p>
                    <p className="font-extrabold text-sm">{iqd(totalAmt)}</p>
                  </li>
                ))}
            </ul>
          </>
        )}

        {/* Chronological log (selected period) */}
        {filteredWithdrawals.length === 0 ? (
          <p className="text-xs opacity-50 py-2">
            {data.withdrawals.length === 0
              ? "No withdrawals logged yet."
              : `No withdrawals in ${periodLabel}.`}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 max-h-56 overflow-y-auto">
            {filteredWithdrawals.map((w) => (
              <li key={w.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-bold">
                    {iqd(w.amount)}{" "}
                    <span className="font-semibold opacity-70">→ {w.recipient}</span>
                  </p>
                  <p className="text-xs opacity-60 truncate">
                    {shortDate(w.date)}
                    <span
                      className={
                        "ml-1.5 chip text-[10px] " +
                        (w.source === "safe"
                          ? "bg-leaf/20 text-leaf"
                          : "bg-corn/20 text-cocoa")
                      }
                    >
                      from {w.source}
                    </span>
                    {w.note ? ` — ${w.note}` : ""}
                  </p>
                </div>
                <button
                  className="btn-ghost size-7 rounded-lg text-red-500 shrink-0"
                  title="Delete withdrawal"
                  onClick={() => removeWithdrawal(w)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <SafeDepositModal
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            onChanged();
          }}
        />
      )}

      {withdrawOpen && (
        <WithdrawModal
          safeTotal={data.safeTotal}
          managerHolds={data.managerHolds}
          onClose={() => setWithdrawOpen(false)}
          onSaved={() => {
            setWithdrawOpen(false);
            onChanged();
          }}
        />
      )}

      {adjustOpen && (
        <CashAdjustmentModal
          onClose={() => setAdjustOpen(false)}
          onSaved={() => {
            setAdjustOpen(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

// Credit historical cash that never passed through the POS (e.g. sales from
// before the system went live) straight to "Manager currently holds".
function CashAdjustmentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiSend("/api/cash-tracking", "POST", { kind: "adjustment", date, amount, note });
      toast.show("Cash adjustment added");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add historical cash">
      <p className="text-sm opacity-70 mb-3">
        Use this for real cash the manager received outside the POS (e.g. sales from before
        the system went live) that&apos;s needed to correct &quot;Manager currently holds&quot;.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Date the cash was received</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount (IQD)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !amount}>
          Add
        </button>
      </div>
    </Modal>
  );
}

function SafeDepositModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiSend("/api/cash-tracking", "POST", { kind: "safe", date, amount, note });
      toast.show("Added to safe (taken from manager)");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add money to safe">
      <p className="text-sm opacity-70 mb-3">
        This amount will be automatically deducted from the manager&apos;s wallet.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount (IQD)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !amount}>
          Add to safe
        </button>
      </div>
    </Modal>
  );
}

// Withdraw cash to a named person, sourced from the Safe or the Manager. The amount
// is capped at the chosen source's current balance (also enforced server-side).
function WithdrawModal({
  safeTotal,
  managerHolds,
  onClose,
  onSaved,
}: {
  safeTotal: number;
  managerHolds: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<WithdrawalSource>("manager");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const available = source === "safe" ? safeTotal : managerHolds;
  const amountNum = Math.round(Number(amount));
  const overMax = Number.isFinite(amountNum) && amountNum > available;
  const valid = Number.isFinite(amountNum) && amountNum > 0 && !overMax && recipient.trim().length > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await apiSend("/api/cash-tracking", "POST", {
        kind: "withdrawal",
        source,
        recipient,
        amount: amountNum,
        date,
        note,
      });
      toast.show(`Withdrew ${iqd(amountNum)} from ${source} to ${recipient}`);
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Withdraw cash">
      <p className="text-sm opacity-70 mb-3">
        Money leaving the business to a person. Choose where it comes from — the amount
        can&apos;t exceed that source&apos;s current balance.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Source</label>
          <div className="grid grid-cols-2 gap-2">
            {WITHDRAWAL_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-bold capitalize transition " +
                  (source === s
                    ? "border-corn bg-corn/15 text-cocoa"
                    : "border-black/10 dark:border-white/10 opacity-70")
                }
              >
                {s}
                <span className="block text-[11px] font-semibold opacity-60">
                  {iqd(s === "safe" ? safeTotal : managerHolds)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Recipient</label>
          <input
            className="input"
            placeholder="Who received the cash?"
            value={recipient}
            maxLength={60}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Amount (IQD)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            max={available}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <p className={"text-xs mt-1 " + (overMax ? "text-red-500 font-semibold" : "opacity-50")}>
            {overMax
              ? `Exceeds the ${source} balance (${iqd(available)} available)`
              : `Available in ${source}: ${iqd(available)}`}
          </p>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !valid}>
          Withdraw
        </button>
      </div>
    </Modal>
  );
}

// ---- POS / FIB / Delivery ledgers — same mechanics for all three buckets, so
// one parameterized section + modal instead of tripling near-identical JSX. ----
function MoneyLedgerSection({ bucket, label }: { bucket: MoneyLedgerBucket; label: string }) {
  const toast = useToast();
  const [addKind, setAddKind] = useState<"opening" | "settlement" | null>(null);

  const { data: balance, reload: reloadBalance } = useFetch<MoneyLedgerBalance>(
    `/api/money-ledger?bucket=${bucket}`
  );
  const { data: entriesData, reload: reloadEntries } = useFetch<{ entries: MoneyLedgerLogEntry[] }>(
    `/api/money-ledger/entries?bucket=${bucket}`
  );
  const { data: baselineData, reload: reloadBaseline } = useFetch<{ baselineAt: string | null }>(
    `/api/money-ledger/baseline?bucket=${bucket}`
  );
  const entries = entriesData?.entries ?? [];
  const baselineAt = baselineData?.baselineAt ?? null;

  function reloadAll() {
    reloadBalance();
    reloadEntries();
    reloadBaseline();
  }

  async function resetFromNow() {
    if (!confirm(`Reset the ${label} balance from right now? Nothing before this moment will count anymore.`))
      return;
    try {
      await apiSend("/api/money-ledger/baseline", "PUT", { bucket, baselineAt: new Date().toISOString() });
      toast.show(`${label} balance reset`);
      reloadAll();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function clearBaseline() {
    try {
      await apiSend("/api/money-ledger/baseline", "PUT", { bucket, baselineAt: null });
      toast.show("Baseline cleared — back to all-time");
      reloadAll();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function remove(entry: MoneyLedgerLogEntry) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    try {
      await apiSend(`/api/money-ledger/entries/${entry.id}?bucket=${bucket}`, "DELETE");
      toast.show("Entry deleted");
      reloadAll();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <section className="card p-5 mb-5 border-corn/40">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-corn-600" />
          <h2 className="text-lg font-extrabold">{label}</h2>
          <span className="chip bg-corn/20 text-cocoa text-[11px]">Admin only</span>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setAddKind("opening")}>
            <Plus size={14} /> Opening balance
          </button>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setAddKind("settlement")}>
            <ArrowUpFromLine size={14} /> Settlement
          </button>
        </div>
      </div>

      {balance && (
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 mb-3">
          <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">Running balance</p>
          <p className="text-2xl font-extrabold mt-1">{iqd(balance.runningBalance)}</p>
          <p className="text-xs opacity-50 mt-0.5">
            Opening {iqd(balance.openingTotal)} + this period {iqd(balance.accrual)} − settlements{" "}
            {iqd(balance.settlementTotal)}
          </p>
        </div>
      )}

      <p className="text-xs opacity-60 mb-2">
        {baselineAt
          ? `Activity before ${shortDate(baselineAt)} is excluded from this balance.`
          : "No baseline set — this balance counts all-time activity."}
      </p>
      <div className="flex gap-2 mb-3">
        <button className="btn-ghost px-3 py-2 text-xs" onClick={resetFromNow}>
          <RotateCcw size={13} /> Reset from today
        </button>
        {baselineAt && (
          <button className="btn-ghost px-3 py-2 text-xs" onClick={clearBaseline}>
            Clear baseline
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs opacity-50 py-2">No entries logged yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5 max-h-56 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {e.kind === "settlement" ? "−" : "+"}
                  {iqd(e.amount)}{" "}
                  <span
                    className={
                      "chip text-[10px] ms-1 " +
                      (e.kind === "settlement" ? "bg-red-500/15 text-red-500" : "bg-leaf/20 text-leaf")
                    }
                  >
                    {e.kind}
                  </span>
                </p>
                <p className="text-xs opacity-60 truncate">
                  {shortDate(e.date)}
                  {e.createdBy ? ` — ${e.createdBy.fullName}` : ""}
                  {e.note ? ` — ${e.note}` : ""}
                </p>
              </div>
              <button
                className="btn-ghost size-7 rounded-lg text-red-500 shrink-0"
                title="Delete entry"
                onClick={() => remove(e)}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {addKind && (
        <MoneyLedgerEntryModal
          bucket={bucket}
          kind={addKind}
          label={label}
          onClose={() => setAddKind(null)}
          onSaved={() => {
            setAddKind(null);
            reloadAll();
          }}
        />
      )}
    </section>
  );
}

function MoneyLedgerEntryModal({
  bucket,
  kind,
  label,
  onClose,
  onSaved,
}: {
  bucket: MoneyLedgerBucket;
  kind: "opening" | "settlement";
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiSend("/api/money-ledger/entries", "POST", { bucket, kind, date, amount, note });
      toast.show(kind === "opening" ? "Opening balance added" : "Settlement added");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${label} — ${kind === "opening" ? "Add opening balance" : "Add settlement"}`}>
      <p className="text-sm opacity-70 mb-3">
        {kind === "opening"
          ? `A one-time starting balance for ${label} — money already sitting in this bucket before it started being tracked here.`
          : `Money that left ${label} (e.g. paid out to the bank, or transferred out). Reduces the running balance.`}
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount (IQD)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !amount}>
          Add
        </button>
      </div>
    </Modal>
  );
}
