import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import { toClientId } from "../utils/tenant.js";

const COLLECTION = "users";

// --- Lookups ---------------------------------------------------------------

// Client admins are unique per (clientId, userId), so login must resolve the
// client first, then find the user within it.
export async function findUserByClient(clientId, userId) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ clientId: toClientId(clientId), userId });
}

export async function findSuperAdmin(userId) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ userId, role: "superadmin" });
}

export async function findUserById(id) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

// --- Seeding / creation ----------------------------------------------------

// Seeds the single platform super-admin from .env if none exists yet.
// Idempotent: keyed on the existence of a superadmin (not the total user count,
// which is now non-zero once clients exist).
export async function seedSuperAdmin() {
  const db = await connectDB();
  const users = db.collection(COLLECTION);

  const existing = await users.findOne({ role: "superadmin" });
  if (existing) return;

  const userId = process.env.SUPERADMIN_USER_ID || "superadmin";
  const password = process.env.SUPERADMIN_PASSWORD || "superadmin123";
  const name = process.env.SUPERADMIN_NAME || "Platform Admin";

  await users.insertOne({
    userId,
    passwordHash: await bcrypt.hash(password, 10),
    name,
    role: "superadmin",
    clientId: null,
    mustChangePassword: true,
    createdAt: new Date(),
  });

  console.log(`Super-admin seeded ✅ (userId: ${userId})`);
}

export async function createClientAdmin({ clientId, userId, password, name }) {
  const db = await connectDB();
  const doc = {
    clientId: toClientId(clientId),
    userId: String(userId).trim(),
    passwordHash: await bcrypt.hash(password, 10),
    name: name || String(userId).trim(),
    role: "admin",
    mustChangePassword: true,
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// --- Password management ----------------------------------------------------

// Super-admin resets a client's admin password; re-arms the forced-change flag.
export async function resetClientAdminPassword(clientId, userId, newPassword) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { clientId: toClientId(clientId), userId },
    { $set: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: true } }
  );
  if (result.matchedCount === 0) throw new Error("Client admin user not found");
  return true;
}

// A logged-in user changes their own password (verifies current, clears the flag).
export async function changeOwnPassword(userDocId, currentPassword, newPassword) {
  const db = await connectDB();
  const user = await db.collection(COLLECTION).findOne({ _id: new ObjectId(userDocId) });
  if (!user) throw new Error("User not found");
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 400;
    throw err;
  }
  await db.collection(COLLECTION).updateOne(
    { _id: user._id },
    { $set: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false } }
  );
  return true;
}
