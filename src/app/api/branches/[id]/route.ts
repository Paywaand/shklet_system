import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { closesNextDay } from "@/lib/businessDay";

// PATCH /api/branches/:id — rename a branch, edit its hours, reorder, or
// deactivate it. Admin only: this changes staff-assignment options and the
// reporting boundary for every order at this branch.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const existing = await prisma.branch.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
    data.name = name;
  }
  if (body.openHour !== undefined || body.closeHour !== undefined) {
    const openHour = Number(body.openHour ?? existing.openHour);
    const closeHour = Number(body.closeHour ?? existing.closeHour);
    const valid = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
    if (!valid(openHour) || !valid(closeHour))
      return NextResponse.json({ error: "Hours must be whole numbers between 0 and 23" }, { status: 400 });
    if (openHour === closeHour)
      return NextResponse.json({ error: "Opening and closing hours can't be the same" }, { status: 400 });
    data.openHour = openHour;
    data.closeHour = closeHour;
  }
  if (typeof body.sortOrder === "number") data.sortOrder = Math.trunc(body.sortOrder);
  if (typeof body.active === "boolean") data.active = body.active;

  const branch = await prisma.branch.update({ where: { id: params.id }, data });
  await audit(guard.session.sub, `Updated branch "${branch.name}"`);
  return NextResponse.json({ branch: { ...branch, closesNextDay: closesNextDay(branch) } });
}
