// IndexedDB-backed cache + outbox for the offline-capable Cashier (POS) screen, plus
// a network helper that distinguishes "couldn't reach the server" from "server said
// no". Scope is deliberately narrow: branch walk-in orders only (POST /api/orders +
// PATCH ready/collected). Delivery, Daily Needs, warehouse, and expenses are NOT cached
// or queued here.
import { openDB, type IDBPDatabase } from "idb";
import type { PaymentMethod } from "@/lib/paymentMethods";

// ----------------------- Outbox op model -----------------------
export type OfflineLineItem = {
  name: string;
  price: number;
  quantity: number;
  modifier: string | null;
};

export type CreatePayload = {
  pagerNumber: number;
  paymentMethod: PaymentMethod;
  orderType: "walk_in" | "takeaway";
  isPaid: boolean;
  eventId: string | null;
  items: OfflineLineItem[];
};

export type LocalStatus = "pending" | "ready" | "collected";

// A queued "place order". `clientId` doubles as the server idempotency key and the
// local id of the optimistic card. Status changes made before this op syncs fold into
// `localStatus` (replayed create-then-update in order on sync) rather than queuing a
// separate PATCH against a server id that doesn't exist yet.
export type CreateOp = {
  kind: "create";
  clientId: string;
  createdAt: number; // epoch ms
  payload: CreatePayload;
  localStatus: LocalStatus;
  // Set when sync was rejected (e.g. pager taken by sync time). The order is surfaced
  // as "needs attention" and kept — never dropped, never auto-renumbered.
  conflict?: string | null;
};

// A queued status change against an order that already exists on the server.
// "cancelled" replays against the dedicated /cancel route (see sync.ts), not the
// general ready/collected PATCH.
export type PatchOp = {
  kind: "patch";
  opId: string;
  orderId: string;
  action: "ready" | "collected" | "cancelled" | "mark_paid";
  createdAt: number;
};

export type OutboxOp = CreateOp | PatchOp;

// Stable IndexedDB key for an op (out-of-line keys).
export function opKey(op: OutboxOp): string {
  return op.kind === "create" ? op.clientId : op.opId;
}

// ----------------------- IndexedDB plumbing -----------------------
const DB_NAME = "shklet-pos";
const DB_VERSION = 1;
const CACHE = "cache";
const OUTBOX = "outbox";

let dbPromise: Promise<IDBPDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX);
      },
    });
  }
  return dbPromise;
}

// ---- Cache (last good GET snapshots) ----
export async function cachePut(key: string, value: unknown): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await getDb();
  await db.put(CACHE, value, key);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) return undefined;
  const db = await getDb();
  return (await db.get(CACHE, key)) as T | undefined;
}

// ---- Outbox ----
export async function outboxAll(): Promise<OutboxOp[]> {
  if (!hasIndexedDb()) return [];
  const db = await getDb();
  return (await db.getAll(OUTBOX)) as OutboxOp[];
}

export async function outboxPut(op: OutboxOp): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await getDb();
  await db.put(OUTBOX, op, opKey(op));
}

export async function outboxDelete(key: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await getDb();
  await db.delete(OUTBOX, key);
}

// ----------------------- Network helper -----------------------
// A request result that distinguishes a network failure (queue it) from an HTTP
// rejection (surface the error; do NOT silently queue a 4xx/5xx).
export type SendResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "http"; status: number; error: string };

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return (data as { error?: string }).error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<SendResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        // CSRF defence — same custom header apiSend uses (see middleware.ts).
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (!res.ok) return { ok: false, kind: "http", status: res.status, error: await readError(res) };
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { ok: true, status: res.status, data };
}

export async function getJson<T>(url: string): Promise<SendResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (!res.ok) return { ok: false, kind: "http", status: res.status, error: await readError(res) };
  return { ok: true, status: res.status, data: (await res.json()) as T };
}
