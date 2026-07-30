import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE, CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/authConstants";

// Page paths that don't require a session.
const PUBLIC_PATHS = ["/login"];

// API paths reachable without a session (everything else under /api is fail-closed).
const PUBLIC_API = ["/api/auth/login"];

// Methods that mutate state must carry the custom CSRF header.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// A token counts as a candidate session only if its signature verifies AND it
// carries a `sid` (the DB session reference). Old/legacy cookies without a `sid`
// are NOT real sessions in the DB-backed model, so they're rejected here — this
// prevents a redirect loop where the middleware thinks a sid-less cookie is valid
// but the DB-backed getSession() (in the page layout / API routes) rejects it.
// NOTE: this only verifies the JWT; the authoritative revocation check (does the
// Session row still exist?) happens server-side in getSession().
async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sid === "string" && payload.sid.length > 0;
  } catch {
    return false;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);

  // ---------------- API routes: fail-closed + CSRF ----------------
  if (pathname.startsWith("/api")) {
    // CSRF: any state-changing request must send `X-Requested-With:
    // XMLHttpRequest`. A cross-site form/navigation cannot set a custom header
    // without a CORS preflight, so this blocks classic CSRF.
    if (MUTATING.has(req.method)) {
      const header = req.headers.get(CSRF_HEADER);
      if (header !== CSRF_HEADER_VALUE) {
        return jsonError("Invalid or missing request header", 403);
      }
    }

    const isPublicApi = PUBLIC_API.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    // Fail-closed: reject any non-public API request without a valid session.
    // (Per-permission + revocation checks still happen in the route handlers via
    // authorize()/getSession(), which additionally verify the DB session row.)
    if (!isPublicApi && !valid) {
      return jsonError("Not authenticated", 401);
    }

    return NextResponse.next();
  }

  // ---------------- Page routes ----------------
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // NOTE: we deliberately do NOT redirect logged-in users away from /login here.
  // The middleware can only verify the JWT, not whether the DB session row still
  // exists. Redirecting /login → /pos on a JWT that the server later rejects
  // creates an infinite /login ⇄ /pos loop. Instead, the login page itself does a
  // DB-backed check (GET /api/auth/me) and forwards already-authenticated users.

  // Page routes require a (candidate) session. If absent/invalid, send to login
  // and proactively clear the stale cookie so a bad/legacy token can't linger.
  if (!isPublic && !valid) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

// Run on all routes EXCEPT Next internals and static assets. API routes are now
// included (they were previously excluded) so the middleware can enforce the
// fail-closed auth gate + CSRF header check. PWA files (manifest, icons) and
// brand assets stay public so the tablet can install/launch without a session.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|icons|manifest.json).*)"],
};
