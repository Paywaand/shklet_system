// Restore a database backup from Cloudflare R2.
//   npm run restore                  — list available backups
//   npm run restore backup-2026-06-14-0300.sql  — restore a specific backup
//
// WARNING: this runs psql against DATABASE_URL directly. Point it at a scratch
// database first if you are testing, not the live production database.
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { r2Config } from "../src/lib/backup";

const execFileAsync = promisify(execFile);

async function main() {
  const cfg = r2Config();
  if (!cfg) {
    console.error("R2 is not configured — set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  const key = process.argv[2];

  if (!key) {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket }));
    const objects = (res.Contents ?? [])
      .filter((o) => o.Key?.endsWith(".sql"))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (objects.length === 0) {
      console.log("No backups found in bucket.");
      process.exit(0);
    }

    console.log("Available backups (newest first):\n");
    for (const o of objects) {
      const kb = ((o.Size ?? 0) / 1024).toFixed(0);
      console.log(`  ${o.Key}  (${kb} KB)  ${o.LastModified?.toISOString()}`);
    }
    console.log(`\nUsage: npm run restore <backup-key>`);
    process.exit(0);
  }

  console.log(`Downloading ${key} from R2...`);
  const getRes = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!getRes.Body) throw new Error("Empty response from R2");

  const bytes = Buffer.from(await getRes.Body.transformToByteArray());
  const tmpPath = path.join(os.tmpdir(), `shklet-restore-${Date.now()}.sql`);
  await fs.writeFile(tmpPath, bytes);
  console.log(`Downloaded ${bytes.length.toLocaleString()} bytes → ${tmpPath}`);

  console.log("Restoring to database (this may take a moment)...");
  try {
    await execFileAsync("psql", ["-d", dbUrl, "-f", tmpPath]);
    console.log("Restore complete.");
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

main().catch((e) => {
  console.error("Restore failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
