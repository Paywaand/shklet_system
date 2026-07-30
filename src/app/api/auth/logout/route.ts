import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { withApiError } from "@/lib/api";

export const POST = withApiError(async () => {
  await destroySession();
  return NextResponse.json({ ok: true });
});
