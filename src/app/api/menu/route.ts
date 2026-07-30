import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// GET /api/menu            -> available items only (for POS)
// GET /api/menu?all=1      -> everything (for menu management)
export async function GET(req: Request) {
  const guard = await authorize(); // any signed-in user
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const all = new URL(req.url).searchParams.get("all") === "1";

  const categories = await prisma.category.findMany({
    where: { branch },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: all ? undefined : { available: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json({ categories });
}
