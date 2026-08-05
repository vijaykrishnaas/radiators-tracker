// Automobile-vertical bills. Parallel of radiator.dao.js — same tenant-scoping,
// payment/discount/status semantics, and enrich() shape — but line items are
// free-form parts (qty × rate = amount) instead of a fixed service/price catalog.
// Collection: "autobills". Never referenced by radiator code paths.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { syncAutoBonusesForRecord, removeBonusesForRecord } from "./bonus.dao.js";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";

export const STATUS = {
  NOT_RECEIVED: "Not Received",
  PARTIAL: "Partial",
  RECEIVED: "Received",
};

function computeTotal(items) {
  return (items || []).reduce((sum, i) => sum + Number(i.amount || 0), 0);
}

function deriveStatus(receivedAmount, totalAmount) {
  if (receivedAmount <= 0) return STATUS.NOT_RECEIVED;
  if (receivedAmount < totalAmount) return STATUS.PARTIAL;
  return STATUS.RECEIVED;
}

function normalizeReceivedAmount(doc) {
  return typeof doc.receivedAmount === "number" ? doc.receivedAmount : 0;
}

// Adds computed money fields so every consumer gets a consistent shape —
// mirrors radiator.dao.js enrich() exactly, but totals over items[].amount.
function enrich(doc) {
  if (!doc) return doc;
  const totalAmount = computeTotal(doc.items);
  const discount = Math.max(Number(doc.discount || 0), 0);
  const netAmount = Math.max(totalAmount - discount, 0);
  const receivedAmount = Math.min(normalizeReceivedAmount(doc), netAmount);
  return {
    ...doc,
    totalAmount,
    discount,
    netAmount,
    receivedAmount,
    pendingAmount: Math.max(netAmount - receivedAmount, 0),
    status: deriveStatus(receivedAmount, netAmount),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Auto-increments the tenant's bill number using the shared `counters`
// collection: one doc per client, field "autobill" holds the last-used number.
async function nextBillNo(cid) {
  const db = await connectDB();
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: cid },
    { $inc: { autobill: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const doc = result.value || result;
  return doc.autobill;
}

function buildRecordFields(data) {
  return {
    billDate: toValidDate(data.billDate, "billDate"),
    vehicleNumber: String(data.vehicleNumber || "").trim(),
    customerName: data.customerName || "",
    phoneNumber: data.phoneNumber || "",
    mechanicName: data.mechanicName,
    labourName: Array.isArray(data.labourName)
      ? data.labourName.map((l) => (typeof l === "object" ? l.label : l))
      : [],
    notes: data.notes || "",
    // Validate each item so a stray "abc" never persists as NaN and null out
    // the tenant's $sum analytics (same guard as radiator.dao's serviceInfo).
    items: (data.items || []).map((i) => {
      const qty = toMoney(i.qty ?? 0, "item qty");
      const rate = toMoney(i.rate ?? 0, "item rate");
      // amount defaults to qty*rate but stays independently editable/overridable.
      const amount = i.amount != null && i.amount !== ""
        ? toMoney(i.amount, "item amount")
        : round2(qty * rate);
      return {
        particulars: i.particulars || "",
        partRef: i.partRef || null,
        qty,
        unit: i.unit || "",
        rate,
        amount,
      };
    }),
  };
}

export async function createAutoBill(clientId, data) {
  const db = await connectDB();
  const collection = db.collection("autobills");
  const cid = toClientId(clientId);

  const payload = {
    clientId: cid,
    billNo: await nextBillNo(cid),
    ...buildRecordFields(data),
    discount: 0,
    receivedAmount: 0,
    status: STATUS.NOT_RECEIVED,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(payload);
  await syncAutoBonusesForRecord(clientId, { ...payload, _id: result.insertedId });
  return { insertedId: result.insertedId };
}

export async function updateAutoBill(clientId, id, data) {
  const db = await connectDB();
  const collection = db.collection("autobills");
  const cid = toClientId(clientId);

  const existing = await collection.findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw new Error("Automobile bill not found");

  const fields = buildRecordFields(data);

  // Item amounts may have changed — re-derive status from existing payments,
  // capping received at the new total (same rule as radiator.dao.js).
  const discount = Math.max(Number(existing.discount || 0), 0);
  const newTotal = Math.max(computeTotal(fields.items) - discount, 0);
  const receivedAmount = Math.min(normalizeReceivedAmount(existing), newTotal);
  const status = deriveStatus(receivedAmount, newTotal);

  await collection.updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { ...fields, receivedAmount, status } }
  );

  await syncAutoBonusesForRecord(clientId, { ...existing, ...fields, receivedAmount, status });
  return getById(clientId, id);
}

export async function deleteAutoBill(clientId, id) {
  const db = await connectDB();
  const result = await db
    .collection("autobills")
    .deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });

  if (result.deletedCount === 0) throw new Error("Automobile bill not found");
  await removeBonusesForRecord(clientId, id);
  return true;
}

// `discount` (optional) is applied at collect time; status/bonus are computed
// against the net (total − discount). Semantics identical to radiator.dao.js.
export async function recordPayment(clientId, id, amount, discount = null) {
  const db = await connectDB();
  const collection = db.collection("autobills");
  const cid = toClientId(clientId);

  const existing = await collection.findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw new Error("Automobile bill not found");

  const grossTotal = computeTotal(existing.items);
  const appliedDiscount = discount != null
    ? Math.max(Number(discount) || 0, 0)
    : Math.max(Number(existing.discount || 0), 0);
  const netTotal = Math.max(grossTotal - appliedDiscount, 0);
  const current = Math.min(normalizeReceivedAmount(existing), netTotal);
  const receivedAmount = Math.min(current + Number(amount || 0), netTotal);
  const status = deriveStatus(receivedAmount, netTotal);

  await collection.updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { receivedAmount, status, discount: appliedDiscount } }
  );

  await syncAutoBonusesForRecord(clientId, { ...existing, receivedAmount, status, discount: appliedDiscount });
  return enrich({ ...existing, receivedAmount, status, discount: appliedDiscount });
}

function buildAutoBillQuery(clientId, { vehicleNumber = "", customerName = "", mechName = "", fromDate = "", toDate = "", status = "", partRef = "" } = {}) {
  const query = { clientId: toClientId(clientId) };
  if (vehicleNumber) query.vehicleNumber = { $regex: escapeRegex(vehicleNumber), $options: "i" };
  if (customerName) query.customerName = { $regex: escapeRegex(customerName), $options: "i" };
  if (mechName) query.mechanicName = mechName;
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  if (status) query.status = status;
  if (partRef) query["items.partRef"] = partRef;
  return query;
}

export async function getAllAutoBills(
  clientId,
  page = 1,
  limit = 10,
  vehicleNumber = "",
  mechName = "",
  fromDate = "",
  toDate = "",
  status = "",
  customerName = "",
  partRef = ""
) {
  const db = await connectDB();
  const collection = db.collection("autobills");
  const skip = (page - 1) * limit;
  const query = buildAutoBillQuery(clientId, { vehicleNumber, customerName, mechName, fromDate, toDate, status, partRef });
  const total = await collection.countDocuments(query);
  const bills = await collection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return {
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    autoBillData: bills.map(enrich),
  };
}

export async function getAllAutoBillsForExport(clientId, { vehicleNumber = "", customerName = "", mechName = "", fromDate = "", toDate = "", status = "", partRef = "" } = {}) {
  const db = await connectDB();
  const query = buildAutoBillQuery(clientId, { vehicleNumber, customerName, mechName, fromDate, toDate, status, partRef });
  const bills = await db.collection("autobills").find(query).sort({ billDate: -1 }).toArray();
  return bills.map(enrich);
}

export async function getAutoAnalytics(clientId, { vehicleNumber = "", customerName = "", mechName = "", fromDate = "", toDate = "", status = "", partRef = "" } = {}) {
  const db = await connectDB();
  const query = buildAutoBillQuery(clientId, { vehicleNumber, customerName, mechName, fromDate, toDate, status, partRef });

  const computedFields = {
    totalAmount: { $sum: "$items.amount" },
    receivedAmt: {
      $cond: [{ $isNumber: "$receivedAmount" }, "$receivedAmount", 0],
    },
  };

  const [result] = await db.collection("autobills").aggregate([
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
    byStatus: result.byStatus || [],
    topMechanics: result.topMechanics || [],
  };
}

// Mechanic dropdown source: configured Settings list merged with any names
// already present on existing bills (mirrors getAllmechanics in radiator.dao.js).
export async function getAllAutoMechanics(clientId) {
  const db = await connectDB();
  const settings = await getSettings(clientId);
  const configured = Array.isArray(settings?.mechanics) ? settings.mechanics : [];

  const fromBills = await db
    .collection("autobills")
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
    .collection("autobills")
    .findOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  return enrich(doc);
}
