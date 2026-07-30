"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonGrid } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import toast from "react-hot-toast";
import { Plus, CalendarDays, TrendingUp, TrendingDown } from "lucide-react";

interface EventItem {
  id: string;
  name: string;
  nameKu: string;
  locationLabel: string | null;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "CLOSED";
  evalRevenue: number | null;
  evalExpenses: number | null;
  evalUsageCost: string | null;
  evalProfit: number | null;
}

export default function EventsPage() {
  const { t, lang } = useLanguage();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<{ event: EventItem; topItems: { name: string; qty: number }[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function viewEvent(id: string) {
    const res = await fetch(`/api/events/${id}`);
    const data = await res.json();
    setDetail(data);
  }

  async function closeEvent(id: string) {
    if (!confirm(t("events.confirmCloseEvent"))) return;
    const res = await fetch(`/api/events/${id}/close`, { method: "POST" });
    if (res.ok) {
      toast.success(t("common.success"));
      load();
    }
  }

  return (
    <div>
      <PageHeader
        title={t("events.header")}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t("events.createEvent")}
          </Button>
        }
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("common.noResultsFound")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }}>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold">{lang === "ku" ? e.nameKu : e.name}</p>
                      {e.locationLabel && <p className="text-xs text-[var(--muted)] mt-0.5">{e.locationLabel}</p>}
                    </div>
                    <Badge tone={e.status === "ACTIVE" ? "green" : "neutral"}>
                      {e.status === "ACTIVE" ? t("events.active") : t("events.closed")}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--muted)] ltr-nums mb-3">{formatDate(e.startDate)}</p>
                  {e.status === "CLOSED" && e.evalProfit != null && (
                    <div
                      className={`flex items-center gap-1.5 text-sm font-bold ltr-nums mb-3 ${
                        e.evalProfit >= 0 ? "text-shklet-green" : "text-shklet-red"
                      }`}
                    >
                      {e.evalProfit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {formatMoney(e.evalProfit)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => viewEvent(e.id)}>
                      {t("events.view")}
                    </Button>
                    {e.status === "ACTIVE" && (
                      <Button size="sm" variant="danger" onClick={() => closeEvent(e.id)}>
                        {t("events.closeEvent")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <EventFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          load();
        }}
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t("events.evaluationHeader")}
        description={detail ? (lang === "ku" ? detail.event.nameKu : detail.event.name) : undefined}
        footer={
          <Button variant="ghost" onClick={() => setDetail(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {detail && detail.event.status === "CLOSED" ? (
          <div className="space-y-2 text-sm pb-4">
            <Row label={t("events.revenue")} value={formatMoney(detail.event.evalRevenue ?? 0)} />
            <Row label={t("events.usageCost")} value={formatMoney(Number(detail.event.evalUsageCost ?? 0))} />
            <Row label={t("events.taggedExpenses")} value={formatMoney(detail.event.evalExpenses ?? 0)} />
            <Row
              label={(detail.event.evalProfit ?? 0) >= 0 ? t("events.grossProfit") : t("events.grossLoss")}
              value={formatMoney(detail.event.evalProfit ?? 0)}
              strong
            />
            <p className="font-bold mt-4 mb-1.5">{t("events.topItems")}</p>
            {detail.topItems.map((item) => (
              <div key={item.name} className="flex justify-between text-[var(--muted)]">
                <span>{item.name}</span>
                <span className="ltr-nums">×{item.qty}</span>
              </div>
            ))}
            <Badge tone={(detail.event.evalProfit ?? 0) >= 0 ? "green" : "red"} className="mt-3">
              {(detail.event.evalProfit ?? 0) >= 0 ? t("events.verdictProfitable") : t("events.verdictLoss")}
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] pb-4">{t("events.active")}</p>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={`ltr-nums ${strong ? "font-extrabold text-[15px]" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function EventFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [nameKu, setNameKu] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nameKu, startDate, endDate: endDate || undefined, locationLabel: locationLabel || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("common.success"));
      onSaved();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("events.createEvent")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("events.eventName")} (EN)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("events.eventName")} (KU)</Label>
            <Input dir="rtl" value={nameKu} onChange={(e) => setNameKu(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("events.startDate")}</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("events.endDateOptional")}</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("events.locationOptional")}</Label>
          <Input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
