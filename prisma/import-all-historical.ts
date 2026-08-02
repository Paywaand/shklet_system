// Authoritative full historical import. Reads the 5 per-branch/per-year
// exports in data_to_import/ (Invoices format: invoice_id,date,items,total)
// and loads them into Order/OrderItem.
//
// Idempotent: every row is written with clientId = "hist:<branch>:<invoiceId>"
// (unique), so re-running skips anything already present. `--wipe` first
// removes previously imported rows (pagerNumber 0 + no staff) so the DB ends
// up exactly matching the source files.
//
//   npx tsx prisma/import-all-historical.ts                 # dry run
//   npx tsx prisma/import-all-historical.ts --write --wipe  # full reload
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, "..", "data_to_import");
const WRITE = process.argv.includes("--write");
const WIPE = process.argv.includes("--wipe");

// ----------------------- CSV -----------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ----------------------- Dates -----------------------
// Iraq is UTC+3 year-round. Files record local wall-clock time.
const IRAQ_OFFSET_HOURS = 3;
function parseDate(s: string): Date {
  const [dp, tp] = s.trim().split(" ");
  const [y, m, d] = dp.split("-").map(Number);
  const [h, min] = tp.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - IRAQ_OFFSET_HOURS, min));
}
function monthKey(s: string): string {
  return s.trim().slice(0, 7); // "YYYY-MM"
}

// ----------------------- Item parsing -----------------------
const ITEM_RE = /^(.*) x(\d+)$/;
function normalizeName(raw: string): string {
  let n = raw.trim().toLowerCase().replace(/\s+/g, " ");
  n = n.replace(/nuttela|nutelka|nutela/g, "nutella");
  n = n.replace(/choclate|chocolat\b/g, "chocolate");
  n = n.replace(/pancakes/g, "pancake");
  n = n.replace(/\bspeial\b/g, "special");
  n = n.replace(/\bmaqulba\b/g, "maqluba");
  return n;
}
type ParsedItem = { rawName: string; name: string; quantity: number };
function parseItems(itemsStr: string): ParsedItem[] {
  return itemsStr.split(";").map((p) => {
    const s = p.trim();
    const m = s.match(ITEM_RE);
    if (!m) throw new Error(`Unparseable item: "${s}"`);
    return { rawName: m[1].trim(), name: normalizeName(m[1]), quantity: parseInt(m[2], 10) };
  });
}

// ----------------------- Sources -----------------------
type Src = { file: string; branchName: string; city: "suli" | "erbil"; slug: string };
const SOURCES: Src[] = [
  { file: "60street2025.csv", branchName: "60 Street", city: "suli", slug: "60street" },
  { file: "60street2026.csv", branchName: "60 Street", city: "suli", slug: "60street" },
  { file: "dania2025.csv", branchName: "Dania Trade Center", city: "suli", slug: "dania" },
  { file: "dania2026.csv", branchName: "Dania Trade Center", city: "suli", slug: "dania" },
  { file: "erbil2026.csv", branchName: "Erbil", city: "erbil", slug: "erbil" },
];

type Row = { src: Src; invoiceId: string; dateStr: string; items: ParsedItem[]; total: number };

function loadRows(): Row[] {
  const out: Row[] = [];
  for (const src of SOURCES) {
    const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, src.file), "utf8"))
      .filter((r) => r.length >= 4 && r[0] && r[0] !== "invoice_id");
    for (const r of rows) {
      const [invoiceId, dateStr, itemsStr, totalStr] = r;
      if (!dateStr || !itemsStr) continue;
      out.push({ src, invoiceId, dateStr, items: parseItems(itemsStr), total: parseInt(totalStr, 10) || 0 });
    }
  }
  return out;
}

// Unit prices are not in these exports, so derive them from invoices that
// contain exactly ONE product line: unit price = total / quantity. Keyed by
// month so genuine price changes over time are respected, with an all-time
// fallback for months where an item never appeared alone.
function buildPriceMaps(rows: Row[]) {
  const byMonth = new Map<string, Map<number, number>>();
  const overall = new Map<string, Map<number, number>>();
  const bump = (map: Map<string, Map<number, number>>, key: string, price: number) => {
    if (!map.has(key)) map.set(key, new Map());
    const m = map.get(key)!;
    m.set(price, (m.get(price) ?? 0) + 1);
  };
  for (const r of rows) {
    if (r.items.length !== 1) continue;
    const it = r.items[0];
    if (it.quantity <= 0 || r.total <= 0) continue;
    if (r.total % it.quantity !== 0) continue; // not a clean unit price
    const price = r.total / it.quantity;
    bump(byMonth, `${r.src.branchName}|${it.name}|${monthKey(r.dateStr)}`, price);
    bump(overall, `${r.src.branchName}|${it.name}`, price);
  }
  const pick = (m: Map<string, Map<number, number>>) => {
    const res = new Map<string, number>();
    for (const [k, counts] of m) {
      let best = 0, bestN = -1;
      for (const [p, n] of counts) if (n > bestN) { best = p; bestN = n; }
      res.set(k, best);
    }
    return res;
  };
  return { month: pick(byMonth), overall: pick(overall) };
}

async function main() {
  const branches = await prisma.branch.findMany();
  const branchIdByName = new Map(branches.map((b) => [b.name, b.id]));
  for (const s of SOURCES) {
    if (!branchIdByName.has(s.branchName)) throw new Error(`Branch "${s.branchName}" missing in DB`);
  }

  const rows = loadRows();
  const maps = buildPriceMaps(rows);

  // Build the order payloads, pricing each line.
  let fallbackLines = 0;
  const prepared = rows.map((r) => {
    const priceOf = (name: string): number | null =>
      maps.month.get(`${r.src.branchName}|${name}|${monthKey(r.dateStr)}`) ??
      maps.overall.get(`${r.src.branchName}|${name}`) ??
      null;

    const known = r.items.map((it) => ({ it, price: priceOf(it.name) }));
    const knownSum = known.reduce((s, k) => s + (k.price ?? 0) * k.it.quantity, 0);
    const unknownQty = known.filter((k) => k.price === null).reduce((s, k) => s + k.it.quantity, 0);
    // Anything we couldn't price absorbs whatever the invoice total leaves over.
    const perUnknown = unknownQty > 0 ? Math.max(0, Math.round((r.total - knownSum) / unknownQty)) : 0;
    if (unknownQty > 0) fallbackLines += known.filter((k) => k.price === null).length;

    return {
      clientId: `hist:${r.src.slug}:${r.invoiceId}`,
      branch: r.src.city,
      branchId: branchIdByName.get(r.src.branchName)!,
      total: r.total,
      placedAt: parseDate(r.dateStr),
      items: known.map((k) => ({
        name: k.it.rawName,
        price: k.price ?? perUnknown,
        quantity: k.it.quantity,
      })),
    };
  });

  // Report expected state per branch.
  const byBranch = new Map<string, { n: number; total: number }>();
  for (const r of rows) {
    const cur = byBranch.get(r.src.branchName) ?? { n: 0, total: 0 };
    cur.n++; cur.total += r.total;
    byBranch.set(r.src.branchName, cur);
  }
  console.log(`\n=== Full historical import ${WRITE ? (WIPE ? "(WIPE + WRITE)" : "(WRITE)") : "(DRY RUN)"} ===\n`);
  for (const [name, v] of byBranch) {
    console.log(`${name.padEnd(20)} ${String(v.n).padStart(6)} invoices  ${v.total.toLocaleString().padStart(13)} IQD`);
  }
  console.log(`${"TOTAL".padEnd(20)} ${String(rows.length).padStart(6)} invoices  ${rows.reduce((s, r) => s + r.total, 0).toLocaleString().padStart(13)} IQD`);
  console.log(`\nitem lines priced by fallback: ${fallbackLines}`);

  if (!WRITE) {
    console.log("\nDry run only. Re-run with --write --wipe to load.");
    return prisma.$disconnect();
  }

  if (WIPE) {
    const del = await prisma.order.deleteMany({ where: { pagerNumber: 0, staffId: null } });
    console.log(`\nwiped ${del.count} previously imported orders`);
  }

  // Skip anything already present (idempotent re-runs).
  const existing = new Set(
    (await prisma.order.findMany({ where: { clientId: { startsWith: "hist:" } }, select: { clientId: true } }))
      .map((o) => o.clientId!)
  );
  const todo = prepared.filter((p) => !existing.has(p.clientId));
  console.log(`already present: ${existing.size}, to insert: ${todo.length}\n`);

  // Bulk insert. Creating orders one-at-a-time means a transaction (and several
  // network round-trips) per invoice, which over ~56k rows against a remote DB
  // takes hours. Pre-generating the ids lets orders and their line items each go
  // in as a single multi-row INSERT, cutting it to a few dozen round-trips.
  // Every invoice still becomes its own order row with its own timestamp and
  // its own item rows — nothing is merged or summarised.
  async function withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return withRetry(fn, attempt + 1);
    }
  }

  let created = 0;
  const CHUNK = 500;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const slice = todo.slice(i, i + CHUNK);
    const orderRows = slice.map((o) => ({
      id: randomUUID(),
      clientId: o.clientId,
      branch: o.branch,
      branchId: o.branchId,
      pagerNumber: 0,
      total: o.total,
      paymentMethod: "cash",
      orderType: "walk_in",
      isPaid: true,
      status: "collected",
      placedAt: o.placedAt,
      readyAt: o.placedAt,
      collectedAt: o.placedAt,
    }));
    const itemRows = slice.flatMap((o, idx) =>
      o.items.map((it) => ({ orderId: orderRows[idx].id, ...it }))
    );

    await withRetry(() => prisma.order.createMany({ data: orderRows, skipDuplicates: true }));
    await withRetry(() => prisma.orderItem.createMany({ data: itemRows, skipDuplicates: true }));

    created += slice.length;
    process.stdout.write(`\rImported ${created}/${todo.length}`);
  }
  console.log("\n✓ Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
