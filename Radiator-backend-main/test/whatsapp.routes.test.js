// WhatsApp over HTTP: super-admin enable / test / templates / usage, the tenant gate and send routes, settings,
// the payment-route hook, and the public webhook. The REAL routers run on a local server against the fake Mongo.
// Run with: node --experimental-test-module-mocks --test test/whatsapp.routes.test.js
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";
import { installGraphStub } from "./helpers/waStub.js";

process.env.WHATSAPP_ENC_KEY = "cd".repeat(32);
process.env.JWT_SECRET = "test-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
let fakeDb = new FakeDb();
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
const graph = installGraphStub();

const dao = await import("../src/dao/whatsapp.dao.js");
const { TEMPLATE_NAMES } = await import("../src/services/whatsapp/templates.js");
const { default: adminRoutes } = await import("../src/routes/admin.routes.js");
const { default: whatsappRoutes, requireWhatsApp } = await import("../src/routes/whatsapp.routes.js");
const { default: webhookRoutes } = await import("../src/routes/webhook.routes.js");
const { default: settingsRoutes } = await import("../src/routes/settings.routes.js");
const { default: tyreRoutes } = await import("../src/routes/tyrebill.routes.js");

const app = express();
// Same body handling as index.js: webhooks stay raw.
const webhookBody = express.raw({ type: "*/*", limit: "2mb" });
app.use((req, res, next) => (/^\/webhooks\/whatsapp\//.test(req.path)
  ? webhookBody(req, res, (err) => { if (!err) req.rawBody = req.body; next(err); })
  : express.json({ limit: "2mb" })(req, res, next)));
app.use("/admin", adminRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/settings", settingsRoutes);
app.use("/tyrebills", tyreRoutes);
app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));

let server; let base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { graph.restore(); server.closeAllConnections?.(); server.close(); });

const CLIENT = new ObjectId();
const adminToken = jwt.sign({ sub: "sa1", userId: "superadmin", role: "superadmin" }, process.env.JWT_SECRET);
const userToken = jwt.sign({ sub: "u1", userId: "admin", role: "admin", clientId: String(CLIENT), code: "smt" }, process.env.JWT_SECRET);
const ALL = Object.fromEntries(TEMPLATE_NAMES.map((n) => [n, { status: "APPROVED" }]));

async function api(method, path, { token, body, form, raw, headers } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: form || raw || (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
const admin = (m, p, o = {}) => api(m, `/admin/clients/${CLIENT}/whatsapp${p}`, { token: adminToken, ...o });
const pdfForm = (type = "application/pdf") => {
  const f = new FormData();
  f.append("pdf", new Blob(["%PDF-1.4 fake"], { type }), "bill.pdf");
  return f;
};
const audits = (action) => fakeDb.collection("audit_log").docs.filter((a) => a.action === action);

async function fresh({ account = true, enabled = true, wa = {}, businessType = "tyre" } = {}) {
  fakeDb = new FakeDb();
  graph.reset();
  await fakeDb.collection("clients").insertOne({ _id: CLIENT, name: "Sri Murugan Tyres", code: "smt", status: "active", businessType });
  await fakeDb.collection("settings").insertOne({
    _id: CLIENT, businessType, company: { name: "Sri Murugan Tyres", phone1: "9000000001" },
    whatsapp: { billDefaultTick: false, receipt: true, receiptPdf: false, ownerSummary: false, ownerPhone: "9876500000", summaryTime: "20:00", ...wa },
  });
  if (account) {
    await dao.saveAccount(CLIENT, {
      enabled, provider: "meta", numberType: "new", phoneNumberId: "1111111111", wabaId: "2222222222",
      accessToken: "EAAB-secret-token-1234", appSecret: "app-secret", displayPhone: "+91 90000 00001", verifiedName: "Sri Murugan Tyres", templates: ALL,
    });
  }
}
const goodBody = (over = {}) => ({ enabled: true, provider: "meta", numberType: "existing", phoneNumberId: "1111111111", wabaId: "2222222222", accessToken: "EAAB-new-token-7777", appSecret: "sec", ...over });

// ---- super admin ----------------------------------------------------------

test("admin routes need a super-admin token", async () => {
  await fresh();
  assert.equal((await api("GET", `/admin/clients/${CLIENT}/whatsapp`)).status, 401);
  assert.equal((await api("GET", `/admin/clients/${CLIENT}/whatsapp`, { token: userToken })).status, 403);
  assert.equal((await admin("GET", "")).status, 200);
  assert.equal((await api("GET", `/admin/clients/${new ObjectId()}/whatsapp`, { token: adminToken })).status, 404);
});

test("enable requires every field; nothing is saved and the provider is never called", async () => {
  await fresh({ account: false });
  for (const missing of ["phoneNumberId", "wabaId", "accessToken", "appSecret"]) {
    const r = await admin("PUT", "", { body: goodBody({ [missing]: "" }) });
    assert.equal(r.status, 400, missing);
    assert.equal(r.json.success, false);
  }
  assert.equal((await admin("PUT", "", { body: goodBody({ phoneNumberId: "abc" }) })).status, 400);
  assert.equal((await admin("PUT", "", { body: goodBody({ provider: "gupshup" }) })).status, 400);
  assert.equal(graph.calls.length, 0);
  assert.equal((await admin("GET", "")).json.account, null);
});

test("enable with a failing live test: 400 with the provider's message and nothing saved", async () => {
  await fresh({ account: false });
  graph.handler = () => ({ status: 401, body: { error: { message: "Invalid OAuth access token." } } });
  const r = await admin("PUT", "", { body: goodBody() });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json, { success: false, message: "Invalid OAuth access token." });
  assert.equal((await admin("GET", "")).json.account, null);
  assert.equal(fakeDb.collection("whatsapp_accounts").docs.length, 0);
  assert.equal(audits("whatsapp.enable").length, 0);
});

test("enable with a passing test saves display number / verified name, never returns a secret, and is audited", async () => {
  await fresh({ account: false });
  const r = await admin("PUT", "", { body: goodBody() });
  assert.equal(r.status, 200);
  assert.equal(r.json.account.enabled, true);
  assert.equal(r.json.account.displayPhone, "+91 90000 00001");
  assert.equal(r.json.account.verifiedName, "Sri Murugan Tyres");
  assert.equal(r.json.account.tokenMasked, "••••7777");
  assert.equal(r.json.account.numberType, "existing");
  assert.deepEqual(Object.keys(r.json.account.templates).sort(), [...TEMPLATE_NAMES].sort());
  assert.equal(r.json.account.templates.bill_document.status, "MISSING");
  for (const res of [r.text, (await admin("GET", "")).text]) assert.ok(!/EAAB|secretsEnc|"sec"/.test(res));
  assert.equal(graph.calls.length, 1);
  assert.equal(graph.calls[0].headers.Authorization, "Bearer EAAB-new-token-7777");
  const [a] = audits("whatsapp.enable");
  assert.equal(a.clientCode, "smt");
  assert.ok(!JSON.stringify(a).includes("EAAB"));
  assert.equal(await dao.isWhatsAppEnabled(CLIENT), true);
  const list = await api("GET", "/admin/clients", { token: adminToken });
  assert.equal(list.json.clients.find((c) => c.code === "smt").whatsappEnabled, true);
});

test("changing the IDs or secret re-tests (a failure keeps the old details); a blank token keeps the stored one", async () => {
  await fresh();
  graph.handler = () => ({ status: 400, body: { error: { message: "Unsupported get request" } } });
  const bad = await admin("PUT", "", { body: goodBody({ phoneNumberId: "9999999999", accessToken: "" }) });
  assert.equal(bad.status, 400);
  assert.equal((await dao.getAccount(CLIENT)).phoneNumberId, "1111111111");
  graph.handler = null;
  const ok = await admin("PUT", "", { body: goodBody({ phoneNumberId: "9999999999", accessToken: "", appSecret: "" }) });
  assert.equal(ok.status, 200);
  const stored = await dao.getAccount(CLIENT);
  assert.equal(stored.phoneNumberId, "9999999999");
  assert.equal(dao.decryptSecrets(stored).token, "EAAB-secret-token-1234", "blank token kept");
  assert.equal(graph.calls.at(-1).headers.Authorization, "Bearer EAAB-secret-token-1234", "the test used the stored token");
  assert.equal(audits("whatsapp.account").length, 1);
});

test("disable keeps the details and stops sending; remove deletes them", async () => {
  await fresh();
  const off = await admin("PUT", "", { body: { enabled: false, provider: "meta", numberType: "new" } });
  assert.equal(off.status, 200);
  assert.equal(off.json.account.enabled, false);
  assert.equal(off.json.account.hasToken, true);
  assert.equal(graph.calls.length, 0, "no live test just to switch off");
  assert.equal(audits("whatsapp.disable").length, 1);
  assert.equal(await dao.isWhatsAppEnabled(CLIENT), false);
  assert.equal((await api("GET", "/whatsapp/status", { token: userToken })).status, 403);
  const del = await admin("DELETE", "");
  assert.equal(del.status, 200);
  assert.equal((await admin("GET", "")).json.account, null);
});

test("test endpoint reports the number and verified name, or the provider's error", async () => {
  await fresh();
  const ok = await admin("POST", "/test");
  assert.deepEqual([ok.json.displayPhone, ok.json.verifiedName], ["+91 90000 00001", "Sri Murugan Tyres"]);
  graph.handler = () => ({ status: 400, body: { error: { message: "Token expired" } } });
  const bad = await admin("POST", "/test");
  assert.deepEqual([bad.status, bad.json.message], [400, "Token expired"]);
  await fresh({ account: false });
  assert.equal((await admin("POST", "/test")).status, 400);
});

test("templates: document templates need the App ID for their sample PDF; the rest are created", async () => {
  await fresh();
  const r = await admin("POST", "/templates");
  assert.equal(r.status, 200);
  const created = graph.calls.filter((c) => c.method === "POST" && c.url.endsWith("/message_templates")).map((c) => c.body.name).sort();
  assert.deepEqual(created, ["connection_test", "owner_daily_summary", "payment_receipt"]);
  for (const n of ["bill_document", "payment_receipt_document"]) {
    assert.equal(r.json.templates[n].status, "MISSING");
    assert.match(r.json.templates[n].reason, /App ID/);
  }
});

test("templates: with the App ID a sample PDF is uploaded and its handle approves the document templates", async () => {
  await fresh();
  await dao.saveAccount(CLIENT, { appId: "3333333333" });
  graph.handler = (call, defaults) => {
    const path = new URL(call.url).pathname.replace(/^\/v[\d.]+/, "");
    if (call.method === "POST" && path === "/3333333333/uploads") return { status: 200, body: { id: "upload:abc" } };
    if (call.method === "POST" && path === "/upload:abc") return { status: 200, body: { h: "4::sample-handle" } };
    return defaults(call);
  };
  const r = await admin("POST", "/templates");
  assert.equal(r.status, 200);
  const session = graph.calls.find((c) => c.url.includes("/3333333333/uploads"));
  assert.match(session.url, /file_type=application%2Fpdf/);
  const bytes = graph.calls.find((c) => c.url.endsWith("/upload:abc"));
  assert.equal(bytes.headers.Authorization, "OAuth EAAB-secret-token-1234");
  assert.ok(Buffer.from(bytes.body).toString("latin1").startsWith("%PDF-1.4"), "a real PDF is uploaded");
  const docDefs = graph.calls.filter((c) => c.method === "POST" && c.url.endsWith("/message_templates") && ["bill_document", "payment_receipt_document"].includes(c.body.name));
  assert.equal(docDefs.length, 2);
  assert.ok(docDefs.every((c) => c.body.components[0].example.header_handle[0] === "4::sample-handle"));
  assert.equal(r.json.templates.bill_document.status, "PENDING");
  assert.equal(dao.maskedAccount(await dao.getAccount(CLIENT)).appId, "3333333333");
});

test("templates: creates the missing ones, then syncs approval statuses", async () => {
  await fresh();
  process.env.WHATSAPP_SAMPLE_DOC_HANDLE = "4::env-handle"; // a platform-wide sample handle also works
  const first = await admin("POST", "/templates");
  delete process.env.WHATSAPP_SAMPLE_DOC_HANDLE;
  assert.equal(first.status, 200);
  const created = graph.calls.filter((c) => c.method === "POST" && c.url.endsWith("/2222222222/message_templates"));
  assert.deepEqual(created.map((c) => c.body.name).sort(), [...TEMPLATE_NAMES].sort());
  assert.ok(created.every((c) => c.body.category === "UTILITY" && c.body.language === "en"));
  assert.ok(TEMPLATE_NAMES.every((n) => first.json.templates[n].status === "PENDING"));
  graph.templates.forEach((t) => { t.status = "APPROVED"; });
  graph.templates.find((t) => t.name === "payment_receipt").status = "REJECTED";
  graph.templates.find((t) => t.name === "payment_receipt").rejected_reason = "INVALID_FORMAT";
  const before = graph.calls.length;
  const second = await admin("POST", "/templates");
  assert.equal(graph.calls.slice(before).filter((c) => c.method === "POST").length, 0, "nothing created twice");
  assert.equal(second.json.templates.bill_document.status, "APPROVED");
  assert.equal(second.json.templates.payment_receipt.status, "REJECTED");
  assert.equal(audits("whatsapp.templates").length, 2);
  assert.equal(dao.maskedAccount(await dao.getAccount(CLIENT)).templates.connection_test.status, "APPROVED");
});

test("a template Meta refuses to create is reported on that template; the others still go through", async () => {
  await fresh();
  graph.handler = (call, defaults) => (call.method === "POST" && call.body?.name === "bill_document" ? { status: 400, body: { error: { message: "Header sample is required" } } } : defaults(call));
  process.env.WHATSAPP_SAMPLE_DOC_HANDLE = "4::env-handle";
  const r = await admin("POST", "/templates");
  delete process.env.WHATSAPP_SAMPLE_DOC_HANDLE;
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.templates.bill_document, { status: "MISSING", reason: "Header sample is required" });
  assert.equal(r.json.templates.connection_test.status, "PENDING");
});

test("usage: defaults to this month, validates the month", async () => {
  await fresh();
  await dao.logMessage({ clientId: CLIENT, kind: "bill", status: "delivered", at: new Date("2026-11-03T10:00:00Z") });
  await dao.logMessage({ clientId: CLIENT, kind: "bill", status: "failed", at: new Date("2026-11-03T10:00:00Z") });
  const r = await admin("GET", "/usage?month=2026-11");
  assert.deepEqual([r.json.month, r.json.byKind, r.json.total], ["2026-11", { bill: { sent: 1, failed: 1 } }, 1]);
  assert.equal((await admin("GET", "/usage")).json.month, dao.istMonthOf());
  assert.equal((await admin("GET", "/usage?month=2026-13")).status, 400);
});

// ---- tenant routes --------------------------------------------------------

test("tenant gate: 403 with the contract message unless enabled (middleware and every route)", async () => {
  await fresh({ enabled: false });
  const calls = [["GET", "/whatsapp/status"], ["POST", "/whatsapp/test"], ["GET", "/whatsapp/messages?refId=x"], ["POST", "/whatsapp/receipts/abc/pdf"]];
  for (const [m, p] of calls) {
    const r = await api(m, p, { token: userToken });
    assert.deepEqual([r.status, r.json], [403, { success: false, message: "WhatsApp is not enabled for this company" }], p);
  }
  assert.equal((await api("POST", `/whatsapp/send/bill/tyre/${new ObjectId()}`, { token: userToken, form: pdfForm() })).status, 403);
  assert.equal((await api("GET", "/whatsapp/status")).status, 401);
  // the middleware itself
  let status; let next = false;
  await requireWhatsApp({ user: { clientId: String(CLIENT) } }, { status(s) { status = s; return { json() {} }; } }, () => { next = true; });
  assert.deepEqual([status, next], [403, false]);
  await requireWhatsApp({ user: {} }, { status(s) { status = s; return { json() {} }; } }, () => { next = true; });
  assert.equal(status, 403);
});

test("status shows the number and every template (MISSING when absent); no secrets", async () => {
  await fresh();
  await dao.saveAccount(CLIENT, { templates: { bill_document: { status: "APPROVED" }, payment_receipt: { status: "REJECTED", reason: "INVALID_FORMAT" } } });
  const r = await api("GET", "/whatsapp/status", { token: userToken });
  assert.equal(r.json.enabled, true);
  assert.equal(r.json.displayPhone, "+91 90000 00001");
  assert.deepEqual(r.json.templates.payment_receipt, { status: "REJECTED", reason: "INVALID_FORMAT" });
  assert.deepEqual(r.json.templates.owner_daily_summary, { status: "MISSING" });
  assert.ok(!/EAAB|secretsEnc|app-secret/.test(r.text));
});

test("send bill route: PDF upload only (≤ 2 MB), sends, audits whatsapp.send, lists in /messages", async () => {
  await fresh();
  const bill = await fakeDb.collection("tyrebills").insertOne({ clientId: CLIENT, billNo: 101, customerName: "Murugan", phoneNumber: "9876543210", billDate: new Date("2026-09-20"), payableTotal: 1000, pendingAmount: 400 });
  const id = String(bill.insertedId);
  const send = (form, q = "") => api("POST", `/whatsapp/send/bill/tyre/${id}${q}`, { token: userToken, form });
  assert.equal((await send(pdfForm("image/png"))).status, 400);
  assert.equal((await send(new FormData())).status, 400);
  const big = new FormData();
  big.append("pdf", new Blob([Buffer.alloc(2 * 1024 * 1024 + 10)], { type: "application/pdf" }), "big.pdf");
  assert.equal((await send(big)).status, 400);
  assert.equal(graph.calls.length, 0);

  const ok = await send(pdfForm());
  assert.equal(ok.status, 200);
  assert.equal(ok.json.success, true);
  assert.equal(ok.json.whatsapp.status, "sent");
  assert.equal(ok.json.whatsapp.kind, "bill");
  assert.equal(graph.params(graph.messages()[0])[1], "delivery challan");
  const up = await send(pdfForm(), "?updated=1");
  assert.equal(up.json.whatsapp.kind, "bill_update");
  assert.deepEqual(audits("whatsapp.send").map((a) => a.details), [
    { kind: "bill", vertical: "tyre", refId: id, status: "sent" },
    { kind: "bill_update", vertical: "tyre", refId: id, status: "sent" },
  ]);
  const msgs = await api("GET", `/whatsapp/messages?refId=${id}`, { token: userToken });
  assert.deepEqual(msgs.json.messages.map((m) => m.kind), ["bill_update", "bill"], "newest first");
  assert.deepEqual(Object.keys(msgs.json.messages[0]).sort(), ["_id", "at", "error", "kind", "status", "statusAt", "to"]);
  assert.equal((await api("GET", "/whatsapp/messages", { token: userToken })).status, 400);
  assert.equal((await api("POST", `/whatsapp/send/bill/nope/${id}`, { token: userToken, form: pdfForm() })).status, 400);
  assert.equal((await api("POST", `/whatsapp/send/bill/tyre/${new ObjectId()}`, { token: userToken, form: pdfForm() })).status, 404);
});

test("send bill route: a failure comes back as success:false with the reason and the bill's status", async () => {
  await fresh();
  await dao.saveAccount(CLIENT, { templates: { ...ALL, bill_document: { status: "PENDING" } } });
  const bill = await fakeDb.collection("tyrebills").insertOne({ clientId: CLIENT, billNo: 1, customerName: "M", phoneNumber: "9876543210", billDate: new Date(), payableTotal: 1, pendingAmount: 1 });
  const r = await api("POST", `/whatsapp/send/bill/tyre/${bill.insertedId}`, { token: userToken, form: pdfForm() });
  assert.equal(r.json.success, false);
  assert.equal(r.json.whatsapp.status, "failed");
  assert.equal(r.json.whatsapp.error, "Template bill_document is not approved yet");
});

test("test message route sends to the owner number", async () => {
  await fresh();
  const r = await api("POST", "/whatsapp/test", { token: userToken });
  assert.equal(r.json.success, true);
  assert.equal(graph.messages()[0].body.to, "919876500000");
  await fresh({ wa: { ownerPhone: "" } });
  const bad = await api("POST", "/whatsapp/test", { token: userToken });
  assert.deepEqual([bad.status, bad.json.message], [400, "No valid WhatsApp number"]);
});

// ---- payment hook ---------------------------------------------------------

test("tyre payment route: text receipt goes out in the background; with the PDF switch the response carries whatsappReceiptId", async () => {
  await fresh();
  await dao.saveAccount(CLIENT, {});
  await fakeDb.collection("settings").updateOne({ _id: CLIENT }, { $set: { tyre: { billStartNumber: 1, brands: [{ label: "MRF", value: "mrf", models: [{ label: "x", value: "x", rate: 1000 }] }], bonus: {} } } });
  const { createTyreBill } = await import("../src/dao/tyrebill.dao.js");
  const mk = () => createTyreBill(CLIENT, { billDate: "2026-09-20", vehicleNumber: "TN1", customerName: "M", phoneNumber: "9876543210", items: [{ brandRef: "mrf", modelRef: "x", tyreNumber: "1", qty: 2, rate: 1000 }], paymentType: "full" });
  const b1 = await mk();
  const r1 = await api("POST", `/tyrebills/${b1._id}/payment`, { token: userToken, body: { amount: 500, mode: "upi" } });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.whatsappReceiptId, undefined);
  assert.ok(!("lastPayment" in r1.json.tyreBill), "internal payment info never reaches the response");
  for (let i = 0; i < 50 && graph.messages().length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(graph.messages().length, 1);
  assert.deepEqual(graph.params(graph.messages()[0]).slice(1, 5), ["₹500", "UPI", "Challan 1", "₹1,500"]);

  await fakeDb.collection("settings").updateOne({ _id: CLIENT }, { $set: { "whatsapp": { receipt: true, receiptPdf: true } } });
  const b2 = await mk();
  const r2 = await api("POST", `/tyrebills/${b2._id}/payment`, { token: userToken, body: { amount: 200, mode: "cash" } });
  assert.match(r2.json.whatsappReceiptId, /^[0-9a-f]{24}$/);
  assert.equal(graph.messages().length, 1, "waiting for the browser's PDF");
  const attach = await api("POST", `/whatsapp/receipts/${r2.json.whatsappReceiptId}/pdf`, { token: userToken, form: pdfForm() });
  assert.equal(attach.json.success, true);
  assert.equal(graph.messages().length, 2);
  assert.equal(graph.messages()[1].body.template.name, "payment_receipt_document");
  assert.equal((await api("POST", `/whatsapp/receipts/${new ObjectId()}/pdf`, { token: userToken, form: pdfForm() })).status, 404);

  // a discount-only entry: no receipt, no id
  await fakeDb.collection("settings").updateOne({ _id: CLIENT }, { $set: { "whatsapp": { receipt: true, receiptPdf: true } } });
  const b3 = await mk();
  const r3 = await api("POST", `/tyrebills/${b3._id}/payment`, { token: userToken, body: { amount: 0, discount: 100 } });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.whatsappReceiptId, undefined);
});

// ---- settings -------------------------------------------------------------

test("GET /settings exposes the computed whatsappEnabled; PUT can't set it and keeps the switches in shape", async () => {
  await fresh({ account: false });
  const get = (await api("GET", "/settings", { token: userToken })).json.settings;
  assert.equal(get.whatsappEnabled, false);
  const put = await api("PUT", "/settings", { token: userToken, body: { whatsappEnabled: true, whatsapp: { receipt: true, receiptPdf: "yes", ownerPhone: " 9876543210 ", summaryTime: "25:99", extra: 1, billDefaultTick: true } } });
  assert.equal(put.status, 200);
  assert.equal(put.json.settings.whatsappEnabled, false);
  assert.deepEqual(put.json.settings.whatsapp, { billDefaultTick: true, receipt: true, receiptPdf: true, ownerSummary: false, ownerPhone: "9876543210", summaryTime: "20:00" });
  const stored = await fakeDb.collection("settings").findOne({ _id: CLIENT });
  assert.ok(!("whatsappEnabled" in stored), "never stored");
  assert.equal(await dao.isWhatsAppEnabled(CLIENT), false, "a tenant can't switch the feature on");
  // once the super admin enables it, the flag follows
  await dao.saveAccount(CLIENT, { enabled: true, phoneNumberId: "1111111111", wabaId: "2", accessToken: "t" });
  assert.equal((await api("GET", "/settings", { token: userToken })).json.settings.whatsappEnabled, true);
  // a malformed whatsapp block is ignored rather than stored
  await api("PUT", "/settings", { token: userToken, body: { whatsapp: "on" } });
  assert.equal(typeof (await fakeDb.collection("settings").findOne({ _id: CLIENT })).whatsapp, "object");
});

// ---- webhook --------------------------------------------------------------

const hook = (payload, { secret = "app-secret", sig } = {}) => {
  const raw = JSON.stringify(payload);
  const signature = sig ?? "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return api("POST", "/webhooks/whatsapp/meta", { raw, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature } });
};
const value = (extra, phoneNumberId = "1111111111") => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, ...extra } }] }] });
const waitFor = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

test("webhook verify: echoes the challenge only with the right token", async () => {
  await fresh();
  const ok = await api("GET", "/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345");
  assert.deepEqual([ok.status, ok.text], [200, "12345"]);
  assert.equal((await api("GET", "/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status, 403);
  assert.equal((await api("GET", "/webhooks/whatsapp/meta")).status, 403);
});

test("webhook: a status with a good signature reaches the log and the bill; a bad signature is 401 and changes nothing", async () => {
  await fresh();
  const bill = await fakeDb.collection("tyrebills").insertOne({ clientId: CLIENT, billNo: 1, customerName: "M", phoneNumber: "9876543210", billDate: new Date(), payableTotal: 1, pendingAmount: 1 });
  await api("POST", `/whatsapp/send/bill/tyre/${bill.insertedId}`, { token: userToken, form: pdfForm() });
  const wamid = fakeDb.collection("whatsapp_messages").docs[0].providerMessageId;
  const status = (s) => value({ statuses: [{ id: wamid, status: s, timestamp: "1760000000" }] });

  assert.equal((await hook(status("delivered"), { secret: "wrong-secret" })).status, 401);
  assert.equal((await hook(status("delivered"), { sig: "" })).status, 401);
  assert.equal(fakeDb.collection("whatsapp_messages").docs[0].status, "sent");

  assert.equal((await hook(status("delivered"))).status, 200);
  assert.equal(fakeDb.collection("whatsapp_messages").docs[0].status, "delivered");
  assert.equal((await fakeDb.collection("tyrebills").findOne({ _id: bill.insertedId })).whatsapp.status, "delivered");
  await hook(value({ statuses: [{ id: wamid, status: "failed", errors: [{ title: "Undeliverable" }] }] }));
  const stored = await fakeDb.collection("tyrebills").findOne({ _id: bill.insertedId });
  assert.deepEqual([stored.whatsapp.status, stored.whatsapp.error], ["failed", "Undeliverable"]);
});

test("webhook: an unknown phone_number_id or an unreadable body is a harmless no-op", async () => {
  await fresh();
  assert.equal((await hook(value({ messages: [{ from: "919876543210" }] }, "5555555555"))).status, 200);
  assert.equal((await api("POST", "/webhooks/whatsapp/meta", { raw: "not json", headers: { "Content-Type": "text/plain" } })).status, 400);
  assert.equal((await api("POST", "/webhooks/whatsapp/nope", { raw: "{}", headers: { "Content-Type": "application/json" } })).status, 400);
  assert.equal(graph.calls.length, 0);
});

test("webhook: a customer's message gets one auto-reply per day, even when the sender writes again", async () => {
  await fresh();
  const inbound = (from) => value({ messages: [{ from, id: "in", type: "text" }] });
  assert.equal((await hook(inbound("919876543210"))).status, 200);
  await waitFor(() => graph.messages().length >= 1);
  assert.equal(graph.messages().length, 1);
  assert.equal(graph.messages()[0].body.to, "919876543210");
  assert.equal(graph.messages()[0].body.type, "text");
  assert.equal(graph.messages()[0].body.text.body, "This number only sends bills from Sri Murugan Tyres. For any query please call 9000000001.");
  await hook(inbound("919876543210"));
  await hook(inbound("919800000002"));
  await waitFor(() => graph.messages().length >= 2);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(graph.messages().map((c) => c.body.to), ["919876543210", "919800000002"]);
  // a disabled company doesn't reply
  await dao.setEnabled(CLIENT, false);
  await hook(inbound("919811111111"));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(graph.messages().length, 2);
});

test("webhook: one delivery covering two numbers of the same Meta app updates both companies", async () => {
  await fresh();
  const OTHER = new ObjectId();
  await fakeDb.collection("settings").insertOne({ _id: OTHER, businessType: "tyre", company: { name: "Second Shop", phone1: "9000000002" }, whatsapp: {} });
  await dao.saveAccount(OTHER, { enabled: true, provider: "meta", numberType: "new", phoneNumberId: "3333333333", wabaId: "2222222222", accessToken: "EAAB-other-token", appSecret: "app-secret", templates: ALL });
  await dao.logMessage({ clientId: CLIENT, kind: "bill", refType: "x", refId: "a", to: "919876543210", status: "sent", providerMessageId: "wamid.A" });
  await dao.logMessage({ clientId: OTHER, kind: "bill", refType: "x", refId: "b", to: "919876543211", status: "sent", providerMessageId: "wamid.B" });
  const change = (num, id) => ({ value: { metadata: { phone_number_id: num }, statuses: [{ id, status: "delivered", timestamp: "1760000000" }] } });
  // each number only moves its own company's messages, even when the payload names the other's message id
  const r = await hook({ entry: [{ changes: [change("1111111111", "wamid.A"), change("3333333333", "wamid.B"), change("3333333333", "wamid.A")] }] });
  assert.equal(r.status, 200);
  assert.deepEqual(fakeDb.collection("whatsapp_messages").docs.map((m) => m.status), ["delivered", "delivered"]);
  // a number whose company has a different app secret is skipped; the rest still apply
  await dao.saveAccount(OTHER, { appSecret: "another-secret" });
  const read = (num, id) => ({ value: { metadata: { phone_number_id: num }, statuses: [{ id, status: "read", timestamp: "1760000001" }] } });
  await hook({ entry: [{ changes: [read("1111111111", "wamid.A"), read("3333333333", "wamid.B")] }] });
  assert.deepEqual(fakeDb.collection("whatsapp_messages").docs.map((m) => m.status), ["read", "delivered"]);
});

// Keep this test last: it uses up the company's send allowance for the minute.
test("send limit: more than 30 sends a minute from one company are refused with 429; reading status is not limited", async () => {
  await fresh();
  const codes = [];
  for (let i = 0; i < 45; i++) codes.push((await api("POST", "/whatsapp/test", { token: userToken })).status);
  assert.ok(codes.filter((c) => c === 200).length <= 30, `sent ${codes.filter((c) => c === 200).length}`);
  assert.equal(codes.at(-1), 429);
  const last = await api("POST", "/whatsapp/test", { token: userToken });
  assert.equal(last.json.message, "Too many WhatsApp messages. Please wait a minute.");
  assert.equal((await api("GET", "/whatsapp/status", { token: userToken })).status, 200);
  // another company is not affected
  const OTHER = new ObjectId();
  await fakeDb.collection("clients").insertOne({ _id: OTHER, name: "Second", code: "two", status: "active", businessType: "tyre" });
  await fakeDb.collection("settings").insertOne({ _id: OTHER, businessType: "tyre", company: { name: "Second" }, whatsapp: { ownerPhone: "9876500001" } });
  await dao.saveAccount(OTHER, { enabled: true, provider: "meta", phoneNumberId: "3333333333", wabaId: "2", accessToken: "EAAB-x", appSecret: "s", templates: ALL });
  const otherToken = jwt.sign({ sub: "u2", userId: "admin", role: "admin", clientId: String(OTHER), code: "two" }, process.env.JWT_SECRET);
  assert.equal((await api("POST", "/whatsapp/test", { token: otherToken })).status, 200);
});
