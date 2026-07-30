import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight edge-safe gate: redirects requests with no session cookie at
 * all straight to /login before they ever reach a page. This is a fast
 * first line of defense only — it does NOT validate the session against the
 * database (that needs Prisma, which requires the Node.js runtime). Real
 * authorization — verifying the JWT, checking the session isn't revoked or
 * expired, and role/city/branch scoping — happens server-side in
 * `getCurrentUser()` / `requireRole()` on every page and every API route.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/manifest.json"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/icons") ||
    // Static menu-item photos live under /menu-photos/*, deliberately NOT
    // "/menu" — that prefix is also the (protected) Menu Management page,
    // and a naive startsWith("/menu") match would let that page bypass auth.
    pathname.startsWith("/menu-photos");

  if (isPublic) return NextResponse.next();

  const hasSession = req.cookies.has("shklet_session");
  if (!hasSession && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
