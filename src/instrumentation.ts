// Next.js instrumentation hook — runs once when the server process boots.
// Initialises Sentry error monitoring and starts the R2 backup cron.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Boot Sentry for the correct runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  // Start backup cron — Node only, skip during `next build`.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startBackupCron } = await import("./lib/backup");
    startBackupCron();
  }
}

// Capture server-component and route-handler errors in Next.js 15.
export const onRequestError = Sentry.captureRequestError;
