"use client";

import { useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Send, Plus, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { apiSend } from "@/lib/client";
import { shortDate } from "@/lib/format";
import type { DailyNeedsItem } from "@/lib/types";

// ---- Predefined checklist ----------------------------------------------------
// Kurdish (RTL) sections render right-to-left; Chips are Latin (LTR). There are
// no fixed units — staff type the amount themselves (e.g. "1 box", "2 kg").
type Section = { key: string; title: string; rtl: boolean; items: string[] };

const SECTIONS: Section[] = [
  {
    key: "packaging",
    title: "Packaging",
    rtl: true,
    items: [
      "چیلکه",
      "کەوچک",
      "چەتاڵ",
      "قاپی مەقلوبە",
      "سەرقاپ",
      "سینی مەقلوبە",
      "کوپی 14Oz",
      "کوپی درینک",
      "سەری کوپ",
      "ستیکەر",
      "عەلاگەی سەفەری سپی",
      "هۆڵدەر",
    ],
  },
  {
    key: "sauceAndPancake",
    title: "Sauce & Pancake",
    rtl: true,
    items: [
      "نۆتێلا",
      "چوکلەیت",
      "سۆسی فستق",
      "شلیکی ئاسای",
      "مۆز",
      "ئاو",
      "کەرێ",
      "زەیت",
      "پانکەیک",
      "شەعریە",
      "کێک",
    ],
  },
  {
    key: "topping",
    title: "Topping",
    rtl: true,
    items: ["ئۆریۆ", "زینە", "M&Ms", "مارشمێلۆ", "فستقی هاڕاو", "فستقی گەورە"],
  },
  {
    key: "bakery",
    title: "Bakery",
    rtl: true,
    items: [
      "تیرامیسۆی کلاسیک",
      "کاکو",
      "تیرامیسۆی فستق",
      "براونی",
      "بروکی",
      "کوکیز",
      "پاکێجی بەیکەری",
      "سەری پاکێج",
    ],
  },
  {
    key: "drinks",
    title: "Drinks",
    rtl: true,
    items: [
      "سیرەپی شلیک، قاوە و پرتەقاڵ",
      "شکلیکی بەستوو یان هاڕاو",
      "نەعنا",
      "فرۆتی",
      "پرتەقاڵی وشک",
      "لیمۆ",
      "ئاوی بەراد",
      "قەسەب",
    ],
  },
  {
    key: "iceCream",
    title: "Ice Cream",
    rtl: true,
    items: [
      "کوپی ئایسکرێم",
      "کەوچک",
      "پوریی شلیک و قۆپ",
      "شلکی بەستوو",
      "قۆخی بەستوو",
      "ئایسکرێمی سادە",
      "بوکەڵە",
    ],
  },
  {
    key: "cleaning",
    title: "Cleaning",
    rtl: true,
    items: [
      "دەستکێشی رەش",
      "عەلاگەی رەش",
      "موعجیزە",
      "زاهی",
      "شاڵ",
      "کلێنسی تەڕ",
      "کلێنس",
      "پەڕۆ",
    ],
  },
];

// ---- html2canvas (installed natively via npm, lazily code-split) -------------
// Previously this was injected from cdnjs at runtime (a supply-chain risk — a
// compromised/altered CDN script would run with full page privileges). It's now a
// vendored dependency, dynamically imported so it stays out of the main bundle
// and only loads when the user actually exports an image.
async function loadHtml2Canvas() {
  const mod = await import("html2canvas");
  return mod.default;
}

// A flattened, non-empty line for export.
type Line = { section: string; rtl: boolean; name: string; amount: string };

export default function DailyNeedsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const today = useMemo(() => new Date(), []);
  const dateLabel = shortDate(today);

  function sectionLabel(key: string): string {
    return t(`dailyNeeds.sections.${key}`);
  }

  // Amounts (free text) keyed by `${sectionKey}:${index}` for predefined items.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  // Custom rows per section: an array of { name, amount }.
  const [custom, setCustom] = useState<Record<string, { name: string; amount: string }[]>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, [{ name: "", amount: "" }]]))
  );
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  function setAmountFor(key: string, value: string) {
    setAmounts((prev) => ({ ...prev, [key]: value }));
  }
  function setCustomRow(sectionKey: string, idx: number, patch: Partial<{ name: string; amount: string }>) {
    setCustom((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  }
  function addCustomRow(sectionKey: string) {
    setCustom((prev) => ({ ...prev, [sectionKey]: [...prev[sectionKey], { name: "", amount: "" }] }));
  }

  // Build the export lines (skip empty amounts).
  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const s of SECTIONS) {
      s.items.forEach((name, i) => {
        const amount = (amounts[`${s.key}:${i}`] ?? "").trim();
        if (amount) out.push({ section: s.title, rtl: s.rtl, name, amount });
      });
      for (const row of custom[s.key] ?? []) {
        const amount = row.amount.trim();
        if (row.name.trim() && amount)
          out.push({ section: s.title, rtl: s.rtl, name: row.name.trim(), amount });
      }
    }
    return out;
  }, [amounts, custom]);

  // Lines grouped by section title, preserving SECTIONS order.
  const grouped = useMemo(
    () =>
      SECTIONS.map((s) => ({ section: s, items: lines.filter((l) => l.section === s.title) })).filter(
        (g) => g.items.length > 0
      ),
    [lines]
  );

  async function saveLogQuietly() {
    const payload: DailyNeedsItem[] = lines.map((l) => ({
      category: l.section,
      name: l.name,
      amount: l.amount,
    }));
    try {
      await apiSend("/api/daily-needs", "POST", { items: payload });
    } catch {
      /* persistence is best-effort; never block the export */
    }
  }

  // Render the offscreen branded node to a PNG canvas, making sure the logo image
  // has finished loading first (otherwise html2canvas captures it half-drawn).
  async function renderCanvas(): Promise<HTMLCanvasElement> {
    const node = exportRef.current!;
    const logo = node.querySelector("img");
    if (logo && !logo.complete) {
      await new Promise<void>((res) => {
        logo.addEventListener("load", () => res(), { once: true });
        logo.addEventListener("error", () => res(), { once: true });
      });
    }
    const h2c = await loadHtml2Canvas();
    return h2c(node, { backgroundColor: "#F3ECE4", scale: 2, useCORS: true });
  }

  // The same WhatsApp text, used as a desktop fallback / share caption.
  function buildText(): string {
    let text = `SHKLET — ${t("dailyNeeds.header.title")}\n${dateLabel}\n`;
    for (const g of grouped) {
      text += `\n*${sectionLabel(g.section.key)}*\n`;
      for (const l of g.items) text += `${l.name}: ${l.amount}\n`;
    }
    return text;
  }

  async function saveImage() {
    if (lines.length === 0) return toast.show(t("dailyNeeds.toast.addAmountFirst"), "error");
    if (!exportRef.current) return;
    setBusy(true);
    try {
      const canvas = await renderCanvas();
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `shklet-daily-needs-${dateLabel.replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      saveLogQuietly();
      toast.show(t("dailyNeeds.toast.imageSaved"));
      setCompleteOpen(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t("dailyNeeds.toast.couldNotCreateImage"), "error");
    } finally {
      setBusy(false);
    }
  }

  // Share the rendered image to WhatsApp. On mobile the Web Share API opens the
  // native share sheet (pick WhatsApp → image attached). Where image sharing
  // isn't supported (most desktop browsers) we fall back to the wa.me text link.
  async function sendWhatsApp() {
    if (lines.length === 0) return toast.show(t("dailyNeeds.toast.addAmountFirst"), "error");
    if (!exportRef.current) return;
    setBusy(true);
    try {
      const canvas = await renderCanvas();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      const file = blob
        ? new File([blob], `shklet-daily-needs-${dateLabel.replace(/\s+/g, "-")}.png`, {
            type: "image/png",
          })
        : null;

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (file && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: `Shklet — ${t("dailyNeeds.header.title")}`, text: buildText() });
        saveLogQuietly();
        setCompleteOpen(false);
        return;
      }

      // Fallback: open the WhatsApp text link, and also download the image so the
      // user can attach it manually.
      if (file) {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, "_blank");
      saveLogQuietly();
      setCompleteOpen(false);
    } catch (e) {
      // A user cancelling the share sheet throws AbortError — that's not an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.show(e instanceof Error ? e.message : t("dailyNeeds.toast.couldNotShareImage"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("dailyNeeds.header.title")} subtitle={t("dailyNeeds.header.subtitle", { date: dateLabel })} />

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <section key={section.key} className="card p-4">
            <h2 className="font-extrabold text-lg mb-3" dir={section.rtl ? "rtl" : "ltr"}>
              {sectionLabel(section.key)}
            </h2>
            <div className="flex flex-col gap-2">
              {section.items.map((name, i) => {
                const key = `${section.key}:${i}`;
                return (
                  <div key={key} className="flex items-center gap-2" dir={section.rtl ? "rtl" : "ltr"}>
                    <span className="flex-1 font-semibold">{name}</span>
                    <input
                      type="text"
                      dir="auto"
                      className="input py-2 w-32 text-center"
                      placeholder={t("dailyNeeds.inputs.amountPlaceholder")}
                      value={amounts[key] ?? ""}
                      onChange={(e) => setAmountFor(key, e.target.value)}
                    />
                  </div>
                );
              })}

              {/* Custom rows */}
              {(custom[section.key] ?? []).map((row, idx) => (
                <div
                  key={`custom-${idx}`}
                  className="flex items-center gap-2"
                  dir={section.rtl ? "rtl" : "ltr"}
                >
                  <input
                    type="text"
                    dir="auto"
                    className="input py-2 flex-1"
                    placeholder={t("dailyNeeds.inputs.customItemPlaceholder")}
                    value={row.name}
                    onChange={(e) => setCustomRow(section.key, idx, { name: e.target.value })}
                  />
                  <input
                    type="text"
                    dir="auto"
                    className="input py-2 w-32 text-center"
                    placeholder={t("dailyNeeds.inputs.amountPlaceholder")}
                    value={row.amount}
                    onChange={(e) => setCustomRow(section.key, idx, { amount: e.target.value })}
                  />
                </div>
              ))}
              <button
                className="btn-ghost px-3 py-1.5 text-xs self-start"
                onClick={() => addCustomRow(section.key)}
              >
                <Plus size={14} /> {t("dailyNeeds.inputs.addCustomItem")}
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 mt-5 flex justify-center">
        <button
          className="btn-primary px-6 py-3 shadow-lg"
          onClick={() => setCompleteOpen(true)}
          disabled={lines.length === 0}
        >
          <CheckCircle2 size={20} /> {t("dailyNeeds.bottomBar.completeList")}
          {lines.length > 0 && <span className="chip bg-cocoa/15 text-cocoa">{lines.length}</span>}
        </button>
      </div>

      {/* Complete → export options */}
      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title={t("dailyNeeds.completeModal.title")}>
        <p className="text-sm opacity-70 mb-4">{t("dailyNeeds.completeModal.summary", { n: lines.length })}</p>
        <div className="flex flex-col gap-2">
          <button className="btn-leaf px-4 py-3" onClick={saveImage} disabled={busy}>
            <ImageIcon size={18} /> {busy ? t("dailyNeeds.completeModal.rendering") : t("dailyNeeds.completeModal.saveAsImage")}
          </button>
          <button className="btn-primary px-4 py-3" onClick={sendWhatsApp} disabled={busy}>
            <Send size={18} /> {busy ? t("dailyNeeds.completeModal.preparing") : t("dailyNeeds.completeModal.sendToWhatsapp")}
          </button>
        </div>
      </Modal>

      {/* Offscreen branded export node captured by html2canvas. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <div
          ref={exportRef}
          style={{
            width: 480,
            background: "#F3ECE4",
            color: "#59331C",
            padding: 28,
            fontFamily: "var(--font-sirwan), sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            {/* Plain <img> of the raw asset (not next/image) so html2canvas renders
                it cleanly at a fixed box without clipping. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo_icon.png"
              alt="Shklet"
              width={56}
              height={56}
              style={{ width: 56, height: 56, objectFit: "contain", display: "block" }}
            />
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.5 }}>CORN&apos;ER</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#AA8066" }}>{t("dailyNeeds.header.title")}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{dateLabel}</div>
          <div style={{ height: 3, background: "#FCCB02", borderRadius: 999, marginBottom: 14 }} />

          {grouped.length === 0 ? (
            <div style={{ opacity: 0.6 }}>{t("dailyNeeds.export.noItemsSelected")}</div>
          ) : (
            grouped.map((g) => (
              <div key={g.section.key} style={{ marginBottom: 14 }}>
                <div
                  dir={g.section.rtl ? "rtl" : "ltr"}
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#AA8066",
                    marginBottom: 6,
                    borderBottom: "2px solid rgba(89,51,28,0.15)",
                    paddingBottom: 3,
                  }}
                >
                  {sectionLabel(g.section.key)}
                </div>
                {g.items.map((l, i) => (
                  <div
                    key={i}
                    dir={g.section.rtl ? "rtl" : "ltr"}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 15,
                      fontWeight: 700,
                      padding: "2px 0",
                    }}
                  >
                    <span>{l.name}</span>
                    <span dir="auto" style={{ whiteSpace: "nowrap" }}>
                      {l.amount}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
