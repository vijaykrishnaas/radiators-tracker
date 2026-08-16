// Salary Management — daily attendance marks. Kept as a separate collection
// from salaryPeriods (not embedded) so a day can be queried/edited on its own
// before any settlement doc exists. Once a period is settled (paid), marks
// inside its date range are locked — corrections go through the settlement's
// adjustment path, not by editing history out from under a paid payslip.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { toClientId } from "../utils/tenant.js";
import { toValidDate } from "../utils/sanitize.js";

const COLLECTION = "attendance";
const STATUSES = ["present", "absent", "half", "leave"];

const PRESENT_WEIGHT = { present: 1, absent: 0, half: 0.5, leave: 0 };

function dayStart(date) {
  return moment(date).startOf("day").toDate();
}

async function isDateSettled(db, cid, employeeId, date) {
  const d = dayStart(date);
  const period = await db.collection("salaryPeriods").findOne({
    clientId: cid,
    employeeId,
    status: "paid",
    periodStart: { $lte: d },
    periodEnd: { $gte: d },
  });
  return !!period;
}

// Upserts one day's mark. Rejects if the date falls inside an already-paid
// settlement period for this employee.
export async function markAttendance(clientId, employeeId, date, status, markedBy = "") {
  if (!STATUSES.includes(status)) {
    throw Object.assign(new Error(`status must be one of: ${STATUSES.join(", ")}`), { statusCode: 400 });
  }
  const db = await connectDB();
  const cid = toClientId(clientId);
  const eid = new ObjectId(employeeId);
  const d = dayStart(toValidDate(date, "date"));

  if (await isDateSettled(db, cid, eid, d)) {
    throw Object.assign(new Error("This date has already been settled and cannot be edited"), { statusCode: 409 });
  }

  await db.collection(COLLECTION).updateOne(
    { clientId: cid, employeeId: eid, date: d },
    { $set: { status, markedAt: new Date(), markedBy } },
    { upsert: true }
  );
  return true;
}

export async function getAttendanceForPeriod(clientId, employeeId, periodStart, periodEnd) {
  const db = await connectDB();
  return db.collection(COLLECTION)
    .find({
      clientId: toClientId(clientId),
      employeeId: new ObjectId(employeeId),
      date: { $gte: dayStart(periodStart), $lte: dayStart(periodEnd) },
    })
    .sort({ date: 1 })
    .toArray();
}

// present=1, half=0.5, absent/leave=0, summed over the period.
export async function computePresentDays(clientId, employeeId, periodStart, periodEnd) {
  const days = await getAttendanceForPeriod(clientId, employeeId, periodStart, periodEnd);
  return days.reduce((sum, d) => sum + (PRESENT_WEIGHT[d.status] ?? 0), 0);
}
