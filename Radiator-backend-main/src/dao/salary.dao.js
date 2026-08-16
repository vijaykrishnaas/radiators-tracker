// Salary Management — settlement engine. Mirrors dao/bonus.dao.js's pattern:
// period-keyed docs, paid entries locked forever, corrections via an append-only
// adjustment trail rather than mutating history. Advances CRUD lives here too
// (not a separate advance.dao.js) since the "sweep unapplied advances into the
// next settlement" logic is settlement-specific and small enough not to warrant
// its own module.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { toClientId } from "../utils/tenant.js";
import { toMoney, toValidDate } from "../utils/sanitize.js";
import { getSettings } from "./settings.dao.js";
import { computePresentDays } from "./attendance.dao.js";

const PERIODS = "salaryPeriods";
const ADVANCES = "advances";

const round2 = (n) => Math.round(n * 100) / 100;

function periodKeyOf(periodStart) {
  return moment(periodStart).format("YYYY-MM");
}

// Working days = every calendar day in [periodStart, periodEnd] by default, or
// calendar days minus the tenant's configured weekly-off day when that rule is on.
export function getWorkingDays(periodStart, periodEnd, settings) {
  const start = moment(periodStart).startOf("day");
  const end = moment(periodEnd).startOf("day");
  const totalDays = end.diff(start, "days") + 1;
  if (totalDays <= 0) throw Object.assign(new Error("periodEnd must not be before periodStart"), { statusCode: 400 });

  const rule = settings?.salary?.workingDayRule;
  if (rule !== "excludeWeeklyOff") return totalDays;

  const offDay = Number(settings?.salary?.weeklyOffDay ?? 0);
  let offCount = 0;
  const cursor = start.clone();
  for (let i = 0; i < totalDays; i++) {
    if (cursor.day() === offDay) offCount++;
    cursor.add(1, "day");
  }
  return Math.max(totalDays - offCount, 1);
}

async function computeSettlementFigures(clientId, employeeId, periodStart, periodEnd, presentDaysManual) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const eid = new ObjectId(employeeId);

  const employee = await db.collection("employees").findOne({ _id: eid, clientId: cid });
  if (!employee) throw Object.assign(new Error("Employee not found"), { statusCode: 404 });

  const settings = await getSettings(clientId);
  const workingDays = getWorkingDays(periodStart, periodEnd, settings);

  const presentDaysComputed = await computePresentDays(clientId, employeeId, periodStart, periodEnd);
  const presentDaysMode = presentDaysManual != null && presentDaysManual !== "" ? "manual" : "daily";
  const presentDaysUsed = presentDaysMode === "manual"
    ? Math.max(Number(presentDaysManual) || 0, 0)
    : presentDaysComputed;

  const baseSalary = employee.baseSalary || 0;
  const grossAmount = round2(baseSalary * (presentDaysUsed / workingDays));

  const unappliedAdvances = await db.collection(ADVANCES)
    .find({ clientId: cid, employeeId: eid, status: "unapplied" })
    .toArray();
  const advancesDeducted = round2(unappliedAdvances.reduce((s, a) => s + Number(a.amount || 0), 0));

  return {
    employee, settings, workingDays,
    presentDaysComputed, presentDaysMode, presentDaysUsed,
    baseSalary, grossAmount,
    unappliedAdvances, advancesDeducted,
  };
}

// Read-only preview for the UI — never mutates advances/attendance/settings.
export async function previewSettlement(clientId, employeeId, periodStart, periodEnd, { presentDaysManual, deductions = [] } = {}) {
  const figures = await computeSettlementFigures(clientId, employeeId, periodStart, periodEnd, presentDaysManual);
  const deductionsTotal = round2((deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0));
  const netAmount = Math.max(round2(figures.grossAmount - figures.advancesDeducted - deductionsTotal), 0);

  return {
    employeeId: String(employeeId),
    employeeName: figures.employee.name,
    workingDays: figures.workingDays,
    presentDaysComputed: figures.presentDaysComputed,
    presentDaysMode: figures.presentDaysMode,
    presentDaysUsed: figures.presentDaysUsed,
    baseSalary: figures.baseSalary,
    grossAmount: figures.grossAmount,
    advancesApplied: figures.unappliedAdvances.map((a) => ({
      advanceId: a._id, amount: a.amount, date: a.date, reason: a.reason,
    })),
    advancesDeducted: figures.advancesDeducted,
    deductions,
    deductionsTotal,
    netAmount,
  };
}

// The atomic compute+confirm+pay action. Rejects if this employee+period was
// already settled — corrections after that go through addAdjustment(), never
// through re-settling. Sweeps every currently-unapplied advance for this
// employee (not date-scoped) and flips each to "applied".
export async function settlePeriod(clientId, employeeId, periodStart, periodEnd, { presentDaysManual, deductions = [], note = "" } = {}) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const eid = new ObjectId(employeeId);
  const start = toValidDate(periodStart, "periodStart");
  const end = toValidDate(periodEnd, "periodEnd");
  const periodKey = periodKeyOf(start);

  const existing = await db.collection(PERIODS).findOne({ clientId: cid, employeeId: eid, periodKey });
  if (existing) {
    throw Object.assign(new Error("This employee's period has already been settled"), { statusCode: 409 });
  }

  const figures = await computeSettlementFigures(clientId, eid, start, end, presentDaysManual);
  const cleanDeductions = (deductions || []).map((d) => ({
    amount: toMoney(d.amount ?? 0, "deduction amount"),
    reason: d.reason || "",
  }));
  const deductionsTotal = round2(cleanDeductions.reduce((s, d) => s + d.amount, 0));
  const netAmount = Math.max(round2(figures.grossAmount - figures.advancesDeducted - deductionsTotal), 0);

  const advancesApplied = figures.unappliedAdvances.map((a) => ({
    advanceId: a._id, amount: a.amount, date: a.date, reason: a.reason,
  }));

  const doc = {
    clientId: cid,
    employeeId: eid,
    employeeName: figures.employee.name,
    periodStart: start,
    periodEnd: end,
    periodKey,
    workingDays: figures.workingDays,
    presentDaysMode: figures.presentDaysMode,
    presentDaysManual: figures.presentDaysMode === "manual" ? figures.presentDaysUsed : null,
    presentDaysComputed: figures.presentDaysComputed,
    presentDaysUsed: figures.presentDaysUsed,
    baseSalary: figures.baseSalary,
    grossAmount: figures.grossAmount,
    advancesApplied,
    advancesDeducted: figures.advancesDeducted,
    deductions: cleanDeductions,
    deductionsTotal,
    netAmount,
    status: "paid",
    paidAt: new Date(),
    paidNote: note || "",
    adjustments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(PERIODS).insertOne(doc);

  if (figures.unappliedAdvances.length) {
    await db.collection(ADVANCES).updateMany(
      { _id: { $in: figures.unappliedAdvances.map((a) => a._id) } },
      { $set: { status: "applied", appliedToPeriodId: result.insertedId, appliedAt: new Date() } }
    );
  }

  return { ...doc, _id: result.insertedId };
}

// Appends a correction WITHOUT ever mutating the paid doc's original net/gross
// figures — the settlement stays an honest record of what was actually paid,
// with adjustments layered on top for audit/reporting.
export async function addAdjustment(clientId, salaryPeriodId, { type = "correction", amount, reason = "" } = {}) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const pid = new ObjectId(salaryPeriodId);

  const period = await db.collection(PERIODS).findOne({ _id: pid, clientId: cid });
  if (!period) throw Object.assign(new Error("Salary period not found"), { statusCode: 404 });

  const entry = { at: new Date(), type, amount: toMoney(amount ?? 0, "adjustment amount"), reason };
  await db.collection(PERIODS).updateOne(
    { _id: pid, clientId: cid },
    { $push: { adjustments: entry }, $set: { updatedAt: new Date() } }
  );
  return entry;
}

export async function getSettlementHistory(clientId, { employeeId = "", from = "", to = "", page = 1, limit = 10 } = {}) {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (employeeId) query.employeeId = new ObjectId(employeeId);
  if (from || to) {
    query.periodStart = {};
    if (from) query.periodStart.$gte = moment(from).startOf("day").toDate();
    if (to) query.periodStart.$lte = moment(to).endOf("day").toDate();
  }
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    db.collection(PERIODS).find(query).sort({ periodStart: -1 }).skip(skip).limit(limit).toArray(),
    db.collection(PERIODS).countDocuments(query),
  ]);
  return { rows, total, page, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getPayslipData(clientId, salaryPeriodId) {
  const db = await connectDB();
  const period = await db.collection(PERIODS).findOne({
    _id: new ObjectId(salaryPeriodId),
    clientId: toClientId(clientId),
  });
  if (!period) throw Object.assign(new Error("Salary period not found"), { statusCode: 404 });
  return period;
}

// $sum of paid netAmount in range — the read-only figure expense.dao.js surfaces.
export async function getPayrollTotal(clientId, { from = "", to = "" } = {}) {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId), status: "paid" };
  if (from || to) {
    query.paidAt = {};
    if (from) query.paidAt.$gte = moment(from).startOf("day").toDate();
    if (to) query.paidAt.$lte = moment(to).endOf("day").toDate();
  }
  const [result] = await db.collection(PERIODS).aggregate([
    { $match: query },
    { $group: { _id: null, payrollTotal: { $sum: "$netAmount" } } },
  ]).toArray();
  return result?.payrollTotal || 0;
}

// ---- Advances ----

export async function listAdvances(clientId, employeeId, status = "") {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId), employeeId: new ObjectId(employeeId) };
  if (status) query.status = status;
  return db.collection(ADVANCES).find(query).sort({ date: -1 }).toArray();
}

export async function recordAdvance(clientId, employeeId, { date, amount, reason = "" }) {
  const db = await connectDB();
  const doc = {
    clientId: toClientId(clientId),
    employeeId: new ObjectId(employeeId),
    date: toValidDate(date, "date"),
    amount: toMoney(amount ?? 0, "advance amount"),
    reason,
    status: "unapplied",
    appliedToPeriodId: null,
    appliedAt: null,
    createdAt: new Date(),
  };
  const result = await db.collection(ADVANCES).insertOne(doc);
  return { insertedId: result.insertedId };
}
