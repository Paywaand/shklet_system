import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns the current user plus the permission keys granted to their role.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const grants = await prisma.rolePermission.findMany({
    where: { role: session.role, allowed: true },
    select: { key: true },
  });

  return NextResponse.json({
    user: {
      id: session.sub,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
      branch: session.branch,
      branchId: session.branchId,
    },
    permissions: grants.map((g) => g.key),
  });
}
