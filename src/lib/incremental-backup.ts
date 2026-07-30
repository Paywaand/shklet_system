// Daily *incremental* off-site backup to Cloudflare R2.
//
// Why: the full `pg_dump` snapshot (see backup.ts) copies the entire database
// every day, so each file is almost identical to the previous one — wasteful as
// the DB grows. This module instead exports only the rows created or updated
// *yesterday* and uploads a small JSON file. The full dump still runs, but only
// weekly as a safety net (see startBackupCron in backup.ts).
//
// Node-only (Prisma + AWS SDK). Imported from instrumentation.ts on the Node.js
// runtime, never from Edge middleware.

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "./prisma";
import { r2Config } from "./backup";

// Yesterday's local-time window: [yesterday 00:00:00, today 00:00:00).
// Using a half-open range avoids the millisecond gap a "23:59:59.999" upper
// bound leaves open.
type DayWindow = { from: Date; to: Date; dateStr: string };

export function yesterdayWindow(now: Date = new Date()): DayWindow {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${from.getFullYear()}-${p(from.getMonth() + 1)}-${p(from.getDate())}`;
  return { from, to, dateStr };
}

// Collect yesterday's rows from every table that carries activity. Configuration/
// static tables (Category, MenuItem, User, …) are intentionally skipped — they
// belong in the weekly full dump. Items are filtered through their parent order's
// timestamp, since they have no timestamp of their own.
async function collectRows(w: DayWindow): Promise<Record<string, unknown[]>> {
  const range = { gte: w.from, lt: w.to };

  const [
    orders,
    orderItems,
    deliveryOrders,
    deliveryOrderItems,
    auditLogs,
    expenses,
    safeEntries,
    stockMovements,
    dailyNeedsLogs,
    sessions,
  ] = await Promise.all([
    prisma.order.findMany({ where: { placedAt: range } }),
    prisma.orderItem.findMany({ where: { order: { placedAt: range } } }),
    prisma.deliveryOrder.findMany({ where: { placedAt: range } }),
    prisma.deliveryOrderItem.findMany({ where: { order: { placedAt: range } } }),
    prisma.auditLog.findMany({ where: { createdAt: range } }),
    prisma.expense.findMany({ where: { createdAt: range } }),
    prisma.safeEntry.findMany({ where: { createdAt: range } }),
    prisma.stockMovement.findMany({ where: { createdAt: range } }),
    prisma.dailyNeedsLog.findMany({ where: { createdAt: range } }),
    prisma.session.findMany({ where: { createdAt: range } }),
  ]);

  return {
    Order: orders,
    OrderItem: orderItems,
    DeliveryOrder: deliveryOrders,
    DeliveryOrderItem: deliveryOrderItems,
    AuditLog: auditLogs,
    Expense: expenses,
    SafeEntry: safeEntries,
    StockMovement: stockMovements,
    DailyNeedsLog: dailyNeedsLogs,
    Session: sessions,
  };
}

// Prisma can return BigInt and Decimal values that JSON.stringify can't handle
// natively. Coerce them to strings so the backup is always serialisable.
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && "toFixed" in (value as object)) {
    // Prisma Decimal — stringify without losing precision.
    return String(value);
  }
  return value;
}

// Export yesterday's rows as a JSON file and upload it to R2. Returns the object
// key on success. Does NOT delete or overwrite previous incremental files.
export async function runIncrementalBackup(now: Date = new Date()): Promise<string> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured (missing R2_* environment variables)");

  const w = yesterdayWindow(now);
  const tables = await collectRows(w);
  const rowCount = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);

  const payload = {
    date: w.dateStr,
    generatedAt: new Date().toISOString(),
    tables,
  };
  const body = Buffer.from(JSON.stringify(payload, jsonReplacer, 0), "utf8");

  const [year, month] = w.dateStr.split("-");
  const key = `backups/incremental/${year}/${month}/incremental_backup_${w.dateStr}.json`;

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
      ContentType: "application/json",
    })
  );

  console.log(
    `[backup] incremental ${w.dateStr}: ${rowCount} rows, ${body.length} bytes -> ${key}`
  );
  return key;
}
