import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateStaffBody {
  fullName?: string;
  role?: "ADMIN" | "MANAGER" | "CASHIER";
  cityId?: string | null;
  branchId?: string | null;
  monthlySalary?: number | null;
  active?: boolean;
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("ADMIN");
    const { id } = await params;
    const body = await safeJson<UpdateStaffBody>(req);

    const staff = await prisma.user.update({
      where: { id },
      data: {
        fullName: body.fullName,
        role: body.role,
        cityId: body.role === "MANAGER" ? body.cityId : body.role ? null : undefined,
        branchId: body.role === "CASHIER" ? body.branchId : body.role ? null : undefined,
        monthlySalary: body.monthlySalary,
        active: body.active,
      },
    });

    await logAudit(
      admin.id,
      body.active === false
        ? `deactivated staff member "${staff.fullName}"`
        : `updated staff member "${staff.fullName}"`,
      "User",
      id,
    );
    return NextResponse.json({ staff: { ...staff, passwordHash: undefined } });
  },
);
