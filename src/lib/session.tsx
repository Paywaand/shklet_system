"use client";

import { createContext, useContext } from "react";
import type { Role, PermissionKey } from "./permissions";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "./businessDay";

export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  // "suli" | "erbil" for branch-bound staff, null for the super admin.
  branch: string | null;
};

type SessionValue = {
  user: CurrentUser;
  permissions: string[];
  can: (key: PermissionKey) => boolean;
  // Configured operating hours, so client range pickers bucket/filter by the
  // same business day the server uses. Falls back to defaults if not provided.
  businessHours: BusinessHours;
};

const SessionCtx = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  permissions,
  businessHours = DEFAULT_BUSINESS_HOURS,
  children,
}: {
  user: CurrentUser;
  permissions: string[];
  businessHours?: BusinessHours;
  children: React.ReactNode;
}) {
  const can = (key: PermissionKey) => permissions.includes(key);
  return (
    <SessionCtx.Provider value={{ user, permissions, can, businessHours }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
