// Automobile bills + bonus sync, exercising the REAL autobill.dao.js and
// bonus.dao.js against the in-memory fake Mongo. No live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/autobill.bonus.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
const settings = {
  businessType: "automobile",
  mechanics: ["Ramesh"],
  automobile: { bonus: { mechanicPercent: 10, labourPercent: 4, yearStartMonth: 4 } },
};

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => settings } });

const { createAutoBill, updateAutoBill, recordPayment, getById } = await import("../src/dao/autobill.dao.js");

const CLIENT = new ObjectId();
beforeEach(() => { fakeDb = new FakeDb(); });

const input = (over = {}) => ({
  billDate: "2026-09-20",
  vehicleNumber: "TN52AB1234",
  mechanicName: "Ramesh",
  labourName: ["Kumar", "Siva"],
  items: [{ particulars: "Engine oil", qty: 2, rate: 450 }, { particulars: "Labour", qty: 1, rate: 100 }],
  ...over,
});
const bonuses = () => fakeDb.collection("bonuses").docs;

test("create: items priced qty × rate, per-tenant bill number, bonus accrued but not yet payable", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input());
  const bill = await getById(CLIENT, insertedId);
  assert.equal(bill.billNo, 1);
  assert.equal(bill.totalAmount, 1000);
  assert.equal(bill.status, "Not Received");
  const mech = bonuses().find((b) => b.type === "mechanic");
  assert.equal(mech.accruedAmount, 100); // 10% of 1000
  assert.equal(mech.payableAmount, 0);
  const lab = bonuses().filter((b) => b.type === "labour");
  assert.deepEqual(lab.map((b) => [b.beneficiary, b.accruedAmount]).sort(), [["Kumar", 20], ["Siva", 20]]); // 4% split
  const second = await createAutoBill(CLIENT, input());
  assert.equal((await getById(CLIENT, second.insertedId)).billNo, 2);
});

test("payment with discount: net-based status and payable bonus", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input());
  const part = await recordPayment(CLIENT, insertedId, 450, 100); // net 900, received 450
  assert.equal(part.netAmount, 900);
  assert.equal(part.status, "Partial");
  let mech = bonuses().find((b) => b.type === "mechanic");
  assert.equal(mech.accruedAmount, 90);   // 10% of net 900
  assert.equal(mech.payableAmount, 45);   // half collected
  const done = await recordPayment(CLIENT, insertedId, 450, 100);
  assert.equal(done.status, "Received");
  mech = bonuses().find((b) => b.type === "mechanic");
  assert.equal(mech.payableAmount, 90);
});

test("received is capped at net when overpaid", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input());
  const r = await recordPayment(CLIENT, insertedId, 5000, 0);
  assert.equal(r.receivedAmount, 1000);
  assert.equal(r.pendingAmount, 0);
});

test("editing labour removes the dropped worker's pending bonus; paid entries stay locked", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input());
  // Mark the mechanic entry paid, then change the bill total.
  const mech = bonuses().find((b) => b.type === "mechanic");
  mech.status = "paid";
  mech.payableAmount = 12345;
  await updateAutoBill(CLIENT, insertedId, input({ labourName: ["Kumar"], items: [{ particulars: "Oil", qty: 1, rate: 2000 }] }));
  const lab = bonuses().filter((b) => b.type === "labour");
  assert.deepEqual(lab.map((b) => [b.beneficiary, b.accruedAmount]), [["Kumar", 80]]); // 4% of 2000, one worker
  const mechAfter = bonuses().filter((b) => b.type === "mechanic");
  assert.equal(mechAfter.length, 1, "no duplicate pending mechanic entry once paid");
  assert.equal(mechAfter[0].payableAmount, 12345, "paid entry untouched");
});

test("tenant isolation: another tenant cannot read or pay the bill", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input());
  const other = new ObjectId();
  assert.equal(await getById(other, insertedId), null);
  await assert.rejects(() => recordPayment(other, insertedId, 100, 0), /not found/);
});

test("memos: items keep a clamped memo index; items sent without one are stored as before", async () => {
  const { insertedId } = await createAutoBill(CLIENT, input({
    items: [
      { particulars: "Engine oil", qty: 2, rate: 450, memo: 0 },
      { particulars: "Filter", qty: 1, rate: 300, memo: "1" },
      { particulars: "Stray", qty: 1, rate: 10, memo: 999 },
      { particulars: "Junk", qty: 1, rate: 10, memo: "abc" },
    ],
  }));
  const bill = await getById(CLIENT, insertedId);
  assert.deepEqual(bill.items.map((i) => i.memo), [0, 1, 49, 0]);
  assert.equal(bill.totalAmount, 1220);

  const { insertedId: plainId } = await createAutoBill(CLIENT, input());
  const plain = await getById(CLIENT, plainId);
  assert.ok(plain.items.every((i) => !("memo" in i)));
});
