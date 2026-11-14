import { ObjectId } from "mongodb";
import { connectDB } from "../config/db.js";
import { toClientId } from "../utils/tenant.js";
import { templateStatuses } from "../services/whatsapp/templates.js";
import { encryptSecret, decryptSecret } from "../utils/secretBox.js";

const ACCOUNTS = "whatsapp_accounts";
const MESSAGES = "whatsapp_messages";

export const BILL_COLLECTIONS = { radiator: "radiators", automobile: "autobills", engineering: "engbills", tyre: "tyrebills" };

// ---- accounts (one per client; only the super admin writes them) ----------

export async function getAccount(clientId) {
  const db = await connectDB();
  return db.collection(ACCOUNTS).findOne({ clientId: toClientId(clientId) });
}

export async function getAccountByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const db = await connectDB();
  return db.collection(ACCOUNTS).findOne({ phoneNumberId: String(phoneNumberId) });
}

export async function listEnabledAccounts() {
  const db = await connectDB();
  return db.collection(ACCOUNTS).find({ enabled: true }).toArray();
}

const PLAIN_FIELDS = ["enabled", "enabledAt", "enabledBy", "provider", "numberType", "phoneNumberId", "wabaId", "appId", "displayPhone", "verifiedName", "templates", "lastSummaryDate"];

// Saves only the fields given. accessToken / appSecret are encrypted into secretsEnc; blank keeps the stored one.
export async function saveAccount(clientId, fields = {}) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const existing = await db.collection(ACCOUNTS).findOne({ clientId: cid });
  const set = { updatedAt: new Date() };
  for (const k of PLAIN_FIELDS) if (fields[k] !== undefined) set[k] = fields[k];
  const secretsEnc = { ...(existing?.secretsEnc || {}) };
  if (String(fields.accessToken || "").trim()) secretsEnc.token = encryptSecret(String(fields.accessToken).trim());
  if (String(fields.appSecret || "").trim()) secretsEnc.appSecret = encryptSecret(String(fields.appSecret).trim());
  set.secretsEnc = secretsEnc;
  await db.collection(ACCOUNTS).updateOne({ clientId: cid }, { $set: set }, { upsert: true });
  return getAccount(clientId);
}

export async function setEnabled(clientId, enabled, actor = "") {
  const db = await connectDB();
  const set = { enabled: !!enabled, updatedAt: new Date() };
  if (enabled) Object.assign(set, { enabledAt: new Date(), enabledBy: actor });
  await db.collection(ACCOUNTS).updateOne({ clientId: toClientId(clientId) }, { $set: set });
}

export async function removeAccount(clientId) {
  const db = await connectDB();
  return (await db.collection(ACCOUNTS).deleteOne({ clientId: toClientId(clientId) })).deletedCount;
}

// The single check every send path and tenant route uses.
export async function isWhatsAppEnabled(clientId) {
  if (!clientId) return false;
  const a = await getAccount(clientId);
  return !!(a && a.enabled === true && a.phoneNumberId && a.secretsEnc?.token);
}

export function decryptSecrets(doc) {
  return {
    token: doc?.secretsEnc?.token ? decryptSecret(doc.secretsEnc.token) : "",
    appSecret: doc?.secretsEnc?.appSecret ? decryptSecret(doc.secretsEnc.appSecret) : "",
  };
}

// What a provider function needs to call the API for this account.
export function accountContext(doc) {
  const { token, appSecret } = decryptSecrets(doc);
  return { phoneNumberId: doc.phoneNumberId, wabaId: doc.wabaId, appId: doc.appId || "", token, appSecret };
}

// The only shape of an account that may leave the server: never a secret, only whether one is stored.
export function maskedAccount(doc) {
  if (!doc) return null;
  let tokenMasked = "";
  if (doc.secretsEnc?.token) {
    try {
      const t = decryptSecret(doc.secretsEnc.token);
      tokenMasked = `••••${t.slice(-4)}`;
    } catch {
      tokenMasked = "••••";
    }
  }
  return {
    enabled: !!doc.enabled,
    provider: doc.provider || "meta",
    numberType: doc.numberType || "new",
    phoneNumberId: doc.phoneNumberId || "",
    wabaId: doc.wabaId || "",
    appId: doc.appId || "",
    displayPhone: doc.displayPhone || "",
    verifiedName: doc.verifiedName || "",
    hasToken: !!doc.secretsEnc?.token,
    hasAppSecret: !!doc.secretsEnc?.appSecret,
    tokenMasked,
    templates: templateStatuses(doc),
    enabledAt: doc.enabledAt || null,
  };
}

// ---- messages (log + retry queue) -----------------------------------------

export async function logMessage(entry) {
  const db = await connectDB();
  const doc = { attempts: 0, at: new Date(), ...entry, clientId: toClientId(entry.clientId) };
  const r = await db.collection(MESSAGES).insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

export async function updateMessage(id, set) {
  const db = await connectDB();
  await db.collection(MESSAGES).updateOne({ _id: new ObjectId(String(id)) }, { $set: set });
}

export async function getMessage(id) {
  if (!ObjectId.isValid(String(id))) return null;
  const db = await connectDB();
  return db.collection(MESSAGES).findOne({ _id: new ObjectId(String(id)) });
}

export async function findMessage(query) {
  const db = await connectDB();
  return db.collection(MESSAGES).findOne(query);
}

// Scoped to the company whose signed webhook reported it, so one shop's webhook can never change another's messages.
export async function findByProviderId(providerMessageId, clientId) {
  if (!providerMessageId || !clientId) return null;
  const db = await connectDB();
  return db.collection(MESSAGES).findOne({ providerMessageId, clientId: toClientId(clientId) });
}

export async function messagesForRef(clientId, refId, limit = 50) {
  const db = await connectDB();
  return db.collection(MESSAGES).find({ clientId: toClientId(clientId), refId: String(refId) }).sort({ at: -1, _id: -1 }).limit(limit).toArray();
}

export async function dueRetries(now = new Date(), limit = 50) {
  const db = await connectDB();
  return db.collection(MESSAGES).find({ status: "pending", nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(limit).toArray();
}

export async function staleAwaitingPdf(cutoff, limit = 50) {
  const db = await connectDB();
  return db.collection(MESSAGES).find({ status: "awaiting_pdf", at: { $lte: cutoff } }).sort({ at: 1 }).limit(limit).toArray();
}

// Keeps the bill's last-send summary in step with the log (the bill list filters on it).
export async function setBillWhatsapp(clientId, vertical, billId, summary) {
  const coll = BILL_COLLECTIONS[vertical];
  if (!coll || !ObjectId.isValid(String(billId))) return;
  const db = await connectDB();
  await db.collection(coll).updateOne(
    { _id: new ObjectId(String(billId)), clientId: toClientId(clientId) },
    { $set: { whatsapp: { status: summary.status, at: summary.at || new Date(), error: summary.error || "", kind: summary.kind } } }
  );
}

const IST_MS = 5.5 * 3600 * 1000;

// First instant of the IST month "YYYY-MM" and of the next one.
export function istMonthRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST_MS), to: new Date(Date.UTC(y, m, 1) - IST_MS) };
}

export function istMonthOf(date = new Date()) {
  return new Date(date.getTime() + IST_MS).toISOString().slice(0, 7);
}

// Messages per kind in the IST month: sent counts sent | delivered | read.
export async function usage(clientId, month = istMonthOf()) {
  const db = await connectDB();
  const { from, to } = istMonthRange(month);
  const rows = await db.collection(MESSAGES).find({ clientId: toClientId(clientId), at: { $gte: from, $lte: new Date(to.getTime() - 1) } }).toArray();
  const byKind = {};
  let total = 0;
  for (const m of rows) {
    const k = (byKind[m.kind] ||= { sent: 0, failed: 0 });
    if (["sent", "delivered", "read"].includes(m.status)) { k.sent++; total++; }
    else if (m.status === "failed") k.failed++;
  }
  return { month, byKind, total };
}
