import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword, logAudit } from "@/lib/auth";
import { withApiError } from "@/lib/api";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const POST = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("ADMIN");
    const { id } = await params;

    const newPassword = generateTempPassword();
    const passwordHash = await hashPassword(newPassword);
    const staff = await prisma.user.update({ where: { id }, data: { passwordHash } });

    // Also revoke all existing sessions for this account.
    await prisma.session.updateMany({ where: { userId: id }, data: { revoked: true } });

    await logAudit(admin.id, `reset password for "${staff.fullName}"`, "User", id);
    return NextResponse.json({ newPassword });
  },
);
