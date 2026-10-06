// Automobile browser checks: real app on the Vite dev server, API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node e2e/automobile.e2e.mjs`
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { defaultSettings } = await import(pathToFileURL(join(here, "../../Radiator-backend-main/src/config/defaultSettings.js")).href);
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";
const OUT = process.env.E2E_OUT || join(here, ".out");
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const settings = structuredClone(defaultSettings);
settings.businessType = "automobile";
settings.company.name = "Auto Test";
settings.mechanics = ["Ramesh"];
settings.labour = ["Kumar"];
settings.automobile.parts = [{ label: "Oil Filter", value: "oil-filter", unit: "pcs", rate: 320 }];

// A saved bill whose items sit in two memos (memo index per item).
const memoBill = {
  _id: "a3", billNo: 9, billDate: "2026-09-22T00:00:00.000Z", vehicleNumber: "TN09MM0001", customerName: "", phoneNumber: "",
  mechanicName: "Ramesh", labourName: [], notes: "",
  items: [
    { particulars: "Waste", partRef: null, qty: 3, unit: "pcs", rate: 25, amount: 75, memo: 0 },
    { particulars: "Slip ring", partRef: null, qty: 1, unit: "pcs", rate: 400, amount: 380, memo: 1 },
  ],
};

// Bill with a ₹50 discount already given at an earlier collection.
const bill = {
  _id: "a1", billNo: 7, billDate: "2026-09-20T00:00:00.000Z", vehicleNumber: "TN52AB1234", customerName: "Velu",
  phoneNumber: "", mechanicName: "Ramesh", labourName: [], notes: "",
  items: [{ particulars: "Engine oil", partRef: null, qty: 2, unit: "L", rate: 450, amount: 900 }],
  totalAmount: 900, discount: 50, netAmount: 850, receivedAmount: 200, pendingAmount: 650, status: "Partial",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const payments = [];
let created = null;
let updated = null;

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings") return json({ settings });
  if (p === "/auto-mechanic") return json({ success: true, mechdata: ["Ramesh"] });
  if (p === "/autobills/a1/payment") { payments.push(req.postDataJSON()); return json({ success: true, message: "ok", autoBill: bill }); }
  if (p === "/autobills/a3" && req.method() === "GET") return json(memoBill);
  if (p === "/autobills/a3" && req.method() === "PUT") { updated = req.postDataJSON(); return json({ success: true, message: "Updated" }); }
  if (p === "/autobills/add") { created = req.postDataJSON(); return json({ success: true, message: "Bill saved ✅", id: "a2" }); }
  if (p === "/autobills/analytics") return json({ success: true, kpis: { totalBills: 1, totalRevenue: 900, totalCollected: 200, totalPending: 700, collectionRate: 22, avgBillValue: 900 }, byMonth: [], byStatus: [], topMechanics: [] });
  if (p === "/autobills") return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 1, autoBillData: [bill] });
  return json({ success: true, data: [], mechdata: [], records: [] });
});

await page.goto(BASE + "/issueCounter/login");
await page.evaluate(() => {
  localStorage.setItem("svr_token", "x");
  localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
});

// Gating: automobile tenant sent to its own pages; sidebar keeps Expenses/Bonus/Salary.
await page.goto(BASE + "/issueCounter/dashboard");
await page.waitForURL(/\/automobile\//, { timeout: 10000 }).catch(() => {});
ok("auto: radiator dashboard redirects to automobile", page.url().includes("/automobile/"), page.url());
const nav = await page.locator(".sidebar-nav").innerText();
ok("auto: sidebar has Expenses/Bonus/Salary", /Expenses/.test(nav) && /Bonus/.test(nav) && /Salary/.test(nav), nav.replace(/\s+/g, " "));
await page.goto(BASE + "/engineering/dashboard");
await page.waitForTimeout(1500);
ok("auto: engineering route redirects away", !page.url().includes("/engineering/"), page.url());

// Billing list + Record Payment discount semantics.
await page.goto(BASE + "/automobile/billing");
await page.getByText("TN52AB1234").first().waitFor({ timeout: 10000 });
ok("auto: billing list shows bill", true);

const recordPayment = async (discount, amount) => {
  await page.getByRole("button", { name: "Actions for TN52AB1234" }).click();
  await page.getByRole("menuitem", { name: "Record Payment" }).click();
  if (discount != null) await page.locator("#payment-discount").fill(String(discount));
  if (amount != null) await page.locator("#payment-amount").fill(String(amount));
  const before = payments.length;
  await page.locator(".ui-modal-foot").getByRole("button", { name: "Record Payment" }).click();
  for (let i = 0; i < 50 && payments.length === before; i++) await page.waitForTimeout(100);
  return payments[payments.length - 1];
};

const p1 = await recordPayment(null, 100);
ok("auto: payment without discount keeps existing ₹50 discount", p1?.discount === 50 && p1?.amount === 100, JSON.stringify(p1));
const p2 = await recordPayment(100, null);
ok("auto: extra ₹100 discount is added to existing (150)", p2?.discount === 150, JSON.stringify(p2));

// Create bill: qty × rate auto-computes amount; payload shape.
await page.goto(BASE + "/automobile/dashboard/create");
await page.locator("#vehicle-number").waitFor({ timeout: 10000 });
await page.locator("#vehicle-number").fill("TN01X9999");
await page.locator("#agent").click({ force: true });
await page.getByText("Ramesh", { exact: true }).last().click();
await page.locator("#particulars-0").fill("Brake pads");
await page.locator("#qty-0").fill("2");
await page.locator("#rate-0").fill("750");
ok("auto: amount auto = qty × rate (1500)", (await page.locator("#amount-0").inputValue()) === "1500", await page.locator("#amount-0").inputValue());
// Memos: a second memo, a catalog part that fills unit + rate, S.No running on, per-memo subtotals and a footer breakdown.
await page.getByRole("button", { name: "Add memo" }).click();
ok("auto: Add memo opens memo 2 with one row", (await page.locator(".memo").count()) === 2 && (await page.locator(".memo").nth(1).locator(".memo-row").count()) === 1);
await page.locator("#particulars-1").fill("Oil Filter");
ok("auto: picking a catalog part fills unit, rate and amount", (await page.locator("#unit-1").inputValue()) === "pcs" && (await page.locator("#rate-1").inputValue()) === "320" && (await page.locator("#amount-1").inputValue()) === "320",
  [await page.locator("#unit-1").inputValue(), await page.locator("#rate-1").inputValue(), await page.locator("#amount-1").inputValue()].join(" / "));
ok("auto: S.No runs on across memos (memo 2 starts at 2)", (await page.locator(".memo").nth(1).locator(".memo-sno").first().innerText()) === "2");
await page.locator(".memo").nth(1).getByRole("button", { name: "Add item" }).click();
await page.locator("#particulars-2").fill("Labour charge");
await page.locator("#rate-2").fill("200");
ok("auto: memo 2 subtotal ₹520.00", (await page.locator(".memo").nth(1).locator(".memo-subtotal").innerText()).includes("520.00"));
const note = await page.locator(".form-footer-note").innerText();
ok("auto: footer breaks the total down by memo", note.includes("Memo 1: ₹1,500.00") && note.includes("Memo 2: ₹520.00") && (await page.locator(".form-footer-total strong").innerText()).includes("2,020.00"), note);
await page.getByRole("button", { name: "Add memo" }).click();
await page.getByRole("button", { name: "Remove memo 3" }).click();
ok("auto: removing a memo drops it and its rows", (await page.locator(".memo").count()) === 2 && (await page.locator(".memo-row").count()) === 3);
await page.getByRole("button", { name: "Create bill", exact: true }).click();
await page.waitForTimeout(500);
ok("auto: bill date is required", (await page.getByText("Date is required").count()) > 0 && !created);
await page.locator('input[name="day"]').fill("20");
await page.locator('input[name="month"]').fill("09");
await page.locator('input[name="year"]').fill("2026");
await page.getByRole("button", { name: "Create bill", exact: true }).click();
for (let i = 0; i < 50 && !created; i++) await page.waitForTimeout(100);
ok("auto: create payload items", created?.items?.[0]?.amount === 1500 && created?.items?.[0]?.particulars === "Brake pads", JSON.stringify(created?.items));
ok("auto: payload carries memo index per item and the catalog partRef", JSON.stringify(created?.items?.map((i) => i.memo)) === "[0,1,1]" && created?.items?.[1]?.partRef === "oil-filter" && created?.items?.[2]?.amount === 200, JSON.stringify(created?.items));

// Edit a bill saved with two memos: groups come back, a hand-set amount is kept, qty edits recompute untouched rows.
await page.goto(BASE + "/automobile/dashboard/edit/a3");
await page.locator(".bill-no").getByText("Bill No. 9").waitFor({ timeout: 10000 });
await page.locator("#particulars-0").waitFor();
ok("auto: edit loads both memos", (await page.locator(".memo").count()) === 2 && (await page.locator(".memo").nth(1).locator("#particulars-1").inputValue()) === "Slip ring");
await page.locator("#qty-0").fill("4");
ok("auto: qty edit recomputes a computed amount (4 × 25 = 100)", (await page.locator("#amount-0").inputValue()) === "100", await page.locator("#amount-0").inputValue());
ok("auto: a hand-set amount is kept (380, not 1 × 400)", (await page.locator("#amount-1").inputValue()) === "380");
await page.getByRole("button", { name: "Update bill", exact: true }).click();
for (let i = 0; i < 50 && !updated; i++) await page.waitForTimeout(100);
ok("auto: update keeps memo indices", JSON.stringify(updated?.items?.map((i) => i.memo)) === "[0,1]", JSON.stringify(updated?.items));
await page.screenshot({ path: `${OUT}/auto-edit-memos.png`, fullPage: true });

// Phone: rows stack, nothing scrolls sideways, Qty / Unit / Rate / Amount are labelled.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + "/automobile/dashboard/edit/a3");
await page.locator("#particulars-0").waitFor({ timeout: 10000 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok("auto: bill form has no horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}`);
ok("auto: phone rows show Qty / Unit / Rate / Amount labels", await page.locator(".memo-row").first().locator(".memo-mlabel").evaluateAll((els) => els.length === 4 && els.every((e) => getComputedStyle(e).display !== "none")));
await page.screenshot({ path: `${OUT}/auto-edit-390.png`, fullPage: true });
await page.screenshot({ path: `${OUT}/auto-create.png`, fullPage: true });

ok("auto: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
