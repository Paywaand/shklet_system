"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---- Fetch helpers ----
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error((await safeError(res)) || "Request failed");
  return res.json();
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      // CSRF defence — the server requires this custom header on all mutating
      // requests (see middleware.ts / lib/authConstants.ts).
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await safeError(res)) || "Request failed");
  return res.status === 204 ? (undefined as T) : res.json();
}

async function safeError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error || "";
  } catch {
    return "";
  }
}

// ---- Data hook with optional polling ----
export function useFetch<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(
    async (silent = false) => {
      if (!urlRef.current) return;
      if (!silent) setLoading(true);
      try {
        const d = await apiGet<T>(urlRef.current);
        setData(d);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
    if (!pollMs) return;
    // Skip background polls while the tab/screen is hidden — no point syncing the
    // live board when nobody's looking; it resumes on the next visible tick.
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load(true);
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pollMs]);

  return { data, error, loading, reload: () => load(false), refresh: () => load(true) };
}
