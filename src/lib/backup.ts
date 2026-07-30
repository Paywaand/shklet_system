// Daily off-site backups of the PostgreSQL database to a private Cloudflare R2 bucket.
//
// Why: the production DB on Railway is a single managed Postgres instance — losing
// it (or a bad migration / accidental delete) has no off-site recovery on its own.
// This module takes a logical `pg_dump` snapshot every day at 03:00 and uploads it
// to R2 (S3-compatible). Backups are timestamped and kept FOREVER — there is
// intentionally NO rotation/deletion logic (per requirement).
//
// Node-only (child_process + fs + AWS SDK + node-cron). Imported from
// instrumentation.ts on the Node.js runtime, never from Edge middleware.
//
// Requires the `pg_dump` binary on PATH (provided by postgresql-client in the
// production Docker image).

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import cron from "node-cron";

const execFileAsync = promisify(execFile);

// POST to BACKUP_NOTIFY_WEBHOOK (a Discord channel webhook) on each backup run.
// Discord only renders the `content` field, so we format a single message string
// rather than sending the raw object. Non-critical — a webhook failure never
// breaks the backup itself.
export async function notifyWebhook(success: boolean, detail: string) {
  const url = process.env.BACKUP_NOTIFY_WEBHOOK;
  if (!url) return;
  const emoji = success ? "✅" : "❌";
  const content = `${emoji} **Backup ${success ? "succeeded" : "failed"}**\n${detail}\n_${new Date().toISOString()}_`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // intentionally swallowed — webhook is best-effort
  }
}

// Prune rows that grow forever if unchecked:
//  - expired Session rows (they only self-clean on re-access, so abandoned logins linger)
//  - AuditLog rows older than 90 days
async function runPrune() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  try {
    await execFileAsync("psql", [
      "-d", dbUrl,
      "-c", 'DELETE FROM "Session" WHERE "expiresAt" < NOW();',
      "-c", 'DELETE FROM "AuditLog" WHERE "createdAt" < NOW() - INTERVAL \'90 days\';',
    ]);
    console.log("[backup] pruned expired sessions and old audit logs");
  } catch (e) {
    console.error("[backup] prune failed:", e);
  }
}

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
};

// Returns the R2 config only if every required variable is present; otherwise
// null (so we can skip backups silently in environments that haven't set them up).
export function r2Config(): R2Config | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) return null;
  return { accessKeyId, secretAccessKey, endpoint, bucket };
}

// backup-YYYY-MM-DD-HHMM.sql (local time).
function backupFileName(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
  return `backup-${stamp}.sql`;
}

// Take a logical snapshot of the live Postgres DB with `pg_dump` (reading the
// connection string from DATABASE_URL) and upload it to R2. Returns the object
// key on success.
//
// `--no-owner` / `--no-acl` keep the dump portable: restoring into a fresh
// Railway database (which uses a different role) won't fail on ownership/grant
// statements.
export async function runBackup(): Promise<string> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured (missing R2_* environment variables)");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set — cannot run pg_dump");

  // Unique temp destination for the SQL dump.
  const tmpPath = path.join(os.tmpdir(), `shklet-backup-${Date.now()}.sql`);

  try {
    // pg_dump writes the plain-SQL dump straight to the file (`-f`), so nothing is
    // buffered in this process. The connection string is passed via `-d`.
    await execFileAsync("pg_dump", [
      "-d",
      dbUrl,
      "--no-owner",
      "--no-acl",
      "-f",
      tmpPath,
    ]);

    const body = await fs.readFile(tmpPath);
    const key = backupFileName();

    const s3 = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: "application/sql",
      })
    );

    console.log(`[backup] uploaded ${key} (${body.length} bytes) to R2 bucket "${cfg.bucket}"`);
    return key;
  } finally {
    // Always clean up the local snapshot (best-effort).
    await fs.unlink(tmpPath).catch(() => {});
  }
}

let started = false;

// Schedule the off-site backups. Idempotent — safe to call more than once (only
// the first call installs the cron jobs).
//
// Two jobs:
//  - Daily incremental at 06:00: exports only yesterday's rows as a small JSON
//    file (see incremental-backup.ts). 06:00 (not midnight) lets the previous
//    day's writes fully settle first. Override with INCREMENTAL_BACKUP_CRON.
//  - Weekly full `pg_dump` on Sunday at 03:00 as a safety net. Override with
//    BACKUP_CRON.
export function startBackupCron() {
  if (started) return;
  if (!r2Config()) {
    console.log("[backup] R2 not configured — backups disabled");
    return;
  }

  const fullExpr = process.env.BACKUP_CRON || "0 3 * * 0";
  const incExpr = process.env.INCREMENTAL_BACKUP_CRON || "0 6 * * *";
  if (!cron.validate(fullExpr)) {
    console.error(`[backup] invalid BACKUP_CRON "${fullExpr}" — backups disabled`);
    return;
  }
  if (!cron.validate(incExpr)) {
    console.error(`[backup] invalid INCREMENTAL_BACKUP_CRON "${incExpr}" — backups disabled`);
    return;
  }

  started = true;

  cron.schedule(incExpr, async () => {
    try {
      const { runIncrementalBackup } = await import("./incremental-backup");
      await runIncrementalBackup();
      await notifyWebhook(true, "Incremental backup complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[backup] incremental failed:", e);
      await notifyWebhook(false, `Incremental backup failed: ${msg}`);
    }
  });

  cron.schedule(fullExpr, async () => {
    try {
      const key = await runBackup();
      await notifyWebhook(true, `Full backup complete: ${key}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[backup] full failed:", e);
      await notifyWebhook(false, `Full backup failed: ${msg}`);
    }
    await runPrune();
  });

  console.log(
    `[backup] scheduled: incremental (cron "${incExpr}"), weekly full (cron "${fullExpr}")`
  );
}
