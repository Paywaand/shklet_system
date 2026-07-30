"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileText, Lock } from "lucide-react";
import { useFetch } from "@/lib/client";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState } from "@/components/ui";
import { reportDocumentHTML, rangeLabel, type MonthlyReport } from "@/lib/reportDoc";
import { getBusinessDayBounds, businessDayRangeISO, type BusinessHours } from "@/lib/businessDay";

type Mode = "month" | "custom";

// Default to the current calendar month, e.g. "2026-06".
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Business-day-aligned month: the 1st's business day start → the last day's
// business day end (so each month-boundary trading night lands in one month).
function monthRange(m: string, hours: BusinessHours) {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return { from: "", to: "" };
  const firstOfMonth = new Date(y, mo - 1, 1);
  const lastOfMonth = new Date(y, mo, 0);
  return businessDayRangeISO(firstOfMonth, lastOfMonth, hours);
}

function customRange(from: string, to: string, hours: BusinessHours) {
  return {
    from: from ? getBusinessDayBounds(new Date(from + "T00:00:00"), hours).start.toISOString() : "",
    to: to ? getBusinessDayBounds(new Date(to + "T00:00:00"), hours).end.toISOString() : "",
  };
}

export default function ReportsPage() {
  const { can, businessHours } = useSession();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [frameHeight, setFrameHeight] = useState(1100);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Grow the iframe to fit the whole document so it reads as one continuous page
  // (the app page scrolls) instead of an inner scrollbar.
  function fitFrame() {
    const doc = iframeRef.current?.contentDocument;
    const h = doc?.querySelector<HTMLElement>(".doc")?.scrollHeight;
    if (h) setFrameHeight(h + 24);
  }

  const range = useMemo(
    () => (mode === "month" ? monthRange(month, businessHours) : customRange(from, to, businessHours)),
    [mode, month, from, to, businessHours]
  );

  const url = useMemo(() => {
    if (!range.from || !range.to) return null;
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    return `/api/reports/monthly?${qs.toString()}`;
  }, [range]);

  const { data, loading, error, reload } = useFetch<MonthlyReport>(url);

  const docHtml = useMemo(() => (data ? reportDocumentHTML(data) : ""), [data]);

  // Print the isolated report document inside the iframe → "Save as PDF" gives a
  // single, branded file. Printing the iframe (not window.print()) keeps the
  // app's sidebar and the 80mm receipt print rules out of the output.
  function download() {
    const win = iframeRef.current?.contentWindow;
    if (!win || !data) return;
    const prevTitle = document.title;
    const label = rangeLabel(data.meta.fromISO, data.meta.toISO).replace(/\s+/g, "-");
    document.title = `Shklet-Report-${label}`;
    const restore = () => {
      document.title = prevTitle;
      win.removeEventListener("afterprint", restore);
    };
    win.addEventListener("afterprint", restore);
    win.focus();
    win.print();
    // Fallback restore if afterprint never fires (e.g. dialog cancelled silently).
    setTimeout(() => (document.title = prevTitle), 1000);
  }

  // Admin-only. The API also enforces reports.view; this is the friendly UI guard.
  if (!can("reports.view")) {
    return (
      <>
        <PageHeader title="Monthly Report" subtitle="Downloadable monthly report" />
        <div className="card p-10">
          <EmptyState
            icon={<Lock size={36} />}
            title="Admin only"
            hint="Downloadable reports are restricted to administrators."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Monthly Report"
        subtitle="Branded financial & operations report — admin only"
        action={
          <button
            onClick={download}
            disabled={!data || loading}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            <Download size={18} /> Download Report
          </button>
        }
      />

      {/* Period picker */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {(["month", "custom"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`btn px-4 py-2 text-sm capitalize ${
                mode === m ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
              }`}
            >
              {m === "month" ? "Whole month" : "Custom range"}
            </button>
          ))}
        </div>

        {mode === "month" ? (
          <input
            type="month"
            className="input py-2 w-auto"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="opacity-50">→</span>
            <input type="date" className="input py-2 w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        {data && (
          <span className="ml-auto text-sm opacity-60">
            {rangeLabel(data.meta.fromISO, data.meta.toISO)} · {data.sales.orderCount} orders
          </span>
        )}
      </div>

      {/* Preview / states */}
      {!url ? (
        <div className="card p-10">
          <EmptyState icon={<FileText size={36} />} title="Pick a period" hint="Choose a month or a custom date range to build the report." />
        </div>
      ) : loading ? (
        <Loading label="Building report…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/5 dark:border-white/5 text-sm opacity-70">
            <FileText size={16} /> Live preview — this is exactly what downloads.
          </div>
          <iframe
            ref={iframeRef}
            title="Monthly report preview"
            srcDoc={docHtml}
            onLoad={fitFrame}
            className="w-full bg-white"
            style={{ height: `${frameHeight}px`, border: 0 }}
          />
        </div>
      ) : null}
    </>
  );
}
