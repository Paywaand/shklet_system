// Loyalty program: buy 9 (any) qualifying items, get a free Shklet Special.
// Identity is a bare phone number — no accounts, no login (this system has
// none) — entered once, optionally, at checkout. Progress is tracked ACROSS
// both branches (one Customer row per phone), per product decision.
//
// This is NOT a discount mechanism — reaching 9 unlocks exactly one free
// Shklet Special, redeemed manually by the cashier on a LATER visit. Ad-hoc
// per-order discounts (for friends/regulars, entered fresh each time) are a
// separate, unrelated feature — see the cart's discount entry in pos/page.tsx.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { LOYALTY_QUALIFYING_TOTAL, LOYALTY_FREE_ITEM_NAME, type LoyaltyLookup } from "./loyaltyShared";

export { LOYALTY_QUALIFYING_TOTAL, LOYALTY_FREE_ITEM_NAME };
export type { LoyaltyLookup };

export class LoyaltyError extends Error {}

// Digits-only key — "0770 123 4567", "+964 770 123 4567", etc. all collapse to
// the same Customer row.
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 20);
}

export async function lookupCustomer(rawPhone: string): Promise<LoyaltyLookup> {
  const phone = normalizePhone(rawPhone);
  const empty: LoyaltyLookup = {
    found: false,
    loyaltyCount: 0,
    remaining: LOYALTY_QUALIFYING_TOTAL,
    readyToRedeem: false,
  };
  if (!phone) return empty;

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) return empty;

  return {
    found: true,
    loyaltyCount: customer.loyaltyCount,
    remaining: Math.max(0, LOYALTY_QUALIFYING_TOTAL - customer.loyaltyCount),
    readyToRedeem: customer.loyaltyCount >= LOYALTY_QUALIFYING_TOTAL,
  };
}

export type LoyaltyLineItem = { name: string; price: number; quantity: number };

export type ApplyLoyaltyResult = {
  customerId: string | null;
  customerPhone: string | null;
  freeItemAmount: number; // IQD knocked off by a redeemed free item, 0 if none
  redeemed: boolean;
  // True the instant a customer's count crosses 9 on THIS order (and they
  // didn't also redeem in the same order) — the cashier prompt trigger.
  justQualified: boolean;
};

// Runs INSIDE the order-creation transaction. Upserts the Customer, applies a
// free-item redemption to the order total if requested, and leaves the
// Customer's loyaltyCount updated. Throws LoyaltyError (→ 400) on a bad
// redemption attempt so the cashier sees why, instead of silently no-opping.
export async function applyLoyalty(
  tx: Prisma.TransactionClient,
  params: {
    rawPhone: string | null;
    lineItems: LoyaltyLineItem[];
    redeemFreeItem: boolean;
  }
): Promise<ApplyLoyaltyResult> {
  const phone = params.rawPhone ? normalizePhone(params.rawPhone) : "";
  if (!phone) {
    if (params.redeemFreeItem)
      throw new LoyaltyError("Enter the customer's phone number to redeem a free item");
    return { customerId: null, customerPhone: null, freeItemAmount: 0, redeemed: false, justQualified: false };
  }

  const customer = await tx.customer.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });

  let freeItemAmount = 0;
  let redeemed = false;
  // Quantity of PAID items this order contributes toward the next cycle — the
  // redeemed free unit (if any) is excluded below.
  let qualifyingQty = params.lineItems.reduce((s, i) => s + i.quantity, 0);

  if (params.redeemFreeItem) {
    if (customer.loyaltyCount < LOYALTY_QUALIFYING_TOTAL)
      throw new LoyaltyError(
        `Not enough loyalty progress yet (${customer.loyaltyCount}/${LOYALTY_QUALIFYING_TOTAL})`
      );
    const freeLine = params.lineItems.find(
      (i) => i.name.trim().toLowerCase() === LOYALTY_FREE_ITEM_NAME.toLowerCase()
    );
    if (!freeLine)
      throw new LoyaltyError(`Add a ${LOYALTY_FREE_ITEM_NAME} to the cart to redeem it`);
    freeItemAmount = freeLine.price;
    qualifyingQty = Math.max(0, qualifyingQty - 1);
    redeemed = true;
  }

  const previousCount = customer.loyaltyCount;
  const nextLoyaltyCount =
    (params.redeemFreeItem ? Math.max(0, previousCount - LOYALTY_QUALIFYING_TOTAL) : previousCount) + qualifyingQty;

  await tx.customer.update({ where: { id: customer.id }, data: { loyaltyCount: nextLoyaltyCount } });

  const justQualified = !redeemed && previousCount < LOYALTY_QUALIFYING_TOTAL && nextLoyaltyCount >= LOYALTY_QUALIFYING_TOTAL;

  return { customerId: customer.id, customerPhone: phone, freeItemAmount, redeemed, justQualified };
}
