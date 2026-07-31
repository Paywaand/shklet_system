import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { checkRateLimit, recordFailure, clearRateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  // Brute-force protection: max 5 failed attempts per 15 minutes, keyed by
  // IP + the attempted username. Check (don't record) up-front and reject early.
  const uname = String(username).trim().toLowerCase();
  const rlKey = `${clientIp(req)}:${uname}`;
  const pre = checkRateLimit(rlKey);
  if (pre.blocked) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(pre.retryAfterSeconds) } }
    );
  }

  // Usernames are stored lowercased at creation, so match case-insensitively.
  const user = await prisma.user.findUnique({ where: { username: uname }, include: { branch: true } });

  // Record the failure (so the NEXT request's up-front check can block once the
  // limit is reached) and return a normal 401. This allows the full quota of
  // failed attempts; the (n+1)th request is the one rejected with 429 above.
  const fail = () => {
    recordFailure(rlKey);
    return NextResponse.json(
      { error: "Invalid credentials or inactive account" },
      { status: 401 }
    );
  };

  if (!user || !user.active) return fail();

  const valid = await bcrypt.compare(String(password), user.password);
  if (!valid) return fail();

  // Success — clear the counter and issue a fresh DB-backed session.
  clearRateLimit(rlKey);
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const token = await createSession(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as Role,
      branch: user.branch?.city ?? null,
      branchId: user.branchId,
    },
    { userAgent: req.headers.get("user-agent"), ip: clientIp(req) }
  );
  await setSessionCookie(token);
  await audit(user.id, `Logged in`);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      branch: user.branch?.city ?? null,
      branchId: user.branchId,
    },
  });
}
