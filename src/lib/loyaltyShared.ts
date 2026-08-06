// Client-safe loyalty constants/types — no Prisma import, so this can be
// imported from "use client" components (see pos/page.tsx) without pulling
// the Prisma Client into the browser bundle. Server logic lives in loyalty.ts,
// which re-exports these.
export const LOYALTY_QUALIFYING_TOTAL = 9;
export const LOYALTY_FREE_ITEM_NAME = "Shklet Special";

export type LoyaltyLookup = {
  found: boolean;
  loyaltyCount: number;
  remaining: number;
  readyToRedeem: boolean;
};
