// One-time, idempotent migration: single-tenant radiatorDB → multi-tenant.
// Registers the existing data as client #1 ("Sri Velavan Radiators"), tags all
// business documents with its clientId, converts the global settings doc, and
// promotes the legacy admin to that client's admin.
//
//   npm run migrate              # apply
//   npm run migrate -- --dry-run # report what would change, write nothing
//
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { connectDB } = await import("../config/db.js");
const { ensureIndexes, ensureUsersUniqueIndex } = await import("../config/ensureIndexes.js");
const { seedSuperAdmin } = await import("../dao/user.dao.js");
const { findClientByCode, createClient } = await import("../dao/client.dao.js");
const { seedSettingsForClient } = await import("../dao/settings.dao.js");

const DRY = process.argv.includes("--dry-run");
const log = (...a) => console.log(DRY ? "[dry-run]" : "[migrate]", ...a);

const CLIENT_NAME = "Sri Velavan Radiators";
const CLIENT_CODE = "velavan";
const LEGACY_ADMIN = process.env.ADMIN_USER_ID || "admin";

async function run() {
  const db = await connectDB();

  // 1. Indexes (non-users) — safe to ensure first.
  if (!DRY) await ensureIndexes();
  log("indexes ensured (clients.code, clientId, audit)");

  // 2. Super-admin.
  if (!DRY) await seedSuperAdmin();
  log(`super-admin ensured (${process.env.SUPERADMIN_USER_ID || "superadmin"})`);

  // 3. Client #1.
  let client = await findClientByCode(CLIENT_CODE);
  if (!client) {
    if (DRY) {
      log(`would create client "${CLIENT_NAME}" (code: ${CLIENT_CODE}, admin: ${LEGACY_ADMIN})`);
    } else {
      client = await createClient({ name: CLIENT_NAME, code: CLIENT_CODE, adminUserId: LEGACY_ADMIN });
      log(`created client ${client._id} (${CLIENT_CODE})`);
    }
  } else {
    log(`client already exists: ${client._id} (${CLIENT_CODE})`);
  }
  const clientId = client?._id; // null only in dry-run when client doesn't exist yet

  // 4. Tag existing business docs lacking a clientId.
  for (const coll of ["radiators", "bonuses", "expenses"]) {
    const untagged = await db.collection(coll).countDocuments({ clientId: { $exists: false } });
    if (DRY) {
      log(`${coll}: ${untagged} doc(s) would be tagged with clientId`);
    } else {
      const r = await db.collection(coll).updateMany({ clientId: { $exists: false } }, { $set: { clientId } });
      log(`${coll}: tagged ${r.modifiedCount} doc(s)`);
    }
  }

  // 5. Settings: convert legacy {_id:"app"} → {_id:clientId}.
  const legacy = await db.collection("settings").findOne({ _id: "app" });
  if (legacy) {
    if (DRY) {
      log('would convert settings {_id:"app"} → {_id:clientId} and delete the old doc');
    } else {
      const { _id, ...rest } = legacy;
      await db.collection("settings").updateOne(
        { _id: clientId },
        { $setOnInsert: { _id: clientId }, $set: rest },
        { upsert: true }
      );
      await db.collection("settings").deleteOne({ _id: "app" });
      log("settings converted to per-client doc");
    }
  } else if (!DRY) {
    await seedSettingsForClient(clientId, CLIENT_NAME);
    log("no legacy settings — seeded defaults for client #1");
  } else {
    log("no legacy settings — would seed defaults for client #1");
  }

  // 6. Promote legacy admin to this client's admin.
  const legacyAdmin = await db.collection("users").findOne({ userId: LEGACY_ADMIN, clientId: { $exists: false } });
  if (legacyAdmin) {
    if (DRY) {
      log(`would attach clientId + role:admin to legacy user "${LEGACY_ADMIN}"`);
    } else {
      await db.collection("users").updateOne(
        { _id: legacyAdmin._id },
        { $set: { clientId, role: "admin", mustChangePassword: false } }
      );
      log(`legacy admin "${LEGACY_ADMIN}" attached to client #1`);
    }
  } else {
    log(`no untagged legacy admin "${LEGACY_ADMIN}" found (already migrated or absent)`);
  }

  // 7. Build the users compound-unique index now that users are tagged.
  if (!DRY) {
    await ensureUsersUniqueIndex();
    log("users {clientId,userId} unique index built");
  }

  log("done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
