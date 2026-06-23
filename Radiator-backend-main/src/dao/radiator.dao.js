import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { syncBonusesForRecord, removeBonusesForRecord } from "./bonus.dao.js";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";

export const STATUS = {
  NOT_RECEIVED: "Not Received",
  PARTIAL: "Partial",
  RECEIVED: "Received",
};

function computeTotal(serviceInfo) {
  return (serviceInfo || []).reduce((sum, s) => sum + Number(s.price || 0), 0);
}

function deriveStatus(receivedAmount, totalAmount) {
  if (receivedAmount <= 0) return STATUS.NOT_RECEIVED;
  if (receivedAmount < totalAmount) return STATUS.PARTIAL;
  return STATUS.RECEIVED;
}

// Legacy records predate receivedAmount; legacy status "Received" meant fully paid.
function normalizeReceivedAmount(doc) {
  if (typeof doc.receivedAmount === "number") return doc.receivedAmount;
  return doc.status === "Received" ? computeTotal(doc.serviceInfo) : 0;
}

// Adds computed money fields so every consumer gets a consistent shape.
function enrich(doc) {
  if (!doc) return doc;
  const totalAmount = computeTotal(doc.serviceInfo);
  const receivedAmount = normalizeReceivedAmount(doc);
  return {
    ...doc,
    totalAmount,
    receivedAmount,
    pendingAmount: Math.max(totalAmount - receivedAmount, 0),
    status: deriveStatus(receivedAmount, totalAmount),
  };
}

function buildRecordFields(data) {
  return {
    billDate: toValidDate(data.billDate, "billDate"),
    truckNumber: data.truckNumber,
    transportName: data.transportName,
    mechanicName: data.mechanicName,
    phoneNumber: data.phoneNumber,
    radiatorType: data.radiatorType,
    labourName: Array.isArray(data.labourName)
      ? data.labourName.map((l) => (typeof l === "object" ? l.label : l))
      : [],
    // Validate each price as a finite, non-negative number so a stray "abc"
    // can't persist as NaN and null out the tenant's $sum analytics.
    serviceInfo: (data.serviceInfo || []).map((s) => ({
      type: s.type,
      price: toMoney(s.price ?? 0, "service price"),
      comments: s.comments || "",
    })),
  };
}

// Bill numbers are sequential PER CLIENT (each new client restarts at 1).
// Uses an atomic per-client counter so concurrent creates can never collide on
// the same billNo (the old read-max-then-insert approach raced). The counter is
// lazily seeded from the current max bill the first time a client is used, so it
// stays consistent for clients that already had bills before this change.
async function getNextBillNo(db, clientId) {
  const cid = toClientId(clientId);
  const counters = db.collection("counters");

  if (!(await counters.findOne({ _id: cid }))) {
    const last = await db
      .collection("radiators")
      .find({ clientId: cid, billNo: { $type: "number" } })
      .sort({ billNo: -1 })
      .limit(1)
      .toArray();
    const start = last.length ? last[0].billNo : 0;
    // $setOnInsert so a concurrent first-init can't double-seed.
    await counters.updateOne({ _id: cid }, { $setOnInsert: { seq: start } }, { upsert: true });
  }

  const res = await counters.findOneAndUpdate(
    { _id: cid },
    { $inc: { seq: 1 } },
    { returnDocument: "after" }
  );
  const doc = res?.value ?? res; // tolerate driver versions that wrap in { value }
  return doc.seq;
}

export async function createRadiator(clientId, data) {
  const db = await connectDB();
  const collection = db.collection("radiators");
  const cid = toClientId(clientId);

  const payload = {
    clientId: cid,
    ...buildRecordFields(data),
    billNo: await getNextBillNo(db, clientId),
    receivedAmount: 0,
    status: STATUS.NOT_RECEIVED,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(payload);
  await syncBonusesForRecord(clientId, { ...payload, _id: result.insertedId });
  return { insertedId: result.insertedId, billNo: payload.billNo };
}

export async function updateRadiator(clientId, id, data) {
  const db = await connectDB();
  const collection = db.collection("radiators");
  const cid = toClientId(clientId);

  const existing = await collection.findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw new Error("Radiator not found");

  const fields = buildRecordFields(data);

  // Service prices may have changed — re-derive status from existing payments.
  // Cap received at the new total so editing a bill *below* what was already
  // collected can't leave received > total (which would push collection rate
  // past 100% and show a negative/zero pending against an over-received bill).
  const newTotal = computeTotal(fields.serviceInfo);
  const receivedAmount = Math.min(normalizeReceivedAmount(existing), newTotal);
  const status = deriveStatus(receivedAmount, newTotal);

  await collection.updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { ...fields, receivedAmount, status } }
  );

  await syncBonusesForRecord(clientId, { ...existing, ...fields, receivedAmount, status });
  return getById(clientId, id);
}

export async function deleteRadiator(clientId, id) {
  const db = await connectDB();
  const result = await db
    .collection("radiators")
    .deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });

  if (result.deletedCount === 0) throw new Error("Radiator not found");
  await removeBonusesForRecord(clientId, id);
  return true;
}

export async function recordPayment(clientId, id, amount) {
  const db = await connectDB();
  const collection = db.collection("radiators");
  const cid = toClientId(clientId);

  const existing = await collection.findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw new Error("Radiator not found");

  const totalAmount = computeTotal(existing.serviceInfo);
  const current = normalizeReceivedAmount(existing);
  const receivedAmount = Math.min(current + Number(amount), totalAmount);
  const status = deriveStatus(receivedAmount, totalAmount);

  await collection.updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { receivedAmount, status } }
  );

  // Payable bonus follows collections
  await syncBonusesForRecord(clientId, { ...existing, receivedAmount, status });
  return enrich({ ...existing, receivedAmount, status });
}

function buildRadiatorQuery(clientId, { truckNumber = "", mechName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = {}) {
  const query = { clientId: toClientId(clientId) };
  if (truckNumber) query.truckNumber = { $regex: escapeRegex(truckNumber), $options: "i" };
  if (mechName) query.mechanicName = mechName;
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  if (status) query.status = status;
  if (radiatorType) query.radiatorType = radiatorType;
  // Matches bills that include at least one service line of this type.
  if (serviceType) query["serviceInfo.type"] = serviceType;
  return query;
}

export async function getAllRadiators(
  clientId,
  page = 1,
  limit = 10,
  truckNumber = "",
  mechName = "",
  fromDate = "",
  toDate = "",
  status = "",
  radiatorType = "",
  serviceType = ""
) {
  const db = await connectDB();
  const collection = db.collection("radiators");
  const skip = (page - 1) * limit;
  const query = buildRadiatorQuery(clientId, { truckNumber, mechName, fromDate, toDate, status, radiatorType, serviceType });
  const total = await collection.countDocuments(query);
  const radiators = await collection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return {
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    radiatorData: radiators.map(enrich),
  };
}

export async function getAllRadiatorsForExport(clientId, { truckNumber = "", mechName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = {}) {
  const db = await connectDB();
  const query = buildRadiatorQuery(clientId, { truckNumber, mechName, fromDate, toDate, status, radiatorType, serviceType });
  const radiators = await db.collection("radiators").find(query).sort({ billDate: -1 }).toArray();
  return radiators.map(enrich);
}

export async function getRadiatorAnalytics(clientId, { truckNumber = "", mechName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = {}) {
  const db = await connectDB();
  const query = buildRadiatorQuery(clientId, { truckNumber, mechName, fromDate, toDate, status, radiatorType, serviceType });

  const computedFields = {
    totalAmount: { $sum: "$serviceInfo.price" },
    receivedAmt: {
      $cond: [
        // $isNumber correctly matches double/int/long; the old `$type === "number"`
        // never matched (aggregation $type returns "double" etc.), so PARTIAL
        // collections were silently counted as 0.
        { $isNumber: "$receivedAmount" },
        "$receivedAmount",
        { $cond: [{ $eq: ["$status", "Received"] }, { $sum: "$serviceInfo.price" }, 0] },
      ],
    },
  };

  const [result] = await db.collection("radiators").aggregate([
    { $match: query },
    { $addFields: computedFields },
    {
      $facet: {
        kpis: [
          {
            $group: {
              _id: null,
              totalBills: { $sum: 1 },
              totalRevenue: { $sum: "$totalAmount" },
              totalCollected: { $sum: "$receivedAmt" },
            },
          },
        ],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$billDate" } },
              revenue: { $sum: "$totalAmount" },
              collected: { $sum: "$receivedAmt" },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, month: "$_id", revenue: 1, collected: 1, count: 1 } },
          { $sort: { month: 1 } },
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
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          { $project: { _id: 0, status: "$_id", count: 1, revenue: 1 } },
        ],
        topMechanics: [
          { $group: { _id: "$mechanicName", count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          { $project: { _id: 0, mechanic: "$_id", count: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]).toArray();

  const raw = (result.kpis || [])[0] || { totalBills: 0, totalRevenue: 0, totalCollected: 0 };
  const kpis = {
    totalBills: raw.totalBills,
    totalRevenue: raw.totalRevenue,
    totalCollected: raw.totalCollected,
    totalPending: raw.totalRevenue - raw.totalCollected,
    collectionRate: raw.totalRevenue > 0
      ? Math.round((raw.totalCollected / raw.totalRevenue) * 1000) / 10
      : 0,
    avgBillValue: raw.totalBills > 0 ? Math.round((raw.totalRevenue / raw.totalBills) * 100) / 100 : 0,
  };

  return {
    kpis,
    byMonth: result.byMonth || [],
    byServiceType: result.byServiceType || [],
    byProductType: result.byProductType || [],
    byStatus: result.byStatus || [],
    topMechanics: result.topMechanics || [],
  };
}

// Mechanic dropdown source: the configured Settings list merged with any names
// already present on existing bills (so legacy data stays filterable).
export async function getAllmechanics(clientId) {
  const db = await connectDB();
  const settings = await getSettings(clientId);
  const configured = Array.isArray(settings?.mechanics) ? settings.mechanics : [];

  const fromBills = await db
    .collection("radiators")
    .aggregate([
      { $match: { clientId: toClientId(clientId) } },
      { $group: { _id: "$mechanicName" } },
      { $project: { _id: 0, mechanicName: "$_id" } },
    ])
    .toArray();

  const names = new Set(configured.filter(Boolean));
  fromBills.forEach((m) => { if (m.mechanicName) names.add(m.mechanicName); });
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function getById(clientId, id) {
  const db = await connectDB();
  const doc = await db
    .collection("radiators")
    .findOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  return enrich(doc);
}
