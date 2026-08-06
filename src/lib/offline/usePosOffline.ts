"use client";

// Offline brain for the Cashier (POS) screen. Owns the walk-in order data (menu +
// active queue) with an IndexedDB cache fallback, an optimistic merge of queued
// offline orders, and the sync loop (online event + foreground polling). Delivery,
// events, and everything else stay on the page's normal online fetches — this hook
// only governs branch walk-in orders.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Category, Order, DeliveryOrder } from "@/lib/types";
import {
  cacheGet,
  cachePut,
  getJson,
  outboxAll,
  outboxDelete,
  outboxPut,
  sendJson,
  type CreatePayload,
  type LocalStatus,
  type OutboxOp,
} from "./db";
import { flushOutbox } from "./sync";

type MenuPayload = { categories: Category[] };
type ActivePayload = { orders: Order[]; deliveryOrders: DeliveryOrder[]; usedPagers: number[] };

const POLL_MS = 5000; // foreground poll + sync fallback (Background Sync isn't on Safari/iPad)

// ---- Online status (concurrent-safe external store) ----
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true // assume online during SSR
  );
}

// Build an optimistic Order card from a queued create op. Total is provisional —
// computed from the cached menu prices — until the server-computed total replaces it.
function createOpToOrder(op: Extract<OutboxOp, { kind: "create" }>): Order {
  const total = op.payload.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    id: op.clientId,
    clientId: op.clientId,
    shortId: null,
    pagerNumber: op.payload.pagerNumber,
    total,
    paymentMethod: op.payload.paymentMethod,
    orderType: op.payload.orderType,
    isPaid: op.payload.isPaid,
    status: op.localStatus,
    placedAt: new Date(op.createdAt).toISOString(),
    readyAt: null,
    collectedAt: null,
    durationSeconds: null,
    staffId: null,
    staff: null,
    items: op.payload.items.map((it, idx) => ({
      id: `${op.clientId}:${idx}`,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      modifier: it.modifier,
    })),
    pendingSync: true,
    provisional: true,
    conflict: op.conflict ?? null,
  };
}

// `order` is present only when the create round-tripped to the server (i.e.
// !queued). A queued offline order has no server-assigned code yet, so a
// receipt printed for it shows the pager number and omits the order code.
// `loyaltyStatus` rides along on a successful, non-queued create — the
// cashier-prompt trigger for "this customer just unlocked a free item".
export type PlaceResult =
  | { ok: true; queued: boolean; order?: Order; loyaltyStatus?: { justQualified: boolean; phone: string | null } }
  | { ok: false; error: string };

// branchId: "" = main branch, otherwise an event id. Determines which
// branch/event's active-orders queue is fetched and cached. (Physical-branch
// scoping is server-side via activeBranchId() — not passed from the client.)
export function usePosOffline(branchId: string = "") {
  const online = useOnline();
  const cacheKey = `active:${branchId || "main"}`;

  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [activeRaw, setActiveRaw] = useState<ActivePayload | null>(null);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Ref guards re-entrant syncs from the poll/online effects firing together.
  const syncingRef = useRef(false);

  const reloadOps = useCallback(async () => {
    setOps(await outboxAll());
  }, []);

  const loadMenu = useCallback(async () => {
    const res = await getJson<MenuPayload>("/api/menu");
    if (res.ok) {
      setMenu(res.data);
      setMenuError(null);
      await cachePut("menu", res.data);
    } else {
      const cached = await cacheGet<MenuPayload>("menu");
      if (cached) {
        setMenu(cached);
        setMenuError(null);
      } else if (res.kind === "http") {
        setMenuError(res.error);
      } else {
        setMenuError("Offline and no cached menu yet — connect once to load the menu.");
      }
    }
    setMenuLoading(false);
  }, []);

  const loadActive = useCallback(async () => {
    const params = new URLSearchParams({ eventId: branchId || "main" });
    const res = await getJson<ActivePayload>(`/api/orders/active?${params.toString()}`);
    if (res.ok) {
      setActiveRaw(res.data);
      await cachePut(cacheKey, res.data);
    } else {
      const cached = await cacheGet<ActivePayload>(cacheKey);
      if (cached) setActiveRaw(cached);
    }
  }, [branchId, cacheKey]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const queued = await outboxAll();
    if (queued.length === 0) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const summary = await flushOutbox();
      if (summary.synced > 0) await loadActive();
      await reloadOps();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [loadActive, reloadOps]);

  // Initial load.
  useEffect(() => {
    loadMenu();
    loadActive();
    reloadOps();
  }, [loadMenu, loadActive, reloadOps]);

  // Foreground poll: refresh the queue and attempt a sync. Skipped while hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadActive();
      syncNow();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadActive, syncNow]);

  // Reconnect: re-pull fresh data and flush immediately.
  useEffect(() => {
    if (!online) return;
    loadMenu();
    loadActive();
    syncNow();
  }, [online, loadMenu, loadActive, syncNow]);

  // ---- Mutations ----

  // Place a walk-in order. Tries the network first; on a *network* failure queues it
  // and reports queued:true. A server rejection (e.g. pager already taken while
  // online) is surfaced as an error and NOT queued.
  const placeWalkin = useCallback(
    async (payload: CreatePayload): Promise<PlaceResult> => {
      const clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const op: Extract<OutboxOp, { kind: "create" }> = {
        kind: "create",
        clientId,
        createdAt: Date.now(),
        payload,
        localStatus: "pending",
        conflict: null,
      };

      if (online) {
        const res = await sendJson<{
          order: Order;
          loyaltyStatus?: { justQualified: boolean; phone: string | null };
        }>("/api/orders", "POST", { clientId, ...payload });
        if (res.ok) {
          await loadActive();
          return { ok: true, queued: false, order: res.data?.order, loyaltyStatus: res.data?.loyaltyStatus };
        }
        if (res.kind === "http") return { ok: false, error: res.error };
        // network error → fall through and queue
      }

      await outboxPut(op);
      await reloadOps();
      return { ok: true, queued: true };
    },
    [online, loadActive, reloadOps]
  );

  // Mark an order ready/collected. If it's still a queued (unsynced) create, fold the
  // status into that create op so it replays create-then-update in order. Otherwise
  // PATCH the server order; on network failure queue the patch with an optimistic
  // local override.
  const changeStatus = useCallback(
    async (order: Order, action: "ready" | "collected"): Promise<PlaceResult> => {
      const createOp = ops.find(
        (o): o is Extract<OutboxOp, { kind: "create" }> =>
          o.kind === "create" && o.clientId === order.clientId
      );
      if (order.pendingSync && createOp) {
        await outboxPut({ ...createOp, localStatus: action as LocalStatus });
        await reloadOps();
        return { ok: true, queued: true };
      }

      if (online) {
        const res = await sendJson(`/api/orders/${order.id}`, "PATCH", { action });
        if (res.ok) {
          await loadActive();
          return { ok: true, queued: false };
        }
        if (res.kind === "http") return { ok: false, error: res.error };
        // network → queue
      }

      const opId = `patch:${order.id}:${Date.now()}`;
      await outboxPut({ kind: "patch", opId, orderId: order.id, action, createdAt: Date.now() });
      await reloadOps();
      return { ok: true, queued: true };
    },
    [ops, online, loadActive, reloadOps]
  );

  // Cancel a pending order (cashier-facing — see /api/orders/:id/cancel). If it's
  // still a queued, unsynced create it never reached the server, so just drop the
  // queued op entirely rather than folding a status into it. Otherwise PATCH the
  // dedicated cancel route; on network failure queue it like any other patch.
  const cancelOrder = useCallback(
    async (order: Order): Promise<PlaceResult> => {
      const createOp = ops.find(
        (o): o is Extract<OutboxOp, { kind: "create" }> =>
          o.kind === "create" && o.clientId === order.clientId
      );
      if (order.pendingSync && createOp) {
        await outboxDelete(createOp.clientId);
        await reloadOps();
        return { ok: true, queued: false };
      }

      if (online) {
        const res = await sendJson(`/api/orders/${order.id}/cancel`, "PATCH");
        if (res.ok) {
          await loadActive();
          return { ok: true, queued: false };
        }
        if (res.kind === "http") return { ok: false, error: res.error };
        // network → queue
      }

      const opId = `patch:${order.id}:${Date.now()}`;
      await outboxPut({ kind: "patch", opId, orderId: order.id, action: "cancelled", createdAt: Date.now() });
      await reloadOps();
      return { ok: true, queued: true };
    },
    [ops, online, loadActive, reloadOps]
  );

  // Mark an order as paid after the fact. If it's still a queued, unsynced create, fold
  // isPaid into that create op's payload (replayed on sync — no separate patch needed).
  // Otherwise PATCH the server order; on network failure queue a "mark_paid" patch like
  // any other status change.
  const markPaid = useCallback(
    async (order: Order): Promise<PlaceResult> => {
      const createOp = ops.find(
        (o): o is Extract<OutboxOp, { kind: "create" }> =>
          o.kind === "create" && o.clientId === order.clientId
      );
      if (order.pendingSync && createOp) {
        await outboxPut({ ...createOp, payload: { ...createOp.payload, isPaid: true } });
        await reloadOps();
        return { ok: true, queued: true };
      }

      if (online) {
        const res = await sendJson(`/api/orders/${order.id}`, "PATCH", { action: "mark_paid" });
        if (res.ok) {
          await loadActive();
          return { ok: true, queued: false };
        }
        if (res.kind === "http") return { ok: false, error: res.error };
        // network → queue
      }

      const opId = `patch:${order.id}:${Date.now()}`;
      await outboxPut({ kind: "patch", opId, orderId: order.id, action: "mark_paid", createdAt: Date.now() });
      await reloadOps();
      return { ok: true, queued: true };
    },
    [ops, online, loadActive, reloadOps]
  );

  // Resolve a pager conflict: give the queued order a new pager, clear the flag, and
  // try to sync. The order is never dropped or auto-renumbered without the cashier.
  const resolveConflict = useCallback(
    async (clientId: string, newPager: number): Promise<void> => {
      const op = (await outboxAll()).find(
        (o): o is Extract<OutboxOp, { kind: "create" }> => o.kind === "create" && o.clientId === clientId
      );
      if (!op) return;
      await outboxPut({ ...op, payload: { ...op.payload, pagerNumber: newPager }, conflict: null });
      await reloadOps();
      await syncNow();
    },
    [reloadOps, syncNow]
  );

  const discard = useCallback(
    async (clientId: string): Promise<void> => {
      await outboxDelete(clientId);
      await reloadOps();
    },
    [reloadOps]
  );

  // ---- Derived view: merge server queue + optimistic offline orders ----
  const merged = useMemo(() => {
    const serverOrders = activeRaw?.orders ?? [];
    const serverClientIds = new Set(
      serverOrders.map((o) => o.clientId).filter((id): id is string => !!id)
    );

    // Queued patches overlay onto already-synced orders. An order can have more than
    // one queued patch at once (e.g. marked ready AND marked paid while offline), so
    // group by orderId instead of keeping only the last — a status action ("ready" |
    // "collected" | "cancelled") and "mark_paid" apply to different fields and must
    // not clobber each other.
    const patchesByOrderId = new Map<string, Extract<OutboxOp, { kind: "patch" }>[]>();
    for (const op of ops) {
      if (op.kind !== "patch") continue;
      const list = patchesByOrderId.get(op.orderId) ?? [];
      list.push(op);
      patchesByOrderId.set(op.orderId, list);
    }

    const fromServer = serverOrders
      .map((o) => {
        const patches = patchesByOrderId.get(o.id);
        if (!patches || patches.length === 0) return o;
        let next = { ...o, pendingSync: true };
        for (const patch of patches) {
          if (patch.action === "mark_paid") next = { ...next, isPaid: true };
          else next = { ...next, status: patch.action };
        }
        return next;
      })
      .filter((o) => o.status !== "collected" && o.status !== "cancelled");

    // Optimistic creates that haven't reached the server yet.
    const optimistic = ops
      .filter(
        (o): o is Extract<OutboxOp, { kind: "create" }> =>
          o.kind === "create" && !serverClientIds.has(o.clientId)
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(createOpToOrder)
      .filter((o) => o.status !== "collected");

    const orders = [...fromServer, ...optimistic];
    // Reserve pagers for both synced and queued uncollected orders so an offline order
    // can't have its pager handed out again locally.
    const usedPagers = Array.from(new Set(orders.map((o) => o.pagerNumber)));
    return { orders, usedPagers };
  }, [activeRaw, ops]);

  const needsAttention = useMemo(
    () => merged.orders.filter((o) => o.pendingSync && o.conflict),
    [merged.orders]
  );

  return {
    online,
    syncing,
    // data
    menu,
    menuError,
    menuLoading,
    orders: merged.orders,
    usedPagers: merged.usedPagers,
    deliveryOrders: activeRaw?.deliveryOrders ?? [],
    // queue state
    pendingCount: ops.length,
    needsAttention,
    // actions
    placeWalkin,
    changeStatus,
    cancelOrder,
    markPaid,
    resolveConflict,
    discard,
    syncNow,
    refreshActive: loadActive,
  };
}
