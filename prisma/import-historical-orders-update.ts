// Catch-up import: adds receipts from the new "Invoices"-format exports
// (60ty2026-Invoices-update.csv, dania2026-Invoices-update.csv,
// erbil2026-Invoices-update.csv — converted from the .xlsx files the user sent)
// that are NEWER than whatever is already in the DB from the first historical
// import. The cutoff per branch/location is read live from the DB (MAX placedAt),
// so this only ever adds the gap — safe to re-run (it'll just find nothing new).
//
//   npm run import:historical-orders-update          # dry run
//   npm run import:historical-orders-update -- --write
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const DATA_DIR = path.join(__dirname, "..", "data_to_import");
const WRITE = process.argv.includes("--write");

// ----------------------- CSV parsing (handles quoted multi-line fields) -----------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readRows(fileName: string): string[][] {
  const text = fs.readFileSync(path.join(DATA_DIR, fileName), "utf8");
  return parseCSV(text); // no header to drop — these are re-exported straight from openpyxl
}

// Iraq is UTC+3 year-round (no DST).
const IRAQ_OFFSET_HOURS = 3;
function iraqLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - IRAQ_OFFSET_HOURS, minute));
}

// "2026-07-31 17:30" → UTC Date
function parseDashDate(s: string): Date {
  const [datePart, timePart] = s.trim().split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return iraqLocalToUtc(y, m, d, h, min);
}

// ----------------------- Price lookup (built from the original priced exports) -----------------------
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

const PRICE_OVERRIDES: Record<string, number> = {
  "cup no sauce": 3000,
};

function buildPriceMap(receiptReportFiles: string[]): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const fileName of receiptReportFiles) {
    const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8")).slice(1);
    for (const r of rows) {
      if (r.length < 6 || !r[0]) continue;
      for (const line of r[5].split("\n")) {
        const m = line.match(ITEM_LINE_RE);
        if (!m) continue;
        const name = normalizeName(m[1]);
        const price = parseInt(m[3].replace(/,/g, ""), 10);
        if (!counts.has(name)) counts.set(name, new Map());
        const priceCounts = counts.get(name)!;
        priceCounts.set(price, (priceCounts.get(price) ?? 0) + 1);
      }
    }
  }
  const map = new Map<string, number>();
  for (const [name, priceCounts] of counts) {
    let bestPrice = 0;
    let bestCount = -1;
    for (const [price, count] of priceCounts) {
      if (count > bestCount) {
        bestPrice = price;
        bestCount = count;
      }
    }
    map.set(name, bestPrice);
  }
  return map;
}

// ----------------------- Invoices format parsing -----------------------
type PreparedItem = { name: string; price: number; quantity: number };
type PreparedOrder = {
  branch: "suli" | "erbil";
  location: string | null;
  paymentMethod: "cash";
  total: number;
  placedAt: Date;
  items: PreparedItem[];
};

const ITEM_QTY_RE = /^(.*) x(\d+)$/;

function parseInvoicesUpdateFile(
  fileName: string,
  branch: "suli" | "erbil",
  location: string | null,
  priceMap: Map<string, number>,
  afterCutoff: Date
): { orders: PreparedOrder[]; skippedTest: number; skippedOldOrEqual: number; fallbackPricedLines: number } {
  const rows = readRows(fileName).filter((r) => r.length >= 4 && r[0] && r[0] !== "invoice_id");
  const out: PreparedOrder[] = [];
  let skippedTest = 0;
  let skippedOldOrEqual = 0;
  let fallbackPricedLines = 0;

  for (const r of rows) {
    const [invoiceId, dateStr, itemsStr, totalStr] = r;
    const placedAt = parseDashDate(dateStr);
    if (placedAt <= afterCutoff) {
      skippedOldOrEqual++;
      continue;
    }

    const parts = itemsStr.split(";").map((s) => s.trim());
    const parsedParts = parts.map((p) => {
      const m = p.match(ITEM_QTY_RE);
      if (!m) throw new Error(`Unparseable item "${p}" in ${fileName} invoice ${invoiceId}`);
      return { rawName: m[1].trim(), quantity: parseInt(m[2], 10) };
    });

    if (parsedParts.some((p) => normalizeName(p.rawName) === "test")) {
      skippedTest++;
      continue;
    }

    const total = parseInt(totalStr, 10);
    const totalQty = parsedParts.reduce((sum, p) => sum + p.quantity, 0);

    const items: PreparedItem[] = parsedParts.map((p) => {
      const key = normalizeName(p.rawName);
      let price = PRICE_OVERRIDES[key] ?? priceMap.get(key);
      if (price === undefined) {
        price = totalQty > 0 ? Math.round(total / totalQty) : 0;
        fallbackPricedLines++;
      }
      return { name: p.rawName, price, quantity: p.quantity };
    });

    out.push({ branch, location, paymentMethod: "cash", total, placedAt, items });
  }

  return { orders: out, skippedTest, skippedOldOrEqual, fallbackPricedLines };
}

// ----------------------- Main -----------------------
async function main() {
  const suliPriceMap = buildPriceMap([
    "60ty2025-ڕاپۆرتی پسوڵەکان.csv",
    "60ty2026-ڕاپۆرتی پسوڵەکان.csv",
    "Dania 2025-ڕاپۆرتی پسوڵەکان.csv",
  ]);
  const erbilPriceMap = buildPriceMap(["Erbil 2026-ڕاپۆرتی پسوڵەکان.csv"]);

  const branches: {
    file: string;
    branch: "suli" | "erbil";
    location: string | null;
    priceMap: Map<string, number>;
    label: string;
  }[] = [
    { file: "60ty2026-Invoices-update.csv", branch: "suli", location: "2", priceMap: suliPriceMap, label: "60ty  (suli/2)" },
    { file: "dania2026-Invoices-update.csv", branch: "suli", location: "1", priceMap: suliPriceMap, label: "Dania (suli/1)" },
    { file: "erbil2026-Invoices-update.csv", branch: "erbil", location: null, priceMap: erbilPriceMap, label: "Erbil (erbil)" },
  ];

  console.log(`\n=== Historical order CATCH-UP import ${WRITE ? "(WRITING TO DB)" : "(DRY RUN — pass --write to commit)"} ===\n`);

  const allOrders: PreparedOrder[] = [];
  for (const b of branches) {
    const cutoffAgg = await prisma.order.aggregate({
      where: { branch: b.branch, location: b.location },
      _max: { placedAt: true },
    });
    const cutoff = cutoffAgg._max.placedAt ?? new Date(0);
    const result = parseInvoicesUpdateFile(b.file, b.branch, b.location, b.priceMap, cutoff);
    allOrders.push(...result.orders);

    const revenue = result.orders.reduce((s, o) => s + o.total, 0);
    console.log(`${b.label}: existing data up to ${cutoff.toISOString()}`);
    console.log(`  + ${result.orders.length.toLocaleString()} new orders, ${revenue.toLocaleString()} IQD`);
    console.log(`  - skipped (already covered): ${result.skippedOldOrEqual}`);
    console.log(`  - skipped (test transactions): ${result.skippedTest}`);
    console.log(`  - item lines priced via fallback split: ${result.fallbackPricedLines}\n`);
  }

  console.log(`Total new: ${allOrders.length.toLocaleString()} orders, ${allOrders.reduce((s, o) => s + o.total, 0).toLocaleString()} IQD\n`);

  if (!WRITE) {
    console.log("Dry run only — no rows written. Re-run with --write to import for real.");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  const BATCH_SIZE = 200;
  for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
    const batch = allOrders.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((o) =>
        prisma.order.create({
          data: {
            branch: o.branch,
            location: o.location,
            pagerNumber: 0,
            total: o.total,
            paymentMethod: o.paymentMethod,
            orderType: "walk_in",
            isPaid: true,
            status: "collected",
            placedAt: o.placedAt,
            readyAt: o.placedAt,
            collectedAt: o.placedAt,
            items: {
              create: o.items.map((it) => ({
                name: it.name,
                price: it.price,
                quantity: it.quantity,
              })),
            },
          },
        })
      )
    );
    created += batch.length;
    process.stdout.write(`\rImported ${created.toLocaleString()} / ${allOrders.length.toLocaleString()}`);
  }
  console.log("\n✓ Catch-up import complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
