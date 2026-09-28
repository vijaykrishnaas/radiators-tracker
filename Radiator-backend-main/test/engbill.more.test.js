// More Engineering Works DAO coverage (second QA lap): bill numbering from a
// start number, payments + discounts, edits that change received, vehicle lookup.
// Each test gets a fresh in-memory fake DB. No live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/engbill.more.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
let catalog;

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", {
  namedExports: { getSettings: async () => ({ engineering: catalog }) },
});

const { createEngBill, updateEngBill, recordEngPayment, lookupVehicle } = await import("../src/dao/engbill.dao.js");

const CLIENT = new ObjectId();

beforeEach(() => {
  fakeDb = new FakeDb();
  catalog = {
    billStartNumber: 1,
    serviceTypes: [
      { label: "Turbo", value: "turbo", items: [{ label: "Hold set", value: "hold-set", prices: { bs3: 500 } }] },
    ],
  };
});

const bill = (over = {}) => ({
  billDate: "2026-09-26",
  vehicleNo: "tn52j2622",
  mechanic: "Ramesh",
  lorryAddress: "Sankari",
  phone: "9894830886",
  services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 2, rate: 500 }] }],
  ...over,
});

test("bill numbers continue from billStartNumber (paper book 802)", async () => {
  catalog.billStartNumber = 802;
  const a = await createEngBill(CLIENT, bill());
  const b = await createEngBill(CLIENT, bill());
  assert.equal(a.billNo, 802);
  assert.equal(b.billNo, 803);
});

test("raising billStartNumber later jumps ahead; lowering it never reuses numbers", async () => {
  const a = await createEngBill(CLIENT, bill());
  assert.equal(a.billNo, 1);
  catalog.billStartNumber = 500;
  const b = await createEngBill(CLIENT, bill());
  assert.equal(b.billNo, 500);
  catalog.billStartNumber = 10;
  const c = await createEngBill(CLIENT, bill());
  assert.equal(c.billNo, 501);
});

test("partial payment then discount settles the bill", async () => {
  const created = await createEngBill(CLIENT, bill()); // total 1000
  assert.equal(created.paymentStatus, "Not Received");
  const p1 = await recordEngPayment(CLIENT, created._id, { amount: 600, mode: "upi" });
  assert.equal(p1.amountReceived, 600);
  assert.equal(p1.paymentStatus, "Partial");
  // Frontend sends existing + extra discount; server stores total discount.
  const p2 = await recordEngPayment(CLIENT, created._id, { amount: 300, discount: 100 });
  assert.equal(p2.discount, 100);
  assert.equal(p2.netTotal, 900);
  assert.equal(p2.amountReceived, 900);
  assert.equal(p2.balance, 0);
  assert.equal(p2.paymentStatus, "Received");
  assert.deepEqual(p2.payments.map((p) => [p.amount, p.mode]), [[600, "upi"], [300, "cash"]]);
});

test("payment without discount keeps the existing discount", async () => {
  const created = await createEngBill(CLIENT, bill({ discount: 50 }));
  const p = await recordEngPayment(CLIENT, created._id, { amount: 100 });
  assert.equal(p.discount, 50);
  assert.equal(p.netTotal, 950);
});

test("overpayment is capped at net and only the applied part is logged", async () => {
  const created = await createEngBill(CLIENT, bill()); // 1000
  const p = await recordEngPayment(CLIENT, created._id, { amount: 5000 });
  assert.equal(p.amountReceived, 1000);
  assert.equal(p.balance, 0);
  assert.equal(p.payments.at(-1).amount, 1000);
});

test("editing a bill below what was received caps received and logs a negative adjustment", async () => {
  const created = await createEngBill(CLIENT, bill({ amountReceived: 1000 })); // paid in full
  const edited = await updateEngBill(CLIENT, created._id, bill({
    services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 1, rate: 500 }] }],
  }));
  assert.equal(edited.total, 500);
  assert.equal(edited.amountReceived, 500);
  const adj = edited.payments.at(-1);
  assert.equal(adj.adjustment, true);
  assert.equal(adj.amount, -500);
});

test("lookupVehicle returns the latest bill's address/phone, case-insensitive, tenant-scoped", async () => {
  await createEngBill(CLIENT, bill({ billDate: "2026-09-01", lorryAddress: "Old address" }));
  await createEngBill(CLIENT, bill({ billDate: "2026-09-20", lorryAddress: "New address" }));
  await createEngBill(new ObjectId(), bill({ billDate: "2026-09-25", lorryAddress: "Other tenant" }));
  const m = await lookupVehicle(CLIENT, "TN52J2622");
  assert.equal(m.lorryAddress, "New address");
  assert.equal(m.phone, "9894830886");
  assert.equal(await lookupVehicle(CLIENT, "TN00X0000"), null);
  assert.equal(await lookupVehicle(CLIENT, ""), null);
});
