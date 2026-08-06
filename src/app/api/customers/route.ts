import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { normalizePhone } from "@/lib/loyalty";

// GET /api/customers?q=phone — Loyalty admin page (read-only progress view).
// Search is a simple digits-only substring match on phone; `q` empty lists
// everyone with loyalty progress (skips brand-new, all-zero rows so the list
// isn't every phone ever typed at checkout).
export async function GET(req: Request) {
  const guard = await authorize("loyalty.manage");
  if (!guard.ok) return guard.response;

  const q = normalizePhone(new URL(req.url).searchParams.get("q") ?? "");
  const customers = await prisma.customer.findMany({
    where: q ? { phone: { contains: q } } : { loyaltyCount: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ customers });
}
