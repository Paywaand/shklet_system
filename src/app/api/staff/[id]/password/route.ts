import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { isBranch } from "@/lib/branches";

// POST /api/staff/:id/password { password } — admin resets a staff member's password.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("staff.manage");
  if (!guard.ok) return guard.response;

  // A branch-bound user with staff.manage may only reset passwords in their own branch.
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  if (isBranch(guard.session.branch) && target.branch !== guard.session.branch)
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || String(password).length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { password: await bcrypt.hash(String(password), 10) },
    select: { username: true },
  });
  await audit(guard.session.sub, `Reset password for "${user.username}"`);
  return NextResponse.json({ ok: true });
}
