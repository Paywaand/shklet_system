import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./permissions";
import { prisma } from "./prisma";
import { SESSION_COOKIE } from "./authConstants";

export { SESSION_COOKIE };

export type Session = {
  sub: string; // user id
  username: string;
  fullName: string;
  role: Role;
  // Branch this account is bound to ("suli" | "erbil"), or null for the super
  // admin (all branches). Baked into the token so every API route can hard-scope
  // its queries without an extra DB lookup.
  branch: string | null;
  sid: string; // server-side Session row id (enables revocation)
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

function sessionDays(): number {
  return Number(process.env.SESSION_DAYS || "7");
}

// JWT payload (no `sid` — that's added explicitly so we can type it cleanly).
type TokenPayload = Omit<Session, "sid">;

async function signToken(payload: Session): Promise<string> {
  const days = sessionDays();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

// Create a DB-backed session for a user, returning the signed cookie token.
// The token is only a *reference* to the server-side row, so the row can be
// deleted at any time to revoke the session instantly.
export async function createSession(
  user: { id: string; username: string; fullName: string; role: Role; branch: string | null },
  meta?: { userAgent?: string | null; ip?: string | null }
): Promise<string> {
  const expiresAt = new Date(Date.now() + sessionDays() * 24 * 60 * 60 * 1000);
  const row = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    },
  });
  return signToken({
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    branch: user.branch ?? null,
    sid: row.id,
  });
}

// Verify only the JWT signature/expiry (no DB). Used where a DB round-trip isn't
// possible/needed (the Edge middleware does its own inline verify).
export async function verifySessionToken(token: string): Promise<(TokenPayload & { sid?: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub),
      username: String(payload.username),
      fullName: String(payload.fullName),
      role: payload.role as Role,
      branch: typeof payload.branch === "string" ? payload.branch : null,
      sid: payload.sid ? String(payload.sid) : undefined,
    };
  } catch {
    return null;
  }
}

// Read & verify the session from the request cookies AND confirm the server-side
// session row still exists and hasn't expired. This is the revocation check: any
// route handler / server component that calls getSession() rejects a revoked or
// expired session immediately.
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const decoded = await verifySessionToken(token);
  if (!decoded || !decoded.sid) return null;

  const row = await prisma.session.findUnique({ where: { id: decoded.sid } });
  if (!row) return null; // revoked / logged out
  if (row.expiresAt.getTime() < Date.now()) {
    // Expired — clean it up best-effort and reject.
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  return {
    sub: decoded.sub,
    username: decoded.username,
    fullName: decoded.fullName,
    role: decoded.role,
    branch: decoded.branch ?? null,
    sid: decoded.sid,
  };
}

// Revoke (delete) the server-side session row. Safe to call with a missing id.
export async function revokeSession(sid: string | undefined | null) {
  if (!sid) return;
  await prisma.session.delete({ where: { id: sid } }).catch(() => {});
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: sent on top-level same-site navigations (e.g. the post-login redirect
    // to /pos) but withheld on cross-site requests. Strict broke login behind
    // Railway's reverse proxy — the cookie wasn't attached on the navigation that
    // immediately follows login, bouncing the user back to /login. CSRF is still
    // enforced primarily by the X-Requested-With custom-header check in
    // middleware.ts; SameSite=Lax is defence-in-depth on top of that.
    sameSite: "lax",
    path: "/",
    maxAge: sessionDays() * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}
