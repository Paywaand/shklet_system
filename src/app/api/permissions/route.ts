import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { PERMISSIONS, ROLES } from "@/lib/permissions";

// Fixed permissions that are NOT editable in the matrix. "permissions.manage" is
// hard-locked to admin only so the role-management capability can never be moved
// or revoked from the UI.
const LOCKED_KEYS = new Set<string>(["permissions.manage"]);
const EDITABLE_PERMISSIONS = PERMISSIONS.filter((p) => !LOCKED_KEYS.has(p.key));

export async function GET() {
  const guard = await authorize("permissions.manage");
  if (!guard.ok) return guard.response;

  const [rows, logs] = await Promise.all([
    prisma.rolePermission.findMany(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { staff: { select: { fullName: true, username: true } } },
    }),
  ]);

  // Build a {role: {key: allowed}} map so the client doesn't have to.
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const role of ROLES) matrix[role] = {};
  for (const r of rows) {
    if (!matrix[r.role]) matrix[r.role] = {};
    matrix[r.role][r.key] = r.allowed;
  }

  return NextResponse.json({ matrix, permissions: EDITABLE_PERMISSIONS, roles: ROLES, logs });
}

export async function PATCH(req: Request) {
  const guard = await authorize("permissions.manage");
  if (!guard.ok) return guard.response;

  const { role, key, allowed } = await req.json().catch(() => ({}));
  if (!ROLES.includes(role) || !PERMISSIONS.some((p) => p.key === key))
    return NextResponse.json({ error: "Invalid role or permission" }, { status: 400 });

  // Locked permissions (e.g. permissions.manage) are admin-only and fixed — they
  // can't be changed from the matrix at all.
  if (LOCKED_KEYS.has(key))
    return NextResponse.json({ error: "This permission is fixed and cannot be changed" }, { status: 400 });

  await prisma.rolePermission.upsert({
    where: { role_key: { role, key } },
    update: { allowed: !!allowed },
    create: { role, key, allowed: !!allowed },
  });
  await audit(guard.session.sub, `${allowed ? "Granted" : "Revoked"} ${key} for ${role}`);
  return NextResponse.json({ ok: true });
}
