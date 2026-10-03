// Engineering mechanic bonus: entries follow bill saves, payments, edits and deletes, and the review data is shaped
// for the existing Mechanic Review page. Real DAO functions against the in-memory fake Mongo; no live DB.
// Run with: node --experimental-test-module-mocks --test test/engbonus.dao.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

const fakeDb = new FakeDb();
const settings = {
  engineering: {
    billStartNumber: 1,
    fyStartMonth: 4,
    bonus: { mechanicPercent: 10 },
    serviceTypes: [{
      label: "Turbo", value: "turbo",
      items: [
        { label: "Hold set", value: "hold-set", prices: { bs3: 1000 } },
        { label: "Other", value: "other", prices: { bs3: 0 }, requiresComment: true },
      ],
    }],
  },
};
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => settings } });

const { createEngBill, updateEngBill, deleteEngBill, recordEngPayment } = await import("../src/dao/engbill.dao.js");
const { getEngReviewData, backfillEng, syncEngBonusesForRecord } = await import("../src/dao/engbonus.dao.js");

const CLIENT = new ObjectId().toString();
const OTHER = new ObjectId().toString();
const bonuses = () => fakeDb.collection("bonuses").docs;
const bill = (over = {}) => ({
  billDate: "2026-05-10", vehicleNo: "TN01AB1234", mechanic: "Ravi",
  services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 2, rate: 1000 }] }],
  ...over,
});

test("a new bill creates a pending mechanic entry: accrued = % of net, payable follows collection", async () => {
  const b = await createEngBill(CLIENT, bill({ discount: 200, amountReceived: 900 })); // total 2000, net 1800, received 900
  const e = bonuses().find((x) => String(x.recordId) === String(b._id));
  assert.ok(e, "entry created");
  assert.equal(e.type, "mechanic");
  assert.equal(e.status, "pending");
  assert.equal(e.beneficiary, "Ravi");
  assert.equal(e.accruedAmount, 180);   // 10% of 1800
  assert.equal(e.payableAmount, 90);    // half collected
  assert.equal(e.billAmount, 1800);
  assert.equal(e.period, "2026");       // FY starting April 2026
});

test("a May-vs-February bill falls in the right financial year", async () => {
  const b = await createEngBill(CLIENT, bill({ billDate: "2026-02-10" }));
  const e = bonuses().find((x) => String(x.recordId) === String(b._id));
  assert.equal(e.period, "2025");
});

test("recording a payment raises payable on the same entry (no duplicate)", async () => {
  const b = await createEngBill(CLIENT, bill()); // total 2000 unpaid
  const before = bonuses().filter((x) => String(x.recordId) === String(b._id));
  assert.equal(before.length, 1);
  assert.equal(before[0].payableAmount, 0);
  await recordEngPayment(CLIENT, String(b._id), { amount: 2000, mode: "cash" });
  const after = bonuses().filter((x) => String(x.recordId) === String(b._id));
  assert.equal(after.length, 1);
  assert.equal(after[0].payableAmount, 200);
});

test("editing the bill re-prices the entry and follows a mechanic change", async () => {
  const b = await createEngBill(CLIENT, bill());
  await updateEngBill(CLIENT, String(b._id), bill({ mechanic: "Suresh", services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 1, rate: 1000 }] }] }));
  const es = bonuses().filter((x) => String(x.recordId) === String(b._id));
  assert.equal(es.length, 1);
  assert.equal(es[0].beneficiary, "Suresh");
  assert.equal(es[0].accruedAmount, 100);
});

test("a paid entry is a settlement record: later edits never rewrite it", async () => {
  const b = await createEngBill(CLIENT, bill({ amountReceived: 2000 }));
  const e = bonuses().find((x) => String(x.recordId) === String(b._id));
  e.status = "paid"; e.paidAmount = 200;
  await updateEngBill(CLIENT, String(b._id), bill({ services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 5, rate: 1000 }] }] }));
  const es = bonuses().filter((x) => String(x.recordId) === String(b._id));
  assert.equal(es.length, 1, "no new pending entry next to the paid one");
  assert.equal(es[0].accruedAmount, 200);
});

test("deleting a bill removes its pending entry but keeps paid history", async () => {
  const pending = await createEngBill(CLIENT, bill());
  const paidBill = await createEngBill(CLIENT, bill({ amountReceived: 2000 }));
  bonuses().find((x) => String(x.recordId) === String(paidBill._id)).status = "paid";
  await deleteEngBill(CLIENT, String(pending._id));
  await deleteEngBill(CLIENT, String(paidBill._id));
  assert.equal(bonuses().filter((x) => String(x.recordId) === String(pending._id)).length, 0);
  assert.equal(bonuses().filter((x) => String(x.recordId) === String(paidBill._id)).length, 1);
});

test("a bonus failure never blocks saving the bill", async () => {
  const realLog = console.error; console.error = () => {};
  const col = fakeDb.collection("bonuses");
  const orig = col.updateOne; col.updateOne = async () => { throw new Error("boom"); };
  try {
    const b = await createEngBill(CLIENT, bill());
    assert.ok(b._id);
  } finally { col.updateOne = orig; console.error = realLog; }
});

test("backfill creates entries for existing bills of this tenant only", async () => {
  const before = bonuses().length;
  fakeDb.collection("engbills").docs.push({ _id: new ObjectId(), clientId: new ObjectId(OTHER), billDate: new Date("2026-06-01"), mechanic: "Zed", total: 1000, netTotal: 1000, amountReceived: 0 });
  const n = await backfillEng(CLIENT);
  assert.ok(n > 0);
  assert.equal(bonuses().filter((x) => x.beneficiary === "Zed").length, 0, "other tenant untouched");
  assert.ok(bonuses().length >= before);
});

test("review data is shaped for the Mechanic Review page and scoped to the mechanic + tenant", async () => {
  fakeDb.collections.engbills = undefined; fakeDb.collections.bonuses = undefined;
  const a = await createEngBill(CLIENT, bill({ billDate: "2026-05-10", amountReceived: 1000, services: [{ type: "turbo", bsModel: "bs3", items: [{ item: "hold-set", qty: 2, rate: 1000 }, { item: "other", qty: 1, rate: 500, comment: "Bearing clean" }] }] }));
  await createEngBill(CLIENT, bill({ billDate: "2026-05-12", mechanic: "Suresh" }));
  await createEngBill(OTHER, bill({ billDate: "2026-05-11" }));
  const r = await getEngReviewData(CLIENT, "mechanic", "Ravi", "2026-05-01", "2026-05-31", settings);
  assert.equal(r.granularity, "daily");
  assert.equal(r.summary.totalBills, 1);
  assert.equal(r.summary.totalRevenue, 2500);
  assert.equal(r.summary.totalCollected, 1000);
  assert.equal(r.summary.collectionRate, 40);
  assert.equal(r.summary.totalOperations, 2);
  assert.equal(r.summary.suggestedBonus, 100); // 10% of 2500 * 1000/2500
  assert.equal(r.bills.length, 1);
  assert.equal(r.bills[0].truckNumber, "TN01AB1234");
  assert.deepEqual(r.bills[0].services.map((s) => s.comments || s.type), ["Hold set", "Bearing clean"]);
  assert.equal(r.bills[0].totalAmount, 2500);
  assert.equal(r.timeline.length, 31, "daily timeline is gap-filled");
  assert.equal(r.byServiceType[0].type, "Turbo");
  assert.equal(r.byProductType[0].product, "BS3");
  assert.ok(a._id);
});

test("labour review is empty for engineering (no labour role)", async () => {
  const r = await getEngReviewData(CLIENT, "labour", "Anyone", "2026-05-01", "2026-05-31", settings);
  assert.equal(r.summary.totalBills, 0);
  assert.deepEqual(r.bills, []);
});

test("no mechanic means no entry, and clearing the mechanic drops the pending entry", async () => {
  const before = bonuses().length;
  await syncEngBonusesForRecord(CLIENT, { _id: new ObjectId(), billDate: "2026-05-10", total: 100, netTotal: 100 });
  assert.equal(bonuses().length, before);
  const b = await createEngBill(CLIENT, bill());
  assert.ok(bonuses().some((x) => String(x.recordId) === String(b._id)));
  await syncEngBonusesForRecord(CLIENT, { ...b, mechanic: "" });
  assert.ok(!bonuses().some((x) => String(x.recordId) === String(b._id)));
});
