import { fileURLToPath } from "url";
import { dirname } from "path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes Railway/Docker deploys small and fast.
  output: "standalone",
  // Pin the file-tracing root to this app. Other lockfiles exist higher up the
  // tree, and Next 15 would otherwise infer the wrong
  // workspace root, breaking standalone module resolution at build time.
  outputFileTracingRoot: __dirname,
  // src/instrumentation.ts (register()) starts the daily R2 database-backup
  // cron when the server boots. The instrumentation hook is stable as of
  // Next 15, so the former experimental.instrumentationHook flag is gone.

  // Baseline security headers applied to every response. These are cheap,
  // framework-agnostic hardening and don't affect the app's own behaviour:
  //  - HSTS: force HTTPS for 2 years (Railway terminates TLS; the kiosk is
  //    always served over HTTPS in production).
  //  - X-Frame-Options / frame-ancestors: the app is never meant to be embedded
  //    in an <iframe>, so deny framing outright (clickjacking defence).
  //  - X-Content-Type-Options: stop browsers MIME-sniffing responses.
  //  - Referrer-Policy: don't leak full URLs to third parties.
  //  - Permissions-Policy: the POS uses no camera/mic/geolocation, so disable them.
  // No restrictive Content-Security-Policy is set here on purpose: the inline
  // no-flash theme script (app/layout.tsx) and Recharts' inline styles would
  // need explicit allowances, which is a larger change to validate separately.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Source map upload — set SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN in
  // Railway to get readable stack traces. Safe to leave unset; errors still
  // appear in Sentry, just with minified names.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
