import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "shklet_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? "30");

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  cityId: string | null;
  branchId: string | null;
}

/** Creates a DB-backed session row + a signed cookie referencing it. */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId, expiresAt },
  });

  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      const sid = payload.sid as string | undefined;
      if (sid) {
        await prisma.session.updateMany({ where: { id: sid }, data: { revoked: true } });
      }
    } catch {
      // ignore invalid token — clearing the cookie is enough
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Resolves the current authenticated user from the session cookie, verifying
 * the signature *and* checking the DB session row is neither revoked nor
 * expired — this is what makes "delete the session row" an immediate logout,
 * not just a cookie that keeps validating against its own JWT expiry.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let sid: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    sid = payload.sid as string | undefined;
  } catch {
    return null;
  }
  if (!sid) return null;

  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });

  if (!session || session.revoked || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role,
    cityId: session.user.cityId,
    branchId: session.user.branchId,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Throws a 401 AuthError if there's no logged-in user. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  return user;
}

/**
 * Throws a 403 AuthError if the current user's role isn't in `roles`.
 * Use alongside city/branch scoping helpers — role gates *module* access,
 * scoping gates *data* access; both are enforced server-side (see
 * `scopeCityFilter` / `scopeBranchFilter` below).
 */
export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("Forbidden", 403);
  return user;
}

/**
 * Returns a Prisma `where` fragment that scopes a city-keyed query to the
 * current user's access: admins see everything (`{}`), managers are locked
 * to their assigned city, cashiers are locked (via their branch) to their
 * branch's city. Never trust a client-supplied cityId for a non-admin.
 */
export function scopeCityFilter(user: AuthUser, requestedCityId?: string | null) {
  if (user.role === "ADMIN") {
    return requestedCityId ? { cityId: requestedCityId } : {};
  }
  if (user.role === "MANAGER") {
    return { cityId: user.cityId ?? "__none__" };
  }
  // Cashiers don't have city-scoped module access at all (enforced by role
  // checks before this is ever called), but fail closed just in case.
  return { cityId: "__none__" };
}

export function scopeBranchFilter(user: AuthUser, requestedBranchId?: string | null) {
  if (user.role === "ADMIN") {
    return requestedBranchId ? { branchId: requestedBranchId } : {};
  }
  if (user.role === "CASHIER") {
    return { branchId: user.branchId ?? "__none__" };
  }
  return { branchId: "__none__" };
}

export async function logAudit(userId: string, action: string, entityType?: string, entityId?: string) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId },
  });
  // Keep only the last 50 (spec: "Audit log: last 50 actions")
  const count = await prisma.auditLog.count();
  if (count > 200) {
    const excess = await prisma.auditLog.findMany({
      orderBy: { createdAt: "asc" },
      take: count - 200,
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }
}
