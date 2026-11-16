import { ObjectId } from "mongodb";
import { connectDB } from "../../config/db.js";
import { getSettings } from "../../dao/settings.dao.js";
import { toClientId } from "../../utils/tenant.js";
import { toWaNumber } from "../../utils/waPhone.js";
import {
  BILL_COLLECTIONS, getAccount, accountContext, isWhatsAppEnabled, logMessage, updateMessage, getMessage, findMessage, claimMessage,
  findByProviderId, setBillWhatsapp,
} from "../../dao/whatsapp.dao.js";
import { getProvider } from "./providers/index.js";
import {
  billDocumentComponents, receiptComponents, receiptDocumentComponents, summaryComponents, connectionTestComponents, fmtDate, money,
} from "./templates.js";
import { getRadiatorAnalytics } from "../../dao/radiator.dao.js";
import { getAutoAnalytics } from "../../dao/autobill.dao.js";
import { getEngAnalytics } from "../../dao/engbill.dao.js";
import { getTyreAnalytics } from "../../dao/tyrebill.dao.js";

// Every send path: enabled -> company switch -> template approved -> valid number -> send -> log -> bill summary.
// A message is logged once and its row carries everything needed to (re)send it, so retries share one code path.

const IST_MS = 5.5 * 3600 * 1000;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000]; // up to three retries after the first attempt
const MAX_PDF_BYTES = 2 * 1024 * 1024;

export const istYmd = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
export const istDayStart = (ymd) => new Date(Date.parse(`${ymd}T00:00:00Z`) - IST_MS);

const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const templateApproved = (account, name) => account?.templates?.[name]?.status === "APPROVED";
const summaryOf = (m) => ({ id: String(m._id), status: m.status, at: m.statusAt || m.at, error: m.error || "", kind: m.kind });

async function enabledAccount(clientId) {
  if (!(await isWhatsAppEnabled(clientId))) return null;
  return getAccount(clientId);
}

async function waSettings(clientId) {
  const s = await getSettings(clientId);
  return { settings: s, wa: s?.whatsapp || {}, company: s?.company?.name || "our shop", phone1: s?.company?.phone1 || "" };
}

function syncBill(m) {
  if (!BILL_COLLECTIONS[m.refType] || m.status === "awaiting_pdf") return Promise.resolve();
  return setBillWhatsapp(m.clientId, m.refType, m.refId, summaryOf(m)).catch((e) => console.error("WhatsApp bill summary failed:", e.message));
}

function componentsFor(m, mediaId) {
  const p = m.payload || {};
  switch (m.template) {
    case "bill_document": return billDocumentComponents({ ...p, mediaId, filename: m.filename });
    case "payment_receipt": return receiptComponents(p);
    case "payment_receipt_document": return receiptDocumentComponents(p, mediaId, m.filename);
    case "owner_daily_summary": return summaryComponents(p);
    case "connection_test": return connectionTestComponents(p);
    default: throw httpError(`Unknown template ${m.template}`);
  }
}

// One send attempt for a logged message; records success, a retry, or the final failure.
async function attempt(account, m) {
  const now = new Date();
  const attempts = (m.attempts || 0) + 1;
  try {
    const provider = getProvider(account.provider || "meta");
    const ctx = accountContext(account);
    let mediaId = m.mediaId;
    if (m.pdfB64 && !mediaId) {
      mediaId = await provider.uploadDocument(ctx, Buffer.from(m.pdfB64, "base64"), m.filename);
      await updateMessage(m._id, { mediaId }); // a retry reuses the upload
    }
    const id = m.kind === "autoreply"
      ? await provider.sendText(ctx, m.to, m.text)
      : await provider.sendTemplate(ctx, m.to, m.template, "en", componentsFor(m, mediaId));
    const set = { status: "sent", providerMessageId: id, error: "", attempts, nextAttemptAt: null, statusAt: now, mediaId: mediaId || null, pdfB64: null };
    await updateMessage(m._id, set);
    const done = { ...m, ...set };
    await syncBill(done);
    return summaryOf(done);
  } catch (err) {
    const retryable = !!err.retryable && attempts <= RETRY_DELAYS_MS.length;
    const set = {
      status: retryable ? "pending" : "failed",
      error: err.message || "Send failed",
      attempts,
      nextAttemptAt: retryable ? new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]) : null,
      statusAt: now,
    };
    if (!retryable) set.pdfB64 = null; // nothing will send it again; Resend builds a new PDF
    await updateMessage(m._id, set);
    const done = { ...m, ...set };
    await syncBill(done);
    return summaryOf(done);
  }
}

// Checks template and number, then logs the message (pending by default). Returns { m } to send, or { failed } when it was logged as failed.
async function prepare(account, entry, { pdf = null, status = "pending", needTemplate = true } = {}) {
  const { rawPhone, ...rest } = entry;
  const fail = async (error, to) => ({ failed: summaryOf(await logMessage({ ...rest, to: to || String(rawPhone ?? ""), status: "failed", error, statusAt: new Date() })) });
  if (needTemplate && !templateApproved(account, entry.template)) return fail(`Template ${entry.template} is not approved yet`);
  const to = toWaNumber(rawPhone);
  if (!to) return fail("No valid WhatsApp number");
  const withPdf = pdf && pdf.length <= MAX_PDF_BYTES ? { pdfB64: pdf.toString("base64") } : {};
  return { m: await logMessage({ ...rest, to, status, ...withPdf }) };
}

// ---- bills ----------------------------------------------------------------

const sumOf = (rows, key) => (rows || []).reduce((s, r) => s + Number(r?.[key] || 0), 0);

// The few facts a message needs from a bill of any vertical.
export function describeBill(vertical, d) {
  let customer; let ref; let phone; let total; let balance;
  if (vertical === "engineering") {
    customer = d.vehicleNo; ref = `Bill ${d.billNo}`; phone = d.phone; total = d.netTotal; balance = d.balance;
  } else if (vertical === "tyre") {
    customer = d.customerName; ref = `Challan ${d.billNo}`; phone = d.phoneNumber; total = d.payableTotal; balance = d.pendingAmount;
  } else {
    const radiator = vertical === "radiator";
    const gross = sumOf(radiator ? d.serviceInfo : d.items, radiator ? "price" : "amount");
    const net = Math.max(gross - Math.max(Number(d.discount) || 0, 0), 0);
    const legacy = radiator && d.status === "Received" ? gross : 0;
    const received = Math.min(typeof d.receivedAmount === "number" ? d.receivedAmount : legacy, net);
    customer = radiator ? d.transportName : d.customerName;
    ref = radiator ? `Bill ${d.truckNumber}` : `Bill ${d.billNo}`;
    phone = d.phoneNumber; total = net; balance = Math.max(net - received, 0);
  }
  return { customer: customer || "Customer", ref, phone, total, balance, date: d.billDate };
}

async function loadBill(clientId, vertical, billId) {
  const coll = BILL_COLLECTIONS[vertical];
  if (!coll) throw httpError("Unknown bill type");
  if (!ObjectId.isValid(String(billId))) throw httpError("Invalid record id");
  const db = await connectDB();
  const bill = await db.collection(coll).findOne({ _id: new ObjectId(String(billId)), clientId: toClientId(clientId) });
  if (!bill) throw httpError("Bill not found", 404);
  return bill;
}

// Explicit send of a bill / challan PDF (the browser built it). Always sends when called.
export async function sendBill(clientId, vertical, billId, pdfBuffer, { updated = false, actor = "" } = {}) {
  const account = await enabledAccount(clientId);
  if (!account) throw httpError("WhatsApp is not enabled for this company", 403);
  const bill = await loadBill(clientId, vertical, billId);
  const { company } = await waSettings(clientId);
  const d = describeBill(vertical, bill);
  const word = updated ? "updated bill" : vertical === "tyre" ? "delivery challan" : "bill";
  const r = await prepare(account, {
    clientId, kind: updated ? "bill_update" : "bill", refType: vertical, refId: String(billId), template: "bill_document",
    rawPhone: d.phone, actor, filename: `${d.ref.replace(/[^\w.-]+/g, "_")}.pdf`,
    payload: { customer: d.customer, word, company, date: d.date, total: d.total, balance: d.balance },
  }, { pdf: pdfBuffer });
  if (r.failed) { await syncBill({ clientId, refType: vertical, refId: String(billId), ...r.failed }); return r.failed; }
  return attempt(account, r.m);
}

// ---- receipts -------------------------------------------------------------

const MODE_LABELS = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank transfer", other: "Other" };

// Facts for one payment's receipt. `bill` is the bill after the payment (enriched, or a raw engineering / tyre bill).
export function describeReceipt(vertical, bill, { amount, mode, installmentId }) {
  const d = describeBill(vertical, bill);
  const id = String(bill._id);
  let key; let paymentIndex = null; let extra = "-";
  if (vertical === "engineering" || vertical === "tyre") {
    paymentIndex = Math.max((bill.payments || []).length - 1, 0);
    key = `${id}:${paymentIndex}`;
  } else {
    key = `${id}:${Number(bill.receivedAmount) || 0}`; // no payments log on these bills: the running total identifies the payment
  }
  if (vertical === "tyre") {
    const row = installmentId ? (bill.installments || []).find((r) => r.id === installmentId) : null;
    const next = bill.nextDue;
    const parts = [];
    if (row) parts.push(row.label);
    if (bill.paymentType === "installment") parts.push(next ? `next due ${next.label} on ${fmtDate(next.dueDate)} (${money(next.amount)})` : "all installments paid");
    if (parts.length) extra = parts.join(", ");
  }
  return {
    key, paymentIndex, rawPhone: d.phone,
    payload: { amount, mode: MODE_LABELS[mode] || (mode ? String(mode) : "-"), ref: d.ref, balance: d.balance, extra },
  };
}

// Called after a successful payment. Returns { receiptId, done }: receiptId is set when the browser should
// upload the updated bill PDF (receiptPdf on); otherwise the text receipt is sent in the background (`done`).
// Never throws: a WhatsApp problem must not turn a recorded payment into an error.
export async function queueReceipt(clientId, vertical, bill, payment) {
  try {
    return await queueReceiptInner(clientId, vertical, bill, payment);
  } catch (e) {
    console.error("WhatsApp receipt not queued:", e.message);
    return { receiptId: null, done: Promise.resolve(null) };
  }
}

async function queueReceiptInner(clientId, vertical, bill, payment) {
  const none = { receiptId: null, done: Promise.resolve(null) };
  const amount = Number(payment?.amount) || 0;
  if (!(amount > 0)) return none; // a discount-only entry sends nothing
  const account = await enabledAccount(clientId);
  if (!account) return none;
  const { wa, company } = await waSettings(clientId);
  if (!wa.receipt) return none;
  const r = describeReceipt(vertical, bill, payment);
  const refId = String(bill._id);
  const dup = await findMessage({ clientId: toClientId(clientId), kind: "receipt", receiptKey: r.key });
  if (dup) return { receiptId: dup.status === "awaiting_pdf" ? String(dup._id) : null, done: Promise.resolve(summaryOf(dup)) };

  const wantPdf = !!wa.receiptPdf && templateApproved(account, "payment_receipt_document");
  const entry = {
    clientId, kind: "receipt", refType: vertical, refId, paymentIndex: r.paymentIndex, receiptKey: r.key,
    template: wantPdf ? "payment_receipt_document" : "payment_receipt", rawPhone: r.rawPhone,
    filename: `${r.payload.ref.replace(/[^\w.-]+/g, "_")}.pdf`, payload: { ...r.payload, company },
  };
  const p = await prepare(account, entry, { status: wantPdf ? "awaiting_pdf" : "pending" });
  if (p.failed) { await syncBill({ clientId, refType: vertical, refId, ...p.failed }); return { receiptId: null, done: Promise.resolve(p.failed) }; }
  if (wantPdf) return { receiptId: String(p.m._id), done: Promise.resolve(null) };
  return { receiptId: null, done: attempt(account, p.m).catch((e) => console.error("WhatsApp receipt failed:", e.message)) };
}

// The browser's PDF for a pending receipt arrives: send the receipt with the bill attached.
export async function attachReceiptPdf(clientId, receiptId, pdfBuffer) {
  const m = await getMessage(receiptId);
  if (!m || String(m.clientId) !== String(clientId) || m.kind !== "receipt") throw httpError("Receipt not found", 404);
  if (m.status !== "awaiting_pdf") throw httpError("This receipt is no longer waiting for a PDF", 409);
  const account = await enabledAccount(clientId);
  if (!account) throw httpError("WhatsApp is not enabled for this company", 403);
  // Taken in one step, so a second upload or the scheduler's text fallback can't send the same receipt too.
  const claimed = await claimMessage(m._id, "awaiting_pdf", { status: "pending", pdfB64: pdfBuffer.length <= MAX_PDF_BYTES ? pdfBuffer.toString("base64") : null });
  if (!claimed) throw httpError("This receipt is no longer waiting for a PDF", 409);
  return attempt(account, claimed);
}

// No PDF came in time: send the text-only receipt instead.
export async function fallbackReceiptToText(m) {
  const account = await enabledAccount(m.clientId);
  if (!account) {
    await updateMessage(m._id, { status: "failed", error: "WhatsApp is not enabled for this company", statusAt: new Date() });
    return;
  }
  if (!templateApproved(account, "payment_receipt")) {
    const set = { status: "failed", error: "Template payment_receipt is not approved yet", statusAt: new Date() };
    await updateMessage(m._id, set);
    await syncBill({ ...m, ...set });
    return;
  }
  const claimed = await claimMessage(m._id, "awaiting_pdf", { status: "pending", template: "payment_receipt", pdfB64: null });
  if (claimed) await attempt(account, claimed); // otherwise the browser's PDF arrived just now and is sending it
}

// Retry of a message the queue holds (scheduler).
export async function retryMessage(m) {
  const account = await enabledAccount(m.clientId);
  if (!account) {
    await updateMessage(m._id, { status: "failed", error: "WhatsApp is not enabled for this company", nextAttemptAt: null, statusAt: new Date() });
    return null;
  }
  return attempt(account, m);
}

// ---- owner summary / test / auto-reply ------------------------------------

// Today's figures from the vertical's own analytics (bills dated that day), plus overdue installments for tyre.
export async function summaryFigures(clientId, vertical, ymd) {
  const f = { fromDate: ymd, toDate: ymd };
  if (vertical === "engineering") {
    const { kpis } = await getEngAnalytics(clientId, f);
    return { bills: kpis.totalBills, billed: kpis.totalBilled, collected: kpis.totalReceived, pending: kpis.totalOutstanding, overdue: null };
  }
  if (vertical === "tyre") {
    const { kpis, installments } = await getTyreAnalytics(clientId, f);
    return { bills: kpis.totalBills, billed: kpis.payableTotal, collected: kpis.totalCollected, pending: kpis.totalPending, overdue: installments?.overdueAmount ?? 0 };
  }
  const { kpis } = vertical === "automobile" ? await getAutoAnalytics(clientId, f) : await getRadiatorAnalytics(clientId, f);
  return { bills: kpis.totalBills, billed: kpis.totalRevenue, collected: kpis.totalCollected, pending: kpis.totalPending, overdue: null };
}

export async function sendOwnerSummary(clientId, ymd) {
  const skipped = (error) => ({ status: "skipped", error, kind: "summary" });
  const account = await enabledAccount(clientId);
  if (!account) return skipped("WhatsApp is not enabled for this company");
  const { settings, wa, company } = await waSettings(clientId);
  if (!wa.ownerSummary) return skipped("Daily summary is switched off");
  if (await findMessage({ clientId: toClientId(clientId), kind: "summary", refId: ymd })) return skipped("Already sent for this date");
  const figures = await summaryFigures(clientId, settings?.businessType || "radiator", ymd);
  if (!figures.bills && !figures.collected) return skipped("No activity today");
  const r = await prepare(account, {
    clientId, kind: "summary", refType: "summary", refId: ymd, template: "owner_daily_summary", rawPhone: wa.ownerPhone,
    payload: { company, date: istDayStart(ymd).toISOString(), ...figures },
  });
  return r.failed || attempt(account, r.m);
}

export async function sendTest(clientId) {
  const account = await enabledAccount(clientId);
  if (!account) throw httpError("WhatsApp is not enabled for this company", 403);
  const { wa, company } = await waSettings(clientId);
  const r = await prepare(account, { clientId, kind: "test", refType: "test", refId: "test", template: "connection_test", rawPhone: wa.ownerPhone, payload: { company } });
  return r.failed || attempt(account, r.m);
}

// A customer wrote to the shop's number: one free-form reply per sender per IST day.
export async function autoReply(account, from) {
  if (!account?.enabled || !from) return null;
  const clientId = account.clientId;
  const since = istDayStart(istYmd());
  if (await findMessage({ clientId: toClientId(clientId), kind: "autoreply", to: String(from), at: { $gte: since } })) return null;
  const { company, phone1 } = await waSettings(clientId);
  const text = `This number only sends bills from ${company}. ${phone1 ? `For any query please call ${phone1}.` : "For any query please contact the shop directly."}`;
  const m = await logMessage({ clientId, kind: "autoreply", refType: "autoreply", refId: String(from), to: String(from), text, status: "pending" });
  return attempt(account, m);
}

// ---- webhook statuses -----------------------------------------------------

const RANK = { pending: 0, awaiting_pdf: 0, sent: 1, delivered: 2, read: 3 };

// Statuses from a webhook already verified with this company's app secret; only that company's messages change.
export async function applyStatuses(statuses, clientId) {
  for (const s of statuses) {
    const m = await findByProviderId(s.id, clientId);
    if (!m) continue;
    let set;
    if (s.status === "failed") set = { status: "failed", error: s.errorText || "Delivery failed", statusAt: s.timestamp || new Date() };
    else if (m.status === "failed") continue; // a failure is final: a late "sent" must not hide it
    else if (s.status in RANK && RANK[s.status] > (RANK[m.status] ?? 0)) set = { status: s.status, error: "", statusAt: s.timestamp || new Date() };
    if (!set) continue;
    await updateMessage(m._id, set);
    await syncBill({ ...m, ...set });
  }
}
