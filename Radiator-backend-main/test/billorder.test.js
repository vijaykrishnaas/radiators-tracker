// Bill tables in every company type: latest bill date first by default (a back-dated bill sits under its own date,
// not on top), same-day bills newest entered first; and a From/To date filter returns exactly those days.
// Run with: node --experimental-test-module-mocks --test test/billorder.test.js
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => ({ businessType: "radiator", tyre: { brands: [] } }) } });

const { getAllRadiators, getAllRadiatorsForExport } = await import("../src/dao/radiator.dao.js");
const { getAllAutoBills, getAllAutoBillsForExport } = await import("../src/dao/autobill.dao.js");
const { listEngBills, listEngBillsForExport } = await import("../src/dao/engbill.dao.js");
const { getAllTyreBills, getAllTyreBillsForExport } = await import("../src/dao/tyrebill.dao.js");

const CLIENT = new ObjectId();
beforeEach(() => { fakeDb = new FakeDb(); });

// Entered in this order: 4 Oct, 6 Oct, 5 Oct (morning), then a back-dated 3 Oct, then 5 Oct (evening).
const ENTRIES = [["A", "2026-10-04"], ["B", "2026-10-06"], ["C", "2026-10-05"], ["D", "2026-10-03"], ["E", "2026-10-05"]];
const seed = (collection, tag) => {
  ENTRIES.forEach(([id, day], i) => fakeDb.collection(collection).docs.push({
    _id: new ObjectId(), clientId: CLIENT, [tag]: id, billNo: i + 1,
    billDate: new Date(`${day}T00:00:00.000Z`), createdAt: new Date(Date.UTC(2026, 9, 10, 9, i)),
  }));
};
const ids = (rows, tag) => rows.map((r) => r[tag]);

const verticals = [
  ["radiator", "radiators", "truckNumber",
    (f) => getAllRadiators(CLIENT, 1, 50, "", "", f.fromDate || "", f.toDate || "").then((r) => r.radiatorData),
    (f) => getAllRadiatorsForExport(CLIENT, f)],
  ["automobile", "autobills", "vehicleNumber",
    (f) => getAllAutoBills(CLIENT, 1, 50, "", "", f.fromDate || "", f.toDate || "").then((r) => r.autoBillData),
    (f) => getAllAutoBillsForExport(CLIENT, f)],
  ["engineering", "engbills", "vehicleNo", (f) => listEngBills(CLIENT, f, 1, 50).then((r) => r.bills), (f) => listEngBillsForExport(CLIENT, f)],
  ["tyre", "tyrebills", "vehicleNumber", (f) => getAllTyreBills(CLIENT, f, 1, 50).then((r) => r.tyreBillData), (f) => getAllTyreBillsForExport(CLIENT, f)],
];

for (const [name, collection, tag, list, exportAll] of verticals) {
  test(`${name}: bills list latest bill date first, same day newest entered first; the export matches`, async () => {
    seed(collection, tag);
    assert.deepEqual(ids(await list({}), tag), ["B", "E", "C", "A", "D"]);
    assert.deepEqual(ids(await exportAll({}), tag), ["B", "E", "C", "A", "D"]);
  });
  test(`${name}: a From/To date filter returns exactly those days`, async () => {
    seed(collection, tag);
    assert.deepEqual(ids(await list({ fromDate: "2026-10-05", toDate: "2026-10-05" }), tag), ["E", "C"]);
    assert.deepEqual(ids(await list({ fromDate: "2026-10-04", toDate: "2026-10-05" }), tag), ["E", "C", "A"]);
    assert.deepEqual(ids(await list({ fromDate: "2026-10-05" }), tag), ["B", "E", "C"]);
    assert.deepEqual(ids(await list({ toDate: "2026-10-04" }), tag), ["A", "D"]);
  });
}
