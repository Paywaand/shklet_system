"use client";

import { useMemo, useState } from "react";
import { Download, Trash2, Settings2 } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, num, duration, shortDate, shortTime, dateTimeFull } from "@/lib/format";
import {
  currentBusinessDay,
  getBusinessDayBounds,
  businessDayRangeISO,
  type BusinessHours,
} from "@/lib/businessDay";
import type { DeliveryOrder } from "@/lib/types";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Platform = { branch: string; platformName: string; commissionPct: number; color: string };

type DeliveryData = {
  platform: Platform;
  summary: {
    gross: number;
    commission: number;
    net: number;
    orderCount: number;
    avgPrepSeconds: number | null;
    avgArriveSeconds: number | null;
  };
  orders: DeliveryOrder[];
  monthly: { month: string; gross: number; net: number; commission: number; count: number }[];
};

type RangeKey = "month" | "lastMonth" | "custom";

// Ranges are in BUSINESS days (configurable open → close).
function rangeDates(key: RangeKey, cFrom: string, cTo: string, hours: BusinessHours) {
  const today = currentBusinessDay(new Date(), hours);
  if (key === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return businessDayRangeISO(start, today, hours);
  }
  if (key === "lastMonth") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return businessDayRangeISO(start, lastOfPrevMonth, hours);
  }
  return {
    from: cFrom ? getBusinessDayBounds(new Date(cFrom + "T00:00:00"), hours).start.toISOString() : "",
    to: cTo ? getBusinessDayBounds(new Date(cTo + "T00:00:00"), hours).end.toISOString() : "",
  };
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function DeliveryPage() {
  const { user, businessHours } = useSession();
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const url = useMemo(() => {
    const { from, to } = rangeDates(range, cFrom, cTo, businessHours);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return `/api/delivery?${qs.toString()}`;
  }, [range, cFrom, cTo, businessHours]);

  const { data, loading, error, reload } = useFetch<DeliveryData>(url);
  const color = data?.platform.color ?? "#0fb79b";
  const platformName = data?.platform.platformName ?? "Delivery";

  function exportCsv() {
    const orders = data?.orders ?? [];
    const rows = [
      ["Date", "Reference", "Items", "Gross (IQD)", "Commission (IQD)", "Net (IQD)", "Placed→Ready", "Ready→Driver", "Status"],
      ...orders.map((o) => [
        dateTimeFull(o.placedAt),
        o.reference ?? "",
        o.items.map((i) => `${i.quantity}x ${i.name}`).join("; "),
        o.grossTotal,
        o.grossTotal - o.netTotal,
        o.netTotal,
        o.prepSeconds != null ? duration(o.prepSeconds) : "",
        o.arriveSeconds != null ? duration(o.arriveSeconds) : "",
        o.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${platformName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function deleteOrder(o: DeliveryOrder) {
    if (!confirm(`Are you sure you want to delete this ${platformName} order?`)) return;
    setDeletingId(o.id);
    try {
      await apiSend(`/api/delivery-orders/${o.id}`, "DELETE");
      toast.show("Delivery order deleted");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed to delete", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={platformName}
        subtitle={`Delivery revenue — isolated from branch sales · commission ${data?.platform.commissionPct ?? "…"}%`}
      />

      {/* Range filter + settings */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["month", "lastMonth", "custom"] as RangeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`btn px-4 py-2 text-sm ${range === k ? "text-white" : "bg-black/5 dark:bg-white/10"}`}
            style={range === k ? { backgroundColor: color } : undefined}
          >
            {k === "month" ? "This month" : k === "lastMonth" ? "Last month" : "Custom"}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 w-auto" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
            <span className="opacity-50">→</span>
            <input type="date" className="input py-2 w-auto" value={cTo} onChange={(e) => setCTo(e.target.value)} />
          </div>
        )}
        {isAdmin && data && (
          <button onClick={() => setSettingsOpen(true)} className="btn-ghost px-3 py-2 text-sm ml-auto">
            <Settings2 size={16} /> Platform settings
          </button>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Stat label="Gross revenue" value={iqd(data.summary.gross)} color={color} />
            <Stat label={`Commission (${data.platform.commissionPct}%)`} value={`- ${iqd(data.summary.commission)}`} red color={color} />
            <Stat label="Net receivable" value={iqd(data.summary.net)} accent color={color} />
            <Stat label="Orders" value={num(data.summary.orderCount)} color={color} />
            <Stat label="Avg prep time" value={duration(data.summary.avgPrepSeconds)} color={color} />
            <Stat label="Avg ready → driver" value={duration(data.summary.avgArriveSeconds)} color={color} />
          </div>

          {/* Monthly breakdown */}
          <section className="card p-4 mb-5">
            <h2 className="font-extrabold text-lg mb-3">Monthly breakdown</h2>
            {data.monthly.length === 0 ? (
              <EmptyState title={`No ${platformName} orders yet`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                      <th className="py-2 pr-3">Month</th>
                      <th className="py-2 pr-3">Orders</th>
                      <th className="py-2 pr-3">Gross</th>
                      <th className="py-2 pr-3">Commission</th>
                      <th className="py-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((m) => (
                      <tr key={m.month} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-3 font-semibold">{monthLabel(m.month)}</td>
                        <td className="py-2 pr-3">{num(m.count)}</td>
                        <td className="py-2 pr-3">{iqd(m.gross)}</td>
                        <td className="py-2 pr-3 text-red-500">- {iqd(m.commission)}</td>
                        <td className="py-2 font-bold" style={{ color }}>
                          {iqd(m.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* History */}
          <section className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-lg">Order history</h2>
              <button onClick={exportCsv} className="btn-ghost px-3 py-2 text-sm">
                <Download size={16} /> CSV
              </button>
            </div>
            {data.orders.length === 0 ? (
              <EmptyState title={`No ${platformName} orders in this range`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Ref</th>
                      <th className="py-2 pr-3">Items</th>
                      <th className="py-2 pr-3">Gross</th>
                      <th className="py-2 pr-3">Net</th>
                      <th className="py-2 pr-3">Prep</th>
                      <th className="py-2 pr-3">→ Driver</th>
                      <th className="py-2">Status</th>
                      {isAdmin && <th className="py-2 pl-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-3 opacity-70 whitespace-nowrap">
                          {shortDate(o.placedAt)} {shortTime(o.placedAt)}
                        </td>
                        <td className="py-2 pr-3">{o.reference || "—"}</td>
                        <td className="py-2 pr-3 max-w-[200px] truncate">
                          {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                        </td>
                        <td className="py-2 pr-3 font-bold">{num(o.grossTotal)}</td>
                        <td className="py-2 pr-3 font-bold" style={{ color }}>
                          {num(o.netTotal)}
                        </td>
                        <td className="py-2 pr-3 opacity-70">{duration(o.prepSeconds)}</td>
                        <td className="py-2 pr-3 opacity-70">{duration(o.arriveSeconds)}</td>
                        <td className="py-2">
                          <span className="chip bg-black/10 dark:bg-white/10">{o.status.replace("_", " ")}</span>
                        </td>
                        {isAdmin && (
                          <td className="py-2 pl-3 text-right">
                            <button
                              onClick={() => deleteOrder(o)}
                              disabled={deletingId === o.id}
                              title="Delete order"
                              aria-label="Delete order"
                              className="btn-ghost size-8 rounded-lg text-red-500 disabled:opacity-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {settingsOpen && (
            <PlatformSettingsModal
              platform={data.platform}
              onClose={() => setSettingsOpen(false)}
              onSaved={() => {
                setSettingsOpen(false);
                reload();
              }}
            />
          )}
        </>
      ) : null}
    </>
  );
}

// Admin-only: edit the branch's delivery platform name + commission %. Existing
// orders keep their snapshotted commission — only future orders use the new value.
function PlatformSettingsModal({
  platform,
  onClose,
  onSaved,
}: {
  platform: Platform;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(platform.platformName);
  const [pct, setPct] = useState(String(platform.commissionPct));
  const [color, setColor] = useState(platform.color);
  const [saving, setSaving] = useState(false);

  const pctNum = Number(pct);
  const valid = name.trim().length > 0 && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await apiSend("/api/delivery/settings", "PATCH", {
        platformName: name.trim(),
        commissionPct: pctNum,
        color,
      });
      toast.show("Delivery settings saved");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed to save", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Delivery platform settings">
      <p className="text-sm opacity-70 mb-3">
        This branch&apos;s delivery app and the commission it takes. Changing the percentage only
        affects <strong>future</strong> orders — existing orders keep the rate they were placed with.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Platform name</label>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Commission %</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <p className="text-xs opacity-50 mt-1">
            e.g. 20 means the platform keeps 20% — net = gross × {(1 - (pctNum || 0) / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <label className="label">Accent color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 rounded-lg border border-black/10 dark:border-white/10 bg-transparent"
            />
            <span className="text-sm font-mono opacity-70">{color}</span>
          </div>
        </div>
        <button className="btn-primary py-2.5 mt-1" onClick={save} disabled={saving || !valid}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  accent,
  red,
  color,
}: {
  label: string;
  value: string;
  accent?: boolean;
  red?: boolean;
  color: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-extrabold mt-1" style={accent ? { color } : red ? { color: "#ef4444" } : undefined}>
        {value}
      </p>
    </div>
  );
}
