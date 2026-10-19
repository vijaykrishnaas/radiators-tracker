// Exercises the REAL backfillSettingsShape() against an in-memory fake Mongo.
// Focused on the "engineering" key, since that's the settings-backfill logic
// engbill.dao.js's getCatalog() depends on.
// Run with: node --experimental-test-module-mocks --test test/backfillSettingsShape.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakeDb } from "./helpers/fakeDb.js";

const fakeDb = new FakeDb();

mock.module("../src/config/db.js", {
  namedExports: { connectDB: async () => fakeDb },
});

const { backfillSettingsShape } = await import("../src/migrations/backfillSettingsShape.js");
const { defaultSettings } = await import("../src/config/defaultSettings.js");

test("backfill adds the engineering block only to settings docs that lack it", async () => {
  const settings = fakeDb.collection("settings");
  await settings.insertOne({ _id: "client-missing-engineering" });
  await settings.insertOne({
    _id: "client-has-custom-engineering",
    engineering: { billStartNumber: 500, serviceTypes: [] }, // tenant already configured this
  });

  const report = await backfillSettingsShape();
  assert.equal(report.settingsKeys.engineering, 1);

  const backfilled = await settings.findOne({ _id: "client-missing-engineering" });
  assert.deepEqual(backfilled.engineering, defaultSettings.engineering);

  // A tenant's own configured engineering settings must never be touched.
  const untouched = await settings.findOne({ _id: "client-has-custom-engineering" });
  assert.equal(untouched.engineering.billStartNumber, 500);
  assert.deepEqual(untouched.engineering.serviceTypes, []);
});

test("backfill is idempotent: running it twice does not re-modify already-backfilled docs", async () => {
  const settings = fakeDb.collection("settings");
  await settings.insertOne({ _id: "client-idempotent-check" });

  const first = await backfillSettingsShape();
  assert.equal(first.settingsKeys.engineering >= 1, true);

  const second = await backfillSettingsShape();
  // Nothing left to backfill for this key on the second pass (already has it).
  assert.equal(second.settingsKeys.engineering, 0);
});

test("dry-run mode reports counts without writing anything", async () => {
  const settings = fakeDb.collection("settings");
  await settings.insertOne({ _id: "client-dry-run-check" });

  const report = await backfillSettingsShape({ dryRun: true });
  assert.equal(report.settingsKeys.engineering >= 1, true);

  const doc = await settings.findOne({ _id: "client-dry-run-check" });
  assert.equal(doc.engineering, undefined); // dry-run must not have written it
});
