import type { Role } from "@/hooks/use-current-user";

/**
 * Central module → role permission map (module 14, Roles & Permissions).
 * This is the *module access* gate — it does not replace the city/branch
 * *data* scoping enforced separately in every API route (see
 * `scopeCityFilter` / `scopeBranchFilter` in `src/lib/auth.ts`).
 *
 * Kept as a single source of truth so the sidebar, page-level guards, and
 * (eventually) the editable Roles & Permissions matrix in the DB all agree
 * on the same key names.
 */
export const MODULE_KEYS = [
  "cashier",
  "dailyNeeds",
  "menu",
  "warehouse",
  "ingredientUsage",
  "production",
  "estimatedProfit",
  "sales",
  "expenses",
  "profit",
  "cashTracking",
  "events",
  "staff",
  "roles",
  "reports",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

const DEFAULT_PERMISSIONS: Record<ModuleKey, Role[]> = {
  cashier: ["CASHIER", "ADMIN"],
  dailyNeeds: ["CASHIER", "MANAGER", "ADMIN"],
  menu: ["MANAGER", "ADMIN"],
  warehouse: ["MANAGER", "ADMIN"],
  ingredientUsage: ["ADMIN"],
  production: ["ADMIN"],
  estimatedProfit: ["ADMIN"],
  sales: ["MANAGER", "ADMIN"],
  expenses: ["MANAGER", "ADMIN"],
  profit: ["ADMIN"],
  cashTracking: ["ADMIN"],
  events: ["ADMIN"],
  staff: ["ADMIN"],
  roles: ["ADMIN"],
  reports: ["ADMIN"],
};

export function canAccess(role: Role, moduleKey: ModuleKey): boolean {
  return DEFAULT_PERMISSIONS[moduleKey].includes(role);
}

export function rolesFor(moduleKey: ModuleKey): Role[] {
  return DEFAULT_PERMISSIONS[moduleKey];
}
