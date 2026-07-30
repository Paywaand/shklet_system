import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/guard";
import { DailyNeedsItemsSchema } from "@/lib/schemas";
import { activeBranch } from "@/lib/branchScope";

// POST /api/daily-needs — optional persistence of a completed checklist.
// Accessible to every role that can view Daily Needs (incl. cashiers).
export async function POST(req: Request) {
  const guard = await authorize("daily.view");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  // Strict validation before the list is JSON-stringified into the DB (bounds the
  // item count + string sizes — see lib/schemas.ts).
  const parsed = DailyNeedsItemsSchema.safeParse(body.items);
  if (!parsed.success || parsed.data.length === 0)
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

  const log = await prisma.dailyNeedsLog.create({
    data: { createdById: guard.session.sub, branch, items: JSON.stringify(parsed.data) },
  });
  return NextResponse.json({ id: log.id }, { status: 201 });
}
