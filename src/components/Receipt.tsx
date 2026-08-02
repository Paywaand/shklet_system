"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { num, shortDate, shortTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// A kitchen ticket, not a customer receipt: it prints at the till and goes to
// whoever is making the order, not home with the customer. Every field on it
// is something the kitchen needs to act correctly — pager, order time, exactly
// what to make (including sauces/specialty), whether it's paid, how, and
// whether it's dine-in or takeaway. Nothing else belongs on it, so there is no
// order code, cashier name, or "thank you" footer.
//
// Rendered into a body-level portal so the print stylesheet in globals.css can
// collapse everything except this element and emit one continuous 80mm strip.
//
// Language follows the app's current selection. Kurdish flips to RTL with an
// Arabic-script font — the Latin monospace stack cannot shape Arabic script at
// all, so this is a correctness fix, not styling.

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
  pagerNumber: number | null;
  placedAt: string | Date;
  orderType: "walk_in" | "takeaway" | "delivery";
  paymentMethod: string;
  isPaid: boolean;
  total: number;
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

  // In RTL, a Latin/digit run like "3,500 IQD" or "2 Aug 2026" gets reordered
  // by the bidi algorithm — wrapping each such value in <bdi> isolates it so it
  // keeps its own direction.
  const placed = typeof data.placedAt === "string" ? new Date(data.placedAt) : data.placedAt;
  // Kurdish uses a numeric date: the month names available from toLocaleDateString
  // are English, which reads oddly on an otherwise fully Kurdish ticket.
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

          {/* The pager is what the kitchen calls the order by, so it is the
              single largest thing on the ticket. */}
          {data.pagerNumber != null && (
            <div className="r-big">
              <div className="r-big-label">{data.pagerNumber}</div>
              <div className="r-ref">{t("receipt.pager")}</div>
            </div>
          )}

          <hr className="r-rule" />

          <div className="r-flags">
            <span className="r-flag">{typeLabel}</span>
            <span className="r-flag">
              <bdi>
                {dateText} {shortTime(placed)}
              </bdi>
            </span>
          </div>

          <hr className="r-rule" />

          <ul className="r-items">
            {data.lines.map((l) => (
              <li key={l.key}>
                {l.quantity} × <bdi>{l.name}</bdi>
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
            {paymentLabel} —{" "}
            <span className={data.isPaid ? "r-paid-yes" : "r-paid-no"}>
              {data.isPaid ? t("receipt.paid") : t("receipt.notPaid")}
            </span>
          </div>
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
