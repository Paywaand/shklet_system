import { NextResponse } from "next/server";
import { clearSessionCookie, getSession, revokeSession } from "@/lib/auth";
import { audit } from "@/lib/guard";

export async function POST() {
  const session = await getSession();
  if (session) {
    await revokeSession(session.sid); // delete the server-side row → instant revocation
    await audit(session.sub, "Logged out");
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
