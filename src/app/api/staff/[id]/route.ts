import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { ROLES } from "@/lib/permissions";
import { isBranch } from "@/lib/branches";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize("staff.manage");
  if (!guard.ok) return guard.response;

  // A branch-bound user with staff.manage may only edit staff in their own branch.
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  if (isBranch(guard.session.branch) && target.branch !== guard.session.branch)
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.fullName === "string") data.fullName = body.fullName.trim();
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (body.role === "admin" && isBranch(guard.session.branch))
      return NextResponse.json({ error: "Only the super admin can grant the admin role" }, { status: 403 });
    data.role = body.role;
    // Promoting to admin makes the account a super admin (all branches);
    // demoting an admin requires assigning a branch below.
    if (body.role === "admin") data.branch = null;
  }
  // Branch reassignment — super admin only.
  if (body.branch !== undefined && !isBranch(guard.session.branch)) {
    if (body.branch === null) {
      data.branch = null;
    } else if (isBranch(body.branch)) {
      data.branch = body.branch;
    } else {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
    }
  }
  if (typeof body.active === "boolean") {
    // Prevent locking yourself out.
    if (!body.active && params.id === guard.session.sub)
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    data.active = body.active;
  }
  // Salary is admin-only.
  if (body.salary !== undefined && guard.session.role === "admin") {
    data.salary = body.salary === "" || body.salary === null ? null : Math.round(Number(body.salary)) || null;
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, username: true, fullName: true, role: true, branch: true, active: true, salary: true, createdAt: true, lastLogin: true },
  });
  await audit(guard.session.sub, `Updated staff "${user.username}"`);
  return NextResponse.json({ staff: user });
}
