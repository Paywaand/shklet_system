import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

// GET /api/events — all events (newest first).
export async function GET() {
  const guard = await authorize("events.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const events = await prisma.event.findMany({ where: { branch }, orderBy: { startDate: "desc" } });
  return NextResponse.json({ events });
}

// POST /api/events — create an event.
export async function POST(req: Request) {
  const guard = await authorize("events.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const event = await prisma.event.create({
    data: {
      name: body.name.trim(),
      branch,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : null,
      location: body.location?.trim() || null,
      status: "active",
    },
  });
  await audit(guard.session.sub, `Created event "${event.name}"`);
  return NextResponse.json({ event }, { status: 201 });
}
