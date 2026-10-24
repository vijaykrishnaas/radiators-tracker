// Tyre delivery challans: payment plans, per-installment payments, locking, bonus and inventory, exercising the REAL
// tyrebill.dao.js / tyrebonus.dao.js / inventory.dao.js against the in-memory fake Mongo. No live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/tyrebill.dao.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
const settings = {
  businessType: "tyre",
  mechanics: ["Ramesh"],
  tyre: {
    billStartNumber: 101,
    brands: [
      { label: "MRF", value: "mrf", models: [{ label: "10.00-20", value: "10-00-20", rate: 24250 }] },
      { label: "Apollo", value: "apollo", models: [{ label: "9.00-20", value: "9-00-20", rate: 19000 }] },
    ],
    bonus: { mechanicMode: "percent", mechanicPercent: 2, labourMode: "amount", labourAmount: 300, yearStartMonth: 4 },
  },
};

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => settings } });

const { createTyreBill, updateTyreBill, recordTyrePayment, getTyreBillById, deleteTyreBill, enrich, buildTyreQuery, getInstallmentFollowUp } =
  await import("../src/dao/tyrebill.dao.js");
const { addStockEntry, getStockLevels, getPartMovements } = await import("../src/dao/inventory.dao.js");

const CLIENT = new ObjectId();
const OTHER = new ObjectId();
beforeEach(() => { fakeDb = new FakeDb(); });

const tyre = (over = {}) => ({ brandRef: "mrf", modelRef: "10-00-20", tyreNumber: "SN-1", tubeType: "tube", flap: "Yes", qty: 2, rate: 24250, ...over });

// The paper challan's example: tyre amount 48,500 paid as 28,500 now + 10,000 + 10,000 with ₹400 interest on each month.
const plan = () => [
  { label: "Initial amount", dueDate: "2026-09-20", principal: 28500, interest: 0 },
  { label: "1st month", dueDate: "2026-10-20", principal: 10000, interest: 400 },
  { label: "2nd month", dueDate: "2026-11-20", principal: 10000, interest: 400 },
];
const input = (over = {}) => ({
  billDate: "2026-09-20",
  vehicleNumber: "tn 58 ab 1234",
  customerName: "Murugan",
  phoneNumber: "9876543210",
  address: "Madurai",
  mechanicName: "Ramesh",
  labourName: ["Kumar", "Siva"],
  items: [tyre({ qty: 2, rate: 24250 })],
  paymentType: "installment",
  installments: plan(),
  ...over,
});
const bonuses = () => fakeDb.collection("bonuses").docs;
const rejects = (p, rx) => assert.rejects(p, (e) => e.statusCode === 400 && rx.test(e.message));

test("installment challan: principals = tyre amount, interest on top, D.C. number from the start number", async () => {
  const bill = await createTyreBill(CLIENT, input());
  assert.equal(bill.billNo, 101);
  assert.equal(bill.vehicleNumber, "TN 58 AB 1234");
  assert.equal(bill.items[0].brandLabel, "MRF");
  assert.equal(bill.items[0].partRef, "mrf:10-00-20");
  assert.equal(bill.items[0].flap, true);
  assert.equal(bill.items[0].amount, 48500);
  assert.equal(bill.tyreAmount, 48500);
  assert.equal(bill.interestTotal, 800);
  assert.equal(bill.payableTotal, 49300);
  assert.equal(bill.pendingAmount, 49300);
  assert.equal(bill.status, "Not Received");
  assert.equal(bill.installments.length, 3);
  assert.ok(bill.installments.every((r) => typeof r.id === "string" && r.id.length > 0));
  assert.equal(new Date(bill.nextDueDate).toISOString().slice(0, 10), "2026-09-20");
  const second = await createTyreBill(CLIENT, input());
  assert.equal(second.billNo, 102);
});

test("installment plan must match the tyre amount and have amounts", async () => {
  const bad = plan();
  bad[1].principal = 10400; // principals now 48,900
  await rejects(createTyreBill(CLIENT, input({ installments: bad })), /principals add up to ₹48,900 but the tyre amount is ₹48,500/);
  await rejects(createTyreBill(CLIENT, input({ installments: [] })), /at least one installment/);
  const zero = [...plan(), { label: "3rd month", dueDate: "2026-12-20", principal: 0, interest: 0 }];
  await rejects(createTyreBill(CLIENT, input({ installments: zero })), /enter an amount/);
  await rejects(createTyreBill(CLIENT, input({ items: [tyre({ qty: 1.5 })] })), /whole number/);
  await rejects(createTyreBill(CLIENT, input({ items: [tyre({ brandRef: "", modelRef: "" })] })), /choose a brand/);
});

test("payment goes to the chosen installment, capped at what is left on it; no discount on installments", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const [initial, m1] = bill.installments;

  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 1000 }), /Choose which installment/);
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 10401, installmentId: m1.id }), /more than the ₹10,400 left on "1st month"/);
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 100, discount: 50, installmentId: m1.id }), /only for full-payment/);

  // Paying the 1st month before the initial amount is allowed (the user picks the row).
  let after = await recordTyrePayment(CLIENT, bill._id, { amount: 5000, installmentId: m1.id, mode: "upi" });
  assert.equal(after.receivedAmount, 5000);
  assert.equal(after.status, "Partial");
  assert.equal(after.installments[1].paid, 5000);
  assert.equal(after.installments[1].balance, 5400);
  assert.equal(after.payments.at(-1).installmentId, m1.id);
  assert.equal(after.payments.at(-1).mode, "upi");

  after = await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: initial.id });
  assert.equal(after.installments[0].rowStatus, "Paid");
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 1, installmentId: initial.id }), /already fully paid/);

  after = await recordTyrePayment(CLIENT, bill._id, { amount: 5400, installmentId: m1.id });
  after = await recordTyrePayment(CLIENT, bill._id, { amount: 10400, installmentId: after.installments[2].id });
  assert.equal(after.receivedAmount, 49300);
  assert.equal(after.pendingAmount, 0);
  assert.equal(after.status, "Received");
  assert.equal(after.nextDueDate, null);
  assert.equal(after.nextDue, null);
});

test("row status and overdue are worked out from today's date", () => {
  const doc = {
    paymentType: "installment",
    installments: [
      { id: "a", label: "Initial amount", dueDate: new Date("2026-09-20"), principal: 100, interest: 0, payments: [{ amount: 100 }] },
      { id: "b", label: "1st month", dueDate: new Date("2026-10-20"), principal: 100, interest: 10, payments: [{ amount: 50 }] },
      { id: "c", label: "2nd month", dueDate: new Date("2026-11-20"), principal: 100, interest: 10, payments: [] },
      { id: "d", label: "3rd month", dueDate: new Date("2026-12-20"), principal: 100, interest: 10, payments: [{ amount: 20 }] },
    ],
  };
  const e = enrich(doc, new Date("2026-11-20T10:00:00"));
  assert.deepEqual(e.installments.map((r) => r.rowStatus), ["Paid", "Overdue", "Due", "Partly paid"]);
  assert.equal(e.overdueAmount, 60);
  assert.equal(e.overdueCount, 1);
  assert.deepEqual({ id: e.nextDue.id, amount: e.nextDue.amount }, { id: "b", amount: 60 });
});

test("edit: unpaid rows can change, paid rows are locked, payment type is fixed once paid", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const ids = bill.installments.map((r) => r.id);
  await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: ids[0] });

  // Re-plan the unpaid months into three (principal still adds up to 48,500).
  const replanned = [
    { id: ids[0], label: "Initial amount", dueDate: "2026-09-20", principal: 28500, interest: 0 },
    { id: ids[1], label: "1st month", dueDate: "2026-10-25", principal: 7000, interest: 300 },
    { label: "2nd month", dueDate: "2026-11-25", principal: 7000, interest: 300 },
    { label: "3rd month", dueDate: "2026-12-25", principal: 6000, interest: 300 },
  ];
  const edited = await updateTyreBill(CLIENT, bill._id, input({ installments: replanned }));
  assert.equal(edited.installments.length, 4);
  assert.equal(edited.installments[1].id, ids[1]);
  assert.equal(edited.interestTotal, 900);
  assert.equal(edited.payableTotal, 49400);
  assert.equal(edited.receivedAmount, 28500); // the locked row keeps its payment

  const changedLocked = replanned.map((r, i) => (i === 0 ? { ...r, principal: 28000 } : i === 1 ? { ...r, principal: 7500 } : r));
  await rejects(updateTyreBill(CLIENT, bill._id, input({ installments: changedLocked })), /"Initial amount" already has a payment/);
  await rejects(updateTyreBill(CLIENT, bill._id, input({ installments: replanned.slice(1).map((r, i) => (i === 0 ? { ...r, principal: 35500 } : r)) })), /can't be removed/);
  await rejects(updateTyreBill(CLIENT, bill._id, input({ paymentType: "full" })), /payment type can't change/);

  // Lowering the tyre price must still leave a plan that adds up (the paid row can't absorb it).
  await rejects(updateTyreBill(CLIENT, bill._id, input({ items: [tyre({ qty: 1, rate: 20000 })], installments: replanned })), /must match/);
});

test("before any payment the challan can switch between full and installments", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const full = await updateTyreBill(CLIENT, bill._id, input({ paymentType: "full", installments: [] }));
  assert.equal(full.paymentType, "full");
  assert.equal(full.installments.length, 0);
  assert.equal(full.payableTotal, 48500);
  const back = await updateTyreBill(CLIENT, bill._id, input());
  assert.equal(back.paymentType, "installment");
  assert.equal(back.payableTotal, 49300);
});

test("full payment: part payments and discount like the other verticals", async () => {
  const bill = await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined }));
  assert.equal(bill.payableTotal, 48500);
  let after = await recordTyrePayment(CLIENT, bill._id, { amount: 20000, mode: "cash" });
  assert.equal(after.status, "Partial");
  after = await recordTyrePayment(CLIENT, bill._id, { amount: 28000, discount: 500 });
  assert.equal(after.discount, 500);
  assert.equal(after.payableTotal, 48000);
  assert.equal(after.receivedAmount, 48000);
  assert.equal(after.status, "Received");
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 10 }), /already fully paid/);
  // Payments log sums to what was received.
  assert.equal(after.payments.reduce((s, p) => s + p.amount, 0), 48000);
});

test("bonus: % of the tyre amount, payable as the tyre amount is collected (interest ignored); labour fixed ₹ split", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const mech = () => bonuses().find((b) => b.type === "mechanic");
  assert.equal(mech().accruedAmount, 970); // 2% of 48,500 — not of 49,300
  assert.equal(mech().payableAmount, 0);
  assert.equal(mech().period, "2026");
  const lab = bonuses().filter((b) => b.type === "labour");
  assert.deepEqual(lab.map((b) => [b.beneficiary, b.accruedAmount]).sort(), [["Kumar", 150], ["Siva", 150]]);

  await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  // Interest is ignored: 28,500 of the 48,500 tyre amount collected → 970 × 28500/48500
  assert.equal(mech().payableAmount, Math.round(970 * 28500 / 48500 * 100) / 100);
  // Once the tyre price is collected the whole bonus is ready, though 800 of interest is still owed.
  await recordTyrePayment(CLIENT, bill._id, { amount: 10400, installmentId: bill.installments[1].id });
  await recordTyrePayment(CLIENT, bill._id, { amount: 9600, installmentId: bill.installments[2].id });
  assert.equal(mech().payableAmount, 970);

  await deleteTyreBill(CLIENT, bill._id);
  assert.equal(bonuses().length, 0);
});

test("inventory: tyre stock in by brand+model, out by challan lines; whole tyres only", async () => {
  await addStockEntry(CLIENT, { partRef: "mrf:10-00-20", date: "2026-09-01", qty: 10, buyPrice: 21000, supplier: "MRF depot" });
  await assert.rejects(addStockEntry(CLIENT, { partRef: "mrf:10-00-20", date: "2026-09-01", qty: 1.5 }), /whole number/);
  await assert.rejects(addStockEntry(CLIENT, { partRef: "ceat:x", date: "2026-09-01", qty: 1 }), /parts catalog/);
  const bill = await createTyreBill(CLIENT, input());
  const moves = await getPartMovements(CLIENT, "mrf:10-00-20");
  assert.deepEqual(moves.map((m) => [m.kind, m.qty]), [["out", 2], ["in", 10]]);
  assert.equal(moves[0].billNo, bill.billNo);
  assert.equal(typeof getStockLevels, "function"); // summary itself runs an aggregation (not in the fake DB)
});

test("tenant isolation: another tenant can't read, pay or edit a challan", async () => {
  const bill = await createTyreBill(CLIENT, input());
  assert.equal(await getTyreBillById(OTHER, bill._id), null);
  await assert.rejects(recordTyrePayment(OTHER, bill._id, { amount: 1, installmentId: bill.installments[0].id }), (e) => e.statusCode === 404);
  await assert.rejects(updateTyreBill(OTHER, bill._id, input()), (e) => e.statusCode === 404);
  await assert.rejects(deleteTyreBill(OTHER, bill._id), (e) => e.statusCode === 404);
});

test("overdue filter and the dashboard follow-up list", async () => {
  const now = new Date("2026-11-21T09:00:00");
  const q = buildTyreQuery(CLIENT, { overdue: true }, now);
  // Overdue = due on a day before today: anything stored before 21 Nov (UTC midnight of each due day).
  assert.ok(q.nextDueDate.$lte < new Date("2026-11-21T00:00:00Z") && q.nextDueDate.$lte >= new Date("2026-11-20T00:00:00Z"));

  const bill = await createTyreBill(CLIENT, input());
  await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: bill.installments[0].id });
  await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined }));
  const f = await getInstallmentFollowUp(CLIENT, now);
  // 1st month (due 20 Oct) and 2nd month (due 20 Nov) are both before 21 Nov.
  assert.equal(f.overdueAmount, 20800);
  assert.equal(f.overdueBills, 1);
  assert.equal(f.dueThisMonth, 0);
  assert.deepEqual(f.rows.map((r) => [r.label, r.balance, r.overdue]), [["1st month", 10400, true], ["2nd month", 10400, true]]);
});

test("review: a row sent twice is refused (it would copy its payments)", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const ids = bill.installments.map((r) => r.id);
  await recordTyrePayment(CLIENT, bill._id, { amount: 28500, installmentId: ids[0] });
  const dup = [
    { id: ids[0], label: "Initial amount", dueDate: "2026-09-20", principal: 28500, interest: 0 },
    { id: ids[0], label: "Initial amount", dueDate: "2026-09-20", principal: 28500, interest: 0 },
  ];
  await rejects(updateTyreBill(CLIENT, bill._id, input({ items: [tyre({ qty: 1, rate: 57000 })], installments: dup })), /sent twice/);
});

test("review: a write based on a stale read is refused instead of losing a payment", async () => {
  const bill = await createTyreBill(CLIENT, input());
  const coll = fakeDb.collection("tyrebills");
  // Someone else records a payment between this request's read and its write: simulate by moving updatedAt on.
  const realFindOne = coll.findOne.bind(coll);
  let bump = 0;
  coll.findOne = async (q) => {
    const doc = await realFindOne(q);
    // A minute apart each time: the fake DB compares dates as strings, which only carry whole seconds.
    bump += 60_000;
    coll.docs[0] = { ...coll.docs[0], updatedAt: new Date(Date.now() + bump) };
    return doc;
  };
  await assert.rejects(recordTyrePayment(CLIENT, bill._id, { amount: 100, installmentId: bill.installments[0].id }), (e) => e.statusCode === 409);
  await assert.rejects(updateTyreBill(CLIENT, bill._id, input()), (e) => e.statusCode === 409);
  coll.findOne = realFindOne;
  const ok = await recordTyrePayment(CLIENT, bill._id, { amount: 100, installmentId: bill.installments[0].id });
  assert.equal(ok.receivedAmount, 100);
});

test("review: a full-payment challan can't be edited below what was received", async () => {
  const bill = await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined }));
  await recordTyrePayment(CLIENT, bill._id, { amount: 40000 });
  await rejects(updateTyreBill(CLIENT, bill._id, input({ paymentType: "full", items: [tyre({ qty: 1, rate: 30000 })] })), /₹40,000 is already received/);
  const fine = await updateTyreBill(CLIENT, bill._id, input({ paymentType: "full", items: [tyre({ qty: 2, rate: 22000 })] }));
  assert.equal(fine.payableTotal, 44000);
  assert.equal(fine.receivedAmount, 40000);
});

test("review: re-sending the same discount with no amount is not a payment", async () => {
  const bill = await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined }));
  await recordTyrePayment(CLIENT, bill._id, { amount: 1000, discount: 500 });
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 0, discount: 500 }), /Enter a payment amount/);
});

test("review: an installment is not overdue on its own due date, whatever the server's time zone", () => {
  const doc = {
    paymentType: "installment",
    installments: [
      { id: "a", label: "1st month", dueDate: new Date("2026-10-24T00:00:00Z"), principal: 100, interest: 0, payments: [] },
      { id: "b", label: "Initial amount", dueDate: new Date("2026-10-23T00:00:00Z"), principal: 100, interest: 0, payments: [] },
    ],
  };
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Honolulu"]) {
      process.env.TZ = tz;
      // 9 am on 24 Oct in that zone.
      const now = new Date(2026, 9, 24, 9, 0, 0);
      const e = enrich(doc, now);
      assert.deepEqual(e.installments.map((r) => r.rowStatus), ["Due", "Overdue"], tz);
    }
  } finally {
    process.env.TZ = before;
  }
});

test("review: a challan discounted to ₹0 is settled, not 'Not Received'", async () => {
  const bill = await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined, items: [tyre({ qty: 1, rate: 1000 })] }));
  const after = await recordTyrePayment(CLIENT, bill._id, { amount: 0, discount: 1000 });
  assert.equal(after.payableTotal, 0);
  assert.equal(after.pendingAmount, 0);
  assert.equal(after.status, "Received");
});

test("review: a discount can't cut the total below what was already received", async () => {
  const bill = await createTyreBill(CLIENT, input({ paymentType: "full", installments: undefined }));
  await recordTyrePayment(CLIENT, bill._id, { amount: 40000 });
  // 8,500 is still owed; a 10,000 discount would leave 38,500 to collect against 40,000 received.
  await rejects(recordTyrePayment(CLIENT, bill._id, { amount: 0, discount: 10000 }), /more than the ₹8,500 still owed/);
  const ok = await recordTyrePayment(CLIENT, bill._id, { amount: 0, discount: 8500 });
  assert.equal(ok.status, "Received");
  assert.equal(ok.receivedAmount, 40000);
});
