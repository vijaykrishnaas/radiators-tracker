// Salary settlement advance handling, exercising the REAL src/dao/salary.dao.js
// against the in-memory fake Mongo. No live MongoDB needed.
// Run with: node --experimental-test-module-mocks --test test/salary.dao.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb = new FakeDb();
let presentDays = 30;

mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", {
  namedExports: { getSettings: async () => ({ salary: { workingDayRule: "allDays", weeklyOffDay: 0 } }) },
});
mock.module("../src/dao/attendance.dao.js", {
  namedExports: { computePresentDays: async () => presentDays },
});

const { splitAdvances, previewSettlement, settlePeriod } = await import("../src/dao/salary.dao.js");

const CLIENT = new ObjectId();

async function freshEmployee(baseSalary) {
  fakeDb = new FakeDb();
  presentDays = 30;
  const emp = { clientId: CLIENT, name: "Ramesh", baseSalary, active: true };
  const { insertedId } = await fakeDb.collection("employees").insertOne(emp);
  return insertedId;
}

async function addAdvance(employeeId, amount) {
  await fakeDb.collection("advances").insertOne({
    clientId: CLIENT, employeeId, date: new Date("2026-09-05"), amount, reason: "test", status: "unapplied",
  });
}

test("splitAdvances caps the deduction at gross and carries the rest", () => {
  assert.deepEqual(splitAdvances([{ amount: 5000 }], 3000), { total: 5000, deducted: 3000, carryForward: 2000 });
  assert.deepEqual(splitAdvances([{ amount: 1000 }, { amount: 500 }], 3000), { total: 1500, deducted: 1500, carryForward: 0 });
  assert.deepEqual(splitAdvances([], 3000), { total: 0, deducted: 0, carryForward: 0 });
  assert.deepEqual(splitAdvances([{ amount: 700 }], 0), { total: 700, deducted: 0, carryForward: 700 });
});

test("advance larger than gross: excess is carried forward, not lost", async () => {
  const eid = await freshEmployee(3000); // 30 working days, 30 present → gross 3000
  await addAdvance(eid, 5000);

  const preview = await previewSettlement(CLIENT, eid, "2026-09-01", "2026-09-30");
  assert.equal(preview.grossAmount, 3000);
  assert.equal(preview.advancesDeducted, 3000);
  assert.equal(preview.advancesCarriedForward, 2000);
  assert.equal(preview.netAmount, 0);

  const period = await settlePeriod(CLIENT, eid, "2026-09-01", "2026-09-30");
  assert.equal(period.advancesDeducted, 3000);
  assert.equal(period.advancesCarriedForward, 2000);
  assert.equal(period.netAmount, 0);

  const all = fakeDb.collection("advances").docs;
  const original = all.find((a) => a.amount === 5000);
  assert.equal(original.status, "applied");
  const carried = all.filter((a) => a.status === "unapplied");
  assert.equal(carried.length, 1, "exactly one carried-forward advance");
  assert.equal(carried[0].amount, 2000);
  assert.equal(String(carried[0].employeeId), String(eid));
  assert.equal(String(carried[0].carriedFromPeriodId), String(period._id));

  // Next month the carried ₹2,000 is recovered.
  const next = await previewSettlement(CLIENT, eid, "2026-10-01", "2026-10-30");
  assert.equal(next.advancesDeducted, 2000);
  assert.equal(next.netAmount, 1000);
});

test("advance smaller than gross: unchanged behavior, nothing carried", async () => {
  const eid = await freshEmployee(30000);
  await addAdvance(eid, 5000);
  const period = await settlePeriod(CLIENT, eid, "2026-09-01", "2026-09-30", {
    deductions: [{ amount: 1000, reason: "damage" }],
  });
  assert.equal(period.grossAmount, 30000);
  assert.equal(period.advancesDeducted, 5000);
  assert.equal(period.advancesCarriedForward, 0);
  assert.equal(period.netAmount, 24000);
  assert.equal(fakeDb.collection("advances").docs.filter((a) => a.status === "unapplied").length, 0);
});

test("re-settling the same employee+period is rejected", async () => {
  const eid = await freshEmployee(3000);
  await settlePeriod(CLIENT, eid, "2026-09-01", "2026-09-30");
  await assert.rejects(() => settlePeriod(CLIENT, eid, "2026-09-01", "2026-09-30"), /already been settled/);
});
