// WhatsApp building blocks: secret box, phone normalisation, Meta webhook parsing / signature, template parameters.
// Run with: node --experimental-test-module-mocks --test test/whatsapp.utils.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { encryptSecret, decryptSecret } from "../src/utils/secretBox.js";
import { toWaNumber } from "../src/utils/waPhone.js";
import { verifyWebhook, parseWebhook, phoneNumberIds } from "../src/services/whatsapp/providers/meta.js";
import { getProvider } from "../src/services/whatsapp/providers/index.js";
import { cleanParam, money, fmtDate, billDocumentComponents, receiptComponents, TEMPLATE_DEFS, TEMPLATE_NAMES } from "../src/services/whatsapp/templates.js";

const withKey = (key, fn) => {
  const prev = process.env.WHATSAPP_ENC_KEY;
  if (key === undefined) delete process.env.WHATSAPP_ENC_KEY; else process.env.WHATSAPP_ENC_KEY = key;
  try { return fn(); } finally { if (prev === undefined) delete process.env.WHATSAPP_ENC_KEY; else process.env.WHATSAPP_ENC_KEY = prev; }
};

test("secretBox: round trip (hex and base64 keys), random IV, tampering and a wrong key fail", () => {
  const hex = crypto.randomBytes(32).toString("hex");
  withKey(hex, () => {
    const box = encryptSecret("EAAB-token-123");
    assert.match(box, /^v1:[^:]+:[^:]+:[^:]+$/);
    assert.ok(!box.includes("EAAB"));
    assert.equal(decryptSecret(box), "EAAB-token-123");
    assert.notEqual(encryptSecret("EAAB-token-123"), box, "a fresh IV each time");
    const [v, iv, tag, data] = box.split(":");
    const flipped = Buffer.from(data, "base64"); flipped[0] ^= 1;
    assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":")), /could not be decrypted/);
    assert.throws(() => decryptSecret("garbage"), /not in a readable format/);
  });
  const b64 = crypto.randomBytes(32).toString("base64");
  let box;
  withKey(b64, () => { box = encryptSecret("x"); assert.equal(decryptSecret(box), "x"); });
  withKey(hex, () => assert.throws(() => decryptSecret(box), /could not be decrypted/));
});

test("secretBox: a missing or malformed key gives a clear error", () => {
  withKey(undefined, () => assert.throws(() => encryptSecret("x"), /WHATSAPP_ENC_KEY is not set/));
  withKey("abc", () => assert.throws(() => encryptSecret("x"), /must be 32 bytes/));
});

test("toWaNumber: 10 digits, 0 / 91 / +91 prefixes and punctuation; anything else is null", () => {
  assert.equal(toWaNumber("9876543210"), "919876543210");
  assert.equal(toWaNumber("09876543210"), "919876543210");
  assert.equal(toWaNumber("919876543210"), "919876543210");
  assert.equal(toWaNumber("+91 98765-43210"), "919876543210");
  assert.equal(toWaNumber("(0) 98765 43210"), "919876543210");
  for (const bad of ["", null, undefined, "12345", "5876543210", "98765432100", "+1 415 555 2671", "9198765432101", "abcdefghij"]) {
    assert.equal(toWaNumber(bad), null, `${bad}`);
  }
});

test("meta.verifyWebhook: good signature passes; wrong secret, tampered body, missing header fail", () => {
  const raw = Buffer.from('{"entry":[]}');
  const sig = "sha256=" + crypto.createHmac("sha256", "app-secret").update(raw).digest("hex");
  assert.equal(verifyWebhook({ appSecret: "app-secret" }, raw, sig), true);
  assert.equal(verifyWebhook({ appSecret: "other" }, raw, sig), false);
  assert.equal(verifyWebhook({ appSecret: "app-secret" }, Buffer.from('{"entry":[1]}'), sig), false);
  assert.equal(verifyWebhook({ appSecret: "app-secret" }, raw, undefined), false);
  assert.equal(verifyWebhook({ appSecret: "app-secret" }, raw, "sha256=short"), false);
});

test("meta.parseWebhook: statuses (with error text) and inbound senders, per phone number id", () => {
  const json = { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: "111" },
    statuses: [{ id: "w1", status: "delivered", timestamp: "1760000000" }, { id: "w2", status: "failed", errors: [{ title: "Re-engagement", error_data: { details: "outside window" } }] }],
    messages: [{ from: "919876543210", id: "in1" }],
  } }] }] };
  const r = parseWebhook(json);
  assert.deepEqual(r.statuses.map((s) => [s.id, s.status]), [["w1", "delivered"], ["w2", "failed"]]);
  assert.equal(r.statuses[1].errorText, "Re-engagement: outside window");
  assert.equal(r.statuses[0].timestamp.getTime(), 1760000000000);
  assert.deepEqual(r.inbound, [{ from: "919876543210", phoneNumberId: "111" }]);
  assert.deepEqual(phoneNumberIds(json), ["111"]);
});

test("getProvider: meta only; an unknown name is a 400", () => {
  assert.equal(typeof getProvider("meta").sendTemplate, "function");
  assert.throws(() => getProvider("nope"), (e) => e.statusCode === 400);
});

test("template parameters: no newlines / tabs / long space runs, never empty, 300 chars; money and dates read like paper", () => {
  assert.equal(cleanParam("a\nb\t c     d"), "a b c d");
  assert.equal(cleanParam("   "), "-");
  assert.equal(cleanParam(null), "-");
  assert.equal(cleanParam("x".repeat(500)).length, 300);
  assert.equal(money(1234567.5), "₹12,34,567.5");
  assert.equal(fmtDate("2026-11-05T00:00:00Z"), "05-Nov-2026");
  assert.equal(fmtDate("nonsense"), "-");
  const c = billDocumentComponents({ customer: "Anil\nKumar", word: "bill", company: "", date: "2026-11-05T00:00:00Z", total: 1000, balance: 0, mediaId: "m1", filename: "b.pdf" });
  assert.deepEqual(c[0].parameters[0], { type: "document", document: { id: "m1", filename: "b.pdf" } });
  assert.deepEqual(c[1].parameters.map((p) => p.text), ["Anil Kumar", "bill", "-", "05-Nov-2026", "₹1,000", "₹0"]);
  assert.equal(receiptComponents({ company: "C", amount: 5, mode: "UPI", ref: "R", balance: 0 })[0].parameters[5].text, "-");
});

test("template definitions: UTILITY / en, every placeholder has an example, none starts or ends with a variable", () => {
  assert.deepEqual(Object.keys(TEMPLATE_DEFS).sort(), [...TEMPLATE_NAMES].sort());
  for (const d of Object.values(TEMPLATE_DEFS)) {
    assert.equal(d.category, "UTILITY");
    assert.equal(d.language, "en");
    const body = d.components.find((c) => c.type === "BODY");
    const vars = body.text.match(/\{\{\d+\}\}/g) || [];
    assert.equal(body.example.body_text[0].length, vars.length, d.name);
    assert.ok(!/^\{\{/.test(body.text) && !/\}\}$/.test(body.text), d.name);
  }
  for (const n of ["bill_document", "payment_receipt_document"]) assert.equal(TEMPLATE_DEFS[n].components[0].format, "DOCUMENT");
});
