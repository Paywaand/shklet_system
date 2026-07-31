// Shared shapes returned by the API to the client.

import type { PaymentMethod } from "./paymentMethods";

export type ModifierOption = {
  label: string;
  price: number; // IQD delta added to the item's base price when selected
};

export type ModifierGroup = {
  name: string;
  required: boolean;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  nameKu: string | null;
  price: number;
  description: string | null;
  imageUrl: string | null;
  available: boolean;
  sortOrder: number;
  modifiers: string | null; // JSON-encoded ModifierGroup[]
  categoryId: string;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifier: string | null;
};

export type Order = {
  id: string;
  shortId: string | null;
  pagerNumber: number;
  total: number;
  paymentMethod: PaymentMethod;
  orderType: "walk_in" | "takeaway";
  isPaid: boolean;
  status: "pending" | "ready" | "collected" | "cancelled";
  placedAt: string;
  readyAt: string | null;
  collectedAt: string | null;
  durationSeconds: number | null;
  staffId: string | null;
  staff?: { fullName: string } | null;
  items: OrderItem[];
  // Offline (POS) idempotency key — present on rows created by the cashier tablet.
  clientId?: string | null;
  // Client-only flags set on optimistic cards rendered from the offline outbox. Never
  // sent by the server: `pendingSync` = queued, not yet on the server; `provisional` =
  // total computed client-side from the cached menu, not yet server-confirmed;
  // `conflict` = sync was rejected (e.g. pager taken), needs the cashier's attention.
  pendingSync?: boolean;
  provisional?: boolean;
  conflict?: string | null;
};

export type DeliveryOrder = {
  id: string;
  platformName: string; // snapshot ("Toters" | "Talabat" | ...)
  commissionPct: number; // snapshot of the platform commission at order time
  reference: string | null;
  grossTotal: number;
  netTotal: number;
  status: "pending" | "ready" | "driver_arrived" | "collected";
  placedAt: string;
  readyAt: string | null;
  driverArrivedAt: string | null;
  collectedAt: string | null;
  prepSeconds: number | null;
  arriveSeconds: number | null;
  staffId: string | null;
  staff?: { fullName: string } | null;
  items: OrderItem[];
};

// A warehouse category badge token; mapped to Tailwind classes client-side.
export type CategoryColor =
  | "gray"
  | "red"
  | "amber"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "teal";

export type InventoryCategory = {
  id: string;
  name: string;
  color: CategoryColor;
  sortOrder: number;
  itemCount?: number; // server-computed count of items in this category
};

export type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  lastUnitCost: number | null;
  unitSize?: number | null; // fine-measure amount per purchased container (e.g. 1000 ml/bottle)
  unitsPerContainer?: number | null; // sub-units inside one container (e.g. 6 cans per box)
  contentPerUnit?: number | null; // amount of `unit` per sub-unit (e.g. 1850 g per can)
  categoryId: string | null;
  category?: { id: string; name: string; color: CategoryColor } | null;
};

// ---- Daily Needs ----
// `amount` is free text the staff write themselves, e.g. "1 box", "2 kg".
export type DailyNeedsItem = {
  category: string;
  name: string;
  amount: string;
};

export type StockMovement = {
  id: string;
  itemId: string;
  change: number;
  reason: string;
  note: string | null;
  unitCost: number | null;
  totalCost: number | null;
  createdAt: string;
  editedAt?: string | null; // set when the movement was edited after creation
  eventId?: string | null;
  item?: { name: string; unit: string };
  staff?: { fullName: string } | null;
};

// ---- Production: Recipe BOM ----
export type RecipeIngredient = {
  id: string;
  recipeId: string;
  name: string;
  gramsPerServing: number;
  costPerGram: number; // resolved value (manual, or derived from a link)
  inventoryItemId: string | null;
  sortOrder: number;
  // server-computed, read-only:
  lineTotal?: number;
  source?: "manual" | "inventory";
};

export type Recipe = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  salePrice: number;
  notes: string | null;
  ingredients: RecipeIngredient[];
  // server-computed:
  totalCost: number;
  grossProfit: number;
};

// ---- Estimated profit dashboard (isolated from actual financials) ----
export type EstimatedProfitRow = {
  menuItemId: string;
  name: string;
  unitsSold: number;
  grossProfitPerItem: number;
  estimated: number; // unitsSold × grossProfitPerItem
  hasRecipe: boolean;
};

export type EstimatedProfit = {
  days: 1 | 7 | 30;
  estimatedNet: number;
  unitsSold: number;
  itemsWithRecipe: number;
  itemsMissingRecipe: number;
  rows: EstimatedProfitRow[];
};

// ---- Sales-page cash sections (Expected Cash on Hand + admin Cash Tracking) ----
export type ExpectedCash = {
  cashSales: number;
  expenses: number;
  safeMoney: number; // all safe deposits − safe-sourced expenses in range
  cashAdjustments: number; // all-time historical cash credited outside the POS
  expectedCashOnHand: number;
  period: { from: string | null; to: string | null };
};

export type CashLogEntry = {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  createdBy?: { fullName: string } | null;
};

// One withdrawal row (money that left the business to a named person).
export type WithdrawalLogEntry = {
  id: string;
  date: string;
  amount: number;
  source: "safe" | "manager";
  recipient: string;
  note: string | null;
  createdBy?: { fullName: string } | null;
};

export type CashTracking = {
  safeEntries: CashLogEntry[];
  safeDeposits: number; // total moved into the safe (taken from the manager)
  safeExpenses: number; // expenses paid out of the safe this month
  safeTotal: number; // safeDeposits − safeExpenses − safe-sourced withdrawals
  expectedCashOnHand: number; // pre-safe (cashSales + cashAdjustments − totalExpenses)
  managerHolds: number; // expectedCashOnHand − safeDeposits + safeExpenses − manager-sourced withdrawals
  withdrawals: WithdrawalLogEntry[]; // all-time withdrawal log (newest first)
  withdrawalTotals: Record<string, number>; // { recipient: totalAmount } across all five names
  cashAdjustments: CashLogEntry[]; // all-time historical-cash log (newest first)
  cashAdjustmentsTotal: number; // sum of all cashAdjustments entries
};

export type StaffMember = {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "manager" | "cashier";
  branchId: string | null; // null = super admin (all branches)
  branch: { id: string; name: string; city: string } | null;
  active: boolean;
  salary: number | null;
  createdAt: string;
  lastLogin: string | null;
};
