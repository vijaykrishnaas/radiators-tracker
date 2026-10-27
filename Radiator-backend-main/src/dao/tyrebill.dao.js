// Tyre-vertical delivery challans. Collection "tyrebills", used only by tyre tenants. Tenant scoping, status values
// and list/export/sort behaviour follow autobill.dao.js; what is different is the money side:
//
//  - Lines are tyres picked from the Settings brand → model catalog (qty × rate). The TYRE AMOUNT is their sum.
//  - paymentType "full": paid like the other verticals (part payments, discount at collection).
//  - paymentType "installment": a plan of rows { label, dueDate, principal, interest }. The principals must add up to
//    the tyre amount exactly; amount to collect = tyre amount + total interest. No discount. A payment is recorded
//    against one chosen row and can never be more than what is left on it. A row with any payment is locked: an edit
//    can change, add, remove or re-date only unpaid rows, and the payment type can only change before any payment.
//
// Totals are stored on the challan on every write (for list sorting and the dashboard). Overdue depends on today's
// date, so it is worked out when a challan is read; `nextDueDate` (the earliest unsettled row) is stored so the list
// can filter overdue challans in the query.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { removeBonusesForRecord } from "./bonus.dao.js";
import { syncTyreBonusesForRecord } from "./tyrebonus.dao.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toValidDate } from "../utils/sanitize.js";
import { parseSort, findSortedPage, SORT_COLLATION, countMatching } from "../utils/listSort.js";

const COLLECTION = "tyrebills";

export const STATUS = {
  NOT_RECEIVED: "Not Received",
  PARTIAL: "Partial",
  RECEIVED: "Received",
};

export const ROW_STATUS = { PAID: "Paid", OVERDUE: "Overdue", PART: "Partly paid", DUE: "Due" };

const PAYMENT_MODES = ["cash", "upi", "card", "bank", "other"];
const MAX_ITEMS = 100;
const MAX_ROWS = 120;
// One line can be many tyres, each with its own serial ("MRF-2026-778810, MRF-2026-778811, …"): room for dozens.
const MAX_TYRE_NUMBERS = 2000;

const round2 = (n) => Math.round(n * 100) / 100;
const cleanText = (v, max = 200) => String(v ?? "").trim().slice(0, max);

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const notFound = () => httpError("Challan not found", 404);
const changedMeanwhile = () => httpError("This challan was changed by someone else just now. Reload it and try again.", 409);

// Writes only if the challan is still the revision that was read, and moves it to the next revision, so two payments
// (or a payment and an edit) made at the same moment can never overwrite each other and lose money: the second one is
// refused. A revision number, not a timestamp: two writes in the same clock tick would carry the same timestamp.
// Challans saved before revisions existed have none and count as revision 0.
async function saveIfUnchanged(db, existing, set) {
  const rev = Number(existing.rev) || 0;
  const res = await db.collection(COLLECTION).updateOne(
    { _id: existing._id, clientId: existing.clientId, rev: rev ? rev : { $exists: false } },
    { $set: Object.assign(set, { rev: rev + 1 }) }
  );
  if (!res.matchedCount) throw changedMeanwhile();
}

function toPaymentMode(mode) {
  return PAYMENT_MODES.includes(mode) ? mode : "cash";
}

function deriveStatus(received, payable) {
  // Nothing to collect (e.g. discounted to ₹0) is settled, not "Not Received".
  if (payable <= 0) return STATUS.RECEIVED;
  if (received <= 0) return STATUS.NOT_RECEIVED;
  if (received < payable) return STATUS.PARTIAL;
  return STATUS.RECEIVED;
}

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Default row names, as on the paper challan: "Initial amount", "1st month", "2nd month", ...
export const defaultRowLabel = (i) => (i === 0 ? "Initial amount" : `${ordinal(i)} month`);

const sumPaid = (payments) => round2((payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));

// ---------------------------------------------------------------------------
// Building a challan from the request
// ---------------------------------------------------------------------------

function buildHeader(data) {
  return {
    billDate: toValidDate(data.billDate, "billDate"),
    // Vehicle numbers are always stored in capitals.
    vehicleNumber: cleanText(data.vehicleNumber, 30).toUpperCase(),
    customerName: cleanText(data.customerName),
    phoneNumber: cleanText(data.phoneNumber, 30),
    address: cleanText(data.address, 500),
    mechanicName: cleanText(data.mechanicName),
    labourName: Array.isArray(data.labourName)
      ? data.labourName.map((l) => cleanText(typeof l === "object" ? l?.label : l)).filter(Boolean)
      : [],
    notes: cleanText(data.notes, 1000),
  };
}

// Lines are validated against the brand → model catalog. Labels come from the catalog while the brand/model still
// exists there, and otherwise from what the challan already had, so old challans stay editable after a catalog edit.
function buildItems(rawItems, brands = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw httpError("Add at least one tyre");
  if (rawItems.length > MAX_ITEMS) throw httpError(`A challan can have at most ${MAX_ITEMS} tyre lines`);
  return rawItems.map((it, i) => {
    const n = i + 1;
    const brandRef = cleanText(it?.brandRef, 80);
    const modelRef = cleanText(it?.modelRef, 80);
    const brand = brands.find((b) => b.value === brandRef);
    const model = brand?.models?.find((m) => m.value === modelRef);
    const brandLabel = brand?.label || cleanText(it?.brandLabel, 80);
    const modelLabel = model?.label || cleanText(it?.modelLabel, 120);
    if (!brandLabel) throw httpError(`Tyre ${n}: choose a brand`);
    if (!modelLabel) throw httpError(`Tyre ${n}: choose a model / size`);

    const qty = Number(it?.qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1) throw httpError(`Tyre ${n}: quantity must be a whole number of 1 or more`);
    // Kept to the paisa, as printed: the line amount is then exactly qty × the rate on the challan.
    const rate = round2(toMoney(it?.rate ?? 0, `Tyre ${n} rate`));
    // Refused, never cut: a silently shortened list would drop the last tyres' serials from the challan.
    const tyreNumber = String(it?.tyreNumber ?? "").trim();
    if (tyreNumber.length > MAX_TYRE_NUMBERS) throw httpError(`Tyre ${n}: tyre numbers are too long (at most ${MAX_TYRE_NUMBERS} characters)`);
    const tubeType = it?.tubeType === "tubeless" ? "tubeless" : "tube";
    const flap = it?.flap === true || it?.flap === "Yes" || it?.flap === "yes" || it?.flap === "true";
    return {
      brandRef: brandRef || null,
      brandLabel,
      modelRef: modelRef || null,
      modelLabel,
      // Inventory key (shared with the automobile inventory code, which counts sold stock by items[].partRef).
      partRef: brandRef && modelRef ? `${brandRef}:${modelRef}` : null,
      particulars: `${brandLabel} ${modelLabel}`.trim(),
      tyreNumber,
      tubeType,
      flap,
      qty,
      rate,
      amount: round2(qty * rate),
    };
  });
}

const newRowId = () => new ObjectId().toHexString();

// Due dates arrive as "YYYY-MM-DD" and are stored as UTC midnight of that calendar day, so a stored date's day is its
// UTC date. "Today" is the server's calendar day. Comparing days (never instants) keeps an installment from turning
// overdue on its own due date when the server runs west of UTC.
const dayOf = (d) => moment.utc(d).format("YYYY-MM-DD");
const todayOf = (now) => moment(now).format("YYYY-MM-DD");
const startOfDayUtc = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

function sameDay(a, b) {
  return dayOf(a) === dayOf(b);
}

// Validates the installment plan against the tyre amount and merges it with the rows already saved: rows that have a
// payment are locked (sent back unchanged or the save is refused), every other row is replaced by what was sent.
function buildInstallments(rawRows, tyreAmount, existingRows = []) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw httpError("Add at least one installment");
  if (rawRows.length > MAX_ROWS) throw httpError(`A plan can have at most ${MAX_ROWS} installments`);

  const byId = new Map(existingRows.map((r) => [r.id, r]));
  const locked = existingRows.filter((r) => sumPaid(r.payments) > 0);
  const ids = rawRows.map((r) => String(r?.id || "")).filter(Boolean);
  const sentIds = new Set(ids);
  // A row sent twice would copy its payments and inflate what was received.
  if (sentIds.size !== ids.length) throw httpError("The same installment was sent twice. Reload the challan and try again.");
  const missing = locked.find((r) => !sentIds.has(r.id));
  if (missing) throw httpError(`"${missing.label}" already has a payment, so it can't be removed`);

  const rows = rawRows.map((raw, i) => {
    const n = i + 1;
    const prev = raw?.id ? byId.get(String(raw.id)) : null;
    const label = cleanText(raw?.label, 60) || defaultRowLabel(i);
    const principal = round2(toMoney(raw?.principal ?? 0, `Installment ${n} principal`));
    const interest = round2(toMoney(raw?.interest ?? 0, `Installment ${n} interest`));
    const dueDate = toValidDate(raw?.dueDate, `Installment ${n} due date`);
    if (prev && sumPaid(prev.payments) > 0) {
      if (prev.principal !== principal || prev.interest !== interest || !sameDay(prev.dueDate, dueDate)) {
        throw httpError(`"${prev.label}" already has a payment, so its amounts and due date can't change`);
      }
      return { ...prev, label };
    }
    if (principal + interest <= 0) throw httpError(`Installment ${n} (${label}): enter an amount`);
    return { id: prev?.id || newRowId(), label, dueDate, principal, interest, payments: [] };
  });

  const principalSum = round2(rows.reduce((s, r) => s + r.principal, 0));
  if (principalSum !== round2(tyreAmount)) {
    throw httpError(
      `Installment principals add up to ₹${principalSum.toLocaleString("en-IN")} but the tyre amount is ₹${round2(tyreAmount).toLocaleString("en-IN")}. They must match.`
    );
  }
  return rows;
}

// Every stored total, recomputed from the lines and the plan/payments. Called on each write.
function computeTotals(doc) {
  const tyreAmount = round2((doc.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
  if (doc.paymentType === "installment") {
    const installments = (doc.installments || []).map((r) => {
      const total = round2(r.principal + r.interest);
      const paid = sumPaid(r.payments);
      return { ...r, total, paid, settled: paid >= total };
    });
    const interestTotal = round2(installments.reduce((s, r) => s + r.interest, 0));
    const payableTotal = round2(tyreAmount + interestTotal);
    const receivedAmount = round2(installments.reduce((s, r) => s + r.paid, 0));
    const open = installments.filter((r) => !r.settled).map((r) => new Date(r.dueDate)).sort((a, b) => a - b);
    return {
      installments,
      tyreAmount,
      interestTotal,
      discount: 0,
      payableTotal,
      receivedAmount,
      pendingAmount: round2(Math.max(payableTotal - receivedAmount, 0)),
      status: deriveStatus(receivedAmount, payableTotal),
      nextDueDate: open[0] || null,
    };
  }
  const discount = Math.min(Math.max(Number(doc.discount) || 0, 0), tyreAmount);
  const payableTotal = round2(tyreAmount - discount);
  // Kept to the paisa: added up payment by payment, ₹5,000.19 + ₹5,000.18 is 10000.369999999999 in floating point,
  // which left a fully paid ₹10,000.37 challan "Partial" with ₹0 pending.
  const receivedAmount = round2(Math.min(Math.max(Number(doc.receivedAmount) || 0, 0), payableTotal));
  return {
    installments: [],
    tyreAmount,
    interestTotal: 0,
    discount,
    payableTotal,
    receivedAmount,
    pendingAmount: round2(payableTotal - receivedAmount),
    status: deriveStatus(receivedAmount, payableTotal),
    nextDueDate: null,
  };
}

function hasAnyPayment(doc) {
  if (!doc) return false;
  if (doc.paymentType === "installment") return (doc.installments || []).some((r) => sumPaid(r.payments) > 0);
  return (Number(doc.receivedAmount) || 0) > 0;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Adds what depends on today's date: each row's status, the next unpaid row, and the overdue amount.
export function enrich(doc, now = new Date()) {
  if (!doc) return doc;
  const today = todayOf(now);
  let overdueAmount = 0;
  let overdueCount = 0;
  let nextDue = null;
  const installments = (doc.installments || []).map((r) => {
    const total = round2(Number(r.principal || 0) + Number(r.interest || 0));
    const paid = sumPaid(r.payments);
    const balance = round2(Math.max(total - paid, 0));
    let rowStatus;
    if (balance <= 0) rowStatus = ROW_STATUS.PAID;
    else if (dayOf(r.dueDate) < today) rowStatus = ROW_STATUS.OVERDUE;
    else if (paid > 0) rowStatus = ROW_STATUS.PART;
    else rowStatus = ROW_STATUS.DUE;
    if (rowStatus === ROW_STATUS.OVERDUE) {
      overdueAmount += balance;
      overdueCount += 1;
    }
    if (balance > 0 && (!nextDue || new Date(r.dueDate) < new Date(nextDue.dueDate))) {
      nextDue = { id: r.id, label: r.label, dueDate: r.dueDate, amount: balance };
    }
    return { ...r, total, paid, balance, rowStatus };
  });
  return {
    ...doc,
    vehicleNumber: String(doc.vehicleNumber || "").toUpperCase(),
    installments,
    // Same names the shared payment modal and exports read on the other verticals.
    totalAmount: doc.tyreAmount,
    netAmount: doc.payableTotal,
    nextDue,
    overdueAmount: round2(overdueAmount),
    overdueCount,
  };
}

async function getTyreSettings(clientId) {
  const settings = await getSettings(clientId);
  return settings?.tyre || {};
}

// Per-tenant D.C. number on the shared `counters` doc (field "tyrebill"), starting at settings.tyre.billStartNumber.
// The pipeline update keeps it atomic: next = max(current, start - 1) + 1.
async function nextBillNo(db, cid, startNumber) {
  const start = Math.max(parseInt(startNumber, 10) || 1, 1);
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: cid },
    [{ $set: { tyrebill: { $add: [{ $max: [{ $ifNull: ["$tyrebill", 0] }, start - 1] }, 1] } } }],
    { upsert: true, returnDocument: "after" }
  );
  const doc = result.value || result;
  return doc.tyrebill;
}

async function syncBonus(clientId, bill) {
  try {
    await syncTyreBonusesForRecord(clientId, bill);
  } catch (err) {
    console.error("tyre bonus sync failed:", err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function createTyreBill(clientId, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const cfg = await getTyreSettings(clientId);
  const header = buildHeader(data);
  const items = buildItems(data.items, cfg.brands);
  const paymentType = data.paymentType === "installment" ? "installment" : "full";
  const tyreAmount = items.reduce((s, i) => s + i.amount, 0);
  const installments = paymentType === "installment" ? buildInstallments(data.installments, tyreAmount) : [];
  const now = new Date();

  const base = { ...header, items, paymentType, installments, discount: 0, receivedAmount: 0, payments: [] };
  const doc = {
    clientId: cid,
    billNo: await nextBillNo(db, cid, cfg.billStartNumber),
    ...base,
    ...computeTotals(base),
    createdAt: now,
    updatedAt: now,
    rev: 1,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  const saved = { ...doc, _id: result.insertedId };
  await syncBonus(clientId, saved);
  return saved;
}

export async function updateTyreBill(clientId, id, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw notFound();

  const cfg = await getTyreSettings(clientId);
  const header = buildHeader(data);
  const items = buildItems(data.items, cfg.brands);
  const existingType = existing.paymentType === "installment" ? "installment" : "full";
  const paymentType = data.paymentType === "installment" ? "installment" : data.paymentType === "full" ? "full" : existingType;
  if (paymentType !== existingType && hasAnyPayment(existing)) {
    throw httpError("This challan already has a payment, so the payment type can't change");
  }
  const tyreAmount = items.reduce((s, i) => s + i.amount, 0);
  const installments = paymentType === "installment"
    ? buildInstallments(data.installments, tyreAmount, existingType === "installment" ? existing.installments || [] : [])
    : [];

  const base = {
    ...header,
    items,
    paymentType,
    installments,
    // A full-payment challan keeps what was collected (capped at the new total); an installment one has no discount.
    discount: paymentType === "full" ? existing.discount || 0 : 0,
    receivedAmount: paymentType === "full" ? existing.receivedAmount || 0 : 0,
  };
  const totals = computeTotals(base);
  // A full-payment challan can't be cut below what was already collected plus the discount already given. Otherwise
  // collected money would vanish from the totals while still in the payment log, or the discount would be silently
  // shrunk to fit and the challan shown as Received with nothing collected.
  if (paymentType === "full") {
    const received = round2(Number(existing.receivedAmount) || 0);
    const given = round2(Number(existing.discount) || 0);
    const floor = round2(received + given);
    if (floor > round2(tyreAmount)) {
      const inr = (n) => `₹${n.toLocaleString("en-IN")}`;
      throw httpError(
        received > 0 && given > 0
          ? `${inr(received)} received and a ${inr(given)} discount are already on this challan, so its total can't go below ${inr(floor)}`
          : given > 0
            ? `A ${inr(given)} discount is already on this challan, so its total can't go below ${inr(given)}`
            : `${inr(received)} is already received, so the challan total can't go below that`
      );
    }
  }
  const set = { ...base, ...totals, updatedAt: new Date() };
  await saveIfUnchanged(db, existing, set);
  const saved = { ...existing, ...set };
  await syncBonus(clientId, saved);
  return enrich(saved);
}

export async function deleteTyreBill(clientId, id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  if (result.deletedCount === 0) throw notFound();
  try {
    await removeBonusesForRecord(clientId, id);
  } catch (err) {
    console.error("tyre bonus cleanup failed:", err?.message || err);
  }
  return true;
}

/**
 * Records a collection.
 *  - full payment: { amount, discount?, mode } — the amount is capped at what is still owed (as on the other verticals).
 *  - installments: { amount, installmentId, mode } — the amount must fit what is left on that row; no discount.
 */
export async function recordTyrePayment(clientId, id, { amount = 0, discount = null, mode = "cash", installmentId = null } = {}) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: cid });
  if (!existing) throw notFound();

  const pay = round2(toMoney(amount || 0, "amount"));
  const paymentMode = toPaymentMode(mode);
  const now = new Date();
  const log = Array.isArray(existing.payments) ? [...existing.payments] : [];
  let base;

  if (existing.paymentType === "installment") {
    if (discount != null && Number(discount) > 0) {
      throw httpError("Discount is only for full-payment challans. Change the installment plan instead.");
    }
    if (!(pay > 0)) throw httpError("Enter the amount paid");
    const rows = existing.installments || [];
    const idx = rows.findIndex((r) => r.id === String(installmentId || ""));
    if (idx === -1) throw httpError("Choose which installment this payment is for");
    const row = rows[idx];
    const left = round2(row.principal + row.interest - sumPaid(row.payments));
    if (left <= 0) throw httpError(`"${row.label}" is already fully paid`);
    if (pay > left) {
      throw httpError(`₹${pay.toLocaleString("en-IN")} is more than the ₹${left.toLocaleString("en-IN")} left on "${row.label}"`);
    }
    const installments = rows.map((r, i) =>
      i === idx ? { ...r, payments: [...(r.payments || []), { date: now, amount: pay, mode: paymentMode }] } : r
    );
    log.push({ date: now, amount: pay, mode: paymentMode, installmentId: row.id, label: row.label });
    base = { ...existing, installments };
  } else {
    const discountIn = discount != null ? round2(toMoney(discount, "discount")) : existing.discount;
    const prev = computeTotals(existing);
    // A discount only reduces what is still owed; it can't eat into money already received.
    const extraDiscount = round2(Math.min(Number(discountIn) || 0, prev.tyreAmount) - prev.discount);
    if (extraDiscount > prev.pendingAmount) {
      throw httpError(`A ₹${extraDiscount.toLocaleString("en-IN")} discount is more than the ₹${prev.pendingAmount.toLocaleString("en-IN")} still owed`);
    }
    const next = computeTotals({ ...existing, discount: discountIn, receivedAmount: prev.receivedAmount + pay });
    const applied = round2(next.receivedAmount - Math.min(prev.receivedAmount, next.payableTotal));
    const discountChanged = discount != null && next.discount !== round2(Number(existing.discount) || 0);
    if (!(applied > 0) && !discountChanged) {
      throw httpError(prev.pendingAmount <= 0 ? "This challan is already fully paid" : "Enter a payment amount and/or a discount");
    }
    if (applied > 0) log.push({ date: now, amount: applied, mode: paymentMode });
    base = { ...existing, discount: next.discount, receivedAmount: next.receivedAmount };
  }

  const totals = computeTotals(base);
  const set = {
    installments: totals.installments,
    discount: totals.discount,
    receivedAmount: totals.receivedAmount,
    tyreAmount: totals.tyreAmount,
    interestTotal: totals.interestTotal,
    payableTotal: totals.payableTotal,
    pendingAmount: totals.pendingAmount,
    status: totals.status,
    nextDueDate: totals.nextDueDate,
    payments: log,
    updatedAt: now,
  };
  await saveIfUnchanged(db, existing, set);
  const saved = { ...existing, ...set };
  await syncBonus(clientId, saved);
  return enrich(saved);
}

export async function getTyreBillById(clientId, id) {
  const db = await connectDB();
  const doc = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  return enrich(doc);
}

// ---------------------------------------------------------------------------
// Lists, export, dashboard
// ---------------------------------------------------------------------------

const TYRE_SORT = {
  billNo: "billNo",
  date: "billDate",
  vehicle: "vehicleNumber",
  customer: "customerName",
  agent: "mechanicName",
  type: "paymentType",
  total: "payableTotal",
  rec: "receivedAmount",
  pend: "pendingAmount",
  status: "status",
  // Challans with nothing scheduled (full payment, or every installment paid) go last in both directions, so
  // "next due" always starts with the challans that actually have a due date.
  due: (dir) => ({ $ifNull: ["$nextDueDate", dir === 1 ? new Date("9999-12-31T00:00:00Z") : new Date(0)] }),
};

// One search box over every text field on the challan (and the D.C. number when the text is a number).
// Vehicle numbers are typed both with and without spaces ("TN 58 AB 1234" / "TN58AB1234"), so a search matches
// either way: the typed characters in order, with any spaces between them.
const vehicleRx = (text) => {
  const chars = String(text).replace(/\s+/g, "").split("");
  return { $regex: chars.map((c) => escapeRegex(c)).join("\\s*"), $options: "i" };
};

function searchClause(search) {
  const text = String(search || "").trim();
  if (!text) return null;
  const rx = { $regex: escapeRegex(text), $options: "i" };
  const or = [
    { vehicleNumber: vehicleRx(text) }, { customerName: rx }, { phoneNumber: rx }, { address: rx }, { mechanicName: rx },
    { labourName: rx }, { "items.particulars": rx }, { "items.tyreNumber": rx }, { notes: rx },
  ];
  if (/^\d+$/.test(text)) or.push({ billNo: Number(text) });
  return { $or: or };
}

export function buildTyreQuery(
  clientId,
  { vehicleNumber = "", customerName = "", mechName = "", fromDate = "", toDate = "", status = "", paymentType = "", brandRef = "", overdue = false, search = "" } = {},
  now = new Date()
) {
  const query = { clientId: toClientId(clientId) };
  const s = searchClause(search);
  if (s) Object.assign(query, s);
  if (String(vehicleNumber).trim()) query.vehicleNumber = vehicleRx(vehicleNumber);
  if (customerName) query.customerName = { $regex: escapeRegex(customerName), $options: "i" };
  if (mechName) query.mechanicName = String(mechName);
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  if (status) query.status = String(status);
  if (paymentType === "full" || paymentType === "installment") query.paymentType = paymentType;
  if (brandRef) query["items.brandRef"] = String(brandRef);
  // Overdue: the earliest unpaid installment was due before today.
  if (overdue) query.nextDueDate = { $lte: new Date(startOfDayUtc(todayOf(now)).getTime() - 1) };
  return query;
}

export async function getAllTyreBills(clientId, filters = {}, page = 1, limit = 10, sortQuery = {}) {
  const db = await connectDB();
  const coll = db.collection(COLLECTION);
  const query = buildTyreQuery(clientId, filters);
  const [total, bills] = await Promise.all([
    countMatching(coll, query),
    findSortedPage(coll, query, parseSort(sortQuery, TYRE_SORT, { createdAt: -1 }), (page - 1) * limit, limit),
  ]);
  return { total, page, totalPages: Math.ceil(total / limit) || 1, tyreBillData: bills.map((b) => enrich(b)) };
}

export async function getAllTyreBillsForExport(clientId, filters = {}, sortQuery = {}) {
  const db = await connectDB();
  const query = buildTyreQuery(clientId, filters);
  const order = parseSort(sortQuery, TYRE_SORT, { billDate: -1 });
  // The export follows the order chosen on screen; a computed key (next due) needs the aggregation path.
  const bills = order.computed
    ? await findSortedPage(db.collection(COLLECTION), query, order, 0, 1_000_000)
    : await db.collection(COLLECTION).find(query, { collation: SORT_COLLATION }).sort(order.sort).toArray();
  return bills.map((b) => enrich(b));
}

/**
 * Installment follow-up for the dashboard, over ALL of the tenant's challans (not the dashboard date filter: an
 * installment from an old challan that is overdue today still needs chasing). Returns totals plus the list of
 * unpaid rows that are overdue or due by the end of this month, earliest first.
 */
export async function getInstallmentFollowUp(clientId, now = new Date(), limit = 100) {
  const db = await connectDB();
  const today = todayOf(now);
  const monthEnd = moment.utc(today).endOf("month");
  const bills = await db
    .collection(COLLECTION)
    .find({ clientId: toClientId(clientId), paymentType: "installment", nextDueDate: { $lte: monthEnd.toDate() } })
    .toArray();

  const rows = [];
  let overdueAmount = 0;
  let dueThisMonth = 0;
  const overdueBills = new Set();
  for (const b of bills) {
    const e = enrich(b, now);
    for (const r of e.installments) {
      if (r.balance <= 0 || moment.utc(r.dueDate).isAfter(monthEnd)) continue;
      const overdue = dayOf(r.dueDate) < today;
      if (overdue) {
        overdueAmount += r.balance;
        overdueBills.add(String(b._id));
      } else {
        dueThisMonth += r.balance;
      }
      rows.push({
        billId: String(b._id),
        billNo: b.billNo,
        customerName: b.customerName,
        phoneNumber: b.phoneNumber,
        vehicleNumber: e.vehicleNumber,
        installmentId: r.id,
        label: r.label,
        dueDate: r.dueDate,
        balance: r.balance,
        overdue,
      });
    }
  }
  rows.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return {
    overdueAmount: round2(overdueAmount),
    overdueBills: overdueBills.size,
    dueThisMonth: round2(dueThisMonth),
    rows: rows.slice(0, limit),
  };
}

export async function getTyreAnalytics(clientId, filters = {}) {
  const db = await connectDB();
  const cfg = await getTyreSettings(clientId);
  const query = buildTyreQuery(clientId, filters);
  const num = (f) => ({ $cond: [{ $isNumber: f }, f, 0] });

  const [result] = await db.collection(COLLECTION).aggregate([
    { $match: query },
    {
      $facet: {
        kpis: [
          {
            $group: {
              _id: null,
              totalBills: { $sum: 1 },
              tyreRevenue: { $sum: num("$tyreAmount") },
              interestTotal: { $sum: num("$interestTotal") },
              payableTotal: { $sum: num("$payableTotal") },
              totalCollected: { $sum: num("$receivedAmount") },
              totalPending: { $sum: num("$pendingAmount") },
              totalDiscount: { $sum: num("$discount") },
              installmentBills: { $sum: { $cond: [{ $eq: ["$paymentType", "installment"] }, 1, 0] } },
              tyresSold: { $sum: { $sum: "$items.qty" } },
            },
          },
        ],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$billDate" } },
              revenue: { $sum: num("$payableTotal") },
              collected: { $sum: num("$receivedAmount") },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, month: "$_id", revenue: 1, collected: 1, count: 1 } },
          { $sort: { month: 1 } },
        ],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: num("$payableTotal") } } },
          { $project: { _id: 0, status: "$_id", count: 1, revenue: 1 } },
        ],
        // Grouped by the brand's stored value, like the brand filter and the inventory: a brand renamed in Settings
        // keeps its value, so its old and new challans stay one bar (grouping by the printed name split them).
        byBrand: [
          { $unwind: "$items" },
          {
            $group: {
              _id: { $ifNull: ["$items.brandRef", { $concat: ["~", { $ifNull: ["$items.brandLabel", ""] }] }] },
              label: { $last: "$items.brandLabel" },
              qty: { $sum: "$items.qty" },
              revenue: { $sum: "$items.amount" },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ],
        topMechanics: [
          { $match: { mechanicName: { $nin: [null, ""] } } },
          { $group: { _id: "$mechanicName", count: { $sum: 1 }, revenue: { $sum: num("$tyreAmount") } } },
          { $project: { _id: 0, mechanic: "$_id", count: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]).toArray();

  const raw = (result?.kpis || [])[0] || {
    totalBills: 0, tyreRevenue: 0, interestTotal: 0, payableTotal: 0, totalCollected: 0, totalPending: 0,
    totalDiscount: 0, installmentBills: 0, tyresSold: 0,
  };
  const kpis = {
    ...raw,
    collectionRate: raw.payableTotal > 0 ? Math.round((raw.totalCollected / raw.payableTotal) * 1000) / 10 : 0,
    avgBillValue: raw.totalBills > 0 ? round2(raw.payableTotal / raw.totalBills) : 0,
  };
  delete kpis._id;

  return {
    kpis,
    byMonth: result?.byMonth || [],
    byStatus: result?.byStatus || [],
    // Shown under the brand's current name; a brand removed from Settings keeps the name on its challans.
    byBrand: (result?.byBrand || []).map((r) => ({
      brand: (cfg.brands || []).find((x) => x.value === r._id)?.label || r.label,
      qty: r.qty,
      revenue: r.revenue,
    })),
    topMechanics: result?.topMechanics || [],
    installments: await getInstallmentFollowUp(clientId),
  };
}

// Mechanic dropdown source: the Settings list merged with names already used on challans.
export async function getAllTyreMechanics(clientId) {
  const db = await connectDB();
  const settings = await getSettings(clientId);
  const configured = Array.isArray(settings?.mechanics) ? settings.mechanics : [];
  const fromBills = await db
    .collection(COLLECTION)
    .find({ clientId: toClientId(clientId) })
    .project({ mechanicName: 1 })
    .toArray();
  const names = new Set(configured.filter(Boolean));
  fromBills.forEach((b) => { if (b.mechanicName) names.add(b.mechanicName); });
  return [...names].sort((a, b) => a.localeCompare(b));
}
