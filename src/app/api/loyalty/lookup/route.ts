import { NextResponse } from "next/server";
import { authorize } from "@/lib/guard";
import { lookupCustomer } from "@/lib/loyalty";

// GET /api/loyalty/lookup?phone=... — cashier-facing (POS "i" info button).
// Never errors on "not found" — an unrecognized phone just means no history yet.
export async function GET(req: Request) {
  const guard = await authorize("pos.use");
  if (!guard.ok) return guard.response;

  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  const result = await lookupCustomer(phone);
  return NextResponse.json(result);
}
