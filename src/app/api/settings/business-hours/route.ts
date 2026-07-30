import { NextResponse } from "next/server";
import { authorize, audit } from "@/lib/guard";
import { getBusinessHours, setBusinessHours } from "@/lib/businessHours";
import { closesNextDay } from "@/lib/businessDay";

// GET /api/settings/business-hours — current operating hours (any signed-in user;
// the client also gets these via the session, this is for explicit refreshes).
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const hours = await getBusinessHours();
  return NextResponse.json({ ...hours, closesNextDay: closesNextDay(hours) });
}

// PUT /api/settings/business-hours — change the opening/closing hours. Admin only:
// this shifts the reporting boundary for the whole branch, so it is not delegated
// to staff.manage holders even though the editor lives on the Staff page.
export async function PUT(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const openHour = Number(body.openHour);
  const closeHour = Number(body.closeHour);
  const valid = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
  if (!valid(openHour) || !valid(closeHour))
    return NextResponse.json({ error: "Hours must be whole numbers between 0 and 23" }, { status: 400 });
  if (openHour === closeHour)
    return NextResponse.json(
      { error: "Opening and closing hours can't be the same" },
      { status: 400 }
    );

  const hours = await setBusinessHours({ openHour, closeHour });
  await audit(
    guard.session.sub,
    `Set business hours to ${openHour}:00 – ${closeHour}:00${closesNextDay(hours) ? " (next day)" : ""}`
  );
  return NextResponse.json({ ...hours, closesNextDay: closesNextDay(hours) });
}
