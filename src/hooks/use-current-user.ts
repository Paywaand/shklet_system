"use client";

import { useEffect, useState } from "react";

export type Role = "ADMIN" | "MANAGER" | "CASHIER";

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  cityId: string | null;
  branchId: string | null;
  cityName: string | null;
  cityNameKu: string | null;
  branchName: string | null;
  branchNameKu: string | null;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
