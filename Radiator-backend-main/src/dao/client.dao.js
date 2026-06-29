import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import { toClientId, assertClientId } from "../utils/tenant.js";
import { deleteLogo, deleteQr, deleteLoginBg, deleteSignature } from "./logo.dao.js";

const COLLECTION = "clients";

// Business-code rules: lowercase, url-safe, used at login and in /t/:code/login.
export const CODE_REGEX = /^[a-z0-9-]{2,40}$/;

export function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

export async function findClientByCode(code) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ code: normalizeCode(code) });
}

export async function getClientById(id) {
  if (!ObjectId.isValid(id)) return null;
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

// Lightweight status lookup used by the per-request lockout middleware.
export async function getClientStatus(clientId) {
  const db = await connectDB();
  return db
    .collection(COLLECTION)
    .findOne({ _id: toClientId(clientId) }, { projection: { status: 1 } });
}

export async function createClient({ name, code, adminUserId }) {
  const db = await connectDB();
  const now = new Date();
  const doc = {
    name: String(name).trim(),
    code: normalizeCode(code),
    status: "active",
    adminUserId: String(adminUserId).trim(),
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listClients() {
  const db = await connectDB();
  return db
    .collection(COLLECTION)
    .find({}, { projection: { name: 1, code: 1, status: 1, adminUserId: 1, lastLoginAt: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
}

// Renames / toggles status. The business `code` is intentionally NOT updatable
// (it would break handover links already given out).
export async function updateClient(id, { name, status } = {}) {
  const db = await connectDB();
  const set = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) set.name = name.trim();
  if (status === "active" || status === "suspended") set.status = status;
  const result = await db
    .collection(COLLECTION)
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set: set }, { returnDocument: "after" });
  return result.value || result; // driver version tolerance
}

export async function touchLastLogin(clientId) {
  const db = await connectDB();
  await db
    .collection(COLLECTION)
    .updateOne({ _id: toClientId(clientId) }, { $set: { lastLoginAt: new Date() } });
}

// Gathers a client's full dataset for the pre-delete / on-demand export.
export async function exportClientData(clientId) {
  const cid = toClientId(clientId);
  const db = await connectDB();
  const [client, settings, radiators, bonuses, expenses] = await Promise.all([
    db.collection("clients").findOne({ _id: cid }),
    db.collection("settings").findOne({ _id: cid }),
    db.collection("radiators").find({ clientId: cid }).sort({ billDate: 1 }).toArray(),
    db.collection("bonuses").find({ clientId: cid }).sort({ billDate: 1 }).toArray(),
    db.collection("expenses").find({ clientId: cid }).sort({ date: 1 }).toArray(),
  ]);
  return { client, settings, radiators, bonuses, expenses };
}

// Cascade-deletes a client and ALL of its data. assertClientId + ObjectId
// conversion happen BEFORE any deleteMany so a null clientId can never match
// (and wipe) other tenants' null-field documents.
export async function offboardClient(clientId) {
  assertClientId(clientId);
  const cid = toClientId(clientId);
  const db = await connectDB();

  const counts = {};
  counts.radiators = (await db.collection("radiators").deleteMany({ clientId: cid })).deletedCount;
  counts.bonuses = (await db.collection("bonuses").deleteMany({ clientId: cid })).deletedCount;
  counts.expenses = (await db.collection("expenses").deleteMany({ clientId: cid })).deletedCount;
  counts.settings = (await db.collection("settings").deleteOne({ _id: cid })).deletedCount;
  counts.users = (await db.collection("users").deleteMany({ clientId: cid })).deletedCount;
  await db.collection("counters").deleteOne({ _id: cid });
  await deleteLogo(cid);
  await deleteQr(cid);
  await deleteLoginBg(cid);
  await deleteSignature(cid);
  counts.clients = (await db.collection("clients").deleteOne({ _id: cid })).deletedCount;
  return counts;
}
