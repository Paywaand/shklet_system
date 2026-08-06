// Central definition of roles, permission keys, and their default grants.
// Shared by both client (nav/route gating) and server (API authorization).

export type Role = "admin" | "manager" | "cashier";

export const ROLES: Role[] = ["admin", "manager", "cashier"];

// Permission keys map to modules/actions.
export const PERMISSIONS = [
  { key: "pos.use", label: "Cashier", module: "Cashier" },
  { key: "daily.view", label: "Daily Needs", module: "Daily Needs" },
  { key: "menu.manage", label: "Manage Menu", module: "Menu" },
  { key: "inventory.manage", label: "Manage Inventory", module: "Warehouse" },
  { key: "expenses.manage", label: "Manage Expenses", module: "Expenses" },
  { key: "events.manage", label: "Manage Events", module: "Events" },
  { key: "events.evaluate", label: "View Event Evaluation", module: "Events" },
  { key: "analytics.view", label: "View Analytics", module: "Sales" },
  { key: "recipes.manage", label: "Manage Production (Recipes / BOM)", module: "Production" },
  { key: "estimated.view", label: "View Estimated Profit", module: "Estimated" },
  { key: "profit.view", label: "View Profit Overview", module: "Profit" },
  { key: "reports.view", label: "Download Monthly Reports", module: "Reports" },
  { key: "delivery.view", label: "View Delivery Revenue", module: "Delivery" },
  { key: "loyalty.manage", label: "Manage Loyalty & Discounts", module: "Loyalty" },
  { key: "staff.manage", label: "Manage Staff", module: "Staff" },
  { key: "permissions.manage", label: "Manage Roles & Permissions", module: "Roles" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

// Default grants used to seed the RolePermission table.
export const DEFAULT_GRANTS: Record<Role, PermissionKey[]> = {
  admin: [
    "pos.use",
    "daily.view",
    "menu.manage",
    "inventory.manage",
    "expenses.manage",
    "events.manage",
    "events.evaluate",
    "analytics.view",
    "recipes.manage",
    "estimated.view",
    "profit.view",
    // reports.view (downloadable monthly report) is admin-only: managers must
    // not be able to download financial / ingredient-cost reports.
    "reports.view",
    "delivery.view",
    "loyalty.manage",
    "staff.manage",
    "permissions.manage",
  ],
  manager: [
    "pos.use",
    "daily.view",
    "menu.manage",
    "inventory.manage",
    "expenses.manage",
    "events.manage",
    "analytics.view",
    // Delivery revenue view + the void/delete action on that page — managers can
    // now void a Talabat/Toters order (soft-delete, see DeliveryOrder.deletedAt).
    "delivery.view",
    "loyalty.manage",
    // recipes.manage + estimated.view are admin-only: managers must not see sauce
    // recipes, batch/bucket costs, or per-item profit margins.
  ],
  cashier: ["pos.use", "daily.view"],
};

// Maps a route path to the permission key that guards it.
export const ROUTE_PERMISSION: Record<string, PermissionKey> = {
  "/pos": "pos.use",
  "/daily-needs": "daily.view",
  "/menu": "menu.manage",
  "/inventory": "inventory.manage",
  "/expenses": "expenses.manage",
  "/events": "events.manage",
  "/analytics": "analytics.view",
  "/production": "recipes.manage",
  "/estimated": "estimated.view",
  "/profit": "profit.view",
  "/reports": "reports.view",
  "/delivery": "delivery.view",
  "/loyalty": "loyalty.manage",
  "/staff": "staff.manage",
  "/permissions": "permissions.manage",
};
