// Manual one-off incremental backup to Cloudflare R2 — exports yesterday's rows
// as a JSON file. Useful for verifying the incremental job before relying on the
// 06:00 cron.
//   npm run backup:incremental
import { runIncrementalBackup } from "../src/lib/incremental-backup";

runIncrementalBackup()
  .then((key) => {
    console.log(`Incremental backup complete: ${key}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Incremental backup failed:", e);
    process.exit(1);
  });
