// Builds the branded, print-ready monthly report as a self-contained HTML
// document (inline <style>, brand palette, A4 page). Pure + client-safe (no
// Prisma) so it is shared by the API response type, the on-page <iframe srcDoc>
// preview, and the Download/Print action. Single source of truth → the preview
// is exactly what prints.
import { iqd, num, duration, shortDate, dateTimeFull } from "./format";

export type ItemStat = { name: string; qty: number; revenue: number };

export type MonthlyReport = {
  meta: {
    fromISO: string;
    toISO: string;
    generatedAt: string;
    branch: string;
  };
  sales: {
    revenue: number;
    orderCount: number;
    avgOrderValue: number;
    payment: {
      cash: { count: number; amount: number };
      card: { count: number; amount: number };
    };
  };
  delivery: { platformName: string; gross: number; commission: number; net: number; orderCount: number };
  expenses: { total: number; byCategory: { category: string; amount: number; count: number }[] };
  financials: { ingredientCostIQD: number; netProfit: number };
  ordersByHour: { hour: number; count: number }[];
  timing: {
    avgPrepSeconds: number | null;
    avgWaitSeconds: number | null;
    avgTotalSeconds: number | null;
    slowest: { pagerNumber: number; seconds: number } | null;
    trend: { date: string; avgPrepSeconds: number; orders: number }[];
  };
  topByQuantity: ItemStat[];
  topByRevenue: ItemStat[];
};

// Brand palette (Shklet)
const CORN = "#EC2231"; // brand red
const LEAF = "#3E9B4F"; // success green
const CREAM = "#F2E8DC"; // brand cream
const COCOA = "#1A1A1A"; // ink

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

// Human label for the selected range: "May 2026" when it is a whole calendar
// month, otherwise "1 May 2026 – 31 May 2026".
export function rangeLabel(fromISO: string, toISO: string): string {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  const isMonth =
    from.getDate() === 1 &&
    from.getHours() === 0 &&
    to.getMonth() === from.getMonth() &&
    to.getFullYear() === from.getFullYear();
  if (isMonth) {
    return from.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return `${shortDate(from)} – ${shortDate(to)}`;
}

function statCard(label: string, value: string, accent?: "corn" | "leaf"): string {
  const bar = accent === "corn" ? CORN : accent === "leaf" ? LEAF : COCOA;
  return `<div class="stat"><div class="stat-bar" style="background:${bar}"></div>
    <div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div>`;
}

function sectionTitle(n: number, title: string): string {
  return `<div class="sec-head"><span class="sec-num">${n}</span><h2>${esc(title)}</h2></div>`;
}

function tableRows(rows: string[]): string {
  return rows.map((r, i) => `<tr class="${i % 2 ? "alt" : ""}">${r}</tr>`).join("");
}

// ---- Sections ----
function salesSection(r: MonthlyReport): string {
  const { sales, delivery } = r;
  const cards = [
    statCard("Revenue", iqd(sales.revenue), "leaf"),
    statCard("Orders", num(sales.orderCount)),
    statCard("Avg Order", iqd(sales.avgOrderValue)),
    statCard(`${delivery.platformName} Net`, iqd(delivery.net), "corn"),
  ].join("");
  const payRows = tableRows([
    `<td>Cash</td><td class="r">${num(sales.payment.cash.count)}</td><td class="r">${iqd(sales.payment.cash.amount)}</td>`,
    `<td>Card</td><td class="r">${num(sales.payment.card.count)}</td><td class="r">${iqd(sales.payment.card.amount)}</td>`,
  ]);
  return `${sectionTitle(1, "Sales Summary")}
    <div class="stats">${cards}</div>
    <div class="two-col">
      <div>
        <h3>Payment split</h3>
        <table><thead><tr><th>Method</th><th class="r">Orders</th><th class="r">Amount</th></tr></thead>
        <tbody>${payRows}</tbody></table>
      </div>
      <div>
        <h3>${esc(delivery.platformName)} (delivery)</h3>
        <table><tbody>
          <tr><td>Gross</td><td class="r">${iqd(delivery.gross)}</td></tr>
          <tr class="alt"><td>Commission</td><td class="r">−${num(delivery.commission)} IQD</td></tr>
          <tr><td><strong>Net received</strong></td><td class="r"><strong>${iqd(delivery.net)}</strong></td></tr>
          <tr class="alt"><td>Orders</td><td class="r">${num(delivery.orderCount)}</td></tr>
        </tbody></table>
      </div>
    </div>`;
}

function expensesSection(r: MonthlyReport): string {
  const { expenses, financials, sales } = r;
  const rows = expenses.byCategory.length
    ? tableRows(
        expenses.byCategory.map(
          (c) => `<td>${esc(c.category)}</td><td class="r">${num(c.count)}</td><td class="r">${iqd(c.amount)}</td>`
        )
      )
    : `<tr><td colspan="3" class="muted">No expenses recorded this period.</td></tr>`;
  return `${sectionTitle(2, "Expenses")}
    <table><thead><tr><th>Category</th><th class="r">Entries</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td><strong>Total expenses</strong></td><td></td><td class="r"><strong>${iqd(expenses.total)}</strong></td></tr></tfoot>
    </table>
    <div class="stats" style="margin-top:10px">
      ${statCard("Revenue", iqd(sales.revenue), "leaf")}
      ${statCard("Expenses", iqd(expenses.total))}
      ${statCard("Ingredient cost", iqd(financials.ingredientCostIQD))}
      ${statCard("Net profit", iqd(financials.netProfit), financials.netProfit >= 0 ? "leaf" : "corn")}
    </div>
    <p class="note">Net profit = revenue − expenses − warehouse ingredient cost (delivery-platform revenue kept separate).</p>`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// ISO instant → local YYYY-MM-DD (matches the report route's local day keys).
function isoToLocalKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Monday-based weekday index (0 = Mon … 6 = Sun).
const mondayIdx = (d: Date) => (d.getDay() + 6) % 7;
// Compact m:ss for calendar cells.
function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${pad2(s)}`;
}

// Orders by hour as a clean vertical bar chart (00 → 23 in order).
function hoursSection(r: MonthlyReport): string {
  const max = Math.max(1, ...r.ordersByHour.map((h) => h.count));
  const cols = r.ordersByHour
    .map((h) => {
      const pct = h.count > 0 ? Math.max(3, Math.round((h.count / max) * 86)) : 0;
      return `<div class="hcol">
        <span class="hcol-n">${h.count || ""}</span>
        <span class="hcol-bar" style="height:${pct}%"></span>
        <span class="hcol-h">${h.hour % 3 === 0 ? pad2(h.hour) : ""}</span>
      </div>`;
    })
    .join("");
  return `${sectionTitle(3, "Orders by Hour")}
    <p class="note">Orders placed in each hour of the day — taller bar = busier hour (labels every 3 h).</p>
    <div class="hourchart">${cols}</div>`;
}

// Daily average prep time as a compact calendar heat-map.
function prepCalendar(r: MonthlyReport): string {
  const trend = r.timing.trend;
  if (!trend.length) return `<p class="muted">No timing data.</p>`;
  const byDate = new Map(trend.map((t) => [t.date, t]));
  const preps = trend.map((t) => t.avgPrepSeconds);
  const min = Math.min(...preps);
  const max = Math.max(...preps);
  const heat = (sec: number) => {
    const ratio = max > min ? (sec - min) / (max - min) : 0; // 0 = fastest, 1 = slowest
    if (ratio < 0.34) return "rgba(62,155,79,0.18)"; // leaf
    if (ratio < 0.67) return "rgba(236,34,49,0.14)"; // corn
    return "rgba(192,57,43,0.28)"; // red
  };

  const startKey = isoToLocalKey(r.meta.fromISO);
  const endKey = isoToLocalKey(r.meta.toISO);
  const cursor = parseKey(startKey);
  cursor.setDate(cursor.getDate() - mondayIdx(cursor)); // back to Monday
  const last = parseKey(endKey);
  last.setDate(last.getDate() + (6 - mondayIdx(last))); // forward to Sunday

  const cells: string[] = [];
  while (cursor <= last) {
    const key = keyOf(cursor);
    const inPeriod = key >= startKey && key <= endKey;
    if (!inPeriod) {
      cells.push(`<div class="cal-cell cal-out"></div>`);
    } else {
      const t = byDate.get(key);
      const bg = t ? `background:${heat(t.avgPrepSeconds)}` : "";
      const val = t
        ? `<span class="cal-v">${mmss(t.avgPrepSeconds)}</span>`
        : `<span class="cal-v cal-empty">·</span>`;
      cells.push(
        `<div class="cal-cell" style="${bg}"><span class="cal-d">${cursor.getDate()}</span>${val}</div>`
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map((d) => `<div class="cal-hd">${d}</div>`)
    .join("");
  const weeks: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(`<div class="cal-week">${cells.slice(i, i + 7).join("")}</div>`);
  }

  return `<div class="calendar">
      <div class="cal-head">${weekdays}</div>
      ${weeks.join("")}
    </div>
    <div class="cal-legend">
      <span>Faster</span>
      <span class="cal-sw" style="background:rgba(62,155,79,0.18)"></span>
      <span class="cal-sw" style="background:rgba(236,34,49,0.14)"></span>
      <span class="cal-sw" style="background:rgba(192,57,43,0.28)"></span>
      <span>Slower · m:ss avg prep</span>
    </div>`;
}

// One horizontal bar chart (used for both Top Items lists).
function barChart(
  items: { name: string; value: number }[],
  max: number,
  valueFn: (v: number) => string
): string {
  if (!items.length) return `<p class="muted">No items sold.</p>`;
  return `<div class="barchart">${items
    .map((it, idx) => {
      const pct = Math.max(3, Math.round((it.value / max) * 100));
      const color = idx === 0 ? LEAF : CORN;
      return `<div class="bc-row">
        <span class="bc-name" title="${esc(it.name)}">${esc(it.name)}</span>
        <span class="bc-track"><span class="bc-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="bc-val">${valueFn(it.value)}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function timingSection(r: MonthlyReport): string {
  const { timing } = r;
  const cards = [
    statCard("Avg prep (placed → ready)", duration(timing.avgPrepSeconds), "leaf"),
    statCard("Avg wait (ready → collected)", duration(timing.avgWaitSeconds)),
    statCard("Avg total time", duration(timing.avgTotalSeconds)),
    statCard(
      "Slowest order",
      timing.slowest ? `#${timing.slowest.pagerNumber} · ${duration(timing.slowest.seconds)}` : "—"
    ),
  ].join("");
  return `${sectionTitle(4, "Prep & Ready Time Trends")}
    <div class="stats">${cards}</div>
    <h3 style="margin-top:14px">Daily average prep time</h3>
    ${prepCalendar(r)}`;
}

function topItemsSection(r: MonthlyReport): string {
  const q = r.topByQuantity.slice(0, 8).map((i) => ({ name: i.name, value: i.qty }));
  const rev = r.topByRevenue.slice(0, 8).map((i) => ({ name: i.name, value: i.revenue }));
  const qMax = Math.max(1, ...q.map((x) => x.value));
  const rMax = Math.max(1, ...rev.map((x) => x.value));
  return `${sectionTitle(5, "Top Items")}
    <div class="two-col">
      <div><h3>By quantity</h3>${barChart(q, qMax, (v) => `${num(v)} sold`)}</div>
      <div><h3>By revenue</h3>${barChart(rev, rMax, (v) => iqd(v))}</div>
    </div>`;
}

const STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    color: ${COCOA}; background: #fff; font-size: 12px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc { max-width: 820px; margin: 0 auto; padding: 28px 32px 40px; }
  .cover { display: flex; align-items: center; gap: 16px; border-bottom: 4px solid ${CORN}; padding-bottom: 16px; }
  .cover img { width: 64px; height: 64px; object-fit: contain; }
  .cover h1 { margin: 0; font-size: 26px; letter-spacing: -0.5px; }
  .cover .sub { margin: 2px 0 0; font-size: 13px; opacity: 0.7; font-weight: 600; }
  .cover .period { margin-left: auto; text-align: right; }
  .cover .period .pl { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; }
  .cover .period .pv { font-size: 18px; font-weight: 800; color: ${LEAF}; }
  .cover .period .pg { font-size: 10px; opacity: 0.55; margin-top: 2px; }

  section { margin-top: 26px; page-break-inside: avoid; }
  .sec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .sec-num {
    width: 26px; height: 26px; border-radius: 8px; background: ${COCOA}; color: #fff;
    font-weight: 800; font-size: 13px; display: inline-flex; align-items: center; justify-content: center;
  }
  .sec-head h2 { margin: 0; font-size: 17px; letter-spacing: -0.3px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 0 0 6px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { position: relative; background: ${CREAM}; border-radius: 12px; padding: 12px 12px 12px 16px; overflow: hidden; }
  .stat-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.65; font-weight: 700; }
  .stat-value { font-size: 17px; font-weight: 800; margin-top: 3px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 14px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 7px 10px; font-size: 11.5px; }
  thead th { background: ${COCOA}; color: #fff; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody tr.alt { background: ${CREAM}; }
  tbody td { border-bottom: 1px solid #efe7dd; }
  tfoot td { border-top: 2px solid ${CORN}; font-size: 12px; padding-top: 8px; }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.over { color: #c0392b; font-weight: 700; }
  td.under { color: ${LEAF}; font-weight: 700; }
  .over { color: #c0392b; font-weight: 700; }
  .under { color: ${LEAF}; font-weight: 700; }
  .muted { opacity: 0.55; font-style: italic; }
  .note { font-size: 10.5px; opacity: 0.7; margin: 6px 0 8px; }

  /* Orders-by-hour vertical bar chart */
  .hourchart { display: flex; align-items: flex-end; gap: 3px; height: 150px; margin-top: 8px; padding-bottom: 16px; border-bottom: 2px solid #e7ddd0; }
  .hcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
  .hcol-n { font-size: 8px; font-weight: 700; margin-bottom: 2px; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .hcol-bar { width: 100%; max-width: 16px; background: ${CORN}; border-radius: 4px 4px 0 0; }
  .hcol-h { position: absolute; bottom: -15px; font-size: 8.5px; opacity: 0.6; font-variant-numeric: tabular-nums; }

  /* Prep-time calendar heat-map */
  .calendar { margin-top: 8px; }
  .cal-head, .cal-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-head { margin-bottom: 5px; }
  .cal-hd { text-align: center; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.55; font-weight: 700; }
  .cal-week { margin-bottom: 4px; }
  .cal-cell { min-height: 40px; border: 1px solid #efe7dd; border-radius: 7px; padding: 3px 5px; display: flex; flex-direction: column; justify-content: space-between; }
  .cal-out { border-color: transparent; background: transparent; }
  .cal-d { font-size: 9px; font-weight: 700; opacity: 0.5; }
  .cal-v { font-size: 12px; font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }
  .cal-empty { opacity: 0.3; font-weight: 600; }
  .cal-legend { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 10px; opacity: 0.7; }
  .cal-sw { width: 16px; height: 12px; border-radius: 3px; display: inline-block; }

  /* Top-items horizontal bar charts */
  .barchart { display: flex; flex-direction: column; gap: 7px; margin-top: 2px; }
  .bc-row { display: grid; grid-template-columns: 92px 1fr auto; align-items: center; gap: 8px; font-size: 11px; }
  .bc-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bc-track { height: 14px; background: ${CREAM}; border-radius: 7px; overflow: hidden; }
  .bc-fill { display: block; height: 100%; border-radius: 7px; }
  .bc-val { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .foot { margin-top: 34px; padding-top: 12px; border-top: 1px solid #e7ddd0; font-size: 10px; opacity: 0.55; display: flex; justify-content: space-between; }

  @page { size: A4; margin: 14mm; }
`;

// Inner body markup (without <html>/<head>) — used for the srcDoc preview too.
export function reportBody(r: MonthlyReport): string {
  const label = rangeLabel(r.meta.fromISO, r.meta.toISO);
  const generated = dateTimeFull(r.meta.generatedAt);
  return `<div class="doc">
    <header class="cover">
      <img src="/brand/logo_icon.png" alt="Shklet" onerror="this.style.display='none'" />
      <div>
        <h1>Shklet — Monthly Report</h1>
        <p class="sub">${esc(r.meta.branch)}</p>
      </div>
      <div class="period">
        <div class="pl">Reporting period</div>
        <div class="pv">${esc(label)}</div>
        <div class="pg">Generated ${esc(generated)}</div>
      </div>
    </header>
    <section>${salesSection(r)}</section>
    <section>${expensesSection(r)}</section>
    <section>${hoursSection(r)}</section>
    <section>${timingSection(r)}</section>
    <section>${topItemsSection(r)}</section>
    <div class="foot">
      <span>Shklet Sales &amp; Management System · Confidential — internal use only</span>
      <span>${esc(label)}</span>
    </div>
  </div>`;
}

// Full standalone HTML document (for <iframe srcDoc> and print/download).
export function reportDocumentHTML(r: MonthlyReport): string {
  const label = rangeLabel(r.meta.fromISO, r.meta.toISO);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shklet Report — ${esc(label)}</title>
    <style>${STYLE}</style></head>
    <body>${reportBody(r)}</body></html>`;
}
