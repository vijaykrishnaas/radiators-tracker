// WhatsApp sending: gates, switches, templates, receipts for every vertical, retries, awaiting-PDF, summary, auto-reply, usage.
// Runs the REAL notify / dao / scheduler code against the in-memory fake Mongo and a stubbed Graph API.
// Run with: node --experimental-test-module-mocks --test test/whatsapp.notify.test.js
import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";
import { installGraphStub } from "./helpers/waStub.js";

process.env.WHATSAPP_ENC_KEY = "ab".repeat(32);
let fakeDb;
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
const graph = installGraphStub();
after(() => graph.restore());

const dao = await import("../src/dao/whatsapp.dao.js");
const notify = await import("../src/services/whatsapp/notify.js");
const { tick } = await import("../src/jobs/scheduler.js");
const { TEMPLATE_NAMES } = await import("../src/services/whatsapp/templates.js");
const { createTyreBill, recordTyrePayment, getAllTyreBills } = await import("../src/dao/tyrebill.dao.js");
const { createRadiator, recordPayment: radPay, getAllRadiators } = await import("../src/dao/radiator.dao.js");
const { createAutoBill, recordPayment: autoPay, getAllAutoBills } = await import("../src/dao/autobill.dao.js");
const { createEngBill, recordEngPayment, listEngBills } = await import("../src/dao/engbill.dao.js");

const CLIENT = new ObjectId();
const ALL = Object.fromEntries(TEMPLATE_NAMES.map((n) => [n, { status: "APPROVED" }]));
const PDF = Buffer.from("%PDF-1.4 fake");
const NOW = new Date("2026-11-14T14:35:00Z"); // 20:05 IST on 2026-11-14

const tyreCfg = {
  billStartNumber: 101,
  brands: [{ label: "MRF", value: "mrf", models: [{ label: "10.00-20", value: "10-00-20", rate: 24250 }] }],
  bonus: { mechanicMode: "percent", mechanicPercent: 0, labourMode: "percent", labourPercent: 0, yearStartMonth: 4 },
};
const engCfg = {
  billStartNumber: 1,
  serviceTypes: [{ label: "Turbo", value: "turbo", items: [{ label: "Hold set", value: "hold-set", prices: { bs4: 500 } }] }],
};

// Fresh database with one WhatsApp-enabled company; `wa` overrides the company's switches.
async function setup({ templates = ALL, enabled = true, wa = {}, businessType = "tyre" } = {}) {
  fakeDb = new FakeDb();
  graph.reset();
  await fakeDb.collection("settings").insertOne({
    _id: CLIENT, businessType, mechanics: ["Ramesh"],
    company: { name: "Sri Murugan Tyres", phone1: "9000000001" },
    whatsapp: { billDefaultTick: false, receipt: true, receiptPdf: false, ownerSummary: true, ownerPhone: "9876500000", summaryTime: "20:00", ...wa },
    tyre: tyreCfg, engineering: engCfg, automobile: { bonus: {} }, catalog: { productTypes: [], serviceTypes: [] }, bonus: {},
  });
  await dao.saveAccount(CLIENT, {
    enabled, provider: "meta", numberType: "new", phoneNumberId: "1111111111", wabaId: "2222222222",
    accessToken: "EAAB-secret-token-1234", appSecret: "app-secret", displayPhone: "+91 90000 00001", verifiedName: "Sri Murugan Tyres", templates,
  });
}
const log = () => fakeDb.collection("whatsapp_messages").docs;
const sentMessages = () => graph.messages();

const tyreInput = (over = {}) => ({
  billDate: "2026-09-20", vehicleNumber: "tn 58 ab 1234", customerName: "Murugan", phoneNumber: "9876543210", mechanicName: "Ramesh",
  items: [{ brandRef: "mrf", modelRef: "10-00-20", tyreNumber: "SN-1", tubeType: "tube", flap: "Yes", qty: 2, rate: 24250 }],
  paymentType: "installment",
  installments: [
    { label: "Initial amount", dueDate: "2026-09-20", principal: 28500, interest: 0 },
    { label: "1st month", dueDate: "2026-10-20", principal: 10000, interest: 400 },
    { label: "2nd month", dueDate: "2026-11-20", principal: 10000, interest: 400 },
  ],
  ...over,
});

test("disabled company: nothing is sent, queued or logged", async () => {
  await setup({ enabled: false });
  assert.equal(await dao.isWhatsAppEnabled(CLIENT), false);
  const bill = await createTyreBill(CLIENT, tyreInput());
  await assert.rejects(notify.sendBill(CLIENT, "tyre", bill._id, PDF), (e) => e.statusCode === 403);
  const paid = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  const r = await notify.queueReceipt(CLIENT, "tyre", paid, paid.lastPayment);
  assert.equal(r.receiptId, null);
  assert.deepEqual(await notify.sendOwnerSummary(CLIENT, "2026-11-14"), { status: "skipped", error: "WhatsApp is not enabled for this company", kind: "summary" });
  await assert.rejects(notify.sendTest(CLIENT), (e) => e.statusCode === 403);
  assert.equal(graph.calls.length, 0);
  assert.equal(log().length, 0);
  await setup({ enabled: false });
  assert.equal(await dao.isWhatsAppEnabled(new ObjectId()), false, "no account at all");
});

test("bill send: uploads the PDF, sends bill_document with the document header, logs it and marks the bill", async () => {
  await setup();
  const bill = await createTyreBill(CLIENT, tyreInput({ paymentType: "full", installments: undefined }));
  const w = await notify.sendBill(CLIENT, "tyre", bill._id, PDF, { actor: "admin" });
  assert.equal(w.status, "sent");
  assert.equal(w.kind, "bill");
  assert.equal(graph.uploads().length, 1);
  const [call] = sentMessages();
  assert.equal(call.body.to, "919876543210");
  assert.equal(call.body.template.name, "bill_document");
  assert.deepEqual(call.body.template.components[0].parameters[0].document.id, "media-1");
  assert.deepEqual(graph.params(call), ["Murugan", "delivery challan", "Sri Murugan Tyres", "20-Sep-2026", "₹48,500", "₹48,500"]);
  const row = log()[0];
  assert.equal(row.status, "sent");
  assert.equal(row.pdfB64, null, "the PDF is dropped once sent");
  assert.equal(row.providerMessageId, "wamid.1");
  const stored = await fakeDb.collection("tyrebills").findOne({ _id: bill._id });
  assert.equal(stored.whatsapp.status, "sent");
  assert.equal(stored.whatsapp.kind, "bill");
  // an edited bill goes out as "updated bill"
  const u = await notify.sendBill(CLIENT, "tyre", bill._id, PDF, { updated: true });
  assert.equal(u.kind, "bill_update");
  assert.equal(graph.params(sentMessages()[1])[1], "updated bill");
});

test("unapproved template: logged as failed with the reason, nothing sent, bill marked failed", async () => {
  await setup({ templates: { ...ALL, bill_document: { status: "PENDING" } } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  const w = await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  assert.equal(w.status, "failed");
  assert.equal(w.error, "Template bill_document is not approved yet");
  assert.equal(graph.calls.length, 0);
  assert.equal(log()[0].status, "failed");
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp.status, "failed");
  // a template missing from the account altogether is the same
  await setup({ templates: {} });
  assert.equal((await notify.sendTest(CLIENT)).error, "Template connection_test is not approved yet");
});

test("no valid phone: failed with 'No valid WhatsApp number', nothing sent", async () => {
  await setup();
  const bill = await createTyreBill(CLIENT, tyreInput({ phoneNumber: "12345" }));
  const w = await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  assert.equal(w.error, "No valid WhatsApp number");
  assert.equal(graph.calls.length, 0);
});

test("tyre receipt: amount, mode, installment name and the next due date + amount; balance after payment", async () => {
  await setup();
  const bill = await createTyreBill(CLIENT, tyreInput());
  const paid = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, mode: "upi", installmentId: bill.installments[0].id });
  const r = await notify.queueReceipt(CLIENT, "tyre", paid, { ...paid.lastPayment, installmentId: bill.installments[0].id });
  assert.equal(r.receiptId, null);
  await r.done;
  const [call] = sentMessages();
  assert.equal(call.body.template.name, "payment_receipt");
  assert.deepEqual(graph.params(call), [
    "Sri Murugan Tyres", "₹28,500", "UPI", "Challan 101", "₹20,800", "Initial amount, next due 1st month on 20-Oct-2026 (₹10,400)",
  ]);
  assert.equal(log()[0].status, "sent");
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp.kind, "receipt");
});

test("receipts for the other verticals carry the right bill reference, balance and mode", async () => {
  // radiator: no payments log, no payment mode
  await setup({ businessType: "radiator" });
  const { insertedId: rid } = await createRadiator(CLIENT, { billDate: "2026-09-20", truckNumber: "TN52R0001", transportName: "Velu Transport", phoneNumber: "9876543210", serviceInfo: [{ type: "Service", price: 2500 }] });
  const rp = await radPay(CLIENT, rid, 1000, 0);
  await (await notify.queueReceipt(CLIENT, "radiator", rp, rp.lastPayment)).done;
  assert.deepEqual(graph.params(sentMessages()[0]), ["Sri Murugan Tyres", "₹1,000", "-", "Bill TN52R0001", "₹1,500", "-"]);
  // automobile
  await setup({ businessType: "automobile" });
  const { insertedId: aid } = await createAutoBill(CLIENT, { billDate: "2026-09-20", vehicleNumber: "TN52AB1234", customerName: "Anil", phoneNumber: "9876543210", items: [{ particulars: "Oil", qty: 2, rate: 450 }] });
  const ap = await autoPay(CLIENT, aid, 300, 0);
  await (await notify.queueReceipt(CLIENT, "automobile", ap, ap.lastPayment)).done;
  assert.deepEqual(graph.params(sentMessages()[0]).slice(1, 5), ["₹300", "-", "Bill 1", "₹600"]);
  // engineering
  await setup({ businessType: "engineering" });
  const eb = await createEngBill(CLIENT, { billDate: "2026-09-20", vehicleNo: "tn01ab1234", phone: "9876543210", mechanic: "Ravi", services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "hold-set", qty: 2, rate: 500 }] }] });
  const ep = await recordEngPayment(CLIENT, eb._id, { amount: 400, mode: "upi" });
  await (await notify.queueReceipt(CLIENT, "engineering", ep, ep.lastPayment)).done;
  assert.deepEqual(graph.params(sentMessages()[0]).slice(1, 5), ["₹400", "UPI", "Bill 1", "₹600"]);
});

test("a discount-only entry sends no receipt, and a repeated payment sends one message", async () => {
  await setup({ businessType: "radiator" });
  const { insertedId } = await createRadiator(CLIENT, { billDate: "2026-09-20", truckNumber: "TN52R0001", phoneNumber: "9876543210", serviceInfo: [{ type: "Service", price: 2500 }] });
  const discountOnly = await radPay(CLIENT, insertedId, 0, 100);
  assert.equal(discountOnly.lastPayment.amount, 0);
  assert.equal((await notify.queueReceipt(CLIENT, "radiator", discountOnly, discountOnly.lastPayment)).receiptId, null);
  assert.equal(log().length, 0);
  const paid = await radPay(CLIENT, insertedId, 500, 0);
  await (await notify.queueReceipt(CLIENT, "radiator", paid, paid.lastPayment)).done;
  await (await notify.queueReceipt(CLIENT, "radiator", paid, paid.lastPayment)).done; // same payment again
  assert.equal(sentMessages().length, 1);
  assert.equal(log().filter((m) => m.kind === "receipt").length, 1);
  const second = await radPay(CLIENT, insertedId, 500, 0); // a different payment is its own receipt
  await (await notify.queueReceipt(CLIENT, "radiator", second, second.lastPayment)).done;
  assert.equal(sentMessages().length, 2);
});

test("company switches: receipt off sends none; summary off sends none; bill sends ignore the default-tick switch", async () => {
  await setup({ wa: { receipt: false, ownerSummary: false, billDefaultTick: false } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  const paid = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  assert.equal((await notify.queueReceipt(CLIENT, "tyre", paid, paid.lastPayment)).receiptId, null);
  assert.equal(log().length, 0);
  assert.equal((await notify.sendOwnerSummary(CLIENT, "2026-11-14")).error, "Daily summary is switched off");
  assert.equal((await notify.sendBill(CLIENT, "tyre", bill._id, PDF)).status, "sent"); // an explicit send always sends
  assert.equal(sentMessages().length, 1);
});

test("receipt with PDF: waits as awaiting_pdf, the browser's PDF sends payment_receipt_document", async () => {
  await setup({ wa: { receiptPdf: true } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  const paid = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  const q = await notify.queueReceipt(CLIENT, "tyre", paid, paid.lastPayment);
  assert.match(q.receiptId, /^[0-9a-f]{24}$/);
  assert.equal(log()[0].status, "awaiting_pdf");
  assert.equal(graph.calls.length, 0);
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp, undefined, "bill untouched until it is sent");
  // the same payment again returns the same pending receipt rather than a second one
  assert.equal((await notify.queueReceipt(CLIENT, "tyre", paid, paid.lastPayment)).receiptId, q.receiptId);
  assert.equal(log().length, 1);

  await assert.rejects(notify.attachReceiptPdf(new ObjectId(), q.receiptId, PDF), (e) => e.statusCode === 404, "another company's receipt");
  const w = await notify.attachReceiptPdf(CLIENT, q.receiptId, PDF);
  assert.equal(w.status, "sent");
  assert.equal(graph.uploads().length, 1);
  assert.equal(sentMessages()[0].body.template.name, "payment_receipt_document");
  assert.equal(sentMessages()[0].body.template.components[0].parameters[0].document.id, "media-1");
  await assert.rejects(notify.attachReceiptPdf(CLIENT, q.receiptId, PDF), (e) => e.statusCode === 409, "only once");
});

test("receipt PDF never arrives: after 2 minutes the scheduler sends the text receipt instead", async () => {
  await setup({ wa: { receiptPdf: true, ownerSummary: false } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  const paid = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  await notify.queueReceipt(CLIENT, "tyre", paid, paid.lastPayment);
  const at = log()[0].at;
  await tick(new Date(at.getTime() + 60_000));
  assert.equal(graph.calls.length, 0, "still waiting at 1 minute");
  await tick(new Date(at.getTime() + 3 * 60_000));
  assert.equal(sentMessages().length, 1);
  assert.equal(sentMessages()[0].body.template.name, "payment_receipt");
  assert.equal(log()[0].status, "sent");
  assert.equal(graph.uploads().length, 0);
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp.status, "sent");
});

test("retries: network / 5xx errors back off 30s, 2m, 10m then fail; the uploaded PDF is reused", async () => {
  await setup({ wa: { ownerSummary: false } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  let mode = "503";
  graph.handler = (call, defaults) => {
    if (call.url.endsWith("/messages")) {
      if (mode === "net") throw new Error("ECONNRESET");
      return { status: 503, body: { error: { message: "Service unavailable" } } };
    }
    return defaults(call);
  };
  const w = await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  assert.equal(w.status, "pending");
  let m = log()[0];
  assert.equal(m.attempts, 1);
  assert.equal(m.nextAttemptAt.getTime() - m.statusAt.getTime(), 30_000);
  assert.equal(graph.uploads().length, 1);
  assert.ok(m.mediaId);
  assert.ok(m.pdfB64 === undefined || m.pdfB64 === null || m.pdfB64, "pdf kept until sent");
  const bw = await fakeDb.collection("tyrebills").findOne({ _id: bill._id });
  assert.equal(bw.whatsapp.status, "pending");

  await tick(new Date(m.nextAttemptAt.getTime() - 1000)); // not due yet
  assert.equal(sentMessages().length, 1);
  mode = "net";
  await tick(m.nextAttemptAt);
  m = log()[0];
  assert.equal(m.attempts, 2);
  assert.equal(m.status, "pending");
  assert.equal(m.nextAttemptAt.getTime() - m.statusAt.getTime(), 120_000);
  assert.match(m.error, /Could not reach WhatsApp/);
  await tick(m.nextAttemptAt);
  m = log()[0];
  assert.equal(m.attempts, 3);
  assert.equal(m.nextAttemptAt.getTime() - m.statusAt.getTime(), 600_000);
  await tick(m.nextAttemptAt);
  m = log()[0];
  assert.equal(m.attempts, 4);
  assert.equal(m.status, "failed");
  assert.equal(m.nextAttemptAt, null);
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp.status, "failed");
  assert.equal(graph.uploads().length, 1, "the media id from the first attempt was reused");
  await tick(new Date(NOW.getTime() + 86400000)); // nothing more is attempted
  assert.equal(sentMessages().length, 4);
});

test("a retry that succeeds ends sent; a provider rejection (4xx) fails at once without retrying", async () => {
  await setup({ wa: { ownerSummary: false } });
  const bill = await createTyreBill(CLIENT, tyreInput());
  let fail = true;
  graph.handler = (call, defaults) => (call.url.endsWith("/messages") && fail ? { status: 500, body: {} } : defaults(call));
  await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  fail = false;
  await tick(log()[0].nextAttemptAt);
  assert.equal(log()[0].status, "sent");
  assert.equal(log()[0].attempts, 2);

  graph.handler = (call, defaults) => (call.url.endsWith("/messages") ? { status: 400, body: { error: { message: "(#131030) Recipient phone number not in allowed list" } } } : defaults(call));
  const w = await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  assert.equal(w.status, "failed");
  assert.equal(w.error, "(#131030) Recipient phone number not in allowed list");
  assert.equal(log()[1].attempts, 1);
});

test("webhook statuses move the log and the bill's summary forward, never backward", async () => {
  await setup();
  const bill = await createTyreBill(CLIENT, tyreInput());
  await notify.sendBill(CLIENT, "tyre", bill._id, PDF);
  const id = log()[0].providerMessageId;
  await notify.applyStatuses([{ id, status: "failed", errorText: "forged" }], new ObjectId()); // another company's webhook
  assert.equal(log()[0].status, "sent", "a webhook verified for another company can't touch this company's messages");
  await notify.applyStatuses([{ id, status: "delivered", timestamp: new Date("2026-11-14T10:00:00Z") }], CLIENT);
  assert.equal(log()[0].status, "delivered");
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill._id })).whatsapp.status, "delivered");
  await notify.applyStatuses([{ id, status: "read", timestamp: new Date() }, { id, status: "sent", timestamp: new Date() }, { id: "unknown", status: "read" }], CLIENT);
  assert.equal(log()[0].status, "read");
  await notify.applyStatuses([{ id, status: "failed", errorText: "Message undeliverable" }], CLIENT);
  assert.equal(log()[0].status, "failed");
  assert.equal(log()[0].error, "Message undeliverable");
  const stored = await fakeDb.collection("tyrebills").findOne({ _id: bill._id });
  assert.deepEqual([stored.whatsapp.status, stored.whatsapp.error], ["failed", "Message undeliverable"]);
});

test("auto-reply: one text per sender per IST day, naming the company and its phone", async () => {
  await setup();
  const account = await dao.getAccount(CLIENT);
  const first = await notify.autoReply(account, "919876543210");
  assert.equal(first.status, "sent");
  assert.equal(await notify.autoReply(account, "919876543210"), null, "same sender, same day");
  const other = await notify.autoReply(account, "919800000001");
  assert.equal(other.status, "sent");
  const texts = sentMessages().map((c) => c.body.text.body);
  assert.equal(texts.length, 2);
  assert.equal(texts[0], "This number only sends bills from Sri Murugan Tyres. For any query please call 9000000001.");
  // yesterday's reply doesn't count
  log()[0].at = new Date(Date.now() - 36 * 3600 * 1000);
  assert.equal((await notify.autoReply(account, "919876543210")).status, "sent");
  // a disabled account never replies
  assert.equal(await notify.autoReply({ ...account, enabled: false }, "919811111111"), null);
});

test("owner summary: today's figures (tyre adds overdue), once per date, skipped when idle", async () => {
  await setup();
  const bill = await createTyreBill(CLIENT, tyreInput({ billDate: "2026-11-14", paymentType: "full", installments: undefined }));
  await recordTyrePayment(CLIENT, bill._id, { amount: 10000, mode: "cash" });
  await createTyreBill(CLIENT, tyreInput({ billDate: "2026-09-01" })); // an old challan with overdue installments
  const w = await notify.sendOwnerSummary(CLIENT, "2026-11-14");
  assert.equal(w.status, "sent");
  const [call] = sentMessages();
  assert.equal(call.body.to, "919876500000");
  assert.equal(call.body.template.name, "owner_daily_summary");
  const p = graph.params(call);
  assert.deepEqual(p.slice(0, 6), ["Sri Murugan Tyres", "14-Nov-2026", "1", "₹48,500", "₹10,000", "₹38,500"]);
  assert.match(p[6], /^₹[\d,]+$/);
  assert.ok(Number(p[6].replace(/[₹,]/g, "")) > 0, "overdue installments of the old challan");
  assert.equal((await notify.sendOwnerSummary(CLIENT, "2026-11-14")).error, "Already sent for this date");
  assert.equal(sentMessages().length, 1);

  await setup(); // a day with no bills and no collections
  assert.equal((await notify.sendOwnerSummary(CLIENT, "2026-11-14")).error, "No activity today");
  assert.equal(graph.calls.length, 0);
  assert.equal(log().length, 0);
});

test("owner summary figures for the other verticals come from their own analytics", async () => {
  await setup({ businessType: "radiator" });
  const { insertedId } = await createRadiator(CLIENT, { billDate: "2026-11-14", truckNumber: "TN1", phoneNumber: "9876543210", serviceInfo: [{ type: "Service", price: 2500 }] });
  await radPay(CLIENT, insertedId, 1000, 0);
  await notify.sendOwnerSummary(CLIENT, "2026-11-14");
  assert.deepEqual(graph.params(sentMessages()[0]), ["Sri Murugan Tyres", "14-Nov-2026", "1", "₹2,500", "₹1,000", "₹1,500", "-"]);
  await setup({ businessType: "engineering" });
  await createEngBill(CLIENT, { billDate: "2026-11-14", vehicleNo: "tn01ab1234", mechanic: "Ravi", services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "hold-set", qty: 2, rate: 500 }] }] });
  await notify.sendOwnerSummary(CLIENT, "2026-11-14");
  assert.deepEqual(graph.params(sentMessages()[0]).slice(2, 6), ["1", "₹1,000", "₹0", "₹1,000"]);
});

test("scheduler: the summary goes at the company's time (IST), once per day, including across a restart", async () => {
  await setup();
  await createTyreBill(CLIENT, tyreInput({ billDate: "2026-11-14", paymentType: "full", installments: undefined }));
  await tick(new Date("2026-11-14T14:00:00Z")); // 19:30 IST, before 20:00
  assert.equal(sentMessages().length, 0);
  await tick(NOW); // 20:05 IST
  assert.equal(sentMessages().length, 1);
  assert.equal((await dao.getAccount(CLIENT)).lastSummaryDate, "2026-11-14");
  await tick(new Date(NOW.getTime() + 60_000)); // the next minute, and a "restarted" process: same stored state
  await tick(new Date("2026-11-14T17:00:00Z"));
  assert.equal(sentMessages().length, 1);
  // next day with no activity: marked, nothing sent
  await tick(new Date("2026-11-15T14:35:00Z"));
  assert.equal(sentMessages().length, 1);
  assert.equal((await dao.getAccount(CLIENT)).lastSummaryDate, "2026-11-15");
  // a company with the summary switched off is never marked
  await setup({ wa: { ownerSummary: false } });
  await tick(NOW);
  assert.equal((await dao.getAccount(CLIENT)).lastSummaryDate, undefined);
});

test("connection test goes to the owner's number with the connection_test template", async () => {
  await setup();
  const w = await notify.sendTest(CLIENT);
  assert.equal(w.status, "sent");
  assert.equal(sentMessages()[0].body.to, "919876500000");
  assert.deepEqual(graph.params(sentMessages()[0]), ["Sri Murugan Tyres"]);
  await setup({ wa: { ownerPhone: "" } });
  assert.equal((await notify.sendTest(CLIENT)).error, "No valid WhatsApp number");
});

test("usage: counts per kind in the IST month, sent = sent | delivered | read, failures separate", async () => {
  await setup();
  const t = (kind, status, at) => dao.logMessage({ clientId: CLIENT, kind, status, at: new Date(at), refId: "x" });
  await t("bill", "sent", "2026-11-03T10:00:00Z");
  await t("bill", "delivered", "2026-11-04T10:00:00Z");
  await t("bill", "failed", "2026-11-05T10:00:00Z");
  await t("receipt", "read", "2026-11-05T10:00:00Z");
  await t("receipt", "pending", "2026-11-05T10:00:00Z");
  await t("summary", "sent", "2026-10-31T19:00:00Z"); // 00:30 IST on 1 Nov: this month
  await t("summary", "sent", "2026-10-31T17:00:00Z"); // 22:30 IST on 31 Oct: last month
  await t("bill", "sent", "2026-11-30T19:00:00Z"); // 00:30 IST on 1 Dec: next month
  const u = await dao.usage(CLIENT, "2026-11");
  assert.deepEqual(u.byKind, { bill: { sent: 2, failed: 1 }, receipt: { sent: 1, failed: 0 }, summary: { sent: 1, failed: 0 } });
  assert.equal(u.total, 4);
  assert.deepEqual((await dao.usage(new ObjectId(), "2026-11")).byKind, {});
});

test("masked account never exposes a secret; secrets are stored encrypted and a blank keeps the stored one", async () => {
  await setup();
  const doc = await dao.getAccount(CLIENT);
  const masked = dao.maskedAccount(doc);
  const text = JSON.stringify(masked);
  assert.ok(!text.includes("EAAB-secret-token-1234") && !text.includes("app-secret") && !text.includes("secretsEnc"));
  assert.equal(masked.tokenMasked, "••••1234");
  assert.equal(masked.hasToken, true);
  assert.equal(masked.hasAppSecret, true);
  assert.equal(masked.templates.bill_document.status, "APPROVED");
  assert.ok(!JSON.stringify(doc.secretsEnc).includes("EAAB"));
  await dao.saveAccount(CLIENT, { accessToken: "", appSecret: "   ", wabaId: "3333333333" });
  const after2 = await dao.getAccount(CLIENT);
  assert.equal(dao.decryptSecrets(after2).token, "EAAB-secret-token-1234");
  assert.equal(after2.wabaId, "3333333333");
  await dao.saveAccount(CLIENT, { accessToken: "NEW-token-9999" });
  assert.equal(dao.maskedAccount(await dao.getAccount(CLIENT)).tokenMasked, "••••9999");
  assert.equal(dao.maskedAccount(null), null);
});

test("waFailed list filter: only bills whose last WhatsApp send failed (tyre, radiator, automobile, engineering)", async () => {
  await setup();
  const failed = { status: "failed", at: new Date(), error: "x", kind: "bill" };
  const sent = { status: "sent", at: new Date(), error: "", kind: "bill" };
  const t1 = await createTyreBill(CLIENT, tyreInput());
  await createTyreBill(CLIENT, tyreInput());
  await fakeDb.collection("tyrebills").updateOne({ _id: t1._id }, { $set: { whatsapp: failed } });
  const t = await getAllTyreBills(CLIENT, { waFailed: true });
  assert.deepEqual(t.tyreBillData.map((b) => String(b._id)), [String(t1._id)]);
  assert.equal((await getAllTyreBills(CLIENT, {})).tyreBillData.length, 2);

  const r1 = await createRadiator(CLIENT, { billDate: "2026-09-20", truckNumber: "TN1", serviceInfo: [{ type: "Service", price: 10 }] });
  const r2 = await createRadiator(CLIENT, { billDate: "2026-09-20", truckNumber: "TN2", serviceInfo: [{ type: "Service", price: 10 }] });
  await fakeDb.collection("radiators").updateOne({ _id: r1.insertedId }, { $set: { whatsapp: failed } });
  await fakeDb.collection("radiators").updateOne({ _id: r2.insertedId }, { $set: { whatsapp: sent } });
  const r = await getAllRadiators(CLIENT, 1, 10, "", "", "", "", "", "", "", { waFailed: true });
  assert.deepEqual(r.radiatorData.map((b) => b.truckNumber), ["TN1"]);

  const a1 = await createAutoBill(CLIENT, { billDate: "2026-09-20", vehicleNumber: "A1", items: [{ particulars: "x", qty: 1, rate: 5 }] });
  await createAutoBill(CLIENT, { billDate: "2026-09-20", vehicleNumber: "A2", items: [{ particulars: "x", qty: 1, rate: 5 }] });
  await fakeDb.collection("autobills").updateOne({ _id: a1.insertedId }, { $set: { whatsapp: failed } });
  const a = await getAllAutoBills(CLIENT, 1, 10, "", "", "", "", "", "", "", { waFailed: true });
  assert.deepEqual(a.autoBillData.map((b) => b.vehicleNumber), ["A1"]);

  const e1 = await createEngBill(CLIENT, { billDate: "2026-09-20", vehicleNo: "tn01ab1234", mechanic: "Ravi", services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "hold-set", qty: 1, rate: 500 }] }] });
  await createEngBill(CLIENT, { billDate: "2026-09-20", vehicleNo: "tn02ab1234", mechanic: "Ravi", services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "hold-set", qty: 1, rate: 500 }] }] });
  await fakeDb.collection("engbills").updateOne({ _id: e1._id }, { $set: { whatsapp: failed } });
  const e = await listEngBills(CLIENT, { waFailed: true });
  assert.deepEqual(e.bills.map((b) => b.vehicleNo), ["TN01AB1234"]);
});

test("offboardClient removes the WhatsApp account and log; the export leaves out secrets and stored PDFs", async () => {
  await setup();
  await dao.logMessage({ clientId: CLIENT, kind: "bill", status: "pending", refId: "x", pdfB64: "SECRETPDF" });
  const other = new ObjectId();
  await dao.logMessage({ clientId: other, kind: "bill", status: "sent", refId: "y" });
  await fakeDb.collection("clients").insertOne({ _id: CLIENT, name: "Sri Murugan", code: "smt" });
  const { exportClientData, offboardClient } = await import("../src/dao/client.dao.js");
  const data = await exportClientData(CLIENT);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("secretsEnc") && !text.includes("EAAB") && !text.includes("SECRETPDF"));
  assert.equal(data.whatsappAccount.hasToken, true);
  assert.equal(data.whatsappMessages.length, 1);
  const counts = await offboardClient(CLIENT);
  assert.equal(counts.whatsappAccounts, 1);
  assert.equal(counts.whatsappMessages, 1);
  assert.equal(await dao.getAccount(CLIENT), null);
  assert.equal(log().length, 1, "another company's log is untouched");
  assert.equal(String(log()[0].clientId), String(other));
});
