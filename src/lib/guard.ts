import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";
import { prisma } from "./prisma";
import type { PermissionKey } from "./permissions";

// Result of an authorization check used inside route handlers.
export type Guard =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

// Ensure the request has a valid session and (optionally) a granted permission.
export async function authorize(permission?: PermissionKey): Promise<Guard> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  if (permission) {
    const granted = await hasPermission(session.role, permission);
    if (!granted) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
  }

  return { ok: true, session };
}

export async function hasPermission(role: string, key: PermissionKey): Promise<boolean> {
  const row = await prisma.rolePermission.findUnique({
    where: { role_key: { role, key } },
  });
  return !!row?.allowed;
}

// Append an entry to the audit log. Never throws (logging must not break the request).
export async function audit(staffId: string | null, action: string) {
  try {
    await prisma.auditLog.create({ data: { staffId, action } });
  } catch {
    /* ignore */
  }
}
