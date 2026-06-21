import { connectDB } from "./db.js";

// Indexes that are always safe to (re)create on boot. Idempotent.
export async function ensureIndexes() {
  const db = await connectDB();

  await db.collection("clients").createIndex({ code: 1 }, { unique: true, name: "uniq_code" });

  // Tenant-scoping indexes — every business read filters by clientId.
  await db.collection("radiators").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("bonuses").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("expenses").createIndex({ clientId: 1 }, { name: "clientId_1" });

  // Audit log (Stage 2) — harmless to ensure early.
  await db.collection("audit_log").createIndex({ at: -1 }, { name: "at_-1" });
}

// Built separately because it must only be created AFTER the migration tags
// existing users with a clientId — otherwise two legacy admins lacking clientId
// could collide. createIndex is idempotent; callers may wrap in try/catch during
// the pre-migration window.
export async function ensureUsersUniqueIndex() {
  const db = await connectDB();
  await db
    .collection("users")
    .createIndex({ clientId: 1, userId: 1 }, { unique: true, name: "uniq_client_user" });
}
