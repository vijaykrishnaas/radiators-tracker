import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";

const COLLECTION = "bonuses";

const round2 = (n) => Math.round(n * 100) / 100;

// Records store catalog labels; matrices are keyed by catalog values.
function catalogValue(options = [], stored) {
  const opt =
    options.find((o) => o.label === stored) ||
    options.find((o) => o.value === stored);
  return opt ? opt.value : stored;
}

function effectivePercent(line, role, settings, productValue) {
  const cfg = settings.bonus?.[role] || {};
  const serviceValue = catalogValue(settings.catalog?.serviceTypes, line.type);
  const fromMatrix = cfg.matrix?.[productValue]?.[serviceValue];
  if (typeof fromMatrix === "number") return fromMatrix;
  return Number(cfg.defaultPercent || 0);
}

function computeTotal(serviceInfo) {
  return (serviceInfo || []).reduce((sum, s) => sum + Number(s.price || 0), 0);
}

// Same legacy handling as radiator.dao: old "Received" records were fully paid.
function normalizeReceived(record, totalAmount) {
  if (typeof record.receivedAmount === "number") return record.receivedAmount;
  return record.status === "Received" ? totalAmount : 0;
}

// Mechanic bonus year key, e.g. "2026" = Apr 2026 – Mar 2027 when yearStartMonth is 4.
export function yearKey(billDate, yearStartMonth = 4) {
  const m = moment(billDate);
  return String(m.month() + 1 >= yearStartMonth ? m.year() : m.year() - 1);
}

const dayKey = (billDate) => moment(billDate).format("YYYY-MM-DD");

function computeRoleBonus(record, role, settings) {
  const productValue = catalogValue(settings.catalog?.productTypes, record.radiatorType);
  const grossTotal = computeTotal(record.serviceInfo);
  // Bonus is computed on the NET (post-discount) amount the customer actually owes.
  const discount = Math.max(Number(record.discount || 0), 0);
  const totalAmount = Math.max(grossTotal - discount, 0);
  const received = Math.min(normalizeReceived(record, totalAmount), totalAmount);
  const ratio = totalAmount > 0 ? Math.min(received / totalAmount, 1) : 0;

  const accruedGross = (record.serviceInfo || []).reduce(
    (sum, line) =>
      sum + Number(line.price || 0) * effectivePercent(line, role, settings, productValue) / 100,
    0
  );
  const accrued = grossTotal > 0 ? accruedGross * (totalAmount / grossTotal) : 0;

  return {
    accrued: round2(accrued),
    payable: round2(accrued * ratio),
    totalAmount,
    received,
  };
}

// Upserts the bill's bonus entries (one mechanic + one per labour name).
// Entries already marked paid are locked and never touched again.
export async function syncBonusesForRecord(clientId, record) {
  const db = await connectDB();
  const collection = db.collection(COLLECTION);
  const settings = await getSettings(clientId);
  const cid = toClientId(clientId);
  const recordId = new ObjectId(record._id);

  const base = {
    clientId: cid,
    recordId,
    billDate: new Date(record.billDate),
    updatedAt: new Date(),
  };

  // ---- Mechanic entry ----
  const mech = computeRoleBonus(record, "mechanic", settings);
  const mechPeriod = yearKey(record.billDate, settings.bonus?.mechanic?.yearStartMonth);

  const paidMech = await collection.findOne({ clientId: cid, recordId, type: "mechanic", status: "paid" });
  if (!paidMech) {
    await collection.updateOne(
      { clientId: cid, recordId, type: "mechanic", status: "pending" },
      {
        $set: {
          ...base,
          beneficiary: record.mechanicName,
          period: mechPeriod,
          accruedAmount: mech.accrued,
          payableAmount: mech.payable,
          billAmount: mech.totalAmount,
          receivedAmount: mech.received,
        },
        $setOnInsert: { type: "mechanic", status: "pending", createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  // ---- Labour entries (equal split) ----
  const labourNames = Array.isArray(record.labourName) ? record.labourName.filter(Boolean) : [];
  const lab = computeRoleBonus(record, "labour", settings);
  const share = labourNames.length || 1;

  // Remove pending entries for workers no longer on the bill
  await collection.deleteMany({
    clientId: cid,
    recordId,
    type: "labour",
    status: "pending",
    beneficiary: { $nin: labourNames },
  });

  for (const name of labourNames) {
    const paid = await collection.findOne({ clientId: cid, recordId, type: "labour", beneficiary: name, status: "paid" });
    if (paid) continue;

    await collection.updateOne(
      { clientId: cid, recordId, type: "labour", beneficiary: name, status: "pending" },
      {
        $set: {
          ...base,
          period: dayKey(record.billDate),
          accruedAmount: round2(lab.accrued / share),
          payableAmount: round2(lab.payable / share),
          billAmount: lab.totalAmount,
          receivedAmount: lab.received,
        },
        $setOnInsert: { type: "labour", beneficiary: name, status: "pending", createdAt: new Date() },
      },
      { upsert: true }
    );
  }
}

// Deleting a bill removes its pending entries; paid ones stay as settlement history.
export async function removeBonusesForRecord(clientId, id) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteMany({
    clientId: toClientId(clientId),
    recordId: new ObjectId(id),
    status: "pending",
  });
}

async function aggregateByBeneficiary(filter) {
  const db = await connectDB();
  const collection = db.collection(COLLECTION);

  const rows = await collection
    .aggregate([
      { $match: filter },
      { $sort: { billDate: 1 } },
      {
        $group: {
          _id: "$beneficiary",
          operations: { $sum: 1 },
          totalBusiness: { $sum: "$billAmount" },
          totalCollected: { $sum: "$receivedAmount" },
          accruedBonus: { $sum: "$accruedAmount" },
          payableBonus: { $sum: "$payableAmount" },
          paidBonus: { $sum: { $ifNull: ["$paidAmount", 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          records: {
            $push: {
              billDate: "$billDate",
              accruedAmount: "$accruedAmount",
              payableAmount: "$payableAmount",
              paidAmount: { $ifNull: ["$paidAmount", 0] },
              billAmount: "$billAmount",
              receivedAmount: "$receivedAmount",
              status: "$status",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          beneficiary: "$_id",
          operations: 1,
          totalBusiness: 1,
          totalCollected: 1,
          accruedBonus: { $round: ["$accruedBonus", 2] },
          payableBonus: { $round: ["$payableBonus", 2] },
          paidBonus: { $round: ["$paidBonus", 2] },
          status: { $cond: [{ $gt: ["$pendingCount", 0] }, "Pending", "Paid"] },
          records: 1,
        },
      },
      { $sort: { beneficiary: 1 } },
    ])
    .toArray();

  return rows;
}

export async function getMechanicBonus(clientId, year, mechanicName = "", status = "") {
  const filter = { clientId: toClientId(clientId), type: "mechanic", period: String(year) };
  if (mechanicName) filter.beneficiary = mechanicName;
  if (status) filter.status = status;
  return aggregateByBeneficiary(filter);
}

export async function getLabourBonus(clientId, date, name = "", status = "") {
  const filter = { clientId: toClientId(clientId), type: "labour", period: date };
  if (name) filter.beneficiary = name;
  if (status) filter.status = status;
  return aggregateByBeneficiary(filter);
}

// Lists bonuses per beneficiary over a billDate RANGE (not a single period) — used
// by the redesigned bonus pages so they're never empty-by-default. Works for both
// mechanic and labour. Defaults to all statuses; pages pass status="pending".
export async function getPendingByRange(clientId, type, fromDate, toDate, beneficiary = "", status = "") {
  const filter = {
    clientId: toClientId(clientId),
    type,
    billDate: {
      $gte: moment(fromDate).startOf("day").toDate(),
      $lte: moment(toDate).endOf("day").toDate(),
    },
  };
  if (beneficiary) filter.beneficiary = beneficiary;
  if (status) filter.status = status;
  return aggregateByBeneficiary(filter);
}

// Settles (locks) the pending entries matched by `filter`, recording a per-entry
// `paidAmount` whose SUM equals what was actually paid:
//   - no override  → each entry is paid at its own computed payableAmount.
//   - override set  → the total is split across entries in proportion to payable
//                     (equally if every payable is 0), so Σ paidAmount === override.
// This makes the recorded settlement both correct (summable) and reportable.
async function settlePending(db, filter, amount = null, note = "") {
  const coll = db.collection(COLLECTION);
  const paidAt = new Date();
  const hasOverride = amount != null && !isNaN(Number(amount));
  const noteSet = note ? { paidNote: String(note) } : {};

  if (!hasOverride) {
    // Pipeline update: each entry's paidAmount = its own payableAmount.
    const result = await coll.updateMany(filter, [
      { $set: { status: "paid", paidAt, paidAmount: { $ifNull: ["$payableAmount", 0] }, ...noteSet } },
    ]);
    return result.modifiedCount;
  }

  const override = round2(Number(amount));
  const entries = await coll.find(filter).project({ payableAmount: 1 }).toArray();
  if (entries.length === 0) return 0;

  const totalPayable = entries.reduce((s, e) => s + Number(e.payableAmount || 0), 0);
  const ops = entries.map((e) => {
    const share = totalPayable > 0
      ? override * (Number(e.payableAmount || 0) / totalPayable)
      : override / entries.length;
    return { _id: e._id, paidAmount: round2(share) };
  });
  // Correct rounding drift so the split sums to exactly the override.
  const drift = round2(override - ops.reduce((s, o) => s + o.paidAmount, 0));
  if (drift !== 0) ops[ops.length - 1].paidAmount = round2(ops[ops.length - 1].paidAmount + drift);

  const result = await coll.bulkWrite(
    ops.map((o) => ({
      updateOne: { filter: { _id: o._id }, update: { $set: { status: "paid", paidAt, paidAmount: o.paidAmount, ...noteSet } } },
    }))
  );
  return result.modifiedCount;
}

// Marks matching pending entries as paid (locking them against future edits).
export async function markPaid(clientId, type, period, beneficiary = "", amount = null, note = "") {
  const db = await connectDB();
  const filter = { clientId: toClientId(clientId), type, period: String(period), status: "pending" };
  if (beneficiary) filter.beneficiary = beneficiary;
  return settlePending(db, filter, amount, note);
}

// Marks pending bonus entries paid across a billDate range (mechanic OR labour).
// Ranges on billDate (a real Date on every doc), not the `period` string — so it
// works uniformly for mechanic (period = FY string) and labour (period = day).
export async function markPaidByRange(clientId, type, name, fromDate, toDate, amount = null, note = "") {
  const db = await connectDB();
  const filter = {
    clientId: toClientId(clientId),
    type,
    beneficiary: name,
    status: "pending",
    billDate: {
      $gte: moment(fromDate).startOf("day").toDate(),
      $lte: moment(toDate).endOf("day").toDate(),
    },
  };
  return settlePending(db, filter, amount, note);
}

export async function getReviewData(clientId, type, name, fromDate, toDate, settings) {
  const db = await connectDB();

  // clientId scopes BOTH reads below: the $match pipeline AND the raw find(query).
  const query = type === "mechanic"
    ? { clientId: toClientId(clientId), mechanicName: name }
    : { clientId: toClientId(clientId), labourName: name };
  query.billDate = {
    $gte: moment(fromDate).startOf("day").toDate(),
    $lte: moment(toDate).endOf("day").toDate(),
  };

  const diffDays = moment(toDate).diff(moment(fromDate), "days");
  const granularity = diffDays > 90 ? "monthly" : diffDays > 31 ? "weekly" : "daily";

  // Build timeline grouping stage based on granularity
  let timelineGroupId;
  if (granularity === "monthly") {
    timelineGroupId = { $dateToString: { format: "%Y-%m", date: "$billDate" } };
  } else if (granularity === "weekly") {
    // Truncate to ISO Monday: subtract (dayOfWeek - 2 + 7) % 7 days (MongoDB $dayOfWeek: Sun=1)
    timelineGroupId = {
      $dateToString: {
        format: "%Y-%m-%d",
        date: {
          $subtract: [
            "$billDate",
            { $multiply: [{ $mod: [{ $add: [{ $dayOfWeek: "$billDate" }, 5] }, 7] }, 86400000] },
          ],
        },
      },
    };
  } else {
    timelineGroupId = { $dateToString: { format: "%Y-%m-%d", date: "$billDate" } };
  }

  const computedFields = {
    totalAmount: { $sum: "$serviceInfo.price" },
    receivedAmt: {
      $cond: [
        // $isNumber matches partial collections; old `$type === "number"` never did.
        { $isNumber: "$receivedAmount" },
        "$receivedAmount",
        { $cond: [{ $eq: ["$status", "Received"] }, { $sum: "$serviceInfo.price" }, 0] },
      ],
    },
  };

  const pipeline = [
    { $match: query },
    { $addFields: computedFields },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalBills: { $sum: 1 },
              totalRevenue: { $sum: "$totalAmount" },
              totalCollected: { $sum: "$receivedAmt" },
              totalOperations: { $sum: { $size: "$serviceInfo" } },
            },
          },
        ],
        byServiceType: [
          { $unwind: "$serviceInfo" },
          { $group: { _id: "$serviceInfo.type", count: { $sum: 1 }, revenue: { $sum: "$serviceInfo.price" } } },
          { $project: { _id: 0, type: "$_id", count: 1, revenue: 1 } },
          { $sort: { count: -1 } },
        ],
        byProductType: [
          { $group: { _id: "$radiatorType", count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          { $project: { _id: 0, product: "$_id", count: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
        ],
        timeline: [
          { $group: { _id: timelineGroupId, count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          { $project: { _id: 0, date: "$_id", count: 1, revenue: 1 } },
          { $sort: { date: 1 } },
        ],
        bills: [
          {
            $project: {
              _id: 0,
              billDate: 1,
              truckNumber: 1,
              services: "$serviceInfo",
              totalAmount: 1,
              receivedAmount: "$receivedAmt",
            },
          },
          { $sort: { billDate: -1 } },
        ],
      },
    },
  ];

  const [result] = await db.collection("radiators").aggregate(pipeline).toArray();

  const rawSummary = result.summary[0] || { totalBills: 0, totalRevenue: 0, totalCollected: 0, totalOperations: 0 };
  rawSummary.collectionRate = rawSummary.totalRevenue > 0
    ? Math.round((rawSummary.totalCollected / rawSummary.totalRevenue) * 1000) / 10
    : 0;

  // Compute suggested bonus against raw documents
  const rawDocs = await db.collection("radiators").find(query).toArray();
  const role = type === "mechanic" ? "mechanic" : "labour";
  let suggestedBonus = 0;
  for (const doc of rawDocs) {
    const bonus = computeRoleBonus(doc, role, settings);
    if (type === "labour") {
      const share = (Array.isArray(doc.labourName) ? doc.labourName.filter(Boolean) : []).length || 1;
      suggestedBonus += bonus.payable / share;
    } else {
      suggestedBonus += bonus.payable;
    }
  }
  rawSummary.suggestedBonus = round2(suggestedBonus);

  // Gap-fill timeline
  const timelineMap = new Map((result.timeline || []).map((t) => [t.date, t]));
  const filled = [];
  if (granularity === "monthly") {
    let cur = moment(fromDate).startOf("month");
    const end = moment(toDate).startOf("month");
    while (cur.isSameOrBefore(end)) {
      const key = cur.format("YYYY-MM");
      filled.push(timelineMap.get(key) || { date: key, count: 0, revenue: 0 });
      cur.add(1, "month");
    }
  } else if (granularity === "weekly") {
    let cur = moment(fromDate).startOf("isoWeek");
    const end = moment(toDate).startOf("isoWeek");
    while (cur.isSameOrBefore(end)) {
      const key = cur.format("YYYY-MM-DD");
      filled.push(timelineMap.get(key) || { date: key, count: 0, revenue: 0 });
      cur.add(1, "week");
    }
  } else {
    let cur = moment(fromDate).startOf("day");
    const end = moment(toDate).startOf("day");
    while (cur.isSameOrBefore(end)) {
      const key = cur.format("YYYY-MM-DD");
      filled.push(timelineMap.get(key) || { date: key, count: 0, revenue: 0 });
      cur.add(1, "day");
    }
  }

  return {
    granularity,
    summary: rawSummary,
    byServiceType: result.byServiceType || [],
    byProductType: result.byProductType || [],
    timeline: filled,
    bills: result.bills || [],
  };
}

// Backfills bonus entries from existing radiator bills (one-time after deploy,
// or to re-price pending entries after a settings change).
export async function backfill(clientId, fromDate = "", toDate = "") {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }

  const records = await db.collection("radiators").find(query).toArray();
  for (const record of records) {
    await syncBonusesForRecord(clientId, record);
  }
  return records.length;
}
