"use client";

import { useState } from "react";
import { ShieldCheck, History, Check } from "lucide-react";
import { useFetch, apiSend } from "@/lib/client";
import { shortDate, shortTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState } from "@/components/ui";
import { useToast } from "@/components/Toast";

type PermData = {
  matrix: Record<string, Record<string, boolean>>;
  permissions: { key: string; label: string; module: string }[];
  roles: string[];
  logs: {
    id: string;
    action: string;
    createdAt: string;
    staff?: { fullName: string; username: string } | null;
  }[];
};

export default function PermissionsPage() {
  const { data, loading, error, reload } = useFetch<PermData>("/api/permissions");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { matrix, permissions, roles, logs } = data;

  async function toggle(role: string, key: string, current: boolean) {
    const cellId = `${role}:${key}`;
    setBusy(cellId);
    try {
      await apiSend("/api/permissions", "PATCH", { role, key, allowed: !current });
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Control what each role can access" />

      <section className="card p-4 mb-6 overflow-x-auto">
        <h2 className="font-extrabold text-lg flex items-center gap-2 mb-4">
          <ShieldCheck size={20} className="text-leaf" /> Permissions matrix
        </h2>
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="p-2">Permission</th>
              {roles.map((r) => (
                <th key={r} className="p-2 text-center capitalize">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((perm) => (
              <tr key={perm.key} className="border-b border-black/5 dark:border-white/5">
                <td className="p-2">
                  <p className="font-bold">{perm.label}</p>
                  <p className="text-xs opacity-50">{perm.module}</p>
                </td>
                {roles.map((role) => {
                  const allowed = matrix[role]?.[perm.key] ?? false;
                  const cellId = `${role}:${perm.key}`;
                  return (
                    <td key={role} className="p-2 text-center">
                      <button
                        disabled={busy === cellId}
                        onClick={() => toggle(role, perm.key, allowed)}
                        className={`size-9 rounded-lg inline-flex items-center justify-center transition ${
                          allowed
                            ? "bg-leaf text-white"
                            : "bg-black/5 dark:bg-white/10 opacity-50 hover:opacity-100"
                        }`}
                        title={allowed ? "Granted — click to revoke" : "Click to grant"}
                      >
                        {allowed && <Check size={18} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs opacity-50 mt-3">
          Changes apply the next time a user signs in (or refreshes their session).
        </p>
      </section>

      <section className="card p-4">
        <h2 className="font-extrabold text-lg flex items-center gap-2 mb-3">
          <History size={20} className="text-leaf" /> Audit log
          <span className="text-xs opacity-50 font-normal">last 50 actions</span>
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm opacity-50 py-6 text-center">No activity yet</p>
        ) : (
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{log.action}</p>
                  <p className="text-xs opacity-60">{log.staff?.fullName ?? "System"}</p>
                </div>
                <div className="text-xs opacity-50 text-right shrink-0">
                  <p>{shortDate(log.createdAt)}</p>
                  <p>{shortTime(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
