// Salary Management — employee HR records. Deliberately separate from the
// plain name-strings in settings.mechanics/settings.labour: this is a parallel
// identity used for payroll only. An employee's `name` is chosen to match the
// existing mechanic/labour string so nothing here needs to touch bill/bonus code.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex } from "../utils/sanitize.js";

const COLLECTION = "employees";

function sanitizeEmployee(data) {
  const bank = data.bankDetails || null;
  return {
    name: String(data.name || "").trim(),
    role: ["mechanic", "labour", "other"].includes(data.role) ? data.role : "other",
    phone: data.phone || "",
    joinDate: data.joinDate ? new Date(data.joinDate) : null,
    active: data.active !== false,
    baseSalary: Math.max(Number(data.baseSalary) || 0, 0),
    payCycle: data.payCycle || "monthly",
    bankDetails: bank
      ? {
          accountName: bank.accountName || "",
          accountNumber: bank.accountNumber || "",
          ifsc: bank.ifsc || "",
          bankName: bank.bankName || "",
        }
      : null,
    notes: data.notes || "",
  };
}

export async function listEmployees(clientId, { active = "", role = "", search = "" } = {}) {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (active === "true") query.active = true;
  if (active === "false") query.active = false;
  if (role) query.role = role;
  if (search) query.name = { $regex: escapeRegex(search), $options: "i" };
  return db.collection(COLLECTION).find(query).sort({ name: 1 }).toArray();
}

export async function getEmployee(clientId, id) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
}

export async function createEmployee(clientId, data) {
  const db = await connectDB();
  const doc = {
    ...sanitizeEmployee(data),
    clientId: toClientId(clientId),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { insertedId: result.insertedId };
}

export async function updateEmployee(clientId, id, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { ...sanitizeEmployee(data), updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw new Error("Employee not found");
  return true;
}

// Soft-deletes by default (active:false) so settlement/attendance history stays
// intact. Hard-deletes only when the employee has no salary/attendance/advance
// history at all — otherwise a real delete would orphan those records' employeeId.
export async function deactivateEmployee(clientId, id) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const eid = new ObjectId(id);

  const [hasSalary, hasAttendance, hasAdvance] = await Promise.all([
    db.collection("salaryPeriods").findOne({ clientId: cid, employeeId: eid }),
    db.collection("attendance").findOne({ clientId: cid, employeeId: eid }),
    db.collection("advances").findOne({ clientId: cid, employeeId: eid }),
  ]);

  if (!hasSalary && !hasAttendance && !hasAdvance) {
    const result = await db.collection(COLLECTION).deleteOne({ _id: eid, clientId: cid });
    if (result.deletedCount === 0) throw new Error("Employee not found");
    return { hardDeleted: true };
  }

  const result = await db.collection(COLLECTION).updateOne(
    { _id: eid, clientId: cid },
    { $set: { active: false, updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw new Error("Employee not found");
  return { hardDeleted: false };
}
