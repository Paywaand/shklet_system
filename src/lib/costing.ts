// Pure costing math shared by client and server. No Prisma import here so it is
// safe to use inside "use client" components.

// Convert a gram amount into the native unit of a warehouse item, so a deduction
// recorded against that item is in its own unit. Sauces are measured in grams;
// raw items are usually kg / g / litre.
export function gramsToUnit(grams: number, unit: string): number {
  switch (unit) {
    case "kg":
      return grams / 1000;
    case "litre":
      return grams / 1000; // assume ~1 g per ml
    case "g":
    case "ml": // ~1 g per ml
    default:
      return grams; // g, ml, piece, box, bucket → 1:1
  }
}

// Cost-per-gram of a raw warehouse item, derived from its last purchase cost.
// Returns null for non-gram units (piece/box/bucket) so callers fall back to a
// manually entered cost-per-gram.
export function rawCostPerGram(unit: string, lastUnitCost: number | null): number | null {
  if (lastUnitCost == null) return null;
  if (unit === "piece" || unit === "box" || unit === "bucket") return null;
  return lastUnitCost * gramsToUnit(1, unit); // kg/litre → /1000, g → ×1
}

// ---- Sub-unit costing (containers → sub-units → smallest unit) ----
// Items can be bought in a container that holds N sub-units, each holding M of
// the tracked unit (e.g. 1 box = 6 cans, 1 can = 1,850 g). When both numbers are
// known we can derive the cost of one smallest unit (IQD per g/ml/piece):
//   totalContentPerContainer = unitsPerContainer × contentPerUnit
//   costPerSmallestUnit      = lastUnitCost / totalContentPerContainer
export type SubUnitItem = {
  lastUnitCost: number | null;
  unitsPerContainer?: number | null;
  contentPerUnit?: number | null;
};

// Total amount of the tracked unit held by one whole container, or null when the
// sub-unit layer isn't configured.
export function containerContent(item: SubUnitItem): number | null {
  const upc = Number(item.unitsPerContainer) || 0;
  const cpu = Number(item.contentPerUnit) || 0;
  if (upc > 0 && cpu > 0) return upc * cpu;
  return null;
}

// Cost of one smallest unit. Falls back to `lastUnitCost` (cost per tracked unit,
// the existing behaviour) when the sub-unit layer isn't set. Null when there is no
// purchase cost at all. Safe on client and server.
export function computeCostPerUnit(item: SubUnitItem): number | null {
  if (item.lastUnitCost == null) return null;
  const total = containerContent(item);
  if (total == null) return item.lastUnitCost; // no sub-unit info → cost per tracked unit
  return item.lastUnitCost / total;
}

// ---- Sauce batch costing (module 2) ----
// Each line's price and amount are in the linked warehouse item's own unit
// (per box / per ml / per kg …), so cost per batch = Σ(unitPrice × amountUsed).
export type SauceLine = { unitPrice: number; amountUsed: number };

export function sauceBatchCost(lines: SauceLine[]): number {
  return lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.amountUsed) || 0), 0);
}

// cost per gram = cost per batch / total batch grams (0 when the batch weight is unknown)
export function sauceCostPerGram(lines: SauceLine[], totalBatchGrams: number): number {
  const total = Number(totalBatchGrams) || 0;
  if (total <= 0) return 0;
  return sauceBatchCost(lines) / total;
}

// ---- Recipe BOM (module 1) ----
export type BomLine = { gramsPerServing: number; costPerGram: number };

export function lineTotal(line: BomLine): number {
  return (Number(line.gramsPerServing) || 0) * (Number(line.costPerGram) || 0);
}

export function sumLineTotals(lines: BomLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

// gross_profit = sale_price − Σ(line_totals)
export function grossProfit(salePrice: number, lines: BomLine[]): number {
  return (Number(salePrice) || 0) - sumLineTotals(lines);
}

// Gross-profit margin as a percentage: ((price − cost) / price) × 100.
// Returns null when there is no sale price to divide by.
export function gpPercent(salePrice: number, totalCost: number): number | null {
  const price = Number(salePrice) || 0;
  if (price <= 0) return null;
  return ((price - totalCost) / price) * 100;
}

// Color band for a GP%: green ≥60, amber 40–59, red <40.
export type GpBand = "green" | "amber" | "red";
export function gpBand(pct: number): GpBand {
  if (pct >= 60) return "green";
  if (pct >= 40) return "amber";
  return "red";
}

// Tailwind text-color class for a GP% band (full strings → JIT-safe).
export function gpColorClass(pct: number | null): string {
  if (pct == null) return "text-[var(--text)] opacity-50";
  switch (gpBand(pct)) {
    case "green":
      return "text-leaf";
    case "amber":
      return "text-amber-600 dark:text-amber-400";
    case "red":
      return "text-red-500";
  }
}

// "68.4%" — one decimal place; "—" when undefined.
export function formatGp(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}
