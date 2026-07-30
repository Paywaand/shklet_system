import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { ROLES } from "@/lib/permissions";
import { isBranch } from "@/lib/branches";

export async function GET() {
  const guard = await authorize("staff.manage");
  if (!guard.ok) return guard.response;

  const isAdmin = guard.session.role === "admin";
  // The super admin sees staff of BOTH branches (each row carries its branch);
  // a branch-bound user with staff.manage only ever sees their own branch.
  const where = isBranch(guard.session.branch) ? { branch: guard.session.branch } : {};
  const staff = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      branch: true,
      active: true,
      salary: true,
      createdAt: true,
      lastLogin: true,
    },
  });
  // Salary is admin-only — strip it for any other role.
  const result = staff.map((s) => (isAdmin ? s : { ...s, salary: null }));
  return NextResponse.json({ staff: result, canSeeSalary: isAdmin });
}

export async function POST(req: Request) {
  const guard = await authorize("staff.manage");
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();
  const role = body.role;

  if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Branch assignment:
  //  • a branch-bound creator can only create staff in their OWN branch, and
  //    never admins;
  //  • the super admin picks the branch; "admin" accounts are super admins
  //    (branch = null), managers/cashiers must belong to a branch.
  let branch: string | null;
  if (isBranch(guard.session.branch)) {
    if (role === "admin")
      return NextResponse.json({ error: "Only the super admin can create admin accounts" }, { status: 403 });
    branch = guard.session.branch;
  } else if (role === "admin") {
    branch = null; // super admin — all branches
  } else {
    if (!isBranch(body.branch))
      return NextResponse.json({ error: "Pick a branch (Suli or Erbil) for this account" }, { status: 400 });
    branch = body.branch;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "Username already taken" }, { status: 409 });

  // Only admins may set salary.
  const salary =
    guard.session.role === "admin" && body.salary !== undefined && body.salary !== ""
      ? Math.round(Number(body.salary)) || null
      : null;

  const user = await prisma.user.create({
    data: { username, password: await bcrypt.hash(password, 10), fullName, role, branch, salary },
    select: { id: true, username: true, fullName: true, role: true, branch: true, active: true, salary: true, createdAt: true, lastLogin: true },
  });
  await audit(guard.session.sub, `Created staff "${username}" (${role}${branch ? `, ${branch}` : ""})`);
  return NextResponse.json({ staff: user }, { status: 201 });
}
