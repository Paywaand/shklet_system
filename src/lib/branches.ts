// Branch (city) definitions — Shklet runs two fully separated branches.
// Managers/cashiers belong to exactly one branch (User.branch); the super admin
// (User.branch = null) can switch the branch he is viewing from the sidebar.
// The active branch for an admin is kept in a plain cookie (ACTIVE_BRANCH_COOKIE)
// so both server components and API routes can read it.

export const BRANCHES = ["suli", "erbil"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<Branch, string> = {
  suli: "Sulaymaniyah",
  erbil: "Erbil",
};

export const DEFAULT_BRANCH: Branch = "suli";

// Physical branches within a city. Sulaymaniyah has two separately-operated
// locations (own pager set, own active order queue); Erbil has one, so its
// orders always carry `location: null`.
export const LOCATIONS: Record<Branch, readonly string[]> = {
  suli: ["1", "2"],
  erbil: [],
};

export const LOCATION_LABELS: Record<string, string> = {
  "1": "Branch 1",
  "2": "Branch 2",
};

export const DEFAULT_LOCATION: Record<Branch, string | null> = {
  suli: "1",
  erbil: null,
};

export function isValidLocation(branch: Branch, location: unknown): location is string | null {
  if (location === null || location === undefined) return LOCATIONS[branch].length === 0;
  return typeof location === "string" && (LOCATIONS[branch] as readonly string[]).includes(location);
}

// Cookie holding the admin's currently-viewed branch. NOT httpOnly on purpose:
// the sidebar switcher writes it with document.cookie and refreshes.
export const ACTIVE_BRANCH_COOKIE = "shklet_branch";

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
