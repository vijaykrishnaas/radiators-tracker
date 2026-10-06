// Engineering-works bills (turbo / air-compressor service). Collection
// "engbills", used only by engineering-vertical tenants. Payment/discount/status
// semantics match autobill.dao.js; line items are grouped into service cards
// (service type + BS model), each item priced qty × rate. Each save keeps the mechanic bonus entry in sync
// (engbonus.dao.js); a bonus failure is logged and never blocks the bill.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";
import { removeBonusesForRecord } from "./bonus.dao.js";
import { syncEngBonusesForRecord } from "./engbonus.dao.js";

const COLLECTION = "engbills";

export const STATUS = {
  NOT_RECEIVED: "Not Received",
  PARTIAL: "Partial",
  RECEIVED: "Received",
};

const PAYMENT_MODES = ["cash", "upi", "card", "bank", "other"];

async function syncBonus(clientId, bill) {
  try {
    await syncEngBonusesForRecord(clientId, bill);
  } catch (err) {
    console.error("engineering bonus sync failed:", err?.message || err);
  }
}

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
  let costTotal = 0;
  for (const s of services) {
    typeTotals[s.type] = round2((typeTotals[s.type] || 0) + s.subtotal);
    total += s.subtotal;
    costTotal += Number(s.costTotal) || 0;
  }
  total = round2(total);
  costTotal = round2(costTotal);
  const discount = Math.min(Math.max(Number(discountIn) || 0, 0), total);
  const netTotal = round2(total - discount);
  const amountReceived = Math.min(Math.max(Number(receivedIn) || 0, 0), netTotal);
  return {
    typeTotals,
    total,
    costTotal,
    grossProfit: round2(total - costTotal), // before discount and bonus
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

// The bought (cost) price of one unit, saved on the bill so later catalog edits don't rewrite past profit.
// Catalog items take the catalog cost for the card's BS model; an edit keeps the cost already saved on the bill
// (when it had one). Free-description items ("Other") have no catalog cost, so the form sends one per row.
function unitCost(it, itemDef, bsModel, prevCost) {
  if (!itemDef || itemDef.requiresComment) {
    if (it?.cost !== undefined && it?.cost !== null && it?.cost !== "") return toMoney(it.cost, "item cost");
    return prevCost || 0;
  }
  if (prevCost > 0) return prevCost;
  const c = itemDef.costs?.[bsModel];
  return typeof c === "number" && Number.isFinite(c) && c > 0 ? c : 0;
}

// Costs already saved on a bill, keyed by service type + BS model + item.
function savedCosts(services) {
  const map = new Map();
  for (const s of services || []) for (const i of s.items || []) {
    if (Number(i.cost) > 0) map.set(`${s.type}|${s.bsModel || ""}|${i.item}`, Number(i.cost));
  }
  return map;
}

// Validates and normalizes the service cards. Labels come from the catalog
// when the item still exists there (falls back to the submitted label so old
// bills stay editable after a catalog edit). amount is always qty × rate;
// costAmount is qty × the item's saved unit cost.
function buildServices(rawServices, catalog, prevCosts = new Map()) {
  if (!Array.isArray(rawServices) || rawServices.length === 0) {
    throw httpError("Add at least one service", 400);
  }
  const services = rawServices.map((s, si) => {
    const type = String(s?.type || "").trim();
    if (!type) throw httpError(`Service ${si + 1}: choose a service type`, 400);
    const rawItems = Array.isArray(s.items) ? s.items : [];
    if (rawItems.length === 0) throw httpError(`Service ${si + 1}: choose at least one item`, 400);
    const { typeDef } = findCatalogItem(catalog, type, null);
    const bsModel = String(s.bsModel || "").trim();
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
      const cost = unitCost(it, itemDef, bsModel, prevCosts.get(`${type}|${bsModel}|${itemKey}`) || 0);
      return { item: itemKey, label, comment, requiresComment, qty, rate, amount: round2(qty * rate), cost, costAmount: round2(qty * cost) };
    });
    const subtotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
    return {
      type,
      typeLabel: typeDef?.label || String(s.typeLabel || type),
      bsModel,
      items,
      subtotal,
      costTotal: round2(items.reduce((sum, i) => sum + i.costAmount, 0)),
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
  await syncBonus(clientId, { ...doc, _id: result.insertedId });
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
  const services = buildServices(data.services, catalog, savedCosts(existing.services));
  const receivedIn = data.amountReceived ?? existing.amountReceived;
  const discountIn = data.discount ?? existing.discount;
  const totals = computeTotals(services, discountIn, receivedIn);
  const paymentMode = toPaymentMode(data.paymentMode ?? existing.paymentMode);

  const payments = Array.isArray(existing.payments) ? [...existing.payments] : [];
  const delta = round2(totals.amountReceived - (Number(existing.amountReceived) || 0));
  if (delta !== 0) payments.push({ date: new Date(), amount: delta, mode: paymentMode, adjustment: true });

  const set = { ...header, services, ...totals, paymentMode, payments, updatedAt: new Date() };
  await db.collection(COLLECTION).updateOne({ _id: existing._id, clientId: cid }, { $set: set });
  await syncBonus(clientId, { ...existing, ...set });
  return { ...existing, ...set };
}

export async function deleteEngBill(clientId, id) {
  const db = await connectDB();
  const result = await db
    .collection(COLLECTION)
    .deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  if (result.deletedCount === 0) throw notFound();
  try {
    await removeBonusesForRecord(clientId, id);
  } catch (err) {
    console.error("engineering bonus cleanup failed:", err?.message || err);
  }
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
  await syncBonus(clientId, { ...existing, ...set });
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

// ---- Profit ----
// Gross profit = bill total − saved item costs. Bills fully paid count as "earned"; unpaid and part-paid bills as
// "expected". Each bucket also shows what is left after the bill discount and after the mechanic bonus, so the
// headline gross figure is never read as money in hand.
const emptyBucket = () => ({ bills: 0, sales: 0, cost: 0, gross: 0, discount: 0, afterDiscount: 0, bonus: 0, afterBonus: 0 });

// A bill counts as "earned" once it is fully paid — including a bill discounted to zero (nothing left to collect).
const isSettled = (b) => b.paymentStatus === STATUS.RECEIVED || (Number(b.total) > 0 && Number(b.netTotal) <= 0);

// With a service-type / BS-model filter only the matching cards count; the bill's discount and bonus are shared out
// in proportion to those cards' share of the bill total.
export function summarizeProfit(bills, bonusByBill = new Map(), { serviceType = "", bsModel = "" } = {}) {
  const cardMatches = (s) => (!serviceType || s.type === serviceType) && (!bsModel || (s.bsModel || "") === bsModel);
  const earned = emptyBucket();
  const expected = emptyBucket();
  const byType = new Map();
  const byItem = new Map();
  let missingCostLines = 0;

  for (const b of bills) {
    const bucket = isSettled(b) ? earned : expected;
    let sales = 0;
    let cost = 0;
    let billSales = 0;
    for (const s of b.services || []) billSales += Number(s.subtotal) || 0;
    for (const s of b.services || []) {
      if (!cardMatches(s)) continue;
      const t = byType.get(s.type) || { type: s.type, label: s.typeLabel || s.type, sales: 0, cost: 0 };
      for (const i of s.items || []) {
        const amt = Number(i.amount) || 0;
        const c = Number(i.costAmount) || 0;
        sales += amt;
        cost += c;
        t.sales += amt;
        t.cost += c;
        if (amt > 0 && !(Number(i.cost) > 0)) missingCostLines += 1;
        // "Other"-style rows are grouped under their item, not their free-text description.
        const key = `${s.type}|${i.item}`;
        const row = byItem.get(key) || { type: s.type, typeLabel: s.typeLabel || s.type, item: i.item, label: i.label, qty: 0, sales: 0, cost: 0 };
        row.qty += Number(i.qty) || 0;
        row.sales += amt;
        row.cost += c;
        byItem.set(key, row);
      }
      byType.set(s.type, t);
    }
    const share = serviceType || bsModel ? (billSales > 0 ? sales / billSales : 0) : 1;
    if ((serviceType || bsModel) && share === 0 && sales === 0) continue;
    const discount = Math.max(Number(b.discount) || 0, 0) * share;
    const bonus = (Number(bonusByBill.get(String(b._id))) || 0) * share;
    bucket.bills += 1;
    bucket.sales += sales;
    bucket.cost += cost;
    bucket.discount += discount;
    bucket.bonus += bonus;
  }

  const finish = (x) => {
    const gross = x.sales - x.cost;
    return {
      bills: x.bills,
      sales: round2(x.sales),
      cost: round2(x.cost),
      gross: round2(gross),
      discount: round2(x.discount),
      afterDiscount: round2(gross - x.discount),
      bonus: round2(x.bonus),
      afterBonus: round2(gross - x.discount - x.bonus),
    };
  };
  const withMargin = (r) => ({ ...r, sales: round2(r.sales), cost: round2(r.cost), gross: round2(r.sales - r.cost), margin: r.sales > 0 ? round2(((r.sales - r.cost) / r.sales) * 100) : 0 });
  return {
    earned: finish(earned),
    expected: finish(expected),
    byServiceType: [...byType.values()].map(withMargin).sort((a, b) => b.gross - a.gross),
    byItem: [...byItem.values()].map((r) => ({ ...withMargin(r), qty: round2(r.qty) })).sort((a, b) => b.gross - a.gross),
    missingCostLines,
  };
}

export async function getEngProfit(clientId, filters = {}) {
  const db = await connectDB();
  const bills = await db
    .collection(COLLECTION)
    .find(buildQuery(clientId, filters))
    .project({ services: 1, discount: 1, paymentStatus: 1, total: 1, netTotal: 1 })
    .toArray();
  const ids = bills.map((b) => b._id);
  const bonusByBill = new Map();
  if (ids.length) {
    const entries = await db
      .collection("bonuses")
      .find({ clientId: toClientId(clientId), type: "mechanic", recordId: { $in: ids } })
      .toArray();
    for (const e of entries) {
      const k = String(e.recordId);
      bonusByBill.set(k, (bonusByBill.get(k) || 0) + (Number(e.status === "paid" ? e.paidAmount ?? e.accruedAmount : e.accruedAmount) || 0));
    }
  }
  return summarizeProfit(bills, bonusByBill, { serviceType: filters.serviceType, bsModel: filters.bsModel });
}

export async function getEngAnalytics(clientId, filters = {}) {
  const db = await connectDB();
  const query = buildQuery(clientId, filters);
  const [[result], profit] = await Promise.all([db.collection(COLLECTION).aggregate([
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
  ]).toArray(), getEngProfit(clientId, filters)]);

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
    profit,
  };
}
