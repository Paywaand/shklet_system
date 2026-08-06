"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Terminal,
  ShoppingCart,
  Check,
  Clock,
  MapPin,
  Truck,
  Store,
  Package,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Info,
  Gift,
} from "lucide-react";
import clsx from "clsx";
import { useFetch, apiSend } from "@/lib/client";
import { iqd, num, duration, shortTime, itemName } from "@/lib/format";
import type { MenuItem, ModifierGroup, Order, DeliveryOrder } from "@/lib/types";
import { usePosOffline } from "@/lib/offline/usePosOffline";
import { ModifiersSchema, safeParseJson } from "@/lib/schemas";
import type { PaymentMethod } from "@/lib/paymentMethods";
import { LOYALTY_FREE_ITEM_NAME, LOYALTY_QUALIFYING_TOTAL, type LoyaltyLookup } from "@/lib/loyaltyShared";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { Elapsed } from "@/components/Elapsed";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Receipt, type ReceiptData } from "@/components/Receipt";

type CartLine = {
  key: string; // unique per item + chosen modifier
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifier?: string; // e.g. "Sweet Sauce"
};

const ALL = "__all__";
// Fallback accent while the branch's delivery settings are loading.
const DELIVERY_COLOR_FALLBACK = "#0fb79b";
type OrderType = "walkin" | "delivery" | "takeaway";
type DeliveryPlatform = { platformName: string; commissionPct: number; color: string };

function parseModifiers(json: string | null): ModifierGroup[] {
  // Bounded + schema-validated parse (size cap before JSON.parse) — see lib/schemas.ts.
  return safeParseJson(json, ModifiersSchema, []);
}

export default function CashierPage() {
  // Offline-capable data + mutations for branch walk-in orders (menu, active queue,
  // place/ready/collected). Delivery + events stay on normal online fetches.
  const [branch, setBranch] = useState<string>(""); // "" = main branch (this is the event selector, not a city/physical branch)
  // Physical-branch scoping now happens entirely server-side (activeBranchId) —
  // branch-bound staff are fixed automatically; the super admin picks a branch
  // from the Sidebar switcher.
  const pos = usePosOffline(branch);
  const events = useFetch<{ events: { id: string; name: string }[] }>("/api/events/active");
  // Which delivery app this branch uses (Toters in Suli, Talabat in Erbil) + its
  // accent color. Loaded once; the POS only needs the label/color — the commission
  // is applied server-side.
  const deliverySettings = useFetch<{ settings: DeliveryPlatform }>("/api/delivery/settings");
  const platform: DeliveryPlatform = deliverySettings.data?.settings ?? {
    platformName: "Delivery",
    commissionPct: 0,
    color: DELIVERY_COLOR_FALLBACK,
  };
  const toast = useToast();
  const { t, lang } = useLanguage();

  const [orderType, setOrderType] = useState<OrderType>("walkin");
  const [reference, setReference] = useState(""); // delivery driver/order ref
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pager, setPager] = useState<number | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [isPaid, setIsPaid] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); // mobile bottom sheet
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  // Loyalty — optional phone entered at checkout, purely a lookup key. NOT a
  // discount: reaching 9 unlocks exactly one free Shklet Special.
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyLookup | null>(null);
  const [loyaltyChecking, setLoyaltyChecking] = useState(false);
  const [redeemFreeItem, setRedeemFreeItem] = useState(false);

  // Ad-hoc discount — unrelated to loyalty; the cashier types this in fresh
  // for a friend/regular, per order, via the "i" button on the cart header.
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "flat">("pct");
  const [discountValue, setDiscountValue] = useState("");
  const appliedManualDiscount = discountValue.trim() && Number(discountValue) > 0
    ? { type: discountType, value: Number(discountValue) }
    : null;

  const categories = pos.menu?.categories ?? [];
  const usedPagers = pos.usedPagers;
  // Categories to render as labelled sections (with dividers). "All" shows every
  // non-empty category; otherwise just the selected one.
  const visibleCategories = (
    activeCat === ALL ? categories : categories.filter((c) => c.id === activeCat)
  ).filter((c) => c.items.length > 0);

  // Set once an order is placed; drives the printable kitchen ticket overlay. Captured
  // from the cart BEFORE clearCart() runs, since the cart is what holds the
  // (already language-localised) line names.
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const grossTotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart]);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  // Loyalty (item 4) — client-side estimate of the discount, mirroring
  // lib/loyalty.ts's math, so the cashier sees the real total before placing
  // the order. The server recomputes and is the actual source of truth.
  const freeItemLine = cart.find(
    (l) => l.name.trim().toLowerCase() === LOYALTY_FREE_ITEM_NAME.toLowerCase()
  );
  const canRedeem = Boolean(freeItemLine && loyaltyInfo?.readyToRedeem);
  const estimatedDiscount = useMemo(() => {
    let d = 0;
    if (redeemFreeItem && canRedeem && freeItemLine) d += freeItemLine.price;
    const afterLoyalty = Math.max(0, grossTotal - d);
    if (appliedManualDiscount?.type === "pct") {
      d += Math.round(afterLoyalty * (appliedManualDiscount.value / 100));
    } else if (appliedManualDiscount?.type === "flat") {
      d += Math.min(appliedManualDiscount.value, afterLoyalty);
    }
    return d;
  }, [redeemFreeItem, canRedeem, freeItemLine, appliedManualDiscount, grossTotal]);
  const total = Math.max(0, grossTotal - estimatedDiscount);

  async function checkLoyalty() {
    const phone = customerPhone.trim();
    if (!phone) return setLoyaltyInfo(null);
    setLoyaltyChecking(true);
    try {
      const res = await fetch(`/api/loyalty/lookup?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      setLoyaltyInfo(data);
    } catch {
      toast.show(t("common.failed"), "error");
    } finally {
      setLoyaltyChecking(false);
    }
  }

  // Add an item — if it has modifier groups, prompt first.
  function onItemTap(item: MenuItem) {
    if (parseModifiers(item.modifiers).length > 0) {
      setModifierItem(item);
      return;
    }
    addLine(item);
  }

  function addLine(item: MenuItem, modifier?: string, priceDelta = 0) {
    const key = modifier ? `${item.id}::${modifier}` : item.id;
    setCart((c) => {
      const found = c.find((l) => l.key === key);
      if (found) return c.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...c,
        { key, id: item.id, name: itemName(item, lang), price: item.price + priceDelta, quantity: 1, modifier },
      ];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function clearCart() {
    setCart([]);
    setPager(null);
  }

  const lineItemsPayload = () =>
    cart.map((l) => ({ name: l.name, price: l.price, quantity: l.quantity, modifier: l.modifier ?? null }));

  async function placeOrder() {
    if (cart.length === 0) return toast.show(t("cashier.toast.cartEmpty"), "error");
    if (orderType !== "delivery" && pager == null) return toast.show(t("cashier.toast.selectPager"), "error");
    setPlacing(true);
    try {
      if (orderType !== "delivery") {
        // Offline-aware: queues + optimistic on a network drop, surfaces a real error
        // on a server rejection (e.g. pager already taken while online). Walk-in and
        // Take Away share the same pager pool and both live in the Order table.
        const res = await pos.placeWalkin({
          pagerNumber: pager as number,
          paymentMethod: payment,
          orderType: orderType === "takeaway" ? "takeaway" : "walk_in",
          isPaid,
          eventId: branch || null,
          items: lineItemsPayload(),
          customerPhone: customerPhone.trim() || null,
          redeemFreeItem,
          manualDiscountType: appliedManualDiscount?.type ?? null,
          manualDiscountValue: appliedManualDiscount?.value,
        });
        if (!res.ok) return toast.show(res.error, "error");
        toast.show(
          res.queued
            ? t("cashier.toast.savedOffline", { n: pager as number })
            : t("cashier.toast.orderPlaced", { n: pager as number })
        );
        // Proactive prompt: the moment a customer's count crosses 9, tell the
        // cashier right away — they don't have to remember to check next time.
        if (res.loyaltyStatus?.justQualified) {
          toast.show(
            t("cashier.loyalty.justQualified", { phone: res.loyaltyStatus.phone ?? "" }),
            "success"
          );
        }
        // Capture the kitchen ticket while the cart is still populated. Uses
        // the client-side placedAt when the order was queued offline (no
        // server round-trip yet) — a few seconds off is irrelevant for a
        // ticket that prints immediately. `res.order?.total` is the
        // server-confirmed, loyalty-discounted total when online; falls back
        // to the client cart sum only while queued offline (no server total yet).
        setReceipt({
          pagerNumber: pager as number,
          shortId: res.order?.shortId ?? null,
          placedAt: res.order?.placedAt ?? new Date(),
          orderType: orderType === "takeaway" ? "takeaway" : "walk_in",
          paymentMethod: payment,
          isPaid,
          total: res.order?.total ?? total,
          lines: cart.map((l) => ({
            key: l.key,
            name: l.name,
            price: l.price,
            quantity: l.quantity,
            modifier: l.modifier,
          })),
        });
      } else {
        // Delivery is out of scope for offline mode — online only.
        const created = await apiSend<{ order: DeliveryOrder }>("/api/delivery-orders", "POST", {
          reference: reference || null,
          items: lineItemsPayload(),
        });
        toast.show(t("cashier.toast.deliveryPlaced"));
        pos.refreshActive();
        // The kitchen still needs a ticket for a delivery order — it's the
        // same food, made the same way, regardless of which platform (Toters,
        // Talabat, ...) the customer ordered through.
        setReceipt({
          pagerNumber: null,
          shortId: created.order.shortId ?? null,
          placedAt: created.order.placedAt,
          orderType: "delivery",
          paymentMethod: "",
          isPaid: true,
          total: created.order.grossTotal,
          platformName: created.order.platformName,
          reference: created.order.reference,
          lines: cart.map((l) => ({
            key: l.key,
            name: l.name,
            price: l.price,
            quantity: l.quantity,
            modifier: l.modifier,
          })),
        });
      }
      clearCart();
      setOrderType("walkin");
      setReference("");
      setIsPaid(true);
      setCartOpen(false);
      setCustomerPhone("");
      setLoyaltyInfo(null);
      setRedeemFreeItem(false);
      setDiscountOpen(false);
      setDiscountValue("");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("cashier.toast.failedPlaceOrder"), "error");
    } finally {
      setPlacing(false);
    }
  }

  async function markReady(order: Order) {
    const res = await pos.changeStatus(order, "ready");
    if (!res.ok) return toast.show(res.error, "error");
    toast.show(
      res.queued
        ? t("cashier.toast.pagerReadyOffline", { n: order.pagerNumber })
        : t("cashier.toast.pagerReady", { n: order.pagerNumber })
    );
  }

  async function markCollected(order: Order) {
    const res = await pos.changeStatus(order, "collected");
    if (!res.ok) return toast.show(res.error, "error");
    toast.show(
      res.queued
        ? t("cashier.toast.pagerFreedOffline", { n: order.pagerNumber })
        : t("cashier.toast.pagerFreed", { n: order.pagerNumber })
    );
  }

  async function markPaid(order: Order) {
    const res = await pos.markPaid(order);
    if (!res.ok) return toast.show(res.error, "error");
    toast.show(t("cashier.toast.orderMarkedPaid"));
  }

  async function cancelOrder(order: Order) {
    const label = order.shortId
      ? `${t("cashier.confirm.orderWord")} ${order.shortId}`
      : `${t("cashier.confirm.pagerWord")} ${order.pagerNumber}`;
    if (!confirm(t("cashier.confirm.cancelOrder", { label }))) return;
    const res = await pos.cancelOrder(order);
    if (!res.ok) return toast.show(res.error, "error");
    toast.show(res.queued ? t("cashier.toast.orderCancelledOffline") : t("cashier.toast.orderCancelled"));
  }

  async function deliveryAction(order: DeliveryOrder, action: "ready" | "driver_arrived" | "collected") {
    try {
      await apiSend(`/api/delivery-orders/${order.id}`, "PATCH", { action });
      const msg =
        action === "ready"
          ? t("cashier.toast.deliveryReady")
          : action === "driver_arrived"
          ? t("cashier.deliveryCards.driverArrived")
          : t("cashier.toast.orderCollected");
      toast.show(msg);
      pos.refreshActive();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  // Same rule as walk-in orders: cancellable only while still "pending" (not
  // yet marked ready) — enforced server-side too, this is not just a hidden button.
  async function cancelDelivery(order: DeliveryOrder) {
    const label = order.reference || order.platformName;
    if (!confirm(t("cashier.confirm.cancelOrder", { label }))) return;
    try {
      await apiSend(`/api/delivery-orders/${order.id}/cancel`, "PATCH");
      toast.show(t("cashier.toast.orderCancelled"));
      pos.refreshActive();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("common.failed"), "error");
    }
  }

  if (pos.menuLoading) return <Loading />;
  if (pos.menuError) return <ErrorState message={pos.menuError} onRetry={() => pos.syncNow()} />;

  const cartPanel = (
    <CartPanel
      cart={cart}
      total={total}
      orderType={orderType}
      setOrderType={setOrderType}
      platform={platform}
      reference={reference}
      setReference={setReference}
      pager={pager}
      setPager={setPager}
      payment={payment}
      setPayment={setPayment}
      isPaid={isPaid}
      setIsPaid={setIsPaid}
      usedPagers={usedPagers}
      changeQty={changeQty}
      clearCart={clearCart}
      placeOrder={placeOrder}
      placing={placing}
      customerPhone={customerPhone}
      setCustomerPhone={setCustomerPhone}
      loyaltyInfo={loyaltyInfo}
      loyaltyChecking={loyaltyChecking}
      checkLoyalty={checkLoyalty}
      canRedeem={canRedeem}
      redeemFreeItem={redeemFreeItem}
      setRedeemFreeItem={setRedeemFreeItem}
      discountOpen={discountOpen}
      setDiscountOpen={setDiscountOpen}
      discountType={discountType}
      setDiscountType={setDiscountType}
      discountValue={discountValue}
      setDiscountValue={setDiscountValue}
      estimatedDiscount={estimatedDiscount}
    />
  );

  const activeEvents = events.data?.events ?? [];
  const onEvent = branch !== "";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{t("cashier.header.title")}</h1>
          <SyncBadge
            online={pos.online}
            pendingCount={pos.pendingCount}
            syncing={pos.syncing}
            onRetry={pos.syncNow}
          />
        </div>
        <div
          className={clsx(
            "flex items-center gap-2 rounded-xl px-3 py-1.5 border",
            onEvent ? "border-leaf bg-leaf-50 dark:bg-leaf/10" : "border-black/10 dark:border-white/10"
          )}
        >
          <MapPin size={16} className={onEvent ? "text-leaf" : "opacity-60"} />
          <span className="text-xs font-semibold opacity-70">{t("cashier.branch.sellingAt")}</span>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="bg-transparent font-bold text-sm outline-none cursor-pointer"
          >
            <option value="">{t("cashier.branch.mainBranch")}</option>
            {activeEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                📍 {ev.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pos.needsAttention.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm">
            <span className="font-bold">{t("cashier.attention.needAttention", { n: pos.needsAttention.length })}</span>{" "}
            {t("cashier.attention.pagerClashed")}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* Menu + active orders */}
        <div className="min-w-0 flex flex-col gap-5">
          {/* Categories (with All) */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setActiveCat(ALL)}
              className={clsx(
                "btn px-4 py-2.5 whitespace-nowrap",
                activeCat === ALL ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
              )}
            >
              {t("common.all")}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={clsx(
                  "btn px-4 py-2.5 whitespace-nowrap",
                  activeCat === c.id ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Item grid — grouped by category with dividers */}
          {visibleCategories.length === 0 ? (
            <EmptyState title={t("cashier.menuGrid.noItemsTitle")} hint={t("cashier.menuGrid.noItemsHint")} />
          ) : (
            <div className="flex flex-col">
              {visibleCategories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className={idx > 0 ? "mt-4 pt-4 border-t border-black/10 dark:border-white/10" : ""}
                >
                  <p className="text-sm font-bold uppercase tracking-wide opacity-50 mb-2">
                    {cat.name}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {cat.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onItemTap(item)}
                        className="card p-4 text-left hover:ring-2 hover:ring-corn active:scale-[0.98] transition min-h-[96px] flex flex-col justify-between"
                      >
                        <p className="font-bold leading-tight">{itemName(item, lang)}</p>
                        <p className="text-leaf font-extrabold mt-2">{iqd(item.price)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active orders */}
          <ActiveOrders
            orders={pos.orders}
            deliveryOrders={pos.deliveryOrders}
            platform={platform}
            loading={false}
            usedPagers={usedPagers}
            onReady={markReady}
            onCollected={markCollected}
            onCancel={cancelOrder}
            onMarkPaid={markPaid}
            onDelivery={deliveryAction}
            onCancelDelivery={cancelDelivery}
            onResolveConflict={pos.resolveConflict}
            onDiscard={pos.discard}
          />
        </div>

        {/* Desktop cart */}
        <div className="hidden lg:block sticky top-6">{cartPanel}</div>
      </div>

      {/* Mobile floating cart button */}
      {itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-4 left-4 right-4 z-30 btn-primary py-3.5 shadow-lg"
        >
          <ShoppingCart size={20} />
          {t("cashier.mobileCart.viewCart", { n: itemCount, price: iqd(total) })}
        </button>
      )}

      {/* Mobile cart sheet */}
      {cartOpen && (
        <Modal open onClose={() => setCartOpen(false)} title={t("cashier.cart.currentOrder")}>
          {cartPanel}
        </Modal>
      )}

      {/* Modifier prompt */}
      {modifierItem && (
        <ModifierModal
          item={modifierItem}
          onClose={() => setModifierItem(null)}
          onConfirm={(modifier, priceDelta) => {
            addLine(modifierItem, modifier, priceDelta);
            setModifierItem(null);
          }}
        />
      )}

      {/* Printable receipt for the order just placed. */}
      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

// Persistent offline/sync indicator. Stays out of the way when online with an empty
// queue; otherwise shows the pending count and doubles as a manual "retry sync".
function SyncBadge({
  online,
  pendingCount,
  syncing,
  onRetry,
}: {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  if (online && pendingCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onRetry}
      title={online ? t("cashier.syncBadge.tooltipOnline") : t("cashier.syncBadge.tooltipOffline")}
      className={clsx(
        "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold border",
        online ? "border-corn/50 bg-corn/15 text-cocoa" : "border-red-500/40 bg-red-500/10 text-red-500"
      )}
    >
      {online ? <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> : <WifiOff size={14} />}
      {online ? t("cashier.syncBadge.sync") : t("cashier.syncBadge.offline")}
      {pendingCount > 0 && (
        <span className="rounded-full bg-black/10 dark:bg-white/15 px-1.5">{pendingCount}</span>
      )}
    </button>
  );
}

// Pager-conflict resolver shown on a flagged offline order: the cashier picks a free
// pager and resends, or discards. Never auto-renumbers.
function ConflictResolver({
  order,
  usedPagers,
  onResolve,
  onDiscard,
}: {
  order: Order;
  usedPagers: number[];
  onResolve: (clientId: string, newPager: number) => void;
  onDiscard: (clientId: string) => void;
}) {
  const { t } = useLanguage();
  const free = Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => !usedPagers.includes(n));
  const [pick, setPick] = useState<number | "">(free[0] ?? "");
  return (
    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2">
      <p className="text-xs text-red-500 font-semibold mb-1.5">
        {t("cashier.pagerConflict.wasTaken", { n: order.pagerNumber })}
      </p>
      <div className="flex items-center gap-2">
        <select
          className="input py-1.5 text-sm flex-1"
          value={pick}
          onChange={(e) => setPick(e.target.value ? Number(e.target.value) : "")}
        >
          {free.length === 0 && <option value="">{t("cashier.pagerConflict.noFreePagers")}</option>}
          {free.map((n) => (
            <option key={n} value={n}>
              {t("cashier.pagerConflict.pagerOption", { n })}
            </option>
          ))}
        </select>
        <button
          className="btn-primary px-3 py-1.5 text-sm"
          disabled={pick === "" || !order.clientId}
          onClick={() => pick !== "" && order.clientId && onResolve(order.clientId, pick)}
        >
          {t("cashier.pagerConflict.resend")}
        </button>
      </div>
      <button
        type="button"
        className="text-xs text-red-500 mt-1.5 underline"
        onClick={() => order.clientId && onDiscard(order.clientId)}
      >
        {t("cashier.pagerConflict.discard")}
      </button>
    </div>
  );
}

function ModifierModal({
  item,
  onClose,
  onConfirm,
}: {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (modifier: string, priceDelta: number) => void;
}) {
  const { t, lang } = useLanguage();
  const groups = parseModifiers(item.modifiers);
  const [choices, setChoices] = useState<Record<string, string>>({});

  const allRequiredChosen = groups.every((g) => !g.required || choices[g.name]);

  function confirm() {
    // Join the chosen option labels into a single sub-line, e.g. "Sweet Sauce",
    // and sum their price deltas onto the item's base price.
    const chosenOptions = groups
      .map((g) => g.options.find((o) => o.label === choices[g.name]))
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
    const label = chosenOptions.map((o) => o.label).join(", ");
    const priceDelta = chosenOptions.reduce((s, o) => s + o.price, 0);
    onConfirm(label, priceDelta);
  }

  return (
    <Modal open onClose={onClose} title={itemName(item, lang)}>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.name}>
            <p className="label">
              {g.name}
              {g.required && <span className="text-red-500"> *</span>}
            </p>
            <div className="grid gap-2">
              {g.options.map((opt) => {
                const selected = choices[g.name] === opt.label;
                return (
                  <button
                    key={opt.label}
                    onClick={() => setChoices((c) => ({ ...c, [g.name]: opt.label }))}
                    className={clsx(
                      "btn justify-between px-4 py-3 text-left",
                      selected ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
                    )}
                  >
                    <span>
                      {opt.label}
                      {opt.price > 0 && <span className="opacity-70"> (+{iqd(opt.price)})</span>}
                    </span>
                    {selected && <Check size={18} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={confirm} disabled={!allRequiredChosen}>
          {t("cashier.modifierModal.addToOrder")}
        </button>
      </div>
    </Modal>
  );
}

function CartPanel({
  cart,
  total,
  orderType,
  setOrderType,
  platform,
  reference,
  setReference,
  pager,
  setPager,
  payment,
  setPayment,
  isPaid,
  setIsPaid,
  usedPagers,
  changeQty,
  clearCart,
  placeOrder,
  placing,
  customerPhone,
  setCustomerPhone,
  loyaltyInfo,
  loyaltyChecking,
  checkLoyalty,
  canRedeem,
  redeemFreeItem,
  setRedeemFreeItem,
  discountOpen,
  setDiscountOpen,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  estimatedDiscount,
}: {
  cart: CartLine[];
  total: number;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  platform: DeliveryPlatform;
  reference: string;
  setReference: (s: string) => void;
  pager: number | null;
  setPager: (n: number | null) => void;
  payment: PaymentMethod;
  setPayment: (p: PaymentMethod) => void;
  isPaid: boolean;
  setIsPaid: (p: boolean) => void;
  usedPagers: number[];
  changeQty: (key: string, delta: number) => void;
  clearCart: () => void;
  placeOrder: () => void;
  placing: boolean;
  customerPhone: string;
  setCustomerPhone: (s: string) => void;
  loyaltyInfo: LoyaltyLookup | null;
  loyaltyChecking: boolean;
  checkLoyalty: () => void;
  canRedeem: boolean;
  redeemFreeItem: boolean;
  setRedeemFreeItem: (b: boolean) => void;
  discountOpen: boolean;
  setDiscountOpen: (b: boolean) => void;
  discountType: "pct" | "flat";
  setDiscountType: (t: "pct" | "flat") => void;
  discountValue: string;
  setDiscountValue: (s: string) => void;
  estimatedDiscount: number;
}) {
  const { t } = useLanguage();
  const isDelivery = orderType === "delivery";
  const deliveryColor = platform.color || DELIVERY_COLOR_FALLBACK;
  const canPlace = cart.length > 0 && (isDelivery || pager != null);

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold text-lg">{t("cashier.cart.currentOrder")}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDiscountOpen(!discountOpen)}
            title={t("cashier.discount.button")}
            className={clsx(
              "btn-ghost size-8 rounded-lg",
              discountValue.trim() && Number(discountValue) > 0 && "text-corn"
            )}
          >
            <Info size={16} />
          </button>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-sm text-red-500 font-bold">
              {t("cashier.cart.clear")}
            </button>
          )}
        </div>
      </div>

      {/* Ad-hoc discount — unrelated to loyalty; typed fresh per order. */}
      {discountOpen && (
        <div className="rounded-xl border border-corn/40 bg-corn/10 p-3">
          <p className="label mb-1.5">{t("cashier.discount.title")}</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setDiscountType("pct")}
              className={clsx("btn py-2 text-sm", discountType === "pct" ? "bg-corn text-cocoa" : "bg-black/5 dark:bg-white/10")}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => setDiscountType("flat")}
              className={clsx("btn py-2 text-sm", discountType === "flat" ? "bg-corn text-cocoa" : "bg-black/5 dark:bg-white/10")}
            >
              {t("common.iqd")}
            </button>
          </div>
          <input
            className="input"
            type="number"
            min={0}
            placeholder={discountType === "pct" ? "10" : "5000"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
          {discountValue.trim() && Number(discountValue) > 0 && (
            <button
              type="button"
              onClick={() => setDiscountValue("")}
              className="text-xs text-red-500 font-semibold mt-1.5"
            >
              {t("cashier.discount.clear")}
            </button>
          )}
        </div>
      )}

      {/* Order type: Walk-in full-width on top, Delivery + Take Away side by side below */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setOrderType("walkin")}
          className={clsx(
            "btn py-2.5 w-full",
            orderType === "walkin" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
          )}
        >
          <Store size={18} /> {t("cashier.cart.walkIn")}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderType("delivery")}
            style={isDelivery ? { backgroundColor: deliveryColor, color: "#fff" } : undefined}
            className={clsx("btn py-2.5", !isDelivery && "bg-black/5 dark:bg-white/10")}
          >
            <Truck size={18} /> {platform.platformName}
          </button>
          <button
            onClick={() => setOrderType("takeaway")}
            className={clsx(
              "btn py-2.5",
              orderType === "takeaway" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10"
            )}
          >
            <Package size={18} /> {t("cashier.cart.takeAway")}
          </button>
        </div>
      </div>

      {cart.length === 0 ? (
        <p className="text-sm opacity-50 py-6 text-center">{t("cashier.cart.tapItems")}</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[34vh] overflow-y-auto">
          {cart.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{l.name}</p>
                {l.modifier && <p className="text-xs text-leaf truncate">+ {l.modifier}</p>}
                <p className="text-xs opacity-60">{iqd(l.price)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => changeQty(l.key, -1)} className="btn-ghost size-8 min-h-0 rounded-lg">
                  {l.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                </button>
                <span className="w-6 text-center font-bold">{l.quantity}</span>
                <button onClick={() => changeQty(l.key, 1)} className="btn-ghost size-8 min-h-0 rounded-lg">
                  <Plus size={14} />
                </button>
              </div>
              <span className="w-20 text-right font-bold text-sm">{num(l.price * l.quantity)}</span>
            </div>
          ))}
        </div>
      )}

      {isDelivery ? (
        <>
          {/* Delivery: reference instead of pager; payment handled by the platform */}
          <div>
            <label className="label">{t("cashier.cart.driverRefLabel")}</label>
            <input
              className="input"
              placeholder={t("cashier.cart.driverRefPlaceholder")}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ backgroundColor: `${deliveryColor}1a` }}>
            <span style={{ color: deliveryColor }}>
              {t("cashier.cart.paymentHandledByDelivery", { platform: platform.platformName })}
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Pager */}
          <div>
            <label className="label">{t("cashier.cart.pagerNumberLabel")}</label>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
                const used = usedPagers.includes(n);
                const selected = pager === n;
                return (
                  <button
                    key={n}
                    disabled={used}
                    onClick={() => setPager(selected ? null : n)}
                    className={clsx(
                      "aspect-square rounded-lg font-bold text-sm transition",
                      selected
                        ? "bg-corn text-white ring-2 ring-cocoa"
                        : used
                        ? "bg-black/5 dark:bg-white/5 opacity-30 cursor-not-allowed line-through"
                        : "bg-black/5 dark:bg-white/10 hover:bg-corn/40"
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment */}
          <div>
            <label className="label">{t("cashier.cart.paymentLabel")}</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPayment("cash")}
                className={clsx("btn py-2.5", payment === "cash" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10")}
              >
                <Banknote size={18} /> {t("common.cash")}
              </button>
              <button
                onClick={() => setPayment("card")}
                className={clsx("btn py-2.5", payment === "card" ? "bg-fib text-white" : "bg-black/5 dark:bg-white/10")}
              >
                <CreditCard size={18} /> {t("common.card")}
              </button>
              <button
                onClick={() => setPayment("pos")}
                className={clsx("btn py-2.5", payment === "pos" ? "bg-leaf text-white" : "bg-black/5 dark:bg-white/10")}
              >
                <Terminal size={18} /> {t("common.pos")}
              </button>
            </div>
          </div>

          {/* Paid / unpaid — defaults to Paid */}
          <div>
            <label className="label">{t("cashier.cart.paidStatusLabel")}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPaid(true)}
                className={clsx(
                  "btn py-2.5 border-2",
                  isPaid
                    ? "bg-leaf text-white border-leaf"
                    : "bg-black/5 dark:bg-white/10 border-transparent"
                )}
              >
                <Check size={18} /> {t("cashier.cart.paid")}
              </button>
              <button
                type="button"
                onClick={() => setIsPaid(false)}
                className={clsx(
                  "btn py-2.5 border-2",
                  !isPaid
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-black/5 dark:bg-white/10 border-transparent"
                )}
              >
                <AlertTriangle size={18} /> {t("cashier.cart.notPaidYet")}
              </button>
            </div>
          </div>

          {/* Loyalty (item 4) — optional phone, purely a lookup key. */}
          <div>
            <label className="label">{t("cashier.loyalty.phoneLabel")}</label>
            <div className="flex items-center gap-1.5">
              <input
                className="input flex-1"
                placeholder={t("cashier.loyalty.phonePlaceholder")}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <button
                type="button"
                onClick={checkLoyalty}
                disabled={!customerPhone.trim() || loyaltyChecking}
                title={t("cashier.loyalty.check")}
                className="btn-ghost size-10 rounded-lg shrink-0 disabled:opacity-40"
              >
                <Info size={18} />
              </button>
            </div>
            {loyaltyInfo && (
              <p className="text-xs mt-1.5 font-semibold">
                {loyaltyInfo.readyToRedeem ? (
                  <span className="text-leaf">{t("cashier.loyalty.readyToRedeem")}</span>
                ) : (
                  <span className="opacity-70">
                    {t("cashier.loyalty.progress", {
                      count: String(loyaltyInfo.loyaltyCount),
                      total: String(LOYALTY_QUALIFYING_TOTAL),
                      remaining: String(loyaltyInfo.remaining),
                    })}
                  </span>
                )}
              </p>
            )}
            {canRedeem && (
              <button
                type="button"
                onClick={() => setRedeemFreeItem(!redeemFreeItem)}
                className={clsx(
                  "btn w-full py-2 mt-2 text-sm",
                  redeemFreeItem ? "bg-leaf text-white" : "bg-leaf/10 text-leaf border border-leaf/40"
                )}
              >
                <Gift size={16} /> {t("cashier.loyalty.applyFreeItem", { item: LOYALTY_FREE_ITEM_NAME })}
              </button>
            )}
            {estimatedDiscount > 0 && (
              <p className="text-xs opacity-60 mt-1">
                {t("cashier.loyalty.discountApplied", { amount: iqd(estimatedDiscount) })}
              </p>
            )}
          </div>
        </>
      )}

      <div className="border-t border-black/10 dark:border-white/10 pt-3 flex items-center justify-between text-lg font-extrabold">
        <span>{t("cashier.cart.totalLabel")}</span>
        <span className="text-leaf">{iqd(total)}</span>
      </div>

      <button
        onClick={placeOrder}
        disabled={placing || !canPlace}
        style={isDelivery ? { backgroundColor: deliveryColor, color: "#fff" } : undefined}
        className={clsx("py-3.5 text-base", isDelivery ? "btn" : "btn-primary")}
      >
        <Check size={20} />{" "}
        {placing
          ? t("cashier.cart.placing")
          : isDelivery
          ? t("cashier.cart.placeDeliveryOrder")
          : t("cashier.cart.placeOrder")}
      </button>
    </div>
  );
}

function OrderItems({ items }: { items: Order["items"] }) {
  return (
    <ul className="text-sm mt-2 space-y-0.5">
      {items.map((it) => (
        <li key={it.id}>
          <div className="flex justify-between gap-2">
            <span className="truncate">
              {it.quantity}× {it.name}
            </span>
          </div>
          {it.modifier && <span className="text-xs text-leaf">+ {it.modifier}</span>}
        </li>
      ))}
    </ul>
  );
}

function ActiveOrders({
  orders,
  deliveryOrders,
  platform,
  loading,
  usedPagers,
  onReady,
  onCollected,
  onCancel,
  onMarkPaid,
  onDelivery,
  onCancelDelivery,
  onResolveConflict,
  onDiscard,
}: {
  orders: Order[];
  deliveryOrders: DeliveryOrder[];
  platform: DeliveryPlatform;
  loading: boolean;
  usedPagers: number[];
  onReady: (o: Order) => void;
  onCollected: (o: Order) => void;
  onCancel: (o: Order) => void;
  onMarkPaid: (o: Order) => void;
  onDelivery: (o: DeliveryOrder, action: "ready" | "driver_arrived" | "collected") => void;
  onCancelDelivery: (o: DeliveryOrder) => void;
  onResolveConflict: (clientId: string, newPager: number) => void;
  onDiscard: (clientId: string) => void;
}) {
  const { t } = useLanguage();
  const deliveryColor = platform.color || DELIVERY_COLOR_FALLBACK;
  const totalActive = orders.length + deliveryOrders.length;
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-extrabold text-lg flex items-center gap-2">
          <Clock size={20} className="text-leaf" /> {t("cashier.activeOrders.title")}
        </h2>
        <span className="chip bg-leaf text-white">{t("cashier.activeOrders.activeCount", { n: totalActive })}</span>
      </div>

      {totalActive === 0 ? (
        <p className="text-sm opacity-50 py-6 text-center">
          {loading ? t("common.loading") : t("cashier.activeOrders.noneRightNow")}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Walk-in orders — the items are the headline; the pager is a small
              secondary badge so staff instantly see what to make, not a number. */}
          {orders.map((o) => (
            <div
              key={o.id}
              className={clsx(
                "rounded-xl border p-3 flex flex-col",
                !o.isPaid && "border-l-4 border-l-red-500",
                o.conflict
                  ? "border-red-500/60 bg-red-500/5"
                  : o.pendingSync
                  ? "border-corn/60 border-dashed bg-corn/5"
                  : o.status === "ready"
                  ? "border-leaf bg-leaf-50 dark:bg-leaf/10"
                  : "border-black/10 dark:border-white/10"
              )}
            >
              {/* Top row: order code / sync state (muted) + pager badge in the corner */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="font-mono text-xs font-bold tracking-wider opacity-50">
                    {o.shortId ?? ""}
                  </span>
                  {o.orderType === "takeaway" && (
                    <span className="chip bg-cocoa/15 text-cocoa text-[10px] gap-1">
                      <Package size={10} /> {t("cashier.cart.takeAway")}
                    </span>
                  )}
                  {!o.isPaid && (
                    <span className="chip bg-red-500/15 text-red-500 text-[10px] gap-1">
                      {t("cashier.activeOrders.unpaid")}
                    </span>
                  )}
                  {o.conflict ? (
                    <span className="chip bg-red-500/15 text-red-500 text-[10px] gap-1">
                      <AlertTriangle size={10} /> {t("cashier.activeOrders.needsAttention")}
                    </span>
                  ) : o.pendingSync ? (
                    <span className="chip bg-corn/20 text-cocoa text-[10px] gap-1">
                      <RefreshCw size={10} /> {t("cashier.activeOrders.pendingSync")}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {o.status === "pending" && !o.conflict && (
                    <button
                      onClick={() => onCancel(o)}
                      className="btn-ghost size-7 rounded-lg text-red-500"
                      title={t("cashier.activeOrders.cancelOrder")}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <span className="chip bg-corn text-white font-extrabold text-sm shrink-0">
                    {t("cashier.pagerConflict.pagerOption", { n: o.pagerNumber })}
                  </span>
                </div>
              </div>

              {/* Items — the largest, most scannable text on the card */}
              <ul className="text-lg font-extrabold leading-snug space-y-0.5">
                {o.items.map((it) => (
                  <li key={it.id}>
                    {it.quantity}× {it.name}
                    {it.modifier && (
                      <span className="block text-sm font-semibold text-leaf">+ {it.modifier}</span>
                    )}
                  </li>
                ))}
              </ul>

              {/* Total + elapsed. A provisional total (computed offline from the cached
                  menu) is prefixed with ~ until the server-computed total syncs in. */}
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-base font-bold text-leaf" title={o.provisional ? t("cashier.activeOrders.provisionalTooltip") : undefined}>
                  {o.provisional ? "~" : ""}
                  {iqd(o.total)}
                </p>
                <p className="text-xs opacity-60">
                  <Elapsed since={o.placedAt} /> · {shortTime(o.placedAt)}
                </p>
              </div>

              {!o.isPaid && !o.conflict && (
                <button
                  onClick={() => onMarkPaid(o)}
                  className="btn w-full py-2 mt-2 border border-red-500/40 bg-red-500/10 text-red-500"
                >
                  {t("cashier.activeOrders.markPaid")}
                </button>
              )}

              {o.conflict ? (
                <ConflictResolver
                  order={o}
                  usedPagers={usedPagers}
                  onResolve={onResolveConflict}
                  onDiscard={onDiscard}
                />
              ) : o.status === "pending" ? (
                <button onClick={() => onReady(o)} className="btn-leaf w-full py-2.5 mt-2">
                  <Check size={18} /> {t("cashier.activeOrders.markReady")}
                </button>
              ) : (
                <button onClick={() => onCollected(o)} className="btn-primary w-full py-2.5 mt-2">
                  {t("cashier.activeOrders.collectedFreePager")}
                </button>
              )}
            </div>
          ))}

          {/* Delivery-platform orders — same card design as walk-in */}
          {deliveryOrders.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border-2 p-3 flex flex-col"
              style={{
                borderColor: o.status === "ready" ? deliveryColor : `${deliveryColor}66`,
                backgroundColor: o.status === "ready" ? `${deliveryColor}1a` : `${deliveryColor}0d`,
              }}
            >
              {/* Top row: order code (muted) + reference + platform badge */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  {o.shortId && (
                    <span className="font-mono text-xs font-bold tracking-wider opacity-50 block">
                      {o.shortId}
                    </span>
                  )}
                  {o.reference && (
                    <p className="font-bold text-sm truncate">{o.reference}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {o.status === "pending" && (
                    <button
                      onClick={() => onCancelDelivery(o)}
                      className="btn-ghost size-7 rounded-lg text-red-500"
                      title={t("cashier.activeOrders.cancelOrder")}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <span
                    className="chip text-white text-[11px]"
                    style={{ backgroundColor: deliveryColor }}
                  >
                    <Truck size={12} className="mr-1" /> {o.platformName || platform.platformName}
                  </span>
                </div>
              </div>

              {/* Items — the largest, most scannable text on the card */}
              <ul className="text-lg font-extrabold leading-snug space-y-0.5">
                {o.items.map((it) => (
                  <li key={it.id}>
                    {it.quantity}× {it.name}
                    {it.modifier && (
                      <span className="block text-sm font-semibold" style={{ color: deliveryColor }}>+ {it.modifier}</span>
                    )}
                  </li>
                ))}
              </ul>

              {/* Total + elapsed */}
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-base font-bold" style={{ color: deliveryColor }}>{iqd(o.grossTotal)}</p>
                <p className="text-xs opacity-60">
                  <Elapsed since={o.placedAt} /> · {shortTime(o.placedAt)}
                </p>
              </div>

              {/* Timing stats */}
              {(o.prepSeconds != null || o.arriveSeconds != null) && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-60 mt-1">
                  {o.prepSeconds != null && (
                    <span>
                      {t("cashier.deliveryCards.prep")} {duration(o.prepSeconds)}
                    </span>
                  )}
                  {o.arriveSeconds != null && (
                    <span>
                      {t("cashier.deliveryCards.readyToDriver")} {duration(o.arriveSeconds)}
                    </span>
                  )}
                </div>
              )}

              {/* Stage buttons */}
              {o.status === "pending" && (
                <button
                  onClick={() => onDelivery(o, "ready")}
                  className="btn w-full py-2.5 mt-2 text-white"
                  style={{ backgroundColor: deliveryColor }}
                >
                  <Check size={18} /> {t("cashier.deliveryCards.ready")}
                </button>
              )}
              {o.status === "ready" && (
                <button
                  onClick={() => onDelivery(o, "driver_arrived")}
                  className="btn w-full py-2.5 mt-2 text-white"
                  style={{ backgroundColor: deliveryColor }}
                >
                  <Truck size={18} /> {t("cashier.deliveryCards.driverArrived")}
                </button>
              )}
              {o.status === "driver_arrived" && (
                <button onClick={() => onDelivery(o, "collected")} className="btn-primary w-full py-2.5 mt-2">
                  {t("cashier.deliveryCards.collected")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
