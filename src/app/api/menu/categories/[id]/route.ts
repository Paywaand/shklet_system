import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError, safeJson } from "@/lib/api";

interface UpdateCategoryBody {
  name?: string;
  nameKu?: string;
  sortOrder?: number;
}

export const PATCH = withApiError(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN");
    const { id } = await params;
    const body = await safeJson<UpdateCategoryBody>(req);

    const category = await prisma.category.update({ where: { id }, data: body });
    await logAudit(user.id, `renamed menu category to "${category.name}"`, "Category", id);
    return NextResponse.json({ category });
  },
);

export const DELETE = withApiError(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("ADMIN");
    const { id } = await params;

    const category = await prisma.category.findUnique({ where: { id } });
    await prisma.category.delete({ where: { id } });
    await logAudit(user.id, `deleted menu category "${category?.name ?? id}"`, "Category", id);
    return NextResponse.json({ ok: true });
  },
);
