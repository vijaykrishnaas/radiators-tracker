// Fix a name on past bills (dao/rename.dao.js), automobile line units, and the engineering Discount sort.
// Run with: node --experimental-test-module-mocks --test test/rename.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

let fakeDb;
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });

const { namesInUse, renameName, nameKinds } = await import("../src/dao/rename.dao.js");
const { createAutoBill } = await import("../src/dao/autobill.dao.js");
const { listEngBills } = await import("../src/dao/engbill.dao.js");

const A = new ObjectId();
const B = new ObjectId(); // another company: never touched

async function setup(businessType = "automobile") {
  fakeDb = new FakeDb();
  for (const [_id, bt] of [[A, businessType], [B, businessType]]) {
    await fakeDb.collection("settings").insertOne({
      _id, businessType: bt, mechanics: ["Ramesh", "Sureesh"], labour: [],
      automobile: { units: ["pcs", "Ltr"], parts: [{ label: "Engin oil", value: "engin-oil", unit: "Ltr", rate: 450 }], bonus: {} },
      engineering: { serviceTypes: [{ label: "Turbo", value: "turbo", items: [{ label: "Hold sett", value: "hold-set", prices: {} }] }] },
      bonus: {},
    });
  }
}
const auto = (clientId, items, mechanicName = "Sureesh") => fakeDb.collection("autobills").insertOne({ clientId, billNo: 1, mechanicName, items, billDate: new Date() });

test("automobile bills keep each line's unit (trimmed, at most 20 characters)", async () => {
  await setup();
  const bill = await createAutoBill(A, {
    billDate: "2026-11-20", vehicleNumber: "TN01AB1234", mechanicName: "Ramesh", labourName: [],
    items: [{ particulars: "Engine oil", qty: 2, unit: " L ", rate: 450 }, { particulars: "Labour", qty: 1, rate: 300 }, { particulars: "X", qty: 1, unit: "u".repeat(30), rate: 1 }],
  });
  const stored = await fakeDb.collection("autobills").findOne({ _id: bill._id ?? bill.insertedId });
  assert.deepEqual(stored.items.map((i) => i.unit), ["L", "", "u".repeat(20)]);
});

test("kinds follow the business type", async () => {
  await setup("automobile");
  assert.deepEqual((await nameKinds(A)).map((k) => k.kind), ["part", "unit", "mechanic"]);
  await setup("engineering");
  assert.deepEqual((await nameKinds(A)).map((k) => k.kind), ["mechanic", "engItem"]);
  await setup("tyre");
  assert.deepEqual(await nameKinds(A), []);
  await assert.rejects(namesInUse(A, "part"), (e) => e.statusCode === 400);
});

test("part: lists names with bill counts and renames every matching line, the catalog part, and nothing else", async () => {
  await setup();
  await auto(A, [{ particulars: "Engin oil", unit: "Ltr" }, { particulars: "Filter" }]);
  await auto(A, [{ particulars: "Engin oil", unit: "Ltr" }, { particulars: "Engin oil", unit: "Ltr" }]);
  await auto(B, [{ particulars: "Engin oil" }]);
  assert.deepEqual(await namesInUse(A, "part"), [{ name: "Engin oil", bills: 2 }, { name: "Filter", bills: 1 }]);

  const r = await renameName(A, "part", "Engin oil", "  Engine oil ");
  assert.equal(r.bills, 2);
  assert.equal(r.to, "Engine oil");
  const mine = fakeDb.collection("autobills").docs.filter((d) => String(d.clientId) === String(A));
  assert.deepEqual(mine.flatMap((d) => d.items.map((i) => i.particulars)), ["Engine oil", "Filter", "Engine oil", "Engine oil"]);
  assert.equal(fakeDb.collection("autobills").docs.find((d) => String(d.clientId) === String(B)).items[0].particulars, "Engin oil", "other company untouched");
  const s = await fakeDb.collection("settings").findOne({ _id: A });
  assert.equal(s.automobile.parts[0].label, "Engine oil");
  assert.equal(s.automobile.parts[0].value, "engin-oil", "the part keeps its id, so stock stays linked");
  assert.equal((await fakeDb.collection("settings").findOne({ _id: B })).automobile.parts[0].label, "Engin oil");
});

test("unit: renamed on lines, in the units list and on catalog parts", async () => {
  await setup();
  await auto(A, [{ particulars: "Oil", unit: "Ltr" }, { particulars: "Bolt", unit: "pcs" }]);
  const r = await renameName(A, "unit", "Ltr", "L");
  assert.equal(r.bills, 1);
  assert.deepEqual(fakeDb.collection("autobills").docs[0].items.map((i) => i.unit), ["L", "pcs"]);
  const s = await fakeDb.collection("settings").findOne({ _id: A });
  assert.deepEqual(s.automobile.units, ["pcs", "L"]);
  assert.equal(s.automobile.parts[0].unit, "L");
  await assert.rejects(renameName(A, "unit", "pcs", "x".repeat(21)), /20 characters/);
});

test("mechanic: radiator, automobile and engineering bills, mechanic bonus entries and the Settings list", async () => {
  await setup();
  await auto(A, [], "Sureesh");
  await fakeDb.collection("radiators").insertOne({ clientId: A, mechanicName: "Sureesh" });
  await fakeDb.collection("engbills").insertOne({ clientId: A, mechanic: "Sureesh", services: [] });
  await fakeDb.collection("radiators").insertOne({ clientId: B, mechanicName: "Sureesh" });
  await fakeDb.collection("bonuses").insertOne({ clientId: A, type: "mechanic", beneficiary: "Sureesh" });
  await fakeDb.collection("bonuses").insertOne({ clientId: A, type: "labour", beneficiary: "Sureesh" }); // a labourer of the same name stays
  await fakeDb.collection("bonuses").insertOne({ clientId: B, type: "mechanic", beneficiary: "Sureesh" });
  assert.deepEqual(await namesInUse(A, "mechanic"), [{ name: "Sureesh", bills: 3 }]);

  const r = await renameName(A, "mechanic", "Sureesh", "Suresh");
  assert.deepEqual([r.bills, r.bonuses], [3, 1]);
  assert.deepEqual(fakeDb.collection("bonuses").docs.map((b) => b.beneficiary), ["Suresh", "Sureesh", "Sureesh"]);
  assert.equal(fakeDb.collection("radiators").docs[1].mechanicName, "Sureesh");
  assert.deepEqual((await fakeDb.collection("settings").findOne({ _id: A })).mechanics, ["Ramesh", "Suresh"]);
  // renaming onto a name already in the list merges them
  await renameName(A, "mechanic", "Suresh", "Ramesh");
  assert.deepEqual((await fakeDb.collection("settings").findOne({ _id: A })).mechanics, ["Ramesh"]);
});

test("engineering item: renamed on bill lines and in the service catalog", async () => {
  await setup("engineering");
  await fakeDb.collection("engbills").insertOne({ clientId: A, mechanic: "Ramesh", services: [{ type: "turbo", items: [{ item: "hold-set", label: "Hold sett" }, { item: "other", label: "Other" }] }] });
  assert.deepEqual(await namesInUse(A, "engItem"), [{ name: "Hold sett", bills: 1 }, { name: "Other", bills: 1 }]);
  await renameName(A, "engItem", "Hold sett", "Hold set");
  assert.deepEqual(fakeDb.collection("engbills").docs[0].services[0].items.map((i) => i.label), ["Hold set", "Other"]);
  const s = await fakeDb.collection("settings").findOne({ _id: A });
  assert.equal(s.engineering.serviceTypes[0].items[0].label, "Hold set");
});

test("refuses a blank, unchanged or missing name", async () => {
  await setup();
  await assert.rejects(renameName(A, "part", "Filter", "   "), /Enter the correct name/);
  await assert.rejects(renameName(A, "part", "Filter", "Filter"), /same as the current/);
  await assert.rejects(renameName(A, "part", "", "X"), /Choose the name/);
  await assert.rejects(renameName(A, "bogus", "a", "b"), (e) => e.statusCode === 400);
});

test("engineering bills sort by discount", async () => {
  fakeDb = new FakeDb();
  for (const discount of [50, 0, 200]) await fakeDb.collection("engbills").insertOne({ clientId: A, discount, billDate: new Date(), billNo: discount });
  const { bills } = await listEngBills(A, {}, 1, 10, { sortBy: "disc", sortDir: "desc" });
  assert.deepEqual(bills.map((b) => b.discount), [200, 50, 0]);
});
