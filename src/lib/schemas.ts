// Strict Zod schemas + bounded JSON parsing for the two free-form JSON columns in
// the DB (MenuItem.modifiers and DailyNeedsLog.items). SQLite stores these as JSON
// strings, so they're parsed back with JSON.parse() — an unbounded JSON.parse on
// attacker-influenced input is a DoS vector (deeply nested / huge payloads), so we
// (a) cap the raw string length BEFORE parsing and (b) validate the shape after.

import { z } from "zod";
import { WITHDRAWAL_SOURCES } from "./cash";

// Hard caps that bound parse work and storage size.
export const MAX_JSON_BYTES = 16 * 1024; // 16 KB is plenty for these small lists
const MAX_GROUPS = 20;
const MAX_OPTIONS = 50;
const MAX_DAILY_ITEMS = 500;
const MAX_STR = 200;

const shortStr = z.string().trim().min(1).max(MAX_STR);

// ---- MenuItem.modifiers ----
export const ModifierGroupSchema = z.object({
  name: shortStr,
  required: z.boolean(),
  options: z.array(shortStr).max(MAX_OPTIONS),
});

export const ModifiersSchema = z.array(ModifierGroupSchema).max(MAX_GROUPS);
export type Modifiers = z.infer<typeof ModifiersSchema>;

// ---- DailyNeedsLog.items ----
export const DailyNeedsItemSchema = z.object({
  category: shortStr,
  name: shortStr,
  amount: z.string().trim().max(MAX_STR),
});

export const DailyNeedsItemsSchema = z.array(DailyNeedsItemSchema).max(MAX_DAILY_ITEMS);
export type DailyNeedsItems = z.infer<typeof DailyNeedsItemsSchema>;

// Parse a JSON string with an up-front size guard, then validate it against a Zod
// schema. Returns the typed value, or `fallback` (default []) on any failure. Use
// this everywhere a stored JSON column is read so a malformed/oversized row can
// never blow up a request.
export function safeParseJson<T>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
  fallback: T
): T {
  if (!raw) return fallback;
  // Guard BEFORE JSON.parse — refuse to even parse anything oversized.
  if (raw.length > MAX_JSON_BYTES) return fallback;
  try {
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

// ---- Cash withdrawal input (POST /api/cash-tracking kind:"withdrawal") ----
// `source` and `recipient` are validated against the fixed sets in lib/cash.ts so a
// bad value can never reach the DB. `amount` is coerced (the form sends a string)
// and must be a positive whole IQD. The per-source max balance is enforced in the
// route handler, not here — this only validates shape.
export const WithdrawalInputSchema = z.object({
  amount: z.coerce.number().int().positive(),
  source: z.enum(WITHDRAWAL_SOURCES),
  recipient: z.string().trim().min(1).max(60),
  date: z.string().trim().min(1).optional(),
  note: z.string().trim().max(MAX_STR).optional(),
});
export type WithdrawalInput = z.infer<typeof WithdrawalInputSchema>;
