// Automated cross-tenant isolation test. Provisions two throwaway clients,
// creates data in each, and asserts that neither can see the other's data — the
// core safety guarantee of the shared-DB model. Run against a RUNNING backend:
//
//   npm run test:isolation        # uses http://localhost:5000
//   BASE=http://host:port npm run test:isolation
//
// Exits non-zero on any leak. Cleans up the throwaway clients on the way out.
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const BASE = process.env.BASE || "http://localhost:5000";
const SA_USER = process.env.SUPERADMIN_USER_ID || "superadmin";
const SA_PASS = process.env.SUPERADMIN_PASSWORD || "superadmin123";

let passed = 0;
let failed = 0;
const ok = (cond, msg) => {
  if (cond) { passed++; console.log("  ✓", msg); }
  else { failed++; console.error("  ✗", msg); }
};

async function api(method, url, { token, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

const A = { code: "ztest-alpha", user: "zauser", pass: "ztest123", name: "ZTest Alpha" };
const B = { code: "ztest-beta", user: "zbuser", pass: "ztest123", name: "ZTest Beta" };

const bill = (truck, mech) => ({
  billDate: "2026-06-16", truckNumber: truck, transportName: "T", mechanicName: mech,
  radiatorType: "3-Row", serviceInfo: [{ type: "Service", price: 1000 }],
});

async function run() {
  console.log(`Isolation test → ${BASE}`);
  const sa = await api("POST", "/admin/login", { body: { userId: SA_USER, password: SA_PASS } });
  if (!sa.json?.token) { console.error("Super-admin login failed — is the backend running and seeded?"); process.exit(2); }
  const saTok = sa.json.token;

  // Clean any leftovers from a previous run.
  const existing = (await api("GET", "/admin/clients", { token: saTok })).json?.clients || [];
  for (const c of existing) {
    if (c.code === A.code || c.code === B.code) await api("DELETE", `/admin/clients/${c._id}`, { token: saTok });
  }

  // Provision both.
  const ca = await api("POST", "/admin/clients", { token: saTok, body: { name: A.name, code: A.code, adminUserId: A.user, adminPassword: A.pass } });
  const cb = await api("POST", "/admin/clients", { token: saTok, body: { name: B.name, code: B.code, adminUserId: B.user, adminPassword: B.pass } });
  ok(ca.status === 201 && cb.status === 201, "provisioned two clients");
  const aId = ca.json.client._id, bId = cb.json.client._id;

  const aTok = (await api("POST", "/auth/login", { body: { code: A.code, userId: A.user, password: A.pass } })).json.token;
  const bTok = (await api("POST", "/auth/login", { body: { code: B.code, userId: B.user, password: B.pass } })).json.token;
  ok(aTok && bTok, "both clients logged in");

  // Create data in each.
  const aBill = await api("POST", "/radiators/add", { token: aTok, body: bill("AAA-111", "AlphaMech") });
  const bBill = await api("POST", "/radiators/add", { token: bTok, body: bill("BBB-222", "BetaMech") });
  await api("POST", "/expenses", { token: aTok, body: { expenseType: "others", date: "2026-06-15", reason: "alpha exp", amount: 111 } });
  await api("POST", "/expenses", { token: bTok, body: { expenseType: "others", date: "2026-06-15", reason: "beta exp", amount: 222 } });
  ok(aBill.json.billNo === 1 && bBill.json.billNo === 1, "per-client billNo restarts at 1 for each");

  // M4: atomic counter — A's second bill must be exactly 2 (no read-max race).
  const aBill2 = await api("POST", "/radiators/add", { token: aTok, body: bill("AAA-112", "AlphaMech") });
  ok(aBill2.json.billNo === 2, "per-client billNo increments atomically (A's 2nd bill = 2)");

  // Lists are isolated.
  const aList = (await api("GET", "/radiators?page=1&limit=50", { token: aTok })).json;
  const bList = (await api("GET", "/radiators?page=1&limit=50", { token: bTok })).json;
  const aTrucks = (aList.radiatorData || []).map((r) => r.truckNumber);
  const bTrucks = (bList.radiatorData || []).map((r) => r.truckNumber);
  ok(aTrucks.includes("AAA-111") && !aTrucks.includes("BBB-222"), "A's bill list excludes B's bills");
  ok(bTrucks.includes("BBB-222") && !bTrucks.includes("AAA-111"), "B's bill list excludes A's bills");

  // getById across tenants → 404.
  const cross = await api("GET", `/radiators/${bBill.json.id}`, { token: aTok });
  ok(cross.status === 404, "A fetching B's bill by id → 404");

  // Expenses isolated.
  const aExp = (await api("GET", "/expenses?from=2026-06-01&to=2026-06-30", { token: aTok })).json;
  ok((aExp.expenses || []).every((e) => e.reason !== "beta exp"), "A's expenses exclude B's");

  // Analytics isolated (A sees only its own revenue).
  const aAna = (await api("GET", "/radiators/analytics?fromDate=2026-04-01&toDate=2026-06-30", { token: aTok })).json;
  ok(aAna.kpis?.totalBills === 2, "A's analytics counts only A's bills");

  // FB-Dash: the Radiator Model filter actually filters (was silently ignored).
  const modelMatch = (await api("GET", `/radiators/analytics?fromDate=2026-04-01&toDate=2026-06-30&radiatorType=${encodeURIComponent("3-Row")}`, { token: aTok })).json;
  ok(modelMatch.kpis?.totalBills === 2, "FB-Dash: radiatorType filter includes matching bills");
  const modelNone = (await api("GET", "/radiators/analytics?fromDate=2026-04-01&toDate=2026-06-30&radiatorType=NoSuchModel", { token: aTok })).json;
  ok(modelNone.kpis?.totalBills === 0, "FB-Dash: radiatorType filter excludes non-matching bills");

  // Settings isolated.
  await api("PUT", "/settings", { token: bTok, body: { company: { name: "B-ONLY-NAME" } } });
  const aSettings = (await api("GET", "/settings", { token: aTok })).json;
  ok(aSettings.settings?.company?.name !== "B-ONLY-NAME", "B's settings change does not affect A");

  // A1/A3/A4: hostile query inputs are handled, not 500s / unbounded.
  const badRegex = await api("GET", `/radiators?truckNumber=${encodeURIComponent("(")}`, { token: aTok });
  ok(badRegex.status === 200, "A1: malformed-regex search is escaped → 200, not 500");
  const negPage = await api("GET", "/radiators?page=-5&limit=10", { token: aTok });
  ok(negPage.status === 200, "A4: negative page is clamped → 200, not 500");
  const bigLimit = await api("GET", "/radiators?page=1&limit=99999999", { token: aTok });
  ok(bigLimit.status === 200 && (bigLimit.json.radiatorData || []).length <= 200, "A3: huge limit is clamped");

  // A2/A5: garbage numbers/dates are rejected with 400 (never stored as NaN).
  const nanPrice = await api("POST", "/radiators/add", { token: aTok, body: { ...bill("NAN-1", "M"), serviceInfo: [{ type: "Service", price: "abc" }] } });
  ok(nanPrice.status === 400, "A2: non-numeric service price → 400");
  const badDate = await api("POST", "/radiators/add", { token: aTok, body: { ...bill("BD-1", "M"), billDate: "not-a-date" } });
  ok(badDate.status === 400, "A2: invalid billDate → 400");
  const nanExp = await api("POST", "/expenses", { token: aTok, body: { expenseType: "others", date: "2026-06-15", reason: "x", amount: "abc" } });
  ok(nanExp.status === 400, "A5: non-numeric expense amount → 400");
  // The rejections above must not have created anything — A still has exactly 2 bills.
  const aCount = (await api("GET", "/radiators/analytics?fromDate=2026-04-01&toDate=2026-06-30", { token: aTok })).json;
  ok(aCount.kpis?.totalBills === 2 && aCount.kpis?.totalRevenue === 2000, "rejected inputs left analytics intact (2 bills, ₹2000)");

  // FB1: a bonus payout override is recorded as a correct, summable paidAmount.
  // A's two bills share mechanic "AlphaMech"; pay an override of 100 for the FY.
  const payout = await api("POST", "/bonus/payout", { token: aTok, body: { type: "mechanic", period: "2026", beneficiary: "AlphaMech", amount: 100, notes: "qa note" } });
  ok(payout.status === 200, "FB1: mechanic payout accepted");
  const mechRows = (await api("GET", "/bonus/mechanics?year=2026&mechanicName=AlphaMech", { token: aTok })).json.rows || [];
  const aRow = mechRows.find((r) => r.beneficiary === "AlphaMech");
  ok(aRow && aRow.status === "Paid", "FB1: payout marks the mechanic Paid");
  ok(aRow && Math.abs((aRow.paidBonus || 0) - 100) < 0.01, "FB1: Σ paidAmount equals the override (100), not N×");

  // EB1: switching a materials expense to "others" clears the stale products array.
  await api("POST", "/expenses", { token: aTok, body: { expenseType: "materials", date: "2026-06-15", products: [{ name: "X", quantity: 2, unitPrice: 100 }] } });
  const expList = (await api("GET", "/expenses?from=2026-06-01&to=2026-06-30", { token: aTok })).json;
  const matId = (expList.expenses || []).find((e) => e.expenseType === "materials")?._id;
  await api("PUT", `/expenses/${matId}`, { token: aTok, body: { expenseType: "others", date: "2026-06-15", reason: "now others", amount: 50 } });
  const expAfter = (await api("GET", "/expenses/export?from=2026-06-01&to=2026-06-30", { token: aTok })).json;
  const changedExp = (expAfter.expenses || []).find((e) => e._id === matId);
  ok(changedExp && changedExp.expenseType === "others" && (changedExp.products || []).length === 0, "EB1: materials→others clears stale products");

  // EB2: editing a bill below what was already collected caps received to the new total.
  await api("POST", `/radiators/${bBill.json.id}/payment`, { token: bTok, body: { amount: 1000 } }); // pay B's bill in full (total 1000)
  await api("PUT", `/radiators/${bBill.json.id}`, { token: bTok, body: { ...bill("BBB-222", "BetaMech"), serviceInfo: [{ type: "Service", price: 500 }] } });
  const editedBill = (await api("GET", `/radiators/${bBill.json.id}`, { token: bTok })).json;
  ok(editedBill.totalAmount === 500 && editedBill.receivedAmount === 500 && editedBill.pendingAmount === 0 && editedBill.status === "Received",
    "EB2: bill edited below paid amount caps received to new total (no >100% collection)");

  // Bug#4: a PARTIAL payment must reflect in analytics "collected" (the old
  // `$type==="number"` check never matched, so partial collections read as 0).
  await api("POST", `/radiators/${aBill.json.id}/payment`, { token: aTok, body: { amount: 500 } });
  const aColl = (await api("GET", "/radiators/analytics?fromDate=2026-04-01&toDate=2026-06-30", { token: aTok })).json;
  ok(aColl.kpis?.totalCollected === 500, "Bug#4: partial payment reflects in analytics collected (= 500)");

  // Suspend A → immediate lockout on its live token.
  await api("PATCH", `/admin/clients/${aId}`, { token: saTok, body: { status: "suspended" } });
  const aAfterSuspend = await api("GET", "/radiators?page=1&limit=10", { token: aTok });
  ok(aAfterSuspend.status === 403, "suspended client's live token is blocked (403)");
  // M2: the 403 must be flagged so the SPA can cleanly end the session.
  ok(aAfterSuspend.json?.tenantInactive === true, "suspend 403 carries tenantInactive flag");

  // Delete B → its token no longer resolves.
  await api("DELETE", `/admin/clients/${bId}`, { token: saTok });
  const bAfterDelete = await api("GET", "/radiators?page=1&limit=10", { token: bTok });
  ok(bAfterDelete.status === 401, "deleted client's token is rejected (401)");

  // Cleanup A.
  await api("DELETE", `/admin/clients/${aId}`, { token: saTok });

  console.log(`\nIsolation: ${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => { console.error("Test run error:", err); process.exit(2); });
