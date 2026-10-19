// Dashboard "Pending" must be net of discounts (radiator + automobile analytics).
// The aggregation itself runs in MongoDB (not available here), so these tests
// check (a) the pipeline sums a capped discount into totalDiscount and (b) the
// KPI math on the aggregate result, by stubbing collection().aggregate.
// Run with: node --experimental-test-module-mocks --test test/analytics.pending.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { pendingNetOfDiscount } from "../src/utils/analytics.js";

let lastPipeline = null;
let kpiRow = null;
const fakeDb = {
  collection: () => ({
    aggregate: (pipeline) => {
      lastPipeline = pipeline;
      return { toArray: async () => [{ kpis: kpiRow ? [kpiRow] : [], byMonth: [], byServiceType: [], byProductType: [], byStatus: [], topMechanics: [] }] };
    },
  }),
};
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });

const { getRadiatorAnalytics } = await import("../src/dao/radiator.dao.js");
const { getAutoAnalytics } = await import("../src/dao/autobill.dao.js");
const CLIENT = new ObjectId();

test("pendingNetOfDiscount subtracts discounts and never goes negative", () => {
  assert.equal(pendingNetOfDiscount({ totalRevenue: 2250, totalCollected: 2150, totalDiscount: 100 }), 0);
  assert.equal(pendingNetOfDiscount({ totalRevenue: 2250, totalCollected: 1000, totalDiscount: 100 }), 1150);
  assert.equal(pendingNetOfDiscount({ totalRevenue: 1000, totalCollected: 1000 }), 0);
  assert.equal(pendingNetOfDiscount({ totalRevenue: 100, totalCollected: 90, totalDiscount: 50 }), 0);
});

for (const [name, fn] of [["radiator", getRadiatorAnalytics], ["automobile", getAutoAnalytics]]) {
  test(`${name}: fully paid discounted bill shows 0 pending`, async () => {
    // Gross 2250, discount 100, collected 2150 → nothing owed.
    kpiRow = { _id: null, totalBills: 1, totalRevenue: 2250, totalCollected: 2150, totalDiscount: 100 };
    const res = await fn(CLIENT, {});
    assert.equal(res.kpis.totalPending, 0);
    // Other KPIs unchanged (still gross-based).
    assert.equal(res.kpis.totalRevenue, 2250);
    assert.equal(res.kpis.totalCollected, 2150);
  });

  test(`${name}: pipeline sums a discount capped at the bill total`, async () => {
    kpiRow = null;
    await fn(CLIENT, {});
    const json = JSON.stringify(lastPipeline);
    assert.match(json, /"discountAmt":\{"\$min":\[\{"\$max":\[\{"\$cond":\[\{"\$isNumber":"\$discount"\},"\$discount",0\]\},0\]\},"\$totalAmount"\]\}/);
    assert.match(json, /"totalDiscount":\{"\$sum":"\$discountAmt"\}/);
  });
}
