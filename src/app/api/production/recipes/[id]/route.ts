import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, logAudit } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const DELETE = withApiError(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("ADMIN");
    const { id } = await params;
    await prisma.recipe.delete({ where: { id } });
    await logAudit(admin.id, "deleted a recipe", "Recipe", id);
    return NextResponse.json({ ok: true });
  },
);
