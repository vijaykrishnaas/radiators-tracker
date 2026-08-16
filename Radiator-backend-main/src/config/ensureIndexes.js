import { connectDB } from "./db.js";

// Indexes that are always safe to (re)create on boot. Idempotent.
export async function ensureIndexes() {
  const db = await connectDB();

  await db.collection("clients").createIndex({ code: 1 }, { unique: true, name: "uniq_code" });

  // Tenant-scoping indexes — every business read filters by clientId.
  await db.collection("radiators").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("bonuses").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("expenses").createIndex({ clientId: 1 }, { name: "clientId_1" });

  // Automobile bills — same tenant-scoping index, plus a billDate sort index
  // since the billing list/export default to newest-bill-first.
  await db.collection("autobills").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("autobills").createIndex({ clientId: 1, billDate: -1 }, { name: "clientId_1_billDate_-1" });

  // Audit log (Stage 2) — harmless to ensure early.
  await db.collection("audit_log").createIndex({ at: -1 }, { name: "at_-1" });

  // Salary Management — employees, daily attendance, one-time advances, and
  // per-employee-per-period settlement records.
  await db.collection("employees").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("attendance").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("attendance").createIndex(
    { clientId: 1, employeeId: 1, date: 1 },
    { unique: true, name: "uniq_client_emp_date" }
  );
  await db.collection("advances").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("advances").createIndex(
    { clientId: 1, employeeId: 1, status: 1 },
    { name: "client_emp_status" }
  );
  await db.collection("salaryPeriods").createIndex({ clientId: 1 }, { name: "clientId_1" });
  await db.collection("salaryPeriods").createIndex(
    { clientId: 1, employeeId: 1, periodKey: 1 },
    { unique: true, name: "uniq_client_emp_period" }
  );
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
