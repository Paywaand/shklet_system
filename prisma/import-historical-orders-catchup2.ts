// Catch-up #2: imports 60ty-catchup-june/july.csv and erbil-catchup-june.csv
// (Invoices format, converted from the .xlsx files the user sent) into the
// CURRENT branchId-based schema. Cutoff per branch is read live from the DB
// (MAX placedAt), so this only ever adds the gap — safe to re-run.
//   npx tsx prisma/import-historical-orders-catchup2.ts          # dry run
//   npx tsx prisma/import-historical-orders-catchup2.ts --write
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, "..", "data_to_import");
const WRITE = process.argv.includes("--write");

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
function readRows(fileName: string): string[][] {
  return parseCSV(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}

const IRAQ_OFFSET_HOURS = 3;
function iraqLocalToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h - IRAQ_OFFSET_HOURS, min));
}
function parseDashDate(s: string): Date {
  const [dp, tp] = s.trim().split(" ");
  const [y, m, d] = dp.split("-").map(Number);
  const [h, min] = tp.split(":").map(Number);
  return iraqLocalToUtc(y, m, d, h, min);
}

const ITEM_LINE_RE = /^(.*) - بڕ: ([\d,]+) دانە, نرخ: ([\d,]+), کۆی نرخ: ([\d,]+)$/;
function normalizeName(raw: string): string {
  let n = raw.trim().toLowerCase().replace(/\s+/g, " ");
  n = n.replace(/nuttela|nutelka|nutela/g, "nutella");
  n = n.replace(/choclate|chocolat\b/g, "chocolate");
  n = n.replace(/pancakes/g, "pancake");
  n = n.replace(/^extra (nutella|pistachio)$/, "extra chocolate");
  n = n.replace(/^strawberry breeze drink$/, "strawberry breeze");
  return n;
}
const PRICE_OVERRIDES: Record<string, number> = { "cup no sauce": 3000 };

function buildPriceMap(files: string[]): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const f of files) {
    for (const r of readRows(f).slice(1).filter((r) => r.length >= 6 && r[0])) {
      for (const line of r[5].split("\n")) {
        const m = line.match(ITEM_LINE_RE);
        if (!m) continue;
        const name = normalizeName(m[1]);
        const price = parseInt(m[3].replace(/,/g, ""), 10);
        if (!counts.has(name)) counts.set(name, new Map());
        const pc = counts.get(name)!;
        pc.set(price, (pc.get(price) ?? 0) + 1);
      }
    }
  }
  const map = new Map<string, number>();
  for (const [name, pc] of counts) {
    let best = 0, bestCount = -1;
    for (const [price, count] of pc) if (count > bestCount) { best = price; bestCount = count; }
    map.set(name, best);
  }
  return map;
}

type PreparedItem = { name: string; price: number; quantity: number };
type PreparedOrder = {
  branch: "suli" | "erbil";
  branchId: string;
  paymentMethod: "cash";
  total: number;
  placedAt: Date;
  items: PreparedItem[];
};

const ITEM_QTY_RE = /^(.*) x(\d+)$/;

function parseInvoicesFile(
  fileName: string,
  branch: "suli" | "erbil",
  branchId: string,
  priceMap: Map<string, number>,
  afterCutoff: Date
): { orders: PreparedOrder[]; skippedTest: number; skippedOld: number; fallback: number } {
  const rows = readRows(fileName).filter((r) => r.length >= 4 && r[0] && r[0] !== "invoice_id");
  const out: PreparedOrder[] = [];
  let skippedTest = 0, skippedOld = 0, fallback = 0;
  for (const r of rows) {
    const [, dateStr, itemsStr, totalStr] = r;
    const placedAt = parseDashDate(dateStr);
    if (placedAt <= afterCutoff) { skippedOld++; continue; }
    const parts = itemsStr.split(";").map((s) => s.trim());
    const parsed = parts.map((p) => {
      const m = p.match(ITEM_QTY_RE);
      if (!m) throw new Error(`Bad item "${p}" in ${fileName}`);
      return { rawName: m[1].trim(), quantity: parseInt(m[2], 10) };
    });
    if (parsed.some((p) => normalizeName(p.rawName) === "test")) { skippedTest++; continue; }
    const total = parseInt(totalStr, 10);
    const totalQty = parsed.reduce((s, p) => s + p.quantity, 0);
    const items: PreparedItem[] = parsed.map((p) => {
      const key = normalizeName(p.rawName);
      let price = PRICE_OVERRIDES[key] ?? priceMap.get(key);
      if (price === undefined) { price = totalQty > 0 ? Math.round(total / totalQty) : 0; fallback++; }
      return { name: p.rawName, price, quantity: p.quantity };
    });
    out.push({ branch, branchId, paymentMethod: "cash", total, placedAt, items });
  }
  return { orders: out, skippedTest, skippedOld, fallback };
}

async function main() {
  const branches = await prisma.branch.findMany();
  const sixty = branches.find((b) => b.name === "60 Street")!;
  const erbil = branches.find((b) => b.name === "Erbil")!;

  const suliPriceMap = buildPriceMap([
    "60ty2025-ڕاپۆرتی پسوڵەکان.csv",
    "60ty2026-ڕاپۆرتی پسوڵەکان.csv",
    "Dania 2025-ڕاپۆرتی پسوڵەکان.csv",
  ]);
  const erbilPriceMap = buildPriceMap(["Erbil 2026-ڕاپۆرتی پسوڵەکان.csv"]);

  const files: { file: string; branch: "suli" | "erbil"; branchId: string; priceMap: Map<string, number>; label: string }[] = [
    { file: "60ty-catchup-june.csv", branch: "suli", branchId: sixty.id, priceMap: suliPriceMap, label: "60ty (June file)" },
    { file: "60ty-catchup-july.csv", branch: "suli", branchId: sixty.id, priceMap: suliPriceMap, label: "60ty (July file)" },
    { file: "erbil-catchup-june.csv", branch: "erbil", branchId: erbil.id, priceMap: erbilPriceMap, label: "Erbil (June file)" },
  ];

  console.log(`\n=== Catch-up #2 ${WRITE ? "(WRITING)" : "(DRY RUN)"} ===\n`);
  const allOrders: PreparedOrder[] = [];
  for (const f of files) {
    // Cancelled orders must NOT define the import watermark — a stray cancelled
    // test order dated later than the real data would otherwise cause the whole
    // file to be skipped as "already imported".
    const cutoffAgg = await prisma.order.aggregate({
      where: { branchId: f.branchId, status: { not: "cancelled" } },
      _max: { placedAt: true },
    });
    const cutoff = cutoffAgg._max.placedAt ?? new Date(0);
    const result = parseInvoicesFile(f.file, f.branch, f.branchId, f.priceMap, cutoff);
    allOrders.push(...result.orders);
    console.log(`${f.label}: cutoff ${cutoff.toISOString()}`);
    console.log(`  + ${result.orders.length} new, skipped old ${result.skippedOld}, test ${result.skippedTest}, fallback-priced ${result.fallback}`);
  }
  console.log(`\nTotal new: ${allOrders.length} orders, ${allOrders.reduce((s, o) => s + o.total, 0).toLocaleString()} IQD\n`);

  if (!WRITE) {
    console.log("Dry run only. Re-run with --write to commit.");
    return prisma.$disconnect();
  }

  async function createOne(o: PreparedOrder, attempt = 1): Promise<void> {
    try {
      await prisma.order.create({
        data: {
          branch: o.branch,
          branchId: o.branchId,
          pagerNumber: 0,
          total: o.total,
          paymentMethod: o.paymentMethod,
          orderType: "walk_in",
          isPaid: true,
          status: "collected",
          placedAt: o.placedAt,
          readyAt: o.placedAt,
          collectedAt: o.placedAt,
          items: { create: o.items.map((it) => ({ name: it.name, price: it.price, quantity: it.quantity })) },
        },
      });
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return createOne(o, attempt + 1);
    }
  }

  let created = 0;
  const BATCH = 6;
  for (let i = 0; i < allOrders.length; i += BATCH) {
    const batch = allOrders.slice(i, i + BATCH);
    await Promise.all(batch.map((o) => createOne(o)));
    created += batch.length;
    process.stdout.write(`\rImported ${created}/${allOrders.length}`);
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
