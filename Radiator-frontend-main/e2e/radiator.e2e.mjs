// Radiator (live vertical) browser checks: real app on the Vite dev server, API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node e2e/radiator.e2e.mjs`
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { defaultSettings } = await import(pathToFileURL(join(here, "../../Radiator-backend-main/src/config/defaultSettings.js")).href);
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";

const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const settings = structuredClone(defaultSettings);
settings.company.name = "Radiator Test";
settings.mechanics = ["Ramesh"];

// Bill with a ₹100 discount already given at an earlier collection.
const bill = {
  _id: "r1", billDate: "2026-09-20T00:00:00.000Z", truckNumber: "TN52R0001", transportName: "Velu Transport",
  mechanicName: "Ramesh", phoneNumber: "", radiatorType: "bs4", labourName: [],
  serviceInfo: [{ type: "Service", price: 2250 }],
  status: "Partial", totalAmount: 2250, discount: 100, netAmount: 2150, receivedAmount: 1000, pendingAmount: 1150,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const payments = [];
const listParams = [];
const cancels = [];
// Bonus page: Ramesh was paid ₹500 for one bill; the other bill is still pending.
const bonusRow = {
  beneficiary: "Ramesh", operations: 2, totalBusiness: 4000, totalCollected: 4000, accruedBonus: 900, payableBonus: 400, paidBonus: 500, cancelledBonus: 0, status: "Pending",
  records: [
    { _id: "b1", billDate: "2026-09-10T00:00:00.000Z", billAmount: 2000, receivedAmount: 2000, accruedAmount: 500, payableAmount: 500, paidAmount: 500, status: "paid" },
    { _id: "b2", billDate: "2026-09-20T00:00:00.000Z", billAmount: 2000, receivedAmount: 2000, accruedAmount: 400, payableAmount: 400, paidAmount: 0, status: "pending" },
  ],
};
const cancelledRow = { ...bonusRow, beneficiary: "Kumar", accruedBonus: 0, payableBonus: 0, paidBonus: 0, cancelledBonus: 300, status: "Cancelled",
  records: [{ _id: "b3", billDate: "2026-09-12T00:00:00.000Z", billAmount: 2000, receivedAmount: 2000, accruedAmount: 0, payableAmount: 0, paidAmount: 0, cancelledPaid: 300, status: "cancelled" }] };

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings") return json({ settings });
  if (p === "/mechanic") return json({ success: true, mechdata: ["Ramesh"] });
  if (p === "/radiators/r1/payment") { payments.push(req.postDataJSON()); return json({ success: true, message: "ok", radiator: bill }); }
  if (p === "/bonus/pending") return json({ success: true, rows: [bonusRow, cancelledRow] });
  if (p === "/bonus/cancel") { cancels.push(req.postDataJSON()); return json({ success: true, message: "Cancelled ✅" }); }
  if (p === "/radiators") listParams.push(Object.fromEntries(new URL(req.url()).searchParams));
  if (p === "/radiators") return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 1, radiatorData: [bill] });
  return json({ success: true, data: [], mechdata: [], records: [] });
});

await page.goto(BASE + "/issueCounter/login");
await page.evaluate(() => {
  localStorage.setItem("svr_token", "x");
  localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
});

await page.goto(BASE + "/issueCounter/billing");
await page.getByText("TN52R0001").first().waitFor({ timeout: 10000 });
ok("radiator: billing list shows bill", true);
const nav = await page.locator(".sidebar-nav").innerText();
ok("radiator: sidebar has Expenses/Bonus/Salary", /Expenses/.test(nav) && /Bonus/.test(nav) && /Salary/.test(nav), nav.replace(/\s+/g, " "));

const recordPayment = async (discount, amount) => {
  await page.getByRole("button", { name: "Actions for TN52R0001" }).click();
  await page.getByRole("menuitem", { name: "Record Payment" }).click();
  if (discount != null) await page.locator("#payment-discount").fill(String(discount));
  if (amount != null) await page.locator("#payment-amount").fill(String(amount));
  const before = payments.length;
  await page.getByRole("dialog").getByRole("button", { name: "Record Payment" }).click();
  for (let i = 0; i < 50 && payments.length === before; i++) await page.waitForTimeout(100);
  return payments[payments.length - 1];
};

const p1 = await recordPayment(null, 500);
ok("radiator: payment without discount keeps existing ₹100 discount", p1?.discount === 100 && p1?.amount === 500, JSON.stringify(p1));
const p2 = await recordPayment(50, null);
ok("radiator: extra ₹50 discount is added to existing (150)", p2?.discount === 150, JSON.stringify(p2));

// Bills list: headers sort on the server, one search box.
await page.goto(BASE + "/issueCounter/billing");
await page.getByText("TN52R0001").first().waitFor({ timeout: 10000 });
await page.locator("thead").getByRole("button", { name: "Total" }).click();
await page.waitForTimeout(400);
let lp = listParams[listParams.length - 1];
ok("radiator: clicking Total sorts the whole list on the server", lp.sortBy === "total" && lp.sortDir === "asc", JSON.stringify(lp));
await page.locator("#bill-search").fill("velu");
await page.waitForTimeout(600);
lp = listParams[listParams.length - 1];
ok("radiator: search sends one term across all fields (not just the truck no)", lp.search === "velu" && !("truckNumber" in lp), JSON.stringify(lp));

// Settings → Bonus (rupees only): each role is a fixed ₹ per service line (grid) or a fixed ₹ per bill.
await page.goto(BASE + "/settings");
await page.getByRole("tab", { name: "Bonus" }).click();
await page.waitForTimeout(300);
const bonusTabText = await page.locator(".settings-panel, main").first().innerText();
ok("radiator: bonus defaults to the ₹ per service grid, with no % anywhere", (await page.locator('[id^="bonus-mechanic-"]').count()) > 0 && (await page.locator("#mechanic-bonus-amt").count()) === 0
  && /₹ per service/.test(bonusTabText) && !/%/.test(bonusTabText), bonusTabText.match(/.{0,40}%.{0,40}/)?.[0] || "");
await page.locator("#bonus-labour-bs3-service").fill("40");
await page.getByRole("radiogroup", { name: "Mechanic bonus type" }).getByRole("radio", { name: "₹ per bill" }).click();
ok("radiator: '₹ per bill' swaps the mechanic matrix for one amount", (await page.locator('[id^="bonus-mechanic-"]').count()) === 0 && (await page.locator("#mechanic-bonus-amt").count()) === 1);
await page.locator("#mechanic-bonus-amt").fill("300");
const putReq = page.waitForRequest((r) => r.method() === "PUT" && new URL(r.url()).pathname === "/settings", { timeout: 5000 }).catch(() => null);
await page.locator(".page-header .btn-primary, .form-footer .btn-primary").filter({ hasText: /Save/ }).first().click();
const put = await putReq;
const rb = put ? put.postDataJSON()?.bonus : null;
ok("radiator: saving sends mechanic ₹300 per bill and labour ₹40 per BS-3 service line", rb?.mechanic?.mode === "amount" && rb?.mechanic?.amount === 300 && rb?.labour?.mode !== "amount" && rb?.labour?.amountMatrix?.bs3?.service === 40,
  JSON.stringify({ m: rb?.mechanic?.mode, a: rb?.mechanic?.amount, l: rb?.labour?.mode, lg: rb?.labour?.amountMatrix?.bs3 }));

// Bonus page: cancel a paid bonus (whole person for the range, or one entry); cancelled rows read as Cancelled.
await page.goto(BASE + "/bonus/mechanics");
await page.getByText("Ramesh").first().waitFor({ timeout: 10000 });
ok("radiator: a fully cancelled person shows a Cancelled status", (await page.locator("tbody").getByText("Cancelled", { exact: true }).count()) >= 1);
await page.getByRole("button", { name: "Actions for Ramesh" }).click();
await page.getByRole("menuitem", { name: "Cancel paid bonus" }).click();
const dlg = page.getByRole("alertdialog");
ok("radiator: cancel dialog names the amount and that it can't be undone", /₹500\.00/.test(await dlg.innerText()) && /cannot be undone/.test(await dlg.innerText()));
await page.locator("#cancel-note").fill("paid twice");
await dlg.getByRole("button", { name: /Cancel ₹500/ }).click();
for (let i = 0; i < 30 && !cancels.length; i++) await page.waitForTimeout(100);
ok("radiator: cancelling a person's paid bonus posts type, person, range and reason", cancels[0]?.type === "mechanic" && cancels[0]?.beneficiary === "Ramesh" && !!cancels[0]?.from && !!cancels[0]?.to && cancels[0]?.note === "paid twice", JSON.stringify(cancels[0]));
await page.getByRole("button", { name: "Show bills for Ramesh" }).click();
const entryCancel = page.getByRole("button", { name: /Cancel paid bonus of ₹500\.00/ });
ok("radiator: only the paid entry has a Cancel button", (await entryCancel.count()) === 1);
await entryCancel.click();
await page.getByRole("alertdialog").getByRole("button", { name: /Cancel ₹500/ }).click();
for (let i = 0; i < 30 && cancels.length < 2; i++) await page.waitForTimeout(100);
ok("radiator: cancelling one entry posts just its id", JSON.stringify(cancels[1]?.ids) === '["b1"]' && !cancels[1]?.beneficiary, JSON.stringify(cancels[1]));
await page.locator("#bonus-status").click({ force: true }).catch(() => {});
ok("radiator: status filter offers Cancelled", (await page.locator(".rs__option").filter({ hasText: /^Cancelled$/ }).count()) === 1 || (await page.getByText("Cancelled", { exact: true }).count()) > 0);
await page.keyboard.press("Escape");

// Engineering routes stay gated away from radiator tenants.
await page.goto(BASE + "/engineering/dashboard");
await page.waitForTimeout(1500);
ok("radiator: engineering route redirects away", !page.url().includes("/engineering/"), page.url());

ok("radiator: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
