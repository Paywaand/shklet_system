"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, KeyRound, Power, Clock, Save, Plus, Building2 } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { shortDate, iqd } from "@/lib/format";
import type { StaffMember } from "@/lib/types";
import { ROLES } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { closesNextDay } from "@/lib/businessDay";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";

type BranchRow = {
  id: string;
  name: string;
  city: string;
  openHour: number;
  closeHour: number;
  sortOrder: number;
  active: boolean;
  closesNextDay: boolean;
};

export default function StaffPage() {
  const { data, loading, error, reload } = useFetch<{ staff: StaffMember[] }>("/api/staff");
  const { user } = useSession();
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [editModal, setEditModal] = useState<{ open: boolean; member?: StaffMember }>({ open: false });
  const [pwModal, setPwModal] = useState<{ open: boolean; member?: StaffMember }>({ open: false });

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const staff = data?.staff ?? [];
  const payroll = staff
    .filter((m) => m.active)
    .reduce((s, m) => s + (m.salary ?? 0), 0);

  async function toggleActive(member: StaffMember) {
    try {
      await apiSend(`/api/staff/${member.id}`, "PATCH", { active: !member.active });
      toast.show(member.active ? "Account deactivated" : "Account activated");
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Staff Management"
        subtitle="Accounts, roles, and access"
        action={
          <button className="btn-primary px-3 py-2 text-sm" onClick={() => setEditModal({ open: true })}>
            <UserPlus size={18} /> Add staff
          </button>
        }
      />

      {isAdmin && <ManageBranchesCard />}

      {isAdmin && (
        <div className="card p-4 mb-4">
          <p className="text-xs opacity-60 font-semibold uppercase tracking-wide">
            Total monthly payroll (active staff)
          </p>
          <p className="text-2xl font-extrabold text-leaf mt-1">{iqd(payroll)}</p>
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState title="No staff yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                <th className="p-3">Name</th>
                <th className="p-3">Username</th>
                <th className="p-3">Role</th>
                <th className="p-3">Branch</th>
                {isAdmin && <th className="p-3">Salary</th>}
                <th className="p-3">Status</th>
                <th className="p-3">Added</th>
                <th className="p-3">Last login</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3 font-bold">{m.fullName}</td>
                  <td className="p-3 opacity-70">{m.username}</td>
                  <td className="p-3 capitalize">
                    <span className="chip bg-black/10 dark:bg-white/10">{m.role}</span>
                  </td>
                  <td className="p-3">
                    {m.branch ? (
                      <span className="chip bg-corn/15 text-corn-600">{m.branch.name}</span>
                    ) : (
                      <span className="chip bg-leaf/15 text-leaf">All branches</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="p-3 opacity-80">{m.salary != null ? iqd(m.salary) : "—"}</td>
                  )}
                  <td className="p-3">
                    {m.active ? (
                      <span className="chip bg-leaf/20 text-leaf">Active</span>
                    ) : (
                      <span className="chip bg-red-500/15 text-red-500">Inactive</span>
                    )}
                  </td>
                  <td className="p-3 opacity-70">{shortDate(m.createdAt)}</td>
                  <td className="p-3 opacity-70">{m.lastLogin ? shortDate(m.lastLogin) : "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button className="btn-ghost size-8 rounded-lg" title="Edit" onClick={() => setEditModal({ open: true, member: m })}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-ghost size-8 rounded-lg" title="Reset password" onClick={() => setPwModal({ open: true, member: m })}>
                        <KeyRound size={14} />
                      </button>
                      <button
                        className={`btn-ghost size-8 rounded-lg ${m.active ? "text-red-500" : "text-leaf"}`}
                        title={m.active ? "Deactivate" : "Activate"}
                        onClick={() => toggleActive(m)}
                      >
                        <Power size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModal.open && (
        <StaffModal
          member={editModal.member}
          isAdmin={isAdmin}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => {
            setEditModal({ open: false });
            reload();
          }}
        />
      )}
      {pwModal.open && pwModal.member && (
        <PasswordModal member={pwModal.member} onClose={() => setPwModal({ open: false })} />
      )}
    </>
  );
}

// 12-hour label for an hour-of-day (0–23): 0 → "12:00 AM", 17 → "5:00 PM".
function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${period}`;
}

// Admin-only: manage the physical branches in the current city — rename, edit
// each branch's operating hours (drives its business-day report boundary, see
// lib/businessDay.ts), reorder, add a new branch. Staff assignment and orders
// are scoped to these branches; hours are per-branch, not global.
function ManageBranchesCard() {
  const { data, reload } = useFetch<{ branches: BranchRow[] }>("/api/branches");
  const router = useRouter();
  const toast = useToast();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const branches = data?.branches ?? [];

  async function addBranch() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await apiSend("/api/branches", "POST", { name });
      setNewName("");
      toast.show("Branch added");
      reload();
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={18} className="text-leaf" />
        <h2 className="font-extrabold">Manage branches</h2>
      </div>
      <p className="text-xs opacity-60 mb-3">
        Physical branches in this city. Each has its own operating hours — sales, profit and report
        dates are grouped by its own window, so a sale just after midnight counts toward the night it
        belongs to. Staff and orders are scoped to a specific branch.
      </p>
      <div className="flex flex-col gap-3">
        {branches.map((b) => (
          <BranchRowEditor key={b.id} branch={b} onSaved={() => { reload(); router.refresh(); }} />
        ))}
      </div>
      <div className="flex items-end gap-2 mt-4 pt-3 border-t border-black/10 dark:border-white/10">
        <div className="flex-1">
          <label className="label">New branch name</label>
          <input
            className="input py-2"
            placeholder="e.g. Downtown"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <button className="btn-primary px-3 py-2 text-sm" onClick={addBranch} disabled={adding || !newName.trim()}>
          <Plus size={16} /> Add branch
        </button>
      </div>
    </div>
  );
}

function BranchRowEditor({ branch, onSaved }: { branch: BranchRow; onSaved: () => void }) {
  const [name, setName] = useState(branch.name);
  const [openHour, setOpenHour] = useState(branch.openHour);
  const [closeHour, setCloseHour] = useState(branch.closeHour);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const nextDay = closesNextDay({ openHour, closeHour });
  const sameHour = openHour === closeHour;
  const dirty = name !== branch.name || openHour !== branch.openHour || closeHour !== branch.closeHour;

  async function save() {
    if (sameHour) {
      toast.show("Opening and closing hours can't be the same", "error");
      return;
    }
    setSaving(true);
    try {
      await apiSend(`/api/branches/${branch.id}`, "PATCH", { name, openHour, closeHour });
      toast.show("Branch updated");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    try {
      await apiSend(`/api/branches/${branch.id}`, "PATCH", { active: !branch.active });
      toast.show(branch.active ? "Branch deactivated" : "Branch activated");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="label">Name</label>
          <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">
            <Clock size={12} className="inline mb-0.5" /> Opens
          </label>
          <select className="input py-2 w-auto" value={openHour} onChange={(e) => setOpenHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Closes</label>
          <select className="input py-2 w-auto" value={closeHour} onChange={(e) => setCloseHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
                {h <= openHour ? " (next day)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary px-3 py-2 text-sm" onClick={save} disabled={saving || !dirty || sameHour}>
          <Save size={14} /> Save
        </button>
        <button
          className={`btn-ghost px-3 py-2 text-sm ${branch.active ? "text-red-500" : "text-leaf"}`}
          onClick={toggleActive}
        >
          <Power size={14} /> {branch.active ? "Deactivate" : "Activate"}
        </button>
      </div>
      <p className="text-xs mt-2 opacity-70">
        {hourLabel(openHour)} → {hourLabel(closeHour)}
        {nextDay ? " (closes next day)" : " (same day)"}
        {sameHour && <span className="text-red-500 font-semibold"> — choose different hours</span>}
      </p>
    </div>
  );
}

function StaffModal({
  member,
  isAdmin,
  onClose,
  onSaved,
}: {
  member?: StaffMember;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: branchData } = useFetch<{ branches: BranchRow[] }>("/api/branches");
  const branches = branchData?.branches ?? [];
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [username, setUsername] = useState(member?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffMember["role"]>(member?.role ?? "cashier");
  const [branchId, setBranchId] = useState<string>(member?.branchId ?? "");
  const [salary, setSalary] = useState(member?.salary?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    try {
      if (member) {
        await apiSend(`/api/staff/${member.id}`, "PATCH", {
          fullName,
          role,
          ...(role !== "admin" ? { branchId } : {}),
          ...(isAdmin ? { salary } : {}),
        });
      } else {
        await apiSend("/api/staff", "POST", {
          username,
          password,
          fullName,
          role,
          ...(role !== "admin" ? { branchId } : {}),
          ...(isAdmin ? { salary } : {}),
        });
      }
      toast.show("Saved");
      onSaved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={member ? "Edit staff" : "Add staff"}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Username</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!member}
            autoCapitalize="none"
          />
          {member && <p className="text-xs opacity-50 mt-1">Username can’t be changed.</p>}
        </div>
        {!member && (
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
        )}
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as StaffMember["role"])}>
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">
                {r}
              </option>
            ))}
          </select>
          {role === "admin" && (
            <p className="text-xs opacity-50 mt-1">Admins are super admins — they see and switch between every branch.</p>
          )}
        </div>
        {role !== "admin" && (
          <div>
            <label className="label">Branch</label>
            <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="" disabled>
                Select a branch
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="text-xs opacity-50 mt-1">
              This account only sees and manages the selected branch.
            </p>
          </div>
        )}
        {isAdmin && (
          <div>
            <label className="label">Monthly salary (IQD)</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Optional"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function PasswordModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    try {
      await apiSend(`/api/staff/${member.id}/password`, "POST", { password });
      toast.show("Password reset");
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Reset password — ${member.fullName}`}>
      <label className="label">New password</label>
      <input
        className="input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        placeholder="At least 8 characters"
      />
      <div className="flex gap-2 mt-5">
        <button className="btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={saving || password.length < 8}>
          Reset password
        </button>
      </div>
    </Modal>
  );
}
