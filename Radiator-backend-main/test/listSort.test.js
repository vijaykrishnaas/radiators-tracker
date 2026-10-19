// Whitelisted server-side sorting for paginated lists.
// Run with: node --test test/listSort.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSort } from "../src/utils/listSort.js";

const FIELDS = { date: "billDate", total: { $sum: "$items.amount" } };

test("no or unknown key falls back to the list's default order", () => {
  assert.deepEqual(parseSort({}, FIELDS, { createdAt: -1 }), { sort: { createdAt: -1 }, computed: null });
  assert.deepEqual(parseSort({ sortBy: "password" }, FIELDS, { createdAt: -1 }), { sort: { createdAt: -1 }, computed: null });
  assert.deepEqual(parseSort({ sortBy: "__proto__" }, FIELDS, { createdAt: -1 }), { sort: { createdAt: -1 }, computed: null });
  // ?sortBy=a&sortBy=b arrives as an array: not a whitelisted key.
  assert.deepEqual(parseSort({ sortBy: ["date", "total"] }, FIELDS, { createdAt: -1 }).sort, { createdAt: -1 });
});

test("stored field: direction from sortDir (desc unless 'asc'), _id breaks ties", () => {
  assert.deepEqual(parseSort({ sortBy: "date", sortDir: "asc" }, FIELDS), { sort: { billDate: 1, _id: 1 }, computed: null });
  assert.deepEqual(parseSort({ sortBy: "date", sortDir: "nonsense" }, FIELDS), { sort: { billDate: -1, _id: -1 }, computed: null });
});

test("computed value sorts on __sort with its expression", () => {
  assert.deepEqual(parseSort({ sortBy: "total", sortDir: "desc" }, FIELDS), { sort: { __sort: -1, _id: -1 }, computed: { $sum: "$items.amount" } });
});

test("countMatching counts with the same collation as the page query (case-insensitive filters)", async () => {
  const { countMatching, SORT_COLLATION } = await import("../src/utils/listSort.js");
  let seen;
  const coll = { countDocuments: async (q, opts) => { seen = { q, opts }; return 7; } };
  assert.equal(await countMatching(coll, { mechanicName: "ravi" }), 7);
  assert.deepEqual(seen, { q: { mechanicName: "ravi" }, opts: { collation: SORT_COLLATION } });
});
