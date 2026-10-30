// Radiator bonus: ₹ per service line (grid) vs fixed ₹ per bill, and cancelling bonus that was already paid.
// Exercises the REAL bonus.dao.js against the in-memory fake Mongo.
// Run with: node --experimental-test-module-mocks --test test/bonus.radiator.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
let settings;

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => settings } });

const { syncBonusesForRecord, markPaidByRange, cancelPaidBonus } = await import("../src/dao/bonus.dao.js");

const CLIENT = new ObjectId();
const baseSettings = () => ({
  catalog: { productTypes: [{ label: "BS-3", value: "bs3" }], serviceTypes: [{ label: "Service", value: "service" }] },
  bonus: {
    mechanic: { mode: "line", amount: 0, amountMatrix: { bs3: { service: 100 } }, defaultAmount: 0, yearStartMonth: 4 },
    labour: { mode: "line", amount: 0, amountMatrix: { bs3: { service: 40 } }, defaultAmount: 0 },
  },
});
beforeEach(() => { fakeDb = new FakeDb(); settings = baseSettings(); });

const record = (over = {}) => ({
  _id: new ObjectId(),
  billDate: "2026-09-20",
  radiatorType: "BS-3",
  mechanicName: "Ravi",
  labourName: ["Kumar", "Siva"],
  serviceInfo: [{ type: "Service", price: 1000 }],
  receivedAmount: 500,
  ...over,
});
const entries = () => fakeDb.collection("bonuses").docs;
const mech = () => entries().find((e) => e.type === "mechanic");

test("₹ per service (default): each service line earns its grid amount, payable as collected", async () => {
  await syncBonusesForRecord(CLIENT, record());
  assert.equal(mech().accruedAmount, 100);
  assert.equal(mech().payableAmount, 50);
  assert.deepEqual(entries().filter((e) => e.type === "labour").map((e) => e.accruedAmount), [20, 20]); // ₹40 split
  // Two service lines earn twice; a line not in the grid earns the default ₹.
  fakeDb = new FakeDb();
  settings.bonus.mechanic.defaultAmount = 25;
  await syncBonusesForRecord(CLIENT, record({ serviceInfo: [{ type: "Service", price: 1000 }, { type: "Service", price: 500 }, { type: "Tank", price: 500 }], receivedAmount: 2000 }));
  assert.equal(mech().accruedAmount, 225);
});

test("bonus is rupees only: an old % grid (or no mode) is never read as rupees", async () => {
  settings.bonus.mechanic = { matrix: { bs3: { service: 10 } }, defaultPercent: 5, yearStartMonth: 4 };
  await syncBonusesForRecord(CLIENT, record());
  assert.equal(mech().accruedAmount, 0);
});

test("₹ per bill: mechanic earns the fixed amount, payable in step with collection", async () => {
  settings.bonus.mechanic.mode = "amount";
  settings.bonus.mechanic.amount = 300;
  await syncBonusesForRecord(CLIENT, record());
  assert.equal(mech().accruedAmount, 300);
  assert.equal(mech().payableAmount, 150); // half the bill collected
});

test("₹ per bill for labour is split equally among the bill's workers", async () => {
  settings.bonus.labour.mode = "amount";
  settings.bonus.labour.amount = 200;
  await syncBonusesForRecord(CLIENT, record({ receivedAmount: 1000 }));
  const lab = entries().filter((e) => e.type === "labour");
  assert.deepEqual(lab.map((e) => [e.beneficiary, e.accruedAmount, e.payableAmount]).sort(), [["Kumar", 100, 100], ["Siva", 100, 100]]);
});

test("₹ per bill: a zero-total bill earns nothing, and a silly amount is clamped", async () => {
  settings.bonus.mechanic.mode = "amount";
  settings.bonus.mechanic.amount = 500;
  await syncBonusesForRecord(CLIENT, record({ serviceInfo: [{ type: "Service", price: 0 }], receivedAmount: 0 }));
  assert.equal(mech().accruedAmount, 0);
  fakeDb = new FakeDb();
  settings.bonus.mechanic.amount = -50;
  await syncBonusesForRecord(CLIENT, record());
  assert.equal(mech().accruedAmount, 0);
});

test("cancel by range: paid entries become Cancelled at ₹0, keep what was paid, and never come back", async () => {
  const bill = record({ receivedAmount: 1000 });
  await syncBonusesForRecord(CLIENT, bill);
  await markPaidByRange(CLIENT, "mechanic", "Ravi", "2026-09-01", "2026-09-30");
  assert.equal(mech().status, "paid");
  assert.equal(mech().paidAmount, 100);

  const res = await cancelPaidBonus(CLIENT, { type: "mechanic", beneficiary: "Ravi", from: "2026-09-01", to: "2026-09-30", note: "paid twice" });
  assert.deepEqual(res, { modified: 1, amount: 100 });
  const e = mech();
  assert.equal(e.status, "cancelled");
  assert.equal(e.accruedAmount, 0);
  assert.equal(e.payableAmount, 0);
  assert.equal(e.paidAmount, 0);
  assert.equal(e.cancelled.paidAmount, 100);
  assert.equal(e.cancelNote, "paid twice");

  // A later edit / Recalculate of the bill must not re-create a pending mechanic bonus.
  await syncBonusesForRecord(CLIENT, { ...bill, serviceInfo: [{ type: "Service", price: 2000 }] });
  const mechEntries = entries().filter((x) => x.type === "mechanic");
  assert.equal(mechEntries.length, 1);
  assert.equal(mechEntries[0].status, "cancelled");
});

test("cancel by entry id touches only that paid entry; pending entries cannot be cancelled", async () => {
  await syncBonusesForRecord(CLIENT, record({ receivedAmount: 1000 }));
  await markPaidByRange(CLIENT, "labour", "Kumar", "2026-09-01", "2026-09-30");
  const kumar = entries().find((e) => e.beneficiary === "Kumar");
  const siva = entries().find((e) => e.beneficiary === "Siva");
  assert.equal(siva.status, "pending");

  assert.deepEqual(await cancelPaidBonus(CLIENT, { type: "labour", ids: [String(siva._id)] }), { modified: 0, amount: 0 });
  const res = await cancelPaidBonus(CLIENT, { type: "labour", ids: [String(kumar._id)] });
  assert.equal(res.modified, 1);
  assert.equal(entries().find((e) => e.beneficiary === "Kumar").status, "cancelled");
  assert.equal(entries().find((e) => e.beneficiary === "Siva").status, "pending");
});

test("cancel never reaches another tenant's entries", async () => {
  await syncBonusesForRecord(CLIENT, record({ receivedAmount: 1000 }));
  await markPaidByRange(CLIENT, "mechanic", "Ravi", "2026-09-01", "2026-09-30");
  const other = new ObjectId();
  const res = await cancelPaidBonus(other, { type: "mechanic", ids: [String(mech()._id)] });
  assert.equal(res.modified, 0);
  assert.equal(mech().status, "paid");
});

test("issuing a bonus with a negative amount is refused and nothing is marked paid", async () => {
  await syncBonusesForRecord(CLIENT, record({ receivedAmount: 1000 }));
  await assert.rejects(markPaidByRange(CLIENT, "mechanic", "Ravi", "2026-09-01", "2026-09-30", -500), (e) => e.statusCode === 400 && /0 or more/.test(e.message));
  assert.equal(mech().status, "pending");
  assert.equal(mech().paidAmount ?? 0, 0);
});
