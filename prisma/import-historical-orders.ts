// One-time import of historical receipts (pre-dating this system) for all three
// physical registers — 60ty (suli/2), Dania (suli/1), Erbil (erbil) — from the
// CSV exports in data_to_import/. Every imported order is created already
// "collected" + paid, since these are closed historical receipts, not live
// orders. One-shot script: NOT idempotent, re-running will duplicate rows.
//
//   npm run import:historical-orders          # dry run — parses + prints a summary, writes nothing
//   npm run import:historical-orders -- --write   # actually inserts into the DB
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
  return parseCSV(text).slice(1); // drop header
}

// ----------------------- Shared types -----------------------
type PreparedItem = { name: string; price: number; quantity: number };
type PreparedOrder = {
  branch: "suli" | "erbil";
  location: string | null;
  paymentMethod: "cash" | "card";
  total: number;
  placedAt: Date;
  items: PreparedItem[];
  sourceKey: string; // for dedup logging only
};

// Iraq is UTC+3 year-round (no DST). The exports record local wall-clock time;
// convert to the correct UTC instant explicitly so it doesn't depend on the
// timezone of the machine running this script.
const IRAQ_OFFSET_HOURS = 3;
function iraqLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - IRAQ_OFFSET_HOURS, minute));
}

// "1/1/2026 23:58" or "6/22/2026 1:34" → UTC Date
function parseSlashDate(s: string): Date {
  const [datePart, timePart] = s.trim().split(" ");
  const [m, d, y] = datePart.split("/").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return iraqLocalToUtc(y, m, d, h, min);
}

// "2026-07-31 00:52" → UTC Date
function parseDashDate(s: string): Date {
  const [datePart, timePart] = s.trim().split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return iraqLocalToUtc(y, m, d, h, min);
}

// ----------------------- 1. "Receipt report" files (60ty, Dania 2025, Erbil) -----------------------
// Columns: لق (register), ژمارەی پسوڵە (receipt#), بەروار (date), جۆر (type), کۆی گشتی پسوڵە (total), وردەکاری پسوڵە (detail)
const BRANCH_BY_LABEL: Record<string, { branch: "suli" | "erbil"; location: string | null }> = {
  "لقی ٢ (شەستی)": { branch: "suli", location: "2" }, // 60ty
  "لقی ١ (دانیا)": { branch: "suli", location: "1" }, // Dania
  "لقی ٣ (هەولێر)": { branch: "erbil", location: null }, // Erbil
};

const ITEM_LINE_RE = /^(.*) - بڕ: ([\d,]+) دانە, نرخ: ([\d,]+), کۆی نرخ: ([\d,]+)$/;

function parseReceiptReportFile(fileName: string, seenIds: Set<string>): PreparedOrder[] {
  const rows = readRows(fileName).filter((r) => r.length >= 6 && r[0]);
  const out: PreparedOrder[] = [];
  for (const r of rows) {
    const [branchLabel, receiptNo, dateStr, type, totalStr, detail] = r;
    const loc = BRANCH_BY_LABEL[branchLabel];
    if (!loc) throw new Error(`Unknown register label "${branchLabel}" in ${fileName}`);

    const sourceKey = `${loc.branch}:${loc.location ?? "-"}:${receiptNo}`;
    if (seenIds.has(sourceKey)) continue; // exact duplicate across overlapping exports
    seenIds.add(sourceKey);

    const items: PreparedItem[] = [];
    for (const line of detail.split("\n")) {
      const m = line.match(ITEM_LINE_RE);
      if (!m) throw new Error(`Unparseable item line in ${fileName} receipt ${receiptNo}: "${line}"`);
      const [, name, qtyStr, unitPriceStr] = m;
      items.push({
        name: name.trim(),
        price: parseInt(unitPriceStr.replace(/,/g, ""), 10),
        quantity: parseInt(qtyStr.replace(/,/g, ""), 10),
      });
    }

    out.push({
      branch: loc.branch,
      location: loc.location,
      paymentMethod: type.trim() === "Fib" ? "card" : "cash",
      total: parseInt(totalStr, 10),
      placedAt: parseSlashDate(dateStr),
      items,
      sourceKey,
    });
  }
  return out;
}

// ----------------------- 2. Dania 2026 invoices file (no per-item price, no payment type) -----------------------
// Columns: invoice_id, date, items ("Name xN; Name xN"), total
const ITEM_QTY_RE = /^(.*) x(\d+)$/;

// Typo/variant normalization seen across the source POS data, so different
// spellings of the same product resolve to the same price-lookup key.
function normalizeName(raw: string): string {
  let n = raw.trim().toLowerCase().replace(/\s+/g, " ");
  n = n.replace(/nuttela|nutelka|nutela/g, "nutella");
  n = n.replace(/choclate|chocolat\b/g, "chocolate");
  n = n.replace(/pancakes/g, "pancake");
  n = n.replace(/^extra (nutella|pistachio)$/, "extra chocolate"); // same 1,000 IQD "Extras" price line
  n = n.replace(/^strawberry breeze drink$/, "strawberry breeze");
  return n;
}

// Manual overrides for items that never appear with a price in the other exports.
const PRICE_OVERRIDES: Record<string, number> = {
  "cup no sauce": 3000,
};

function buildSuliPriceMap(receiptReportFiles: string[]): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const fileName of receiptReportFiles) {
    const rows = readRows(fileName).filter((r) => r.length >= 6 && r[0]);
    for (const r of rows) {
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

function parseDaniaInvoicesFile(
  fileName: string,
  priceMap: Map<string, number>,
  skipIds: Set<string>
): {
  orders: PreparedOrder[];
  skippedTest: number;
  skippedDuplicate: number;
  fallbackPricedLines: number;
} {
  const rows = readRows(fileName).filter((r) => r.length >= 4 && r[0]);
  const out: PreparedOrder[] = [];
  let skippedTest = 0;
  let skippedDuplicate = 0;
  let fallbackPricedLines = 0;

  for (const r of rows) {
    const [invoiceId, dateStr, itemsStr, totalStr] = r;

    if (skipIds.has(invoiceId)) {
      skippedDuplicate++;
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
        // Last-resort fallback: split the receipt total evenly per unit.
        price = totalQty > 0 ? Math.round(total / totalQty) : 0;
        fallbackPricedLines++;
      }
      return { name: p.rawName, price, quantity: p.quantity };
    });

    out.push({
      branch: "suli",
      location: "1", // Dania
      paymentMethod: "cash", // not recorded in this export; branch runs almost entirely cash
      total,
      placedAt: parseDashDate(dateStr),
      items,
      sourceKey: `suli:1:${invoiceId}`,
    });
  }

  return { orders: out, skippedTest, skippedDuplicate, fallbackPricedLines };
}

// ----------------------- Main -----------------------
async function main() {
  const seenReceiptKeys = new Set<string>();

  // Order matters: 60ty2026 first so the 93 receipts it shares with 60ty2025 are
  // kept from 2026's copy (identical data either way) and 2025's are skipped.
  const sixtyOrders = [
    ...parseReceiptReportFile("60ty2026-ڕاپۆرتی پسوڵەکان.csv", seenReceiptKeys),
    ...parseReceiptReportFile("60ty2025-ڕاپۆرتی پسوڵەکان.csv", seenReceiptKeys),
  ];
  const daniaReceiptOrders = parseReceiptReportFile("Dania 2025-ڕاپۆرتی پسوڵەکان.csv", seenReceiptKeys);
  const erbilOrders = parseReceiptReportFile("Erbil 2026-ڕاپۆرتی پسوڵەکان.csv", seenReceiptKeys);

  // The 60 receipts shared between "Dania 2025" and "dania2026-Invoices" (the
  // Jan 1 2026 boundary) are skipped from the invoices file — the receipt-report
  // version already has real per-item prices instead of a fallback estimate.
  const daniaReceiptIds = new Set(daniaReceiptOrders.map((o) => o.sourceKey.split(":").pop()!));
  const suliPriceMap = buildSuliPriceMap([
    "60ty2025-ڕاپۆرتی پسوڵەکان.csv",
    "60ty2026-ڕاپۆرتی پسوڵەکان.csv",
    "Dania 2025-ڕاپۆرتی پسوڵەکان.csv",
  ]);
  const daniaInvoicesResult = parseDaniaInvoicesFile("dania2026-Invoices.csv", suliPriceMap, daniaReceiptIds);

  const allOrders = [...sixtyOrders, ...daniaReceiptOrders, ...daniaInvoicesResult.orders, ...erbilOrders];

  // ----------------------- Summary -----------------------
  const revenueBy = (branch: string, location: string | null) =>
    allOrders.filter((o) => o.branch === branch && o.location === location).reduce((sum, o) => sum + o.total, 0);

  console.log(`\n=== Historical order import ${WRITE ? "(WRITING TO DB)" : "(DRY RUN — pass --write to commit)"} ===\n`);
  console.log(`60ty   (suli/2):  ${sixtyOrders.length.toLocaleString()} orders, ${revenueBy("suli", "2").toLocaleString()} IQD`);
  console.log(
    `Dania  (suli/1):  ${(daniaReceiptOrders.length + daniaInvoicesResult.orders.length).toLocaleString()} orders, ${revenueBy("suli", "1").toLocaleString()} IQD`
  );
  console.log(`  - from receipt report: ${daniaReceiptOrders.length.toLocaleString()}`);
  console.log(`  - from invoices file:  ${daniaInvoicesResult.orders.length.toLocaleString()}`);
  console.log(`  - skipped (duplicate of receipt report): ${daniaInvoicesResult.skippedDuplicate}`);
  console.log(`  - skipped (test transactions):           ${daniaInvoicesResult.skippedTest}`);
  console.log(`  - item lines priced via fallback split:   ${daniaInvoicesResult.fallbackPricedLines}`);
  console.log(`Erbil  (erbil):   ${erbilOrders.length.toLocaleString()} orders, ${revenueBy("erbil", null).toLocaleString()} IQD`);
  console.log(`\nTotal: ${allOrders.length.toLocaleString()} orders, ${allOrders.reduce((s, o) => s + o.total, 0).toLocaleString()} IQD\n`);

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
  console.log("\n✓ Historical order import complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
