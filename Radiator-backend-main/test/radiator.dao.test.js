// Radiator (LIVE vertical) bills + bonus sync, exercising the REAL radiator.dao.js
// and bonus.dao.js against the in-memory fake Mongo. Locks in current production
// behavior; no live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/radiator.dao.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
const settings = {
  catalog: {
    productTypes: [{ label: "BS-IV", value: "bs4" }],
    serviceTypes: [{ label: "Service", value: "service" }, { label: "Tank", value: "tank" }],
  },
  bonus: {
    mechanic: { matrix: { bs4: { service: 10, tank: 5 } }, defaultPercent: 0, yearStartMonth: 4 },
    labour: { matrix: { bs4: { service: 4, tank: 4 } }, defaultPercent: 0 },
  },
};

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => settings } });

const { createRadiator, updateRadiator, deleteRadiator, recordPayment, getById } = await import("../src/dao/radiator.dao.js");

const CLIENT = new ObjectId();
beforeEach(() => { fakeDb = new FakeDb(); });

const input = (over = {}) => ({
  billDate: "2026-09-20",
  truckNumber: "TN52R0001",
  transportName: "Velu Transport",
  mechanicName: "Ramesh",
  radiatorType: "BS-IV",
  labourName: ["Kumar", "Siva"],
  serviceInfo: [{ type: "Service", price: 2000 }, { type: "Tank", price: 500 }],
  ...over,
});
const bonuses = () => fakeDb.collection("bonuses").docs;

test("create: totals, status and per-line bonus accrual from the matrix", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  const bill = await getById(CLIENT, insertedId);
  assert.equal(bill.totalAmount, 2500);
  assert.equal(bill.netAmount, 2500);
  assert.equal(bill.pendingAmount, 2500);
  assert.equal(bill.status, "Not Received");
  const mech = bonuses().find((b) => b.type === "mechanic");
  assert.equal(mech.accruedAmount, 225); // 10% of 2000 + 5% of 500
  assert.equal(mech.payableAmount, 0);
});

test("recordPayment: discount is the bill's total discount; status and payable follow net", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  const r1 = await recordPayment(CLIENT, insertedId, 1000, 100); // net 2400
  assert.equal(r1.discount, 100);
  assert.equal(r1.netAmount, 2400);
  assert.equal(r1.receivedAmount, 1000);
  assert.equal(r1.status, "Partial");
  // Frontend (since #29) sends existing + extra; here total 150.
  const r2 = await recordPayment(CLIENT, insertedId, 1350, 150); // net 2350, received 2350
  assert.equal(r2.netAmount, 2350);
  assert.equal(r2.receivedAmount, 2350);
  assert.equal(r2.pendingAmount, 0);
  assert.equal(r2.status, "Received");
  const mech = bonuses().find((b) => b.type === "mechanic");
  // accrued scales with net/gross: 225 × 2350/2500 = 211.5, fully payable.
  assert.equal(mech.accruedAmount, 211.5);
  assert.equal(mech.payableAmount, 211.5);
});

test("recordPayment: overpayment is capped at net", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  const r = await recordPayment(CLIENT, insertedId, 9999, 0);
  assert.equal(r.receivedAmount, 2500);
  assert.equal(r.status, "Received");
});

test("update: editing below what was received caps received (current behavior)", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  await recordPayment(CLIENT, insertedId, 2500, 0);
  const edited = await updateRadiator(CLIENT, insertedId, input({ serviceInfo: [{ type: "Service", price: 1000 }] }));
  assert.equal(edited.totalAmount, 1000);
  assert.equal(edited.receivedAmount, 1000);
  assert.equal(edited.status, "Received");
});

test("delete removes pending bonuses but keeps paid ones", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  const mech = bonuses().find((b) => b.type === "mechanic");
  mech.status = "paid";
  await deleteRadiator(CLIENT, insertedId);
  assert.equal(await getById(CLIENT, insertedId), null);
  const left = bonuses();
  assert.equal(left.length, 1);
  assert.equal(left[0].status, "paid");
});

test("tenant isolation: other tenant cannot read, pay, edit or delete", async () => {
  const { insertedId } = await createRadiator(CLIENT, input());
  const other = new ObjectId();
  assert.equal(await getById(other, insertedId), null);
  await assert.rejects(() => recordPayment(other, insertedId, 100, 0), /not found/i);
  await assert.rejects(() => updateRadiator(other, insertedId, input()), /not found/i);
  await assert.rejects(() => deleteRadiator(other, insertedId), /not found/i);
});
