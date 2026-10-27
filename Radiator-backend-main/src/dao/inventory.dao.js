// Automobile inventory. Stock comes IN through stock entries (a purchase: part, qty, buy price, supplier) and goes OUT
// through bills: every bill line whose part was picked from the Settings parts catalog (items[].partRef) counts as sold.
// Nothing is stored as a running balance — stock is always worked out from the entries and the bills, so editing or
// deleting a bill (or an entry) can never leave the count out of step. Selling more than is in stock is allowed (the
// bill form only warns); the part then shows a negative stock until the missing purchase is entered.
// Collection: "stockentries". Never referenced by radiator / engineering code paths.
// Tyre tenants use the same code: their catalog is the brand → model list (a "part" is one brand + model, keyed
// "<brand>:<model>") and their bills are the delivery challans in "tyrebills", whose lines carry the same
// partRef / particulars / qty / amount fields.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";
import { parseSort, findSortedPage, countMatching } from "../utils/listSort.js";

const COLLECTION = "stockentries";
const round2 = (n) => Math.round(n * 100) / 100;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

const cleanText = (v, max = 200) => String(v ?? "").trim().slice(0, max);

// The tenant's sellable catalog as flat { value, label, rate } parts, and the collection its bills live in.
export function inventorySource(settings) {
  if (settings?.businessType === "tyre") {
    const parts = [];
    for (const b of settings?.tyre?.brands || []) {
      for (const m of b.models || []) {
        parts.push({ value: `${b.value}:${m.value}`, label: `${b.label} ${m.label}`.trim(), rate: Number(m.rate) || 0 });
      }
    }
    return { parts, bills: "tyrebills", wholeUnits: true };
  }
  return { parts: settings?.automobile?.parts || [], bills: "autobills", wholeUnits: false };
}

// Validates a stock entry against the tenant's parts catalog. Quantities may be fractional (litres of oil), except
// tyres, which are counted whole.
async function buildEntry(clientId, data) {
  const settings = await getSettings(clientId);
  const { parts, wholeUnits } = inventorySource(settings);
  const partRef = String(data.partRef || "");
  const part = parts.find((p) => p.value === partRef);
  if (!part) throw badRequest("Pick a part from the parts catalog");
  const qty = toMoney(data.qty, "qty");
  if (!(qty > 0)) throw badRequest("qty must be more than 0");
  if (wholeUnits && !Number.isInteger(qty)) throw badRequest("qty must be a whole number");
  return {
    partRef,
    partLabel: part.label,
    date: toValidDate(data.date, "date"),
    qty,
    buyPrice: toMoney(data.buyPrice ?? 0, "buy price"),
    supplier: cleanText(data.supplier),
    note: cleanText(data.note),
  };
}

export async function addStockEntry(clientId, data) {
  const db = await connectDB();
  const doc = { clientId: toClientId(clientId), ...(await buildEntry(clientId, data)), createdAt: new Date() };
  const res = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function updateStockEntry(clientId, id, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const fields = await buildEntry(clientId, data);
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id), clientId: cid },
    { $set: { ...fields, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  const doc = res?.value !== undefined ? res.value : res;
  if (!doc) throw Object.assign(new Error("Stock entry not found"), { statusCode: 404 });
  return doc;
}

export async function deleteStockEntry(clientId, id) {
  const db = await connectDB();
  const res = await db.collection(COLLECTION).findOneAndDelete({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  const doc = res?.value !== undefined ? res.value : res;
  if (!doc) throw Object.assign(new Error("Stock entry not found"), { statusCode: 404 });
  return doc;
}

const ENTRY_SORT = { date: "date", part: "partLabel", qty: "qty", buy: "buyPrice", value: { $multiply: ["$qty", "$buyPrice"] }, supplier: "supplier" };

export async function listStockEntries(clientId, { partRef = "", search = "", from = "", to = "" } = {}, page = 1, limit = 10, sortQuery = {}) {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (partRef) query.partRef = String(partRef);
  // An entry keeps the part's name from the day it was entered; a part renamed in Settings since then is shown and
  // found under its current name (its value, and so its stock, stays the same).
  const { parts } = inventorySource(await getSettings(clientId));
  const text = String(search || "").trim();
  if (text) {
    const rx = { $regex: escapeRegex(text), $options: "i" };
    const needle = text.toLowerCase();
    const renamed = parts.filter((p) => p.label.toLowerCase().includes(needle)).map((p) => p.value);
    query.$or = [{ partLabel: rx }, { supplier: rx }, { note: rx }, ...(renamed.length ? [{ partRef: { $in: renamed } }] : [])];
  }
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = moment(from).startOf("day").toDate();
    if (to) query.date.$lte = moment(to).endOf("day").toDate();
  }
  const coll = db.collection(COLLECTION);
  const [total, entries] = await Promise.all([
    countMatching(coll, query),
    findSortedPage(coll, query, parseSort(sortQuery, ENTRY_SORT, { date: -1, createdAt: -1 }), (page - 1) * limit, limit),
  ]);
  const labelOf = new Map(parts.map((p) => [p.value, p.label]));
  const named = entries.map((e) => (labelOf.has(e.partRef) ? { ...e, partLabel: labelOf.get(e.partRef) } : e));
  return { total, page, totalPages: Math.ceil(total / limit) || 1, entries: named };
}

// Units sold per catalog part, from every bill line that carries a partRef.
async function salesByPart(db, cid, billsCollection, partRef = null) {
  // On the bill, $elemMatch: "at least one line has a part" ($nin on the array would drop a bill as soon as ANY of
  // its lines is free-typed). After $unwind each line is checked on its own.
  const linePart = partRef ? partRef : { $nin: [null, ""] };
  return db.collection(billsCollection).aggregate([
    { $match: { clientId: cid, items: { $elemMatch: { partRef: linePart } } } },
    { $unwind: "$items" },
    { $match: { "items.partRef": linePart } },
    {
      $group: {
        _id: "$items.partRef",
        sold: { $sum: { $ifNull: ["$items.qty", 0] } },
        sales: { $sum: { $ifNull: ["$items.amount", 0] } },
        bills: { $addToSet: "$_id" },
        lastSold: { $max: "$billDate" },
        name: { $last: "$items.particulars" },
      },
    },
  ]).toArray();
}

/**
 * One row per part: everything in the parts catalog, plus any part that still has entries or bill lines after being
 * removed from the catalog. Buy cost is the weighted average of all purchases, used for stock value and profit.
 */
export async function getInventorySummary(clientId) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const settings = await getSettings(clientId);
  const { parts: catalog, bills } = inventorySource(settings);

  const [ins, outs] = await Promise.all([
    db.collection(COLLECTION).aggregate([
      { $match: { clientId: cid } },
      { $sort: { date: 1 } },
      {
        $group: {
          _id: "$partRef",
          added: { $sum: "$qty" },
          cost: { $sum: { $multiply: ["$qty", "$buyPrice"] } },
          entries: { $sum: 1 },
          lastIn: { $max: "$date" },
          name: { $last: "$partLabel" },
        },
      },
    ]).toArray(),
    salesByPart(db, cid, bills),
  ]);

  const inBy = new Map(ins.map((r) => [r._id, r]));
  const outBy = new Map(outs.map((r) => [r._id, r]));
  const refs = [...new Set([...catalog.map((p) => p.value), ...inBy.keys(), ...outBy.keys()])].filter(Boolean);

  const rows = refs.map((ref) => {
    const part = catalog.find((p) => p.value === ref);
    const i = inBy.get(ref) || { added: 0, cost: 0, entries: 0, lastIn: null };
    const o = outBy.get(ref) || { sold: 0, sales: 0, bills: [], lastSold: null };
    const avgCost = i.added > 0 ? i.cost / i.added : 0;
    const remaining = round2(i.added - o.sold);
    return {
      partRef: ref,
      label: part?.label || i.name || o.name || ref,
      inCatalog: !!part,
      rate: Number(part?.rate) || 0,
      added: round2(i.added),
      sold: round2(o.sold),
      remaining,
      avgCost: round2(avgCost),
      stockValue: round2(Math.max(remaining, 0) * avgCost),
      sales: round2(o.sales),
      costOfSales: round2(o.sold * avgCost),
      // Without any purchase recorded there is no buy price, so profit would just repeat sales: leave it out.
      profit: i.added > 0 ? round2(o.sales - o.sold * avgCost) : null,
      bills: o.bills.length,
      lastIn: i.lastIn,
      lastSold: o.lastSold,
    };
  });
  rows.sort((a, b) => a.label.localeCompare(b.label));

  const totals = rows.reduce((t, r) => ({
    parts: t.parts + 1,
    inStock: t.inStock + Math.max(r.remaining, 0),
    stockValue: t.stockValue + r.stockValue,
    sales: t.sales + r.sales,
    profit: t.profit + (r.profit || 0),
    outOfStock: t.outOfStock + (r.remaining <= 0 && r.inCatalog ? 1 : 0),
  }), { parts: 0, inStock: 0, stockValue: 0, sales: 0, profit: 0, outOfStock: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });

  return { rows, totals };
}

// Stock in and out for one part, newest first: purchases and the bills it was sold on.
export async function getPartMovements(clientId, partRef, limit = 100) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const ref = String(partRef || "");
  const source = inventorySource(await getSettings(clientId));
  const [ins, bills] = await Promise.all([
    db.collection(COLLECTION).find({ clientId: cid, partRef: ref }).sort({ date: -1 }).limit(limit).toArray(),
    db.collection(source.bills).find({ clientId: cid, "items.partRef": ref }).sort({ billDate: -1 }).limit(limit).toArray(),
  ]);
  const moves = [
    ...ins.map((e) => ({ kind: "in", date: e.date, qty: e.qty, buyPrice: e.buyPrice, supplier: e.supplier, note: e.note, id: String(e._id) })),
    ...bills.map((b) => {
      const lines = (b.items || []).filter((it) => it.partRef === ref);
      return {
        kind: "out",
        date: b.billDate,
        qty: round2(lines.reduce((s, it) => s + Number(it.qty || 0), 0)),
        amount: round2(lines.reduce((s, it) => s + Number(it.amount || 0), 0)),
        billNo: b.billNo,
        vehicleNumber: String(b.vehicleNumber || "").toUpperCase(),
        id: String(b._id),
      };
    }),
  ];
  moves.sort((a, b) => new Date(b.date) - new Date(a.date));
  return moves.slice(0, limit);
}

// In-stock count per part for the bill form's "not enough stock" warning.
export async function getStockLevels(clientId) {
  const { rows } = await getInventorySummary(clientId);
  return Object.fromEntries(rows.map((r) => [r.partRef, r.remaining]));
}
