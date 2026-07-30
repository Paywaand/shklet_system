// Edge-safe auth constants. Kept in their own module (no Prisma / Node imports) so
// the Edge middleware can import them without pulling the Node-only Prisma client
// into the Edge bundle.

export const SESSION_COOKIE = "shklet_session";

// Custom header required on all mutating API requests (CSRF defence). A browser
// cannot set a custom header on a cross-site form/navigation request without a
// CORS preflight, so requiring it blocks classic CSRF.
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "XMLHttpRequest";
