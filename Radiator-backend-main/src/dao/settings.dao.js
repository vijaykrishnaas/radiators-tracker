import { connectDB } from "../config/db.js";
import { defaultSettings } from "../config/defaultSettings.js";
import { toClientId } from "../utils/tenant.js";

// Settings are per-client, keyed by `_id: <clientId ObjectId>`.

function freshDefaults(clientId, companyName) {
  // Deep clone so the shared defaultSettings object is never mutated.
  const doc = JSON.parse(JSON.stringify(defaultSettings));
  delete doc._id;
  doc._id = toClientId(clientId);
  if (companyName) doc.company.name = companyName;
  return doc;
}

// Seeds a brand-new client's settings (called at provisioning). Idempotent.
export async function seedSettingsForClient(clientId, companyName) {
  const db = await connectDB();
  const collection = db.collection("settings");
  const _id = toClientId(clientId);
  const existing = await collection.findOne({ _id });
  if (existing) return existing;
  const doc = freshDefaults(clientId, companyName);
  await collection.insertOne(doc);
  return doc;
}

// Read-only lookup (no seeding side-effect) — safe for unauthenticated reads
// like the public branding endpoint. Returns null if the client has no settings.
export async function peekSettings(clientId) {
  const db = await connectDB();
  return db.collection("settings").findOne({ _id: toClientId(clientId) });
}

// Returns the client's settings document, seeding defaults if somehow missing.
export async function getSettings(clientId) {
  const db = await connectDB();
  const collection = db.collection("settings");
  const _id = toClientId(clientId);

  let settings = await collection.findOne({ _id });
  if (!settings) {
    settings = freshDefaults(clientId);
    await collection.insertOne(settings);
    console.log(`Default settings seeded for client ${_id} ✅`);
  }
  return settings;
}

export async function updateSettings(clientId, data) {
  const db = await connectDB();
  const collection = db.collection("settings");
  const _id = toClientId(clientId);

  // _id and clientId are immutable / managed here — never accept them from input.
  const { _id: _ignore, clientId: _ignore2, ...update } = data;

  await collection.updateOne({ _id }, { $set: update }, { upsert: true });
  return getSettings(clientId);
}

// Sets only company.logoUrl (after a logo upload) without replacing the rest.
export async function setCompanyLogoUrl(clientId, url) {
  const db = await connectDB();
  await db
    .collection("settings")
    .updateOne({ _id: toClientId(clientId) }, { $set: { "company.logoUrl": url } });
}

// Sets only company.qrUrl (after a payment-QR upload).
export async function setCompanyQrUrl(clientId, url) {
  const db = await connectDB();
  await db
    .collection("settings")
    .updateOne({ _id: toClientId(clientId) }, { $set: { "company.qrUrl": url } });
}
