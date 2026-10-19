// Exercises the REAL exported functions in src/dao/engbill.dao.js against an
// in-memory fake Mongo (test/helpers/fakeDb.js) — no live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/engbill.dao.test.js
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

const fakeDb = new FakeDb();

const catalog = {
  billStartNumber: 1,
  serviceTypes: [
    {
      label: "Turbo",
      value: "turbo",
      items: [
        { label: "Hold set", value: "hold-set", prices: { bs3: 500, bs4: 500, bs6: 500 } },
        { label: "Other", value: "other", prices: { bs3: 0, bs4: 0, bs6: 0 }, requiresComment: true },
      ],
    },
  ],
};

mock.module("../src/config/db.js", {
  namedExports: { connectDB: async () => fakeDb },
});
mock.module("../src/dao/settings.dao.js", {
  namedExports: { getSettings: async () => ({ engineering: catalog }) },
});

const {
  createEngBill,
  updateEngBill,
  deleteEngBill,
  recordEngPayment,
  getEngBillById,
  listEngBills,
} = await import("../src/dao/engbill.dao.js");

const CLIENT_A = new ObjectId().toString();
const CLIENT_B = new ObjectId().toString();

function baseBill(overrides = {}) {
  return {
    billDate: "2026-01-15",
    vehicleNo: "tn01ab1234",
    mechanic: "Ravi",
    services: [
      {
        type: "turbo",
        bsModel: "bs4",
        items: [{ item: "hold-set", qty: 2, rate: 500 }],
      },
    ],
    ...overrides,
  };
}

test("createEngBill computes totals, discount clamp, and initial payment log", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill({ discount: 200, amountReceived: 700 }));
  assert.equal(bill.total, 1000); // 2 * 500
  assert.equal(bill.discount, 200);
  assert.equal(bill.netTotal, 800);
  assert.equal(bill.amountReceived, 700);
  assert.equal(bill.balance, 100);
  assert.equal(bill.paymentStatus, "Partial");
  assert.equal(bill.payments.length, 1);
  assert.equal(bill.payments[0].amount, 700);
});

test("createEngBill clamps discount to total and amountReceived to netTotal", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill({ discount: 5000, amountReceived: 5000 }));
  assert.equal(bill.total, 1000);
  assert.equal(bill.discount, 1000); // clamped to total
  assert.equal(bill.netTotal, 0);
  assert.equal(bill.amountReceived, 0); // clamped to netTotal
  assert.equal(bill.paymentStatus, "Not Received");
});

test("createEngBill rejects a bill with no items / missing required fields", async () => {
  await assert.rejects(() => createEngBill(CLIENT_A, baseBill({ vehicleNo: "" })), /Truck number is required/);
  await assert.rejects(() => createEngBill(CLIENT_A, baseBill({ services: [] })), /Add at least one service/);
  await assert.rejects(
    () => createEngBill(CLIENT_A, baseBill({ services: [{ type: "turbo", bsModel: "bs4", items: [] }] })),
    /choose at least one item/
  );
});

test("createEngBill enforces requiresComment for catalog items that need one", async () => {
  await assert.rejects(
    () =>
      createEngBill(
        CLIENT_A,
        baseBill({ services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "other", qty: 1, rate: 100 }] }] })
      ),
    /describe the work/
  );
});

test("bill numbers increment per tenant independently", async () => {
  const a1 = await createEngBill(CLIENT_A, baseBill());
  const b1 = await createEngBill(CLIENT_B, baseBill());
  const a2 = await createEngBill(CLIENT_A, baseBill());
  assert.equal(b1.billNo, 1); // independent counter for tenant B
  assert.equal(a2.billNo, a1.billNo + 1);
});

test("tenant isolation: a bill created for client A is invisible to client B", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill());
  const asOwner = await getEngBillById(CLIENT_A, bill._id.toString());
  const asOther = await getEngBillById(CLIENT_B, bill._id.toString());
  assert.ok(asOwner);
  assert.equal(asOther, null);
});

test("tenant isolation: client B cannot update or delete client A's bill", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill());
  await assert.rejects(() => updateEngBill(CLIENT_B, bill._id.toString(), baseBill()), /not found/i);
  await assert.rejects(() => deleteEngBill(CLIENT_B, bill._id.toString()), /not found/i);
  const stillThere = await getEngBillById(CLIENT_A, bill._id.toString());
  assert.ok(stillThere);
});

test("tenant isolation: listEngBills for one tenant never returns another tenant's bills", async () => {
  await createEngBill(CLIENT_A, baseBill());
  await createEngBill(CLIENT_B, baseBill());
  const { bills } = await listEngBills(CLIENT_A, {}, 1, 50);
  assert.ok(bills.length > 0);
  assert.ok(bills.every((b) => String(b.clientId) === String(CLIENT_A)));
});

test("updateEngBill recomputes totals and logs an adjustment payment for the delta", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill({ amountReceived: 1000 }));
  assert.equal(bill.amountReceived, 1000);

  // Edit: drop quantity to 1 -> total 500, netTotal 500. amountReceived should
  // be re-capped down from 1000 to 500 automatically.
  const edited = await updateEngBill(CLIENT_A, bill._id.toString(), baseBill({
    services: [{ type: "turbo", bsModel: "bs4", items: [{ item: "hold-set", qty: 1, rate: 500 }] }],
  }));
  assert.equal(edited.total, 500);
  assert.equal(edited.amountReceived, 500);
  assert.equal(edited.paymentStatus, "Received");
  const lastPayment = edited.payments[edited.payments.length - 1];
  assert.equal(lastPayment.adjustment, true);
  assert.equal(lastPayment.amount, -500);
});

test("recordEngPayment accumulates sequential payments correctly", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill()); // total 1000, netTotal 1000
  const p1 = await recordEngPayment(CLIENT_A, bill._id.toString(), { amount: 300 });
  assert.equal(p1.amountReceived, 300);
  assert.equal(p1.balance, 700);
  const p2 = await recordEngPayment(CLIENT_A, bill._id.toString(), { amount: 400 });
  assert.equal(p2.amountReceived, 700);
  assert.equal(p2.payments.length, 2);
  assert.equal(p2.payments[1].amount, 400);
});

test("recordEngPayment caps an overpayment at the net total instead of exceeding it", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill()); // netTotal 1000
  const paid = await recordEngPayment(CLIENT_A, bill._id.toString(), { amount: 5000 });
  assert.equal(paid.amountReceived, 1000);
  assert.equal(paid.balance, 0);
  assert.equal(paid.paymentStatus, "Received");
});

test("recordEngPayment rejects a negative payment amount", async () => {
  const bill = await createEngBill(CLIENT_A, baseBill());
  await assert.rejects(() => recordEngPayment(CLIENT_A, bill._id.toString(), { amount: -50 }), /non-negative/);
});
