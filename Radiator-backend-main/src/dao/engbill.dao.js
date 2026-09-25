// Engineering-works bills (turbo / air-compressor service). Collection
// "engbills", used only by engineering-vertical tenants. Payment/discount/status
// semantics match autobill.dao.js; line items are grouped into service cards
// (service type + BS model), each item priced qty × rate. No bonus sync.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";

const COLLECTION = "engbills";

export const STATUS = {
  NOT_RECEIVED: "Not Received",
  PARTIAL: "Partial",
  RECEIVED: "Received",
};

const PAYMENT_MODES = ["cash", "upi", "card", "bank", "other"];

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const notFound = () => httpError("Engineering bill not found", 404);

function round2(n) {
  return Math.round(n * 100) / 100;
}

function deriveStatus(received, net) {
  if (received <= 0) return STATUS.NOT_RECEIVED;
  if (received < net) return STATUS.PARTIAL;
  return STATUS.RECEIVED;
}

function toPaymentMode(mode) {
  return PAYMENT_MODES.includes(mode) ? mode : "cash";
}

function computeTotals(services, discountIn, receivedIn) {
  const typeTotals = {};
  let total = 0;
  for (const s of services) {
    typeTotals[s.type] = round2((typeTotals[s.type] || 0) + s.subtotal);
    total += s.subtotal;
  }
  total = round2(total);
  const discount = Math.min(Math.max(Number(discountIn) || 0, 0), total);
  const netTotal = round2(total - discount);
  const amountReceived = Math.min(Math.max(Number(receivedIn) || 0, 0), netTotal);
  return {
    typeTotals,
    total,
    discount,
    netTotal,
    amountReceived,
    balance: round2(netTotal - amountReceived),
    paymentStatus: deriveStatus(amountReceived, netTotal),
  };
}

function findCatalogItem(catalog, type, item) {
  const t = (catalog?.serviceTypes || []).find((x) => x.value === type);
  const i = t?.items?.find((x) => x.value === item);
  return { typeDef: t, itemDef: i };
}

// Validates and normalizes the service cards. Labels come from the catalog
// when the item still exists there (falls back to the submitted label so old
// bills stay editable after a catalog edit). amount is always qty × rate.
function buildServices(rawServices, catalog) {
  if (!Array.isArray(rawServices) || rawServices.length === 0) {
    throw httpError("Add at least one service", 400);
  }
  const services = rawServices.map((s, si) => {
    const type = String(s?.type || "").trim();
    if (!type) throw httpError(`Service ${si + 1}: choose a service type`, 400);
    const rawItems = Array.isArray(s.items) ? s.items : [];
    if (rawItems.length === 0) throw httpError(`Service ${si + 1}: choose at least one item`, 400);
    const { typeDef } = findCatalogItem(catalog, type, null);
    const items = rawItems.map((it, ii) => {
      const itemKey = String(it?.item || "").trim();
      const { itemDef } = findCatalogItem(catalog, type, itemKey);
      const label = itemDef?.label || String(it?.label || "").trim() || itemKey;
      if (!label) throw httpError(`Service ${si + 1}, item ${ii + 1}: missing item`, 400);
      const comment = String(it?.comment || "").trim();
      const requiresComment = itemDef ? !!itemDef.requiresComment : !!it?.requiresComment;
      if (requiresComment && !comment) {
        throw httpError(`Service ${si + 1}: describe the work for "${label}"`, 400);
      }
      const qty = it?.qty === "" || it?.qty == null ? 1 : toMoney(it.qty, "item qty");
      const rate = toMoney(it?.rate ?? 0, "item rate");
      return { item: itemKey, label, comment, requiresComment, qty, rate, amount: round2(qty * rate) };
    });
    const subtotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
    return {
      type,
      typeLabel: typeDef?.label || String(s.typeLabel || type),
      bsModel: String(s.bsModel || "").trim(),
      items,
      subtotal,
    };
  });
  return services;
}

function buildHeader(data) {
  const vehicleNo = String(data.vehicleNo || "").trim().toUpperCase();
  if (!vehicleNo) throw httpError("Truck number is required", 400);
  const mechanic = String(data.mechanic || "").trim();
  if (!mechanic) throw httpError("Mechanic name is required", 400);
  return {
    billDate: toValidDate(data.billDate, "billDate"),
    vehicleNo,
    lorryAddress: String(data.lorryAddress || "").trim(),
    mechanic,
    phone: String(data.phone || "").trim(),
  };
}

// Per-tenant bill number on the shared `counters` doc (field "engbill"),
// starting at settings.engineering.billStartNumber. The pipeline update keeps
// this atomic: next = max(current, start - 1) + 1.
async function nextBillNo(db, cid, startNumber) {
  const start = Math.max(parseInt(startNumber, 10) || 1, 1);
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: cid },
    [{ $set: { engbill: { $add: [{ $max: [{ $ifNull: ["$engbill", 0] }, start - 1] }, 1] } } }],
    { upsert: true, returnDocument: "after" }
  );
  const doc = result.value || result;
  return doc.engbill;
}

async function getCatalog(clientId) {
  const settings = await getSettings(clientId);
  return settings?.engineering || {};
}

export async function createEngBill(clientId, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const catalog = await getCatalog(clientId);
  const header = buildHeader(data);
  const services = buildServices(data.services, catalog);
  const totals = computeTotals(services, data.discount, data.amountReceived);
  const paymentMode = toPaymentMode(data.paymentMode);
  const now = new Date();

  const doc = {
    clientId: cid,
    billNo: await nextBillNo(db, cid, catalog.billStartNumber),
    ...header,
    services,
    ...totals,
    paymentMode,
    payments: totals.amountReceived > 0
      ? [{ date: now, amount: totals.amountReceived, mode: paymentMode }]
      : [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Edits recompute every total. Received is re-capped at the new net; if the
// edit changes amountReceived, the difference is logged as a payment entry so
// payments[] always sums to amountReceived.
export async function updateEngBill(clientId, id, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw notFound();

  const catalog = await getCatalog(clientId);
  const header = buildHeader(data);
  const services = buildServices(data.services, catalog);
  const receivedIn = data.amountReceived ?? existing.amountReceived;
  const discountIn = data.discount ?? existing.discount;
  const totals = computeTotals(services, discountIn, receivedIn);
  const paymentMode = toPaymentMode(data.paymentMode ?? existing.paymentMode);

  const payments = Array.isArray(existing.payments) ? [...existing.payments] : [];
  const delta = round2(totals.amountReceived - (Number(existing.amountReceived) || 0));
  if (delta !== 0) payments.push({ date: new Date(), amount: delta, mode: paymentMode, adjustment: true });

  const set = { ...header, services, ...totals, paymentMode, payments, updatedAt: new Date() };
  await db.collection(COLLECTION).updateOne({ _id: existing._id, clientId: cid }, { $set: set });
  return { ...existing, ...set };
}

export async function deleteEngBill(clientId, id) {
  const db = await connectDB();
  const result = await db
    .collection(COLLECTION)
    .deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  if (result.deletedCount === 0) throw notFound();
  return true;
}

// Adds a later payment (and optionally sets the discount), capped at net.
export async function recordEngPayment(clientId, id, { amount = 0, discount = null, mode = "cash" } = {}) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw notFound();

  const pay = toMoney(amount || 0, "amount");
  const discountIn = discount != null ? toMoney(discount, "discount") : existing.discount;
  const prevReceived = Number(existing.amountReceived) || 0;
  const totals = computeTotals(existing.services || [], discountIn, prevReceived + pay);
  const applied = round2(totals.amountReceived - Math.min(prevReceived, totals.netTotal));
  const paymentMode = toPaymentMode(mode);

  const payments = Array.isArray(existing.payments) ? [...existing.payments] : [];
  if (applied > 0) payments.push({ date: new Date(), amount: applied, mode: paymentMode });

  const set = { ...totals, payments, updatedAt: new Date() };
  await db.collection(COLLECTION).updateOne({ _id: existing._id, clientId: cid }, { $set: set });
  return { ...existing, ...set };
}

export async function getEngBillById(clientId, id) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
}

function buildQuery(clientId, { vehicleNo = "", mechanic = "", fromDate = "", toDate = "", status = "", serviceType = "", bsModel = "" } = {}) {
  const query = { clientId: toClientId(clientId) };
  if (vehicleNo) query.vehicleNo = { $regex: escapeRegex(String(vehicleNo).toUpperCase()), $options: "i" };
  if (mechanic) query.mechanic = String(mechanic);
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  if (status) query.paymentStatus = String(status);
  if (serviceType) query["services.type"] = String(serviceType);
  if (bsModel) query["services.bsModel"] = String(bsModel);
  return query;
}

export async function listEngBills(clientId, filters = {}, page = 1, limit = 10) {
  const db = await connectDB();
  const query = buildQuery(clientId, filters);
  const [total, bills] = await Promise.all([
    db.collection(COLLECTION).countDocuments(query),
    db.collection(COLLECTION).find(query).sort({ billDate: -1, billNo: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
  ]);
  return { total, page, totalPages: Math.ceil(total / limit) || 1, bills };
}

export async function listEngBillsForExport(clientId, filters = {}) {
  const db = await connectDB();
  return db.collection(COLLECTION).find(buildQuery(clientId, filters)).sort({ billDate: -1, billNo: -1 }).toArray();
}

// Autofill for the service form: lorry address + phone from the most recent
// bill for this truck number (exact match, case-insensitive via uppercase).
export async function lookupVehicle(clientId, vehicleNo) {
  const v = String(vehicleNo || "").trim().toUpperCase();
  if (!v) return null;
  const db = await connectDB();
  const last = await db
    .collection(COLLECTION)
    .find({ clientId: toClientId(clientId), vehicleNo: v })
    .sort({ billDate: -1, createdAt: -1 })
    .limit(1)
    .project({ vehicleNo: 1, lorryAddress: 1, phone: 1, mechanic: 1 })
    .toArray();
  return last[0] || null;
}

export async function getEngAnalytics(clientId, filters = {}) {
  const db = await connectDB();
  const query = buildQuery(clientId, filters);
  const [result] = await db.collection(COLLECTION).aggregate([
    { $match: query },
    {
      $facet: {
        kpis: [{
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalBilled: { $sum: "$netTotal" },
            totalReceived: { $sum: "$amountReceived" },
          },
        }],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$billDate" } },
              billed: { $sum: "$netTotal" },
              received: { $sum: "$amountReceived" },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, month: "$_id", billed: 1, received: 1, count: 1 } },
          { $sort: { month: 1 } },
        ],
        byServiceType: [
          { $unwind: "$services" },
          {
            $group: {
              _id: "$services.type",
              label: { $last: "$services.typeLabel" },
              amount: { $sum: "$services.subtotal" },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, type: "$_id", label: 1, amount: 1, count: 1 } },
          { $sort: { amount: -1 } },
        ],
        byMechanic: [
          { $group: { _id: "$mechanic", billed: { $sum: "$netTotal" }, count: { $sum: 1 } } },
          { $project: { _id: 0, mechanic: "$_id", billed: 1, count: 1 } },
          { $sort: { billed: -1 } },
        ],
      },
    },
  ]).toArray();

  const k = result?.kpis?.[0] || { totalBills: 0, totalBilled: 0, totalReceived: 0 };
  return {
    kpis: {
      totalBills: k.totalBills,
      totalBilled: round2(k.totalBilled),
      totalReceived: round2(k.totalReceived),
      totalOutstanding: round2(k.totalBilled - k.totalReceived),
    },
    byMonth: result?.byMonth || [],
    byServiceType: result?.byServiceType || [],
    byMechanic: result?.byMechanic || [],
  };
}
