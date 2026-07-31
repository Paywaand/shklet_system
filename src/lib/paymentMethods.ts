// Shared payment-method values. Cash on hand only ever counts "cash" (see
// cash-tracking/sales-cash routes) — "card" and "pos" are both non-cash and
// tracked separately in reporting.
export const PAYMENT_METHODS = ["cash", "card", "pos"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}
