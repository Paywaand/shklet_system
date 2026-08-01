"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { num, shortDate, shortTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// An 80mm thermal receipt, rendered into a body-level portal so the print
// stylesheet in globals.css can collapse everything except this element and
// emit one continuous strip (see the `@media print` block there).
//
// Language follows the app's current selection. In Kurdish the whole receipt
// flips to RTL and uses a system Arabic-script font — the Latin monospace stack
// the receipt normally uses cannot shape Arabic script at all, so this is not
// merely a cosmetic direction change.

export type ReceiptLine = {
  key: string;
  // Already localised at the point the line was added to the cart
  // (pos/page.tsx uses itemName(item, lang)), so no lookup is needed here.
  name: string;
  price: number;
  quantity: number;
  modifier?: string;
};

export type ReceiptData = {
  // Absent for an order placed offline — the server assigns the code on sync.
  shortId?: string | null;
  pagerNumber: number | null;
  placedAt: string | Date;
  orderType: "walk_in" | "takeaway" | "delivery";
  paymentMethod: string;
  isPaid: boolean;
  total: number;
  cashierName?: string | null;
  lines: ReceiptLine[];
};

export function Receipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const [mounted, setMounted] = useState(false);

  // Portals need a DOM target, which only exists after mount.
  useEffect(() => setMounted(true), []);

  // Escape closes, matching the rest of the app's dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const isKu = lang === "ku";
  const money = (amount: number) => `${num(amount)} ${t("receipt.currency")}`;

  // In RTL, a Latin/digit run like "26-7W5JD" or "2 Aug 2026" gets reordered by
  // the bidi algorithm and prints as "7W5JD-26" / "Aug 2026 2". Wrapping each
  // such value in <bdi> isolates it so it keeps its own direction — an order
  // code printed backwards is worse than useless at the counter.
  const placed = typeof data.placedAt === "string" ? new Date(data.placedAt) : data.placedAt;
  // Kurdish uses a numeric date: the month names available from toLocaleDateString
  // are English, which reads oddly on an otherwise fully Kurdish receipt.
  const dateText = isKu
    ? placed.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    : shortDate(placed);

  const typeLabel =
    data.orderType === "takeaway" ? t("cashier.cart.takeAway") : t("receipt.dineIn");

  const paymentLabel =
    data.paymentMethod === "cash"
      ? t("common.cash")
      : data.paymentMethod === "card"
        ? t("common.card")
        : t("common.pos");

  return createPortal(
    <div className="receipt-print-root" onClick={onClose}>
      <div className="receipt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className={`receipt${isKu ? " receipt-rtl" : ""}`} dir={isKu ? "rtl" : "ltr"}>
          <p className="r-brand">Shklet</p>
          <p className="r-sub">{t("receipt.customerCopy")}</p>

          <hr className="r-rule" />

          {/* The pager number is what the customer is actually called by, so it
              is the one thing on the receipt readable across a busy counter. */}
          {data.pagerNumber != null && (
            <div className="r-big">
              <div className="r-big-label">{data.pagerNumber}</div>
              <div className="r-ref">{t("receipt.pager")}</div>
            </div>
          )}

          <div className="r-meta">
            {data.shortId ? (
              <div>
                {t("receipt.order")}: <bdi>{data.shortId}</bdi>
              </div>
            ) : (
              <div>{t("receipt.offlineNoCode")}</div>
            )}
            <div>
              {t("receipt.date")}: <bdi>{dateText}</bdi>
            </div>
            <div>
              {t("receipt.time")}: <bdi>{shortTime(placed)}</bdi>
            </div>
            <div>
              {t("receipt.orderType")}: {typeLabel}
            </div>
            {data.cashierName && (
              <div>
                {t("receipt.cashier")}: {data.cashierName}
              </div>
            )}
          </div>

          <hr className="r-rule" />

          <ul className="r-items">
            {data.lines.map((l) => (
              <li key={l.key}>
                {l.quantity} × <bdi>{l.name}</bdi> — <bdi>{money(l.price * l.quantity)}</bdi>
                {l.modifier && (
                  <span className="r-mod">
                    <bdi>{l.modifier}</bdi>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <hr className="r-rule" />

          <div className="r-total">
            {t("receipt.total")}: <bdi>{money(data.total)}</bdi>
          </div>
          <div className="r-paid">
            {t("receipt.paymentMethod")}: {paymentLabel} —{" "}
            {data.isPaid ? t("receipt.paid") : t("receipt.notPaid")}
          </div>

          <hr className="r-rule" />

          <p className="r-thanks">{t("receipt.thanks")}</p>
          <p className="r-sub">{t("receipt.seeYou")}</p>
        </div>

        {/* Controls are excluded from the printed output by globals.css. */}
        <div className="receipt-actions">
          <button className="btn bg-leaf text-white px-4 py-2" onClick={() => window.print()}>
            {t("receipt.print")}
          </button>
          <button className="btn bg-black/5 dark:bg-white/10 px-4 py-2" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
