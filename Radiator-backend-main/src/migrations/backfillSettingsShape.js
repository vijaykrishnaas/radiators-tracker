// Idempotent, boot-safe backfill: makes sure every existing client/settings
// doc physically has the fields newer features expect, instead of relying only
// on the frontend's fallback-merge with FALLBACK_SETTINGS. Every write here is
// gated on the field being PROVABLY ABSENT ($exists:false) — a tenant's own
// configured value is never touched — so this is safe to run on every boot,
// repeatedly, forever.
import { connectDB } from "../config/db.js";
import { defaultSettings } from "../config/defaultSettings.js";

// Top-level settings keys that were introduced after go-live and may be
// missing from a client's stored settings doc. Add new keys here as future
// features grow defaultSettings.js — no other code path needs to change.
const BACKFILLABLE_SETTINGS_KEYS = ["businessType", "automobile", "salary"];

export async function backfillSettingsShape({ dryRun = false } = {}) {
  const db = await connectDB();
  const report = { clientsBusinessType: 0, settingsKeys: {} };

  // 1. clients.businessType — missing ⇒ "radiator" (matches the code-side
  // fallback already used everywhere businessType is read).
  const clientQuery = { businessType: { $exists: false } };
  if (dryRun) {
    report.clientsBusinessType = await db.collection("clients").countDocuments(clientQuery);
  } else {
    const r = await db.collection("clients").updateMany(clientQuery, { $set: { businessType: "radiator" } });
    report.clientsBusinessType = r.modifiedCount;
  }

  // 2. settings.<key> — one pass per known additive key, only ever touching
  // docs where that exact key is absent.
  for (const key of BACKFILLABLE_SETTINGS_KEYS) {
    const query = { [key]: { $exists: false } };
    if (dryRun) {
      report.settingsKeys[key] = await db.collection("settings").countDocuments(query);
    } else {
      const r = await db.collection("settings").updateMany(query, { $set: { [key]: defaultSettings[key] } });
      report.settingsKeys[key] = r.modifiedCount;
    }
  }

  return report;
}
