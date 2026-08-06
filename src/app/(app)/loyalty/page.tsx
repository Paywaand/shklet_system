"use client";

import { useState } from "react";
import { Search, Gift } from "lucide-react";
import { useFetch } from "@/lib/client";
import { PageHeader } from "@/components/PageHeader";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type Customer = {
  id: string;
  phone: string;
  loyaltyCount: number;
  updatedAt: string;
};

const LOYALTY_TOTAL = 9;

// Admin/manager page: view customers' loyalty progress toward the free 9th-item
// Shklet Special — tracked by phone number, combined across both branches.
// Read-only: the count updates automatically as orders come through the POS;
// there's nothing to edit here. Ad-hoc per-order discounts (unrelated to this
// program) are applied directly at checkout, not managed from here.
export default function LoyaltyPage() {
  const [query, setQuery] = useState("");

  const url = `/api/customers?${new URLSearchParams(query ? { q: query } : {}).toString()}`;
  const { data, loading, error, reload } = useFetch<{ customers: Customer[] }>(url);
  const customers = data?.customers ?? [];

  return (
    <>
      <PageHeader
        title="Loyalty"
        subtitle="Buy 9 items, get a free Shklet Special — progress by phone number, combined across both branches"
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            className="input py-2 pl-9 w-64"
            placeholder="Search by phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : customers.length === 0 ? (
        <EmptyState
          title={query ? "No matching customer" : "No loyalty activity yet"}
          hint={query ? undefined : "Customers appear here once they order with a phone number at checkout."}
        />
      ) : (
        <div className="card p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Loyalty progress</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-3 font-mono font-bold">{c.phone}</td>
                  <td className="py-2 pr-3">
                    {c.loyaltyCount >= LOYALTY_TOTAL ? (
                      <span className="chip bg-leaf/20 text-leaf gap-1">
                        <Gift size={12} /> Free item ready
                      </span>
                    ) : (
                      <span className="opacity-70">
                        {c.loyaltyCount} of {LOYALTY_TOTAL}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
