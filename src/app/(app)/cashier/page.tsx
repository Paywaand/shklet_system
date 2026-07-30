"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/money";
import toast from "react-hot-toast";
import { X, ShoppingCart, Trash2, CheckCircle2, PackageCheck, Wifi, Bell } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModifierOption {
  id: string;
  name: string;
  nameKu: string;
  extraPrice: number;
}
interface ModifierGroup {
  id: string;
  name: string;
  nameKu: string;
  required: boolean;
  options: ModifierOption[];
}
interface MenuItem {
  id: string;
  name: string;
  nameKu: string;
  price: number;
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
}
interface Category {
  id: string;
  name: string;
  nameKu: string;
  items: MenuItem[];
}

interface CartLineModifier {
  groupName: string;
  optionName: string;
  extraPrice: number;
}
interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  nameKu: string;
  unitPrice: number;
  quantity: number;
  modifiers: CartLineModifier[];
}

interface ActiveOrder {
  id: string;
  code: string;
  type: "WALKIN" | "DELIVERY";
  status: "PLACED" | "READY" | "DRIVER_ARRIVED" | "COLLECTED" | "CANCELLED";
  pagerNumber: number | null;
  total: number;
  placedAt: string;
  readyAt: string | null;
  deliveryReference: string | null;
  items: { nameSnapshot: string; nameKuSnapshot: string; quantity: number }[];
}

const CATEGORY_ACCENTS = ["#EF3340", "#249E6B", "#FEDB00", "#AA8066", "#CBA3D8"];

export default function CashierPage() {
  const { t, lang } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"WALKIN" | "DELIVERY">("WALKIN");
  const [pagerNumber, setPagerNumber] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [deliveryRef, setDeliveryRef] = useState("");
  const [branch, setBranch] = useState<{ name: string; nameKu: string; pagerRangeStart: number; pagerRangeEnd: number } | null>(null);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [placing, setPlacing] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMenu = useCallback(async () => {
    const res = await fetch("/api/cashier/menu");
    const data = await res.json();
    setCategories(data.categories ?? []);
    if (data.categories?.[0]) setActiveCategory(data.categories[0].id);
  }, []);

  const loadContext = useCallback(async () => {
    const res = await fetch("/api/cashier/context");
    const data = await res.json();
    setBranch(data.branch);
  }, []);

  const loadActiveOrders = useCallback(async () => {
    const res = await fetch("/api/orders");
    const data = await res.json();
    setActiveOrders(data.orders ?? []);
  }, []);

  useEffect(() => {
    Promise.all([loadMenu(), loadContext(), loadActiveOrders()]).finally(() => setLoading(false));
    pollRef.current = setInterval(loadActiveOrders, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart(item: MenuItem, modifiers: CartLineModifier[] = []) {
    const key = `${item.id}-${modifiers.map((m) => m.optionName).join(",")}-${Date.now()}`;
    setCart((prev) => [
      ...prev,
      {
        key,
        menuItemId: item.id,
        name: item.name,
        nameKu: item.nameKu,
        unitPrice: item.price,
        quantity: 1,
        modifiers,
      },
    ]);
  }

  function handleItemTap(item: MenuItem) {
    if (item.modifierGroups.length > 0) {
      setModifierItem(item);
    } else {
      addToCart(item);
      toast.success(lang === "ku" ? item.nameKu : item.name, {
        duration: 900,
        icon: "✓",
        style: { minWidth: "auto" },
      });
    }
  }

  function removeCartLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function clearCart() {
    setCart([]);
    setPagerNumber(null);
    setDeliveryRef("");
  }

  const cartTotal = cart.reduce(
    (sum, line) =>
      sum + (line.unitPrice + line.modifiers.reduce((s, m) => s + m.extraPrice, 0)) * line.quantity,
    0,
  );
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  const takenPagers = new Set(
    activeOrders.filter((o) => o.status !== "CANCELLED" && o.status !== "COLLECTED").map((o) => o.pagerNumber),
  );
  const pagerOptions: number[] = [];
  if (branch) {
    for (let i = branch.pagerRangeStart; i <= branch.pagerRangeEnd; i++) {
      if (!takenPagers.has(i)) pagerOptions.push(i);
    }
  }

  async function placeOrder() {
    if (cart.length === 0) {
      toast.error(t("cashier.cartEmpty"));
      return;
    }
    if (orderType === "WALKIN" && pagerNumber == null) {
      toast.error(t("cashier.selectPager"));
      return;
    }

    setPlacing(true);
    const payload = {
      type: orderType,
      pagerNumber: orderType === "WALKIN" ? pagerNumber : undefined,
      paymentMethod: orderType === "DELIVERY" ? ("PLATFORM" as const) : paymentMethod,
      deliveryReference: orderType === "DELIVERY" ? deliveryRef : undefined,
      items: cart.map((line) => ({
        menuItemId: line.menuItemId,
        nameSnapshot: line.name,
        nameKuSnapshot: line.nameKu,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        modifiers: line.modifiers,
      })),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        toast.error(t("cashier.pagerTakenMessage", { n: pagerNumber ?? "" }));
        setPagerNumber(null);
        loadActiveOrders();
        return;
      }
      if (!res.ok) throw new Error("failed");
      toast.success(
        orderType === "WALKIN"
          ? t("cashier.orderPlaced", { n: pagerNumber ?? "" })
          : t("cashier.deliveryOrderPlaced"),
      );
      clearCart();
      setMobileCartOpen(false);
      loadActiveOrders();
    } catch {
      toast.error(t("cashier.failedToPlaceOrder"));
    } finally {
      setPlacing(false);
    }
  }

  async function markReady(order: ActiveOrder) {
    await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "READY" }),
    });
    toast.success(
      order.pagerNumber
        ? t("cashier.pagerReady", { n: order.pagerNumber })
        : t("cashier.deliveryOrderReady"),
    );
    loadActiveOrders();
  }

  async function collectOrder(order: ActiveOrder) {
    await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COLLECTED" }),
    });
    toast.success(order.pagerNumber ? t("cashier.pagerFreed", { n: order.pagerNumber }) : t("cashier.orderCollected"));
    loadActiveOrders();
  }

  async function cancelOrder(order: ActiveOrder) {
    if (!confirm(t("cashier.confirmCancelOrder"))) return;
    await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    toast.success(t("cashier.orderCancelledPagerFreed"));
    loadActiveOrders();
  }

  const attentionCount = activeOrders.filter((o) => o.status === "PLACED").length;

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-2.25rem)]">
      {/* Left: menu grid */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{t("cashier.header")}</h1>
            {branch && (
              <p className="text-sm text-[var(--muted)] flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-shklet-green" />
                {lang === "ku" ? branch.nameKu : branch.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-shklet-green bg-shklet-green/10 px-3 py-1.5 rounded-full">
            <Wifi size={13} /> {t("cashier.sync")}
          </div>
        </div>

        <AnimatePresence>
          {attentionCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="flex items-center gap-2.5 rounded-xl bg-shklet-yellow/15 border border-shklet-yellow/40 px-4 py-3 text-sm font-medium">
                <Bell size={16} className="text-[#8a6d00] dark:text-shklet-yellow shrink-0" />
                {t("cashier.attentionBanner", { n: attentionCount })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
          {categories.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "shrink-0 px-4 h-10 rounded-xl text-sm font-bold transition-all duration-150 border",
                activeCategory === cat.id
                  ? "text-white shadow-elevation-2 border-transparent"
                  : "bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]",
              )}
              style={activeCategory === cat.id ? { backgroundColor: CATEGORY_ACCENTS[i % CATEGORY_ACCENTS.length] } : undefined}
            >
              {lang === "ku" ? cat.nameKu : cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pb-28 lg:pb-2 content-start">
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton rounded-2xl h-[92px]" />
            ))}
          {!loading &&
            categories
              .find((c) => c.id === activeCategory)
              ?.items.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleItemTap(item)}
                  className="group relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-start shadow-elevation-1 hover:shadow-elevation-2 hover:border-shklet-red/40 transition-all duration-150 overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-shklet-red scale-x-0 group-hover:scale-x-100 transition-transform origin-left rtl:origin-right" />
                  <p className="font-bold text-[15px] leading-snug mb-1.5">
                    {lang === "ku" ? item.nameKu : item.name}
                  </p>
                  <p className="ltr-nums text-shklet-red font-extrabold text-[15px]">{formatMoney(item.price)}</p>
                  {item.modifierGroups.length > 0 && (
                    <span className="absolute top-3 end-3 text-[10px] font-bold text-[var(--muted-soft)] bg-black/[0.04] dark:bg-white/[0.06] rounded-full px-2 py-0.5">
                      +{item.modifierGroups.length}
                    </span>
                  )}
                </motion.button>
              ))}
          {!loading && categories.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={ShoppingCart} title={t("cashier.noItemsHere")} description={t("cashier.addItemsHint")} />
            </div>
          )}
        </div>
      </div>

      {/* Right: cart + active orders (desktop) */}
      <div className="hidden lg:flex flex-col w-[380px] shrink-0 gap-4 overflow-y-auto no-scrollbar">
        <CartPanel
          cart={cart}
          cartTotal={cartTotal}
          orderType={orderType}
          setOrderType={setOrderType}
          pagerNumber={pagerNumber}
          setPagerNumber={setPagerNumber}
          pagerOptions={pagerOptions}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          deliveryRef={deliveryRef}
          setDeliveryRef={setDeliveryRef}
          removeCartLine={removeCartLine}
          clearCart={clearCart}
          placeOrder={placeOrder}
          placing={placing}
        />
        <ActiveOrdersPanel
          orders={activeOrders}
          onReady={markReady}
          onCollect={collectOrder}
          onCancel={cancelOrder}
        />
      </div>

      {/* Mobile cart trigger */}
      <AnimatePresence>
        {cart.length > 0 && !mobileCartOpen && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden fixed bottom-4 inset-x-4 z-30 bg-shklet-red text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 shadow-[0_12px_32px_-8px_rgba(239,51,64,0.55)]"
          >
            <ShoppingCart size={18} />
            {t("cashier.viewCartMobile", { n: cartCount, price: formatMoney(cartTotal) })}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileCartOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileCartOpen(false)}
          >
            <motion.div
              className="bg-[var(--card)] w-full max-h-[88vh] overflow-y-auto rounded-t-3xl p-4"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-3">
                <div className="h-1 w-10 rounded-full bg-[var(--card-border)]" />
              </div>
              <CartPanel
                cart={cart}
                cartTotal={cartTotal}
                orderType={orderType}
                setOrderType={setOrderType}
                pagerNumber={pagerNumber}
                setPagerNumber={setPagerNumber}
                pagerOptions={pagerOptions}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                deliveryRef={deliveryRef}
                setDeliveryRef={setDeliveryRef}
                removeCartLine={removeCartLine}
                clearCart={clearCart}
                placeOrder={placeOrder}
                placing={placing}
                bare
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {modifierItem && (
        <ModifierModal
          item={modifierItem}
          onClose={() => setModifierItem(null)}
          onConfirm={(mods) => {
            addToCart(modifierItem, mods);
            setModifierItem(null);
          }}
        />
      )}
    </div>
  );
}

function CartPanel(props: {
  cart: CartLine[];
  cartTotal: number;
  orderType: "WALKIN" | "DELIVERY";
  setOrderType: (t: "WALKIN" | "DELIVERY") => void;
  pagerNumber: number | null;
  setPagerNumber: (n: number | null) => void;
  pagerOptions: number[];
  paymentMethod: "CASH" | "CARD";
  setPaymentMethod: (p: "CASH" | "CARD") => void;
  deliveryRef: string;
  setDeliveryRef: (s: string) => void;
  removeCartLine: (key: string) => void;
  clearCart: () => void;
  placeOrder: () => void;
  placing: boolean;
  bare?: boolean;
}) {
  const { t } = useLanguage();
  const {
    cart,
    cartTotal,
    orderType,
    setOrderType,
    pagerNumber,
    setPagerNumber,
    pagerOptions,
    paymentMethod,
    setPaymentMethod,
    deliveryRef,
    setDeliveryRef,
    removeCartLine,
    clearCart,
    placeOrder,
    placing,
    bare,
  } = props;

  return (
    <div className={cn(!bare && "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-elevation-1", "p-4 sm:p-5")}>
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="font-bold text-[15px]">{t("cashier.currentOrder")}</h2>
        {cart.length > 0 && (
          <button onClick={clearCart} className="text-xs font-semibold text-shklet-red hover:underline">
            {t("cashier.clear")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setOrderType("WALKIN")}
          className={cn(
            "h-10 rounded-xl text-sm font-bold transition-all",
            orderType === "WALKIN" ? "bg-shklet-red text-white shadow-elevation-1" : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--muted)]",
          )}
        >
          {t("cashier.walkIn")}
        </button>
        <button
          onClick={() => setOrderType("DELIVERY")}
          className={cn(
            "h-10 rounded-xl text-sm font-bold transition-all",
            orderType === "DELIVERY" ? "bg-shklet-red text-white shadow-elevation-1" : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--muted)]",
          )}
        >
          {t("cashier.delivery")}
        </button>
      </div>

      <div className="space-y-1 max-h-[230px] overflow-y-auto mb-4 no-scrollbar">
        <AnimatePresence initial={false}>
          {cart.length === 0 && (
            <div className="py-8">
              <EmptyState icon={ShoppingCart} title={t("cashier.tapItemsToAdd")} />
            </div>
          )}
          {cart.map((line) => (
            <motion.div
              key={line.key}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start justify-between text-sm gap-2 py-2 border-b border-[var(--card-border-soft)] last:border-0"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate">{line.name}</p>
                {line.modifiers.map((m, i) => (
                  <p key={i} className="text-xs text-[var(--muted)] truncate">
                    {m.optionName}
                  </p>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="ltr-nums font-semibold">
                  {formatMoney(
                    (line.unitPrice + line.modifiers.reduce((s, m) => s + m.extraPrice, 0)) *
                      line.quantity,
                  )}
                </span>
                <button
                  onClick={() => removeCartLine(line.key)}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-shklet-red/10 text-shklet-red/70 hover:text-shklet-red"
                >
                  <X size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {orderType === "WALKIN" ? (
        <div className="mb-3.5">
          <label className="text-[13px] font-semibold text-[var(--muted)] mb-1.5 block">{t("cashier.pagerNumber")}</label>
          <select
            value={pagerNumber ?? ""}
            onChange={(e) => setPagerNumber(e.target.value ? Number(e.target.value) : null)}
            className="w-full h-10 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 text-sm font-medium outline-none focus:border-shklet-red focus:ring-[3px] focus:ring-shklet-red/15"
          >
            <option value="">{t("cashier.selectPager")}</option>
            {pagerOptions.length === 0 && <option disabled>{t("cashier.noFreePagers")}</option>}
            {pagerOptions.map((p) => (
              <option key={p} value={p}>
                {t("cashier.pagerOption", { n: p })}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-3.5">
          <label className="text-[13px] font-semibold text-[var(--muted)] mb-1.5 block">{t("cashier.driverRefLabel")}</label>
          <input
            value={deliveryRef}
            onChange={(e) => setDeliveryRef(e.target.value)}
            placeholder={t("cashier.driverRefPlaceholder")}
            className="w-full h-10 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 text-sm outline-none focus:border-shklet-red focus:ring-[3px] focus:ring-shklet-red/15"
          />
          <p className="text-xs text-[var(--muted)] mt-1.5">{t("cashier.paymentByPlatform")}</p>
        </div>
      )}

      {orderType === "WALKIN" && (
        <div className="mb-4">
          <label className="text-[13px] font-semibold text-[var(--muted)] mb-1.5 block">{t("cashier.paymentMethod")}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod("CASH")}
              className={cn(
                "h-10 rounded-xl text-sm font-bold transition-all",
                paymentMethod === "CASH" ? "bg-shklet-green text-white shadow-elevation-1" : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--muted)]",
              )}
            >
              {t("common.cash")}
            </button>
            <button
              onClick={() => setPaymentMethod("CARD")}
              className={cn(
                "h-10 rounded-xl text-sm font-bold transition-all",
                paymentMethod === "CARD" ? "bg-shklet-green text-white shadow-elevation-1" : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--muted)]",
              )}
            >
              {t("common.card")}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 pt-3 border-t border-[var(--card-border)]">
        <span className="font-bold text-[15px]">{t("cashier.total")}</span>
        <span className="ltr-nums text-shklet-red text-xl font-extrabold tracking-[-0.02em]">{formatMoney(cartTotal)}</span>
      </div>

      <Button className="w-full" size="lg" onClick={placeOrder} loading={placing}>
        {placing
          ? t("cashier.placing")
          : orderType === "DELIVERY"
            ? t("cashier.placeDeliveryOrder")
            : t("cashier.placeOrder")}
      </Button>
    </div>
  );
}

const STATUS_STYLES: Record<ActiveOrder["status"], { bg: string; text: string }> = {
  PLACED: { bg: "bg-shklet-yellow/20", text: "text-[#8a6d00] dark:text-shklet-yellow" },
  READY: { bg: "bg-shklet-green/15", text: "text-shklet-green" },
  DRIVER_ARRIVED: { bg: "bg-shklet-purple/15", text: "text-[#7b4f92] dark:text-shklet-purple" },
  COLLECTED: { bg: "bg-black/5 dark:bg-white/10", text: "text-[var(--muted)]" },
  CANCELLED: { bg: "bg-black/5 dark:bg-white/10", text: "text-[var(--muted)]" },
};

function ActiveOrdersPanel({
  orders,
  onReady,
  onCollect,
  onCancel,
}: {
  orders: ActiveOrder[];
  onReady: (o: ActiveOrder) => void;
  onCollect: (o: ActiveOrder) => void;
  onCancel: (o: ActiveOrder) => void;
}) {
  const { t, lang } = useLanguage();
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 flex-1 shadow-elevation-1">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="font-bold text-[15px]">{t("cashier.activeOrders")}</h2>
        <Badge tone="neutral">{t("cashier.activeCount", { n: orders.length })}</Badge>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {orders.length === 0 && (
            <div className="py-8">
              <EmptyState icon={PackageCheck} title={t("cashier.noActiveOrders")} />
            </div>
          )}
          {orders.map((order) => {
            const style = STATUS_STYLES[order.status];
            return (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-xl border border-[var(--card-border)] p-3.5"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-extrabold ltr-nums text-[15px]">
                    {order.type === "WALKIN" ? `#${order.pagerNumber}` : t("cashier.deliveryLabel")}
                  </span>
                  <span className={cn("text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", style.bg, style.text)}>
                    {order.status === "PLACED" && t("cashier.needsAttention")}
                    {order.status === "READY" && t("cashier.ready")}
                    {order.status === "DRIVER_ARRIVED" && t("cashier.driverArrived")}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mb-2.5 truncate">
                  {order.items.map((i) => `${lang === "ku" ? i.nameKuSnapshot : i.nameSnapshot} ×${i.quantity}`).join(", ")}
                </p>
                <div className="flex gap-1.5">
                  {order.status === "PLACED" && (
                    <Button size="sm" variant="success" onClick={() => onReady(order)} className="flex-1">
                      <CheckCircle2 size={14} /> {t("cashier.markAsReady")}
                    </Button>
                  )}
                  {order.status === "READY" && (
                    <Button size="sm" variant="secondary" onClick={() => onCollect(order)} className="flex-1">
                      {t("cashier.collectedFreePager")}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => onCancel(order)} className="h-8 w-8">
                    <Trash2 size={14} className="text-shklet-red" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
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
  onConfirm: (mods: CartLineModifier[]) => void;
}) {
  const { t, lang } = useLanguage();
  const [selected, setSelected] = useState<Record<string, ModifierOption>>({});

  function selectOption(group: ModifierGroup, option: ModifierOption) {
    setSelected((prev) => ({ ...prev, [group.id]: option }));
  }

  function confirm() {
    const mods: CartLineModifier[] = item.modifierGroups
      .filter((g) => selected[g.id])
      .map((g) => ({
        groupName: lang === "ku" ? g.nameKu : g.name,
        optionName: lang === "ku" ? selected[g.id].nameKu : selected[g.id].name,
        extraPrice: selected[g.id].extraPrice,
      }));
    onConfirm(mods);
  }

  const allRequiredSelected = item.modifierGroups
    .filter((g) => g.required)
    .every((g) => selected[g.id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={lang === "ku" ? item.nameKu : item.name}
      description={t("cashier.chooseOptions")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={!allRequiredSelected}>
            {t("cashier.addToOrder")}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {item.modifierGroups.map((group) => (
          <div key={group.id}>
            <p className="text-[13px] font-bold mb-2">
              {lang === "ku" ? group.nameKu : group.name}
              {group.required && <span className="text-shklet-red"> *</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => selectOption(group, option)}
                  className={cn(
                    "px-3.5 h-9 rounded-xl text-sm font-semibold border transition-all",
                    selected[group.id]?.id === option.id
                      ? "bg-shklet-red text-white border-shklet-red shadow-elevation-1"
                      : "border-[var(--card-border)] hover:border-shklet-red/40",
                  )}
                >
                  {lang === "ku" ? option.nameKu : option.name}
                  {option.extraPrice > 0 && ` (+${formatMoney(option.extraPrice)})`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
