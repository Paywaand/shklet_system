// Send a sample success + failure message through the real notifyWebhook()
// function to confirm the Discord webhook is wired up and renders correctly.
//
// Run with your webhook URL in the environment (it lives on Railway, not here):
//   BACKUP_NOTIFY_WEBHOOK='https://discord.com/api/webhooks/...' npx tsx scripts/test-webhook.ts
import { notifyWebhook } from "../src/lib/backup";

async function main() {
  if (!process.env.BACKUP_NOTIFY_WEBHOOK) {
    console.error(
      "BACKUP_NOTIFY_WEBHOOK is not set. Run:\n" +
        "  BACKUP_NOTIFY_WEBHOOK='<your discord webhook url>' npx tsx scripts/test-webhook.ts"
    );
    process.exit(1);
  }

  console.log("Sending test success message...");
  await notifyWebhook(true, "Test message — backup notifications are working.");

  console.log("Sending test failure message...");
  await notifyWebhook(false, "Test message — this is what a failure looks like.");

  console.log("Done. Check your Discord channel for two messages.");
}

main().catch((e) => {
  console.error("Test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
