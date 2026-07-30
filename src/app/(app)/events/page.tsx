"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw, ClipboardList, MapPin } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { shortDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";

type EventRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  location: string | null;
  status: "active" | "closed";
  closedAt: string | null;
};

export default function EventsPage() {
  const { data, loading, error, reload } = useFetch<{ events: EventRow[] }>("/api/events");
  const { can } = useSession();
  const canEvaluate = can("events.evaluate");
  const toast = useToast();
  const [modal, setModal] = useState<{ open: boolean; event?: EventRow }>({ open: false });

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const events = data?.events ?? [];

  async function setStatus(ev: EventRow, status: "active" | "closed") {
    if (status === "closed" && !confirm(`Close "${ev.name}"? Its evaluation will be generated.`)) return;
    try {
      await apiSend(`/api/events/${ev.id}`, "PATCH", { status });
      toast.show(status === "closed" ? "Event closed" : "Event reopened");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function remove(ev: EventRow) {
    if (!confirm(`Delete "${ev.name}"? Tagged orders/expenses/usage revert to the main branch.`)) return;
    try {
      await apiSend(`/api/events/${ev.id}`, "DELETE");
      toast.show("Event deleted");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  function dateRange(ev: EventRow) {
    const s = shortDate(ev.startDate);
    if (!ev.endDate) return s;
    const e = shortDate(ev.endDate);
    return s === e ? s : `${s} → ${e}`;
  }

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="External pop-up events outside the main branch"
        action={
          <button className="btn-primary px-3 py-2 text-sm" onClick={() => setModal({ open: true })}>
            <Plus size={18} /> New event
          </button>
        }
      />

      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Create an event to start tagging sales, stock usage, and expenses to it." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {events.map((ev) => (
            <div key={ev.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold text-lg truncate">{ev.name}</p>
                  <p className="text-sm opacity-60">{dateRange(ev)}</p>
                  {ev.location && (
                    <p className="text-sm opacity-60 flex items-center gap-1 mt-0.5">
                      <MapPin size={14} /> {ev.location}
                    </p>
                  )}
                </div>
                <span
                  className={`chip ${
                    ev.status === "active" ? "bg-leaf text-white" : "bg-black/10 dark:bg-white/10"
                  }`}
                >
                  {ev.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {canEvaluate && (
                  <Link href={`/events/${ev.id}/evaluation`} className="btn-leaf px-3 py-2 text-sm">
                    <ClipboardList size={16} /> Evaluation
                  </Link>
                )}
                {ev.status === "active" ? (
                  <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setStatus(ev, "closed")}>
                    <CheckCircle2 size={16} /> Close
                  </button>
                ) : (
                  <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setStatus(ev, "active")}>
                    <RotateCcw size={16} /> Reopen
                  </button>
                )}
                <button className="btn-ghost size-9 rounded-lg" onClick={() => setModal({ open: true, event: ev })}>
                  <Pencil size={15} />
                </button>
                <button className="btn-ghost size-9 rounded-lg text-red-500" onClick={() => remove(ev)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <EventModal
          event={modal.event}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            reload();
          }}
        />
      )}
    </>
  );
}

function EventModal({
  event,
  onClose,
  onSaved,
}: {
  event?: EventRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const [startDate, setStartDate] = useState((event?.startDate ?? new Date().toISOString()).slice(0, 10));
  const [endDate, setEndDate] = useState(event?.endDate ? event.endDate.slice(0, 10) : "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    try {
      const payload = { name, startDate, endDate: endDate || null, location };
      if (event) await apiSend(`/api/events/${event.id}`, "PATCH", payload);
      else await apiSend("/api/events", "POST", payload);
      toast.show("Event saved");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={event ? "Edit event" : "New event"}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End date (optional)</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Location / description (optional)</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || !name.trim()}>
          Save
        </button>
      </div>
    </Modal>
  );
}
