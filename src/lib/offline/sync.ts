// Outbox flush engine. Replays queued ops to the server in creation order:
//   • create — POST /api/orders with the clientId idempotency key, then replays any
//              folded-in status change (pending → ready → collected) so a create and
//              its later "mark ready/collected" apply in order against the new row.
//   • patch  — PATCH /api/orders/:id for status changes on already-synced orders.
//
// A network failure stops the flush (still offline) and leaves every remaining op
// queued. A pager conflict (409) — or any other server rejection — flags that create
// as "needs attention" and is kept, never dropped or auto-renumbered.
import type { Order } from "@/lib/types";
import {
  outboxAll,
  outboxPut,
  outboxDelete,
  sendJson,
  type CreateOp,
  type LocalStatus,
} from "./db";

export type FlushSummary = {
  synced: number; // ops fully processed and removed
  conflicts: number; // creates flagged needs-attention this pass
  stoppedOffline: boolean; // hit a network error — remaining ops still queued
};

// Replay a folded-in status change after the order exists server-side. Returns
// "network" if a request couldn't reach the server (caller should stop the flush).
async function replayStatus(orderId: string, target: LocalStatus): Promise<"done" | "network"> {
  // pending → nothing to replay. ready/collected → PATCH ready first (online order of
  // operations), then collected. PATCH is safe to re-apply if the order already
  // advanced server-side (idempotent retry path).
  if (target === "pending") return "done";

  const ready = await sendJson(`/api/orders/${orderId}`, "PATCH", { action: "ready" });
  if (!ready.ok && ready.kind === "network") return "network";

  if (target === "collected") {
    const collected = await sendJson(`/api/orders/${orderId}`, "PATCH", { action: "collected" });
    if (!collected.ok && collected.kind === "network") return "network";
  }
  return "done";
}

async function flushCreate(op: CreateOp): Promise<"synced" | "conflict" | "network"> {
  const res = await sendJson<{ order: Order }>("/api/orders", "POST", {
    clientId: op.clientId,
    ...op.payload,
  });

  if (!res.ok) {
    if (res.kind === "network") return "network";
    // Server rejected it (pager taken at sync time, validation, etc.). Keep the order,
    // flag it for the cashier to fix the pager and resubmit. Never drop or renumber.
    await outboxPut({ ...op, conflict: res.error });
    return "conflict";
  }

  // Created (201) or idempotent hit on an existing row (200). Either way the order now
  // exists; replay any folded-in status change in order.
  const replay = await replayStatus(res.data.order.id, op.localStatus);
  if (replay === "network") return "network";

  await outboxDelete(op.clientId);
  return "synced";
}

export async function flushOutbox(): Promise<FlushSummary> {
  const ops = (await outboxAll()).sort((a, b) => a.createdAt - b.createdAt);
  let synced = 0;
  let conflicts = 0;

  for (const op of ops) {
    if (op.kind === "create") {
      // Skip ones already flagged for attention until the cashier resolves them.
      if (op.conflict) continue;
      const result = await flushCreate(op);
      if (result === "network") return { synced, conflicts, stoppedOffline: true };
      if (result === "conflict") conflicts++;
      else synced++;
    } else {
      const res =
        op.action === "cancelled"
          ? await sendJson(`/api/orders/${op.orderId}/cancel`, "PATCH")
          : await sendJson(`/api/orders/${op.orderId}`, "PATCH", { action: op.action });
      if (!res.ok && res.kind === "network") return { synced, conflicts, stoppedOffline: true };
      // 2xx, or an HTTP error such as 404 (order deleted server-side): either way the
      // patch can't usefully be retried, so drop it.
      await outboxDelete(op.opId);
      synced++;
    }
  }

  return { synced, conflicts, stoppedOffline: false };
}
