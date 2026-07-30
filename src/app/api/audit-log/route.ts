import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const GET = withApiError(async () => {
  await requireRole("ADMIN");
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { fullName: true } } },
  });
  return NextResponse.json({ logs });
});
