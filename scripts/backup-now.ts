// Manual one-off database backup to Cloudflare R2. Useful for verifying the R2
// credentials/bucket are set up correctly, or taking an ad-hoc backup.
//   npm run backup
import { runBackup } from "../src/lib/backup";

runBackup()
  .then((key) => {
    console.log(`Backup complete: ${key}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Backup failed:", e);
    process.exit(1);
  });
