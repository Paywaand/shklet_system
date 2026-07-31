// City definitions — Shklet runs in two fully separated cities. Each city has
// one or more physical branches (see the `Branch` Prisma model — "60 Street",
// "Dania Trade Center" for Suli; "Erbil" for Erbil), managed via the "Manage
// Branches" settings UI rather than hardcoded here.
//
// Menu, Inventory, Expenses, Cash Tracking, Delivery, and Daily Needs stay
// scoped at the CITY level (this file). Staff, Orders, and Hours are scoped at
// the physical-BRANCH level (Branch.id, resolved via activeBranchId() in
// branchScope.ts).

export const BRANCHES = ["suli", "erbil"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<Branch, string> = {
  suli: "Sulaymaniyah",
  erbil: "Erbil",
};

export const DEFAULT_BRANCH: Branch = "suli";

// Cookie holding the admin's currently-viewed city. NOT httpOnly on purpose:
// the sidebar switcher writes it with document.cookie and refreshes.
export const ACTIVE_BRANCH_COOKIE = "shklet_branch";

// Cookie holding the admin's currently-viewed physical branch (Branch.id)
// within that city. NOT httpOnly, same reasoning as ACTIVE_BRANCH_COOKIE.
export const ACTIVE_BRANCH_ID_COOKIE = "shklet_branch_id";

export function isBranch(v: unknown): v is Branch {
  return v === "suli" || v === "erbil";
}

export function branchLabel(v: string | null | undefined): string {
  return isBranch(v) ? BRANCH_LABELS[v] : "All branches";
}

// Default delivery platform per branch (seeded into DeliverySettings; the admin
// can change names/percentages later from the Delivery page).
export const DEFAULT_DELIVERY: Record<Branch, { platformName: string; commissionPct: number; color: string }> = {
  suli: { platformName: "Toters", commissionPct: 20, color: "#0fb79b" },
  erbil: { platformName: "Talabat", commissionPct: 25, color: "#FF5A00" },
};
