// Engineering cost prices and profit: costs are saved on each bill item from the catalog (per BS model), "Other"
// rows take a typed cost, edits keep the saved cost, and the profit summary splits earned (fully paid) from
// expected (unpaid / part-paid) with after-discount and after-bonus figures.
// Run with: node --experimental-test-module-mocks --test test/engprofit.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { FakeDb } from "./helpers/fakeDb.js";

const fakeDb = new FakeDb();
const catalog = {
  billStartNumber: 1,
  fyStartMonth: 4,
  bonus: { mechanicMode: "percent", mechanicPercent: 10 },
  serviceTypes: [
    {
      label: "Turbo",
      value: "turbo",
      items: [
        { label: "Hold set", value: "hold-set", prices: { bs3: 500, bs6: 700 }, costs: { bs3: 300, bs6: 400 } },
        { label: "Tel", value: "tel", prices: { bs3: 200 } },
        { label: "Other", value: "other", prices: { bs3: 0 }, requiresComment: true },
      ],
    },
  ],
};
mock.module("../src/config/db.js", { namedExports: { connectDB: async () => fakeDb } });
mock.module("../src/dao/settings.dao.js", { namedExports: { getSettings: async () => ({ engineering: catalog }) } });

const { createEngBill, updateEngBill, recordEngPayment, getEngProfit } = await import("../src/dao/engbill.dao.js");
const CLIENT = new ObjectId().toString();

const bill = (items, over = {}) => ({
  billDate: "2026-06-10", vehicleNo: "TN01AB1234", mechanic: "Ravi",
  services: [{ type: "turbo", bsModel: "bs3", items }],
  ...over,
});

test("costs come from the catalog for the card's BS model; Other rows use the typed cost; missing cost is 0", async () => {
  const b = await createEngBill(CLIENT, bill([
    { item: "hold-set", qty: 2, rate: 500 },
    { item: "tel", qty: 1, rate: 200 },
    { item: "other", comment: "Bearing clean", qty: 1, rate: 300, cost: 120 },
  ]));
  const [hold, tel, other] = b.services[0].items;
  assert.equal(hold.cost, 300);
  assert.equal(hold.costAmount, 600);
  assert.equal(tel.cost, 0);
  assert.equal(other.cost, 120);
  assert.equal(b.services[0].costTotal, 720);
  assert.equal(b.costTotal, 720);
  assert.equal(b.grossProfit, 1500 - 720);
});

test("a client-sent cost on a catalog item is ignored (catalog wins); an edit keeps the cost saved on the bill", async () => {
  const b = await createEngBill(CLIENT, bill([{ item: "hold-set", qty: 1, rate: 500, cost: 1 }]));
  assert.equal(b.services[0].items[0].cost, 300);
  catalog.serviceTypes[0].items[0].costs.bs3 = 350; // price list changes next month
  try {
    const edited = await updateEngBill(CLIENT, b._id, bill([{ item: "hold-set", qty: 3, rate: 500 }]));
    assert.equal(edited.services[0].items[0].cost, 300, "saved cost kept");
    assert.equal(edited.services[0].items[0].costAmount, 900);
    const fresh = await createEngBill(CLIENT, bill([{ item: "hold-set", qty: 1, rate: 500 }]));
    assert.equal(fresh.services[0].items[0].cost, 350, "new bills use the new cost");
  } finally {
    catalog.serviceTypes[0].items[0].costs.bs3 = 300;
  }
});

test("rejects a negative or non-numeric cost on an Other row", async () => {
  await assert.rejects(createEngBill(CLIENT, bill([{ item: "other", comment: "x", qty: 1, rate: 10, cost: -5 }])), /item cost/);
  await assert.rejects(createEngBill(CLIENT, bill([{ item: "other", comment: "x", qty: 1, rate: 10, cost: "abc" }])), /item cost/);
});

test("profit: fully paid bills are earned, the rest expected; discount and bonus are shown after gross", async () => {
  const C = new ObjectId().toString();
  // Paid: 2 × hold set (sale 1000, cost 600), discount 100 → net 900 fully paid. Bonus 10% of 900 = 90.
  const paid = await createEngBill(C, bill([{ item: "hold-set", qty: 2, rate: 500 }], { discount: 100 }));
  await recordEngPayment(C, paid._id, { amount: 900 });
  // Part-paid: 1 × hold set (sale 500, cost 300), half collected. Bonus 10% of 500 = 50.
  const part = await createEngBill(C, bill([{ item: "hold-set", qty: 1, rate: 500 }]));
  await recordEngPayment(C, part._id, { amount: 250 });
  // Unpaid, no cost set: tel (sale 200, cost 0) → flagged as a line without a cost price. Bonus 20.
  await createEngBill(C, bill([{ item: "tel", qty: 1, rate: 200 }]));

  const p = await getEngProfit(C, {});
  assert.deepEqual(p.earned, { bills: 1, sales: 1000, cost: 600, gross: 400, discount: 100, afterDiscount: 300, bonus: 90, afterBonus: 210 });
  assert.deepEqual(p.expected, { bills: 2, sales: 700, cost: 300, gross: 400, discount: 0, afterDiscount: 400, bonus: 70, afterBonus: 330 });
  assert.equal(p.missingCostLines, 1);
  const hold = p.byItem.find((r) => r.item === "hold-set");
  assert.deepEqual({ qty: hold.qty, sales: hold.sales, cost: hold.cost, gross: hold.gross, margin: hold.margin }, { qty: 3, sales: 1500, cost: 900, gross: 600, margin: 40 });
  const turbo = p.byServiceType.find((r) => r.type === "turbo");
  assert.equal(turbo.gross, 800);
});
