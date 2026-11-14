// Company backup & restore (super admin): export chosen sections to one file, import adds only what is missing.
// Exercises the REAL backup.dao.js against the in-memory fake Mongo.
// Run with: node --experimental-test-module-mocks --test test/backup.dao.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });

const { exportBackup, importBackup, backupSummary, describeBackup } = await import("../src/dao/backup.dao.js");

const A = new ObjectId();
const B = new ObjectId();
const companyA = { _id: A, name: "Sri Murugan Engineering", code: "smew", businessType: "engineering" };
const companyB = { _id: B, name: "Velu Engineering", code: "velu", businessType: "engineering" };

// A file as the browser downloads and uploads it: plain JSON text.
const roundTrip = (o) => JSON.parse(JSON.stringify(o));

beforeEach(async () => {
  fakeDb = new FakeDb();
  await fakeDb.collection("engbills").insertOne({ clientId: A, billNo: 1, billDate: new Date("2026-11-01T00:00:00Z"), vehicleNo: "TN52J2622", netTotal: 3350 });
  await fakeDb.collection("engbills").insertOne({ clientId: A, billNo: 2, billDate: new Date("2026-11-02T00:00:00Z"), vehicleNo: "TN01AB1234", netTotal: 900 });
  await fakeDb.collection("engbills").insertOne({ clientId: B, billNo: 1, billDate: new Date("2026-11-03T00:00:00Z"), vehicleNo: "KA01X1", netTotal: 100 });
  await fakeDb.collection("expenses").insertOne({ clientId: A, date: new Date("2026-11-05T00:00:00Z"), expenseType: "others", amount: 250 });
  await fakeDb.collection("employees").insertOne({ clientId: A, name: "Kumar", monthlySalary: 15000 });
  await fakeDb.collection("settings").insertOne({ _id: A, businessType: "engineering", company: { name: "Sri Murugan Engineering" } });
  await fakeDb.collection("counters").insertOne({ _id: A, engbill: 2 });
});

test("summary counts each section's records for this company only", async () => {
  const s = await backupSummary(A);
  assert.equal(s.bills.count, 2);
  assert.equal(s.expenses.count, 1);
  assert.equal(s.salary.count, 1);
  assert.equal(s.settings.count, 2); // settings + bill numbering
  assert.equal(s.bonuses.count, 0);
});

test("export holds only the chosen sections, with ids and dates kept as their types", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["bills", "expenses"]));
  assert.deepEqual(file.sections, ["bills", "expenses"]);
  assert.equal(file.data.engbills.length, 2);
  assert.equal(file.data.expenses.length, 1);
  assert.equal(file.data.employees, undefined);
  assert.equal(file.data.settings, undefined);
  assert.ok(file.data.engbills.every((d) => String(d.clientId.$oid) === String(A)), "other companies' bills stay out");
  assert.ok(file.data.engbills[0].billDate.$date, "dates are typed in the file");
  const d = describeBackup(file);
  assert.equal(d.sections.bills.count, 2);
  assert.equal(d.company.code, "smew");
});

test("importing into the same company adds nothing twice and never overwrites", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["bills", "expenses", "salary", "settings"]));
  await fakeDb.collection("engbills").updateOne({ clientId: A, billNo: 1 }, { $set: { netTotal: 9999 } }); // edited after the backup
  await fakeDb.collection("engbills").deleteOne({ clientId: A, billNo: 2 }); // deleted after the backup
  const r = await importBackup(A, companyA, file, ["bills", "expenses", "salary", "settings"]);
  assert.deepEqual([r.bills.added, r.bills.alreadyThere], [1, 1]);
  assert.deepEqual([r.expenses.added, r.expenses.alreadyThere], [0, 1]);
  assert.equal(r.settings.alreadyThere, 1);
  const bills = await fakeDb.collection("engbills").find({ clientId: A }).toArray();
  assert.equal(bills.length, 2);
  assert.equal(bills.find((b) => b.billNo === 1).netTotal, 9999, "the newer edit is kept");
  const restored = bills.find((b) => b.billNo === 2);
  assert.ok(restored.billDate instanceof Date && restored._id instanceof ObjectId && restored.clientId instanceof ObjectId);
});

test("importing into a fresh company restores everything, tagged with that company", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["bills", "expenses", "salary", "settings"]));
  // The original company is gone (offboarded), then restored into a new one.
  for (const c of ["engbills", "expenses", "employees"]) await fakeDb.collection(c).deleteMany({ clientId: A });
  await fakeDb.collection("settings").deleteOne({ _id: A });
  await fakeDb.collection("counters").deleteOne({ _id: A });
  const C = new ObjectId();
  const r = await importBackup(C, { _id: C, code: "smew2", businessType: "engineering" }, file, ["bills", "expenses", "salary", "settings"]);
  assert.equal(r.bills.added, 2);
  assert.equal(r.salary.added, 1);
  assert.equal(r.settings.added, 1);
  assert.equal((await fakeDb.collection("engbills").find({ clientId: C }).toArray()).length, 2);
  assert.equal((await fakeDb.collection("settings").findOne({ _id: C })).company.name, "Sri Murugan Engineering");
  assert.equal((await fakeDb.collection("counters").findOne({ _id: C })).engbill, 2, "numbering continues after the restored bills");
});

test("a record still held by another company is skipped, not moved", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["bills"]));
  const r = await importBackup(B, companyB, file, ["bills"]);
  assert.deepEqual([r.bills.added, r.bills.otherCompany], [0, 2]);
  assert.equal((await fakeDb.collection("engbills").find({ clientId: A }).toArray()).length, 2, "company A keeps its bills");
  assert.equal((await fakeDb.collection("engbills").find({ clientId: B }).toArray()).length, 1);
});

test("bill numbering only moves up on import", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["settings"]));
  await fakeDb.collection("counters").updateOne({ _id: A }, { $set: { engbill: 40 } });
  await importBackup(A, companyA, file, ["settings"]);
  assert.equal((await fakeDb.collection("counters").findOne({ _id: A })).engbill, 40);
});

test("bad input is refused: unknown section, a section not in the file, a foreign file, another company type", async () => {
  const file = roundTrip(await exportBackup(A, companyA, ["expenses"]));
  await assert.rejects(exportBackup(A, companyA, ["users"]), /Unknown section/);
  await assert.rejects(exportBackup(A, companyA, []), /at least one section/);
  await assert.rejects(importBackup(A, companyA, file, ["bills"]), /The file has no Bills/);
  await assert.rejects(importBackup(A, companyA, { hello: 1 }, ["bills"]), /not a company backup/);
  const T = new ObjectId();
  const bills = roundTrip(await exportBackup(A, companyA, ["bills", "expenses"]));
  await assert.rejects(importBackup(T, { _id: T, businessType: "tyre" }, bills, ["bills"]), /engineering company and this one is tyre/);
  const r = await importBackup(T, { _id: T, businessType: "tyre" }, bills, ["expenses"]);
  assert.equal(r.expenses.otherCompany, 1, "expenses aren't tied to a company type; this one still belongs to A");
});
