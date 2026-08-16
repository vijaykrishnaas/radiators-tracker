// Manual/one-off runner for the idempotent settings-shape backfill that also
// runs automatically on every server boot (see src/index.js). Useful to check
// what would change before a deploy, or to force a backfill without restarting.
//
//   npm run migrate:backfill              # apply
//   npm run migrate:backfill -- --dry-run # report what would change, write nothing
//
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { backfillSettingsShape } = await import("../migrations/backfillSettingsShape.js");

const DRY = process.argv.includes("--dry-run");

async function run() {
  const report = await backfillSettingsShape({ dryRun: DRY });
  const prefix = DRY ? "[dry-run]" : "[backfill]";
  console.log(`${prefix} clients.businessType backfilled: ${report.clientsBusinessType}`);
  for (const [key, count] of Object.entries(report.settingsKeys)) {
    console.log(`${prefix} settings.${key} backfilled: ${count}`);
  }
  console.log(`${prefix} done.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("[backfill] FAILED:", err);
  process.exit(1);
});
