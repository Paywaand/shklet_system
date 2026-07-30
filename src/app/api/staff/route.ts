import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const staff = await prisma.user.findMany({
    include: { city: true, branch: { include: { city: true } } },
    orderBy: { createdAt: "asc" },
  });

  // monthlySalary is admin-only. This whole route already requires ADMIN,
  // so no stripping is needed here — the field is only ever exposed to an
  // admin (there is no other endpoint that lists staff for non-admins).
  return NextResponse.json({ staff });
});

interface CreateStaffBody {
  username: string;
  password: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  cityId?: string;
  branchId?: string;
  monthlySalary?: number;
}

export const POST = withApiError(async (req: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const body = await safeJson<CreateStaffBody>(req);

  if (body.role === "MANAGER" && !body.cityId) {
    return NextResponse.json({ error: "Assigned city is required for a manager" }, { status: 400 });
  }
  if (body.role === "CASHIER" && !body.branchId) {
    return NextResponse.json({ error: "Assigned branch is required for a cashier" }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  const staff = await prisma.user.create({
    data: {
      username: body.username.trim().toLowerCase(),
      passwordHash,
      fullName: body.fullName,
      role: body.role,
      cityId: body.role === "MANAGER" ? body.cityId : null,
      branchId: body.role === "CASHIER" ? body.branchId : null,
      monthlySalary: body.monthlySalary,
    },
  });

  await logAudit(admin.id, `added staff member "${body.fullName}" (${body.role})`, "User", staff.id);
  return NextResponse.json({ staff: { ...staff, passwordHash: undefined } });
});
