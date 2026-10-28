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
settings.automobile.parts = [{ label: "Oil Filter", value: "oil-filter", rate: 320 }, { label: "Brake Shoe", value: "brake-shoe", rate: 900 }];

// Inventory: Oil Filter has been oversold (short by 2), Brake Shoe has 5 left.
const invRows = [
  { partRef: "brake-shoe", label: "Brake Shoe", inCatalog: true, rate: 900, added: 10, sold: 5, remaining: 5, avgCost: 600, stockValue: 3000, sales: 4500, costOfSales: 3000, profit: 1500, bills: 3, lastIn: null, lastSold: null },
  { partRef: "oil-filter", label: "Oil Filter", inCatalog: true, rate: 320, added: 4, sold: 6, remaining: -2, avgCost: 200, stockValue: 0, sales: 1920, costOfSales: 1200, profit: 720, bills: 6, lastIn: null, lastSold: null },
];
const invEntries = [{ _id: "e1", partRef: "brake-shoe", partLabel: "Brake Shoe", date: "2026-09-01T00:00:00.000Z", qty: 10, buyPrice: 600, supplier: "Sri Parts", note: "INV-9" }];
const listParams = [];
const entryParams = [];
const stockPosts = [];

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
const settingsPuts = [];

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings" && req.method() === "PUT") { settingsPuts.push(req.postDataJSON()); return json({ success: true, message: "Settings saved" }); }
  if (p === "/settings") return json({ settings });
  if (p === "/auto-mechanic") return json({ success: true, mechdata: ["Ramesh"] });
  if (p === "/autobills/a1/payment") { payments.push(req.postDataJSON()); return json({ success: true, message: "ok", autoBill: bill }); }
  if (p === "/autobills/a3" && req.method() === "GET") return json(memoBill);
  if (p === "/autobills/a3" && req.method() === "PUT") { updated = req.postDataJSON(); return json({ success: true, message: "Updated" }); }
  if (p === "/autobills/add") { created = req.postDataJSON(); return json({ success: true, message: "Bill saved ✅", id: "a2" }); }
  if (p === "/autobills/analytics") return json({ success: true, kpis: { totalBills: 1, totalRevenue: 900, totalCollected: 200, totalPending: 700, collectionRate: 22, avgBillValue: 900 }, byMonth: [], byStatus: [], topMechanics: [] });
  if (p === "/autobills") { listParams.push(Object.fromEntries(new URL(req.url()).searchParams)); return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 1, autoBillData: [bill] }); }
  if (p === "/inventory/levels") return json({ success: true, levels: { "oil-filter": 0, "brake-shoe": 5 } });
  if (p === "/inventory/summary") return json({ success: true, rows: invRows, totals: { parts: 2, inStock: 5, stockValue: 3000, sales: 6420, profit: 2220, outOfStock: 1 } });
  if (p === "/inventory/movements") return json({ success: true, movements: [
    { kind: "out", date: "2026-09-22T00:00:00.000Z", qty: 2, amount: 640, billNo: 9, vehicleNumber: "TN09MM0001", id: "a3" },
    { kind: "in", date: "2026-09-01T00:00:00.000Z", qty: 4, buyPrice: 200, supplier: "Sri Parts", id: "e0" },
  ] });
  if (p === "/inventory/entries" && req.method() === "POST") { stockPosts.push(req.postDataJSON()); return json({ success: true, message: "Stock added ✅" }); }
  if (p === "/inventory/entries") { entryParams.push(Object.fromEntries(new URL(req.url()).searchParams)); return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 1, entries: invEntries }); }
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

// Bill No is the first column (no SI No); headers sort the whole list on the server; one search box covers every field.
const heads = await page.locator(".list-card thead th").allInnerTexts();
ok("auto: Bill No is the first column and there is no SI No", heads[0].trim() === "Bill No" && !heads.some((h) => /SI No/i.test(h)), JSON.stringify(heads));
await page.locator("thead").getByRole("button", { name: "Bill No" }).click();
await page.waitForTimeout(400);
let lp = listParams[listParams.length - 1];
ok("auto: clicking Bill No asks the server for bill no ascending", lp.sortBy === "billNo" && lp.sortDir === "asc" && lp.page === "1", JSON.stringify(lp));
ok("auto: sorted header announces its order", (await page.locator("thead th").first().getAttribute("aria-sort")) === "ascending");
await page.locator("thead").getByRole("button", { name: "Pending" }).click();
await page.locator("thead").getByRole("button", { name: "Pending" }).click();
await page.waitForTimeout(400);
lp = listParams[listParams.length - 1];
ok("auto: a second click sorts descending (pending, high to low)", lp.sortBy === "pend" && lp.sortDir === "desc", JSON.stringify(lp));
await page.locator("thead").getByRole("button", { name: "Pending" }).click();
await page.waitForTimeout(400);
lp = listParams[listParams.length - 1];
ok("auto: a third click goes back to the default order", !lp.sortBy, JSON.stringify(lp));
await page.locator("#bill-search").fill("7");
await page.waitForTimeout(600);
lp = listParams[listParams.length - 1];
ok("auto: search sends one 'search' term (a bill number searches from 1 digit)", lp.search === "7" && !("vehicleNumber" in lp), JSON.stringify(lp));
ok("auto: search box says what it covers", /bill no/i.test(await page.locator("#bill-search").getAttribute("placeholder")));
await page.locator("#bill-search").fill("");
await page.waitForTimeout(400);

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
await page.locator("#vehicle-number").pressSequentially("tn01x9999");
ok("auto: vehicle number is typed in capitals", (await page.locator("#vehicle-number").inputValue()) === "TN01X9999", await page.locator("#vehicle-number").inputValue());
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
ok("auto: picking a catalog part fills rate and amount", (await page.locator("#rate-1").inputValue()) === "320" && (await page.locator("#amount-1").inputValue()) === "320",
  [await page.locator("#rate-1").inputValue(), await page.locator("#amount-1").inputValue()].join(" / "));
ok("auto: the bill form has no Unit field or column", (await page.locator('[id^="unit-"]').count()) === 0 && !/Unit/.test(await page.locator(".memo-cols").first().innerText()));
const warn = page.locator(".memo").nth(1).locator(".memo-row-warn");
ok("auto: a catalog part with no stock shows a warning (bill still saves)", (await warn.count()) === 1 && /None in stock/.test(await warn.innerText()), await warn.innerText().catch(() => ""));
ok("auto: S.No runs on across memos (memo 2 starts at 2)", (await page.locator(".memo").nth(1).locator(".memo-sno").first().innerText()) === "2");
await page.locator(".memo").nth(1).getByRole("button", { name: "Add item" }).click();
await page.locator("#particulars-2").fill("Labour charge");
await page.locator("#rate-2").fill("0");
ok("auto: a ₹0 rate gives a ₹0 amount (free item), not a blank required field", (await page.locator("#amount-2").inputValue()) === "0", await page.locator("#amount-2").inputValue());
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
ok("auto: payload vehicle number in capitals, items carry no unit", created?.vehicleNumber === "TN01X9999" && created?.items?.every((i) => !("unit" in i)), JSON.stringify({ v: created?.vehicleNumber, i: created?.items?.[0] }));
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

// Phone: rows stack, nothing scrolls sideways, Qty / Rate / Amount are labelled.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + "/automobile/dashboard/edit/a3");
await page.locator("#particulars-0").waitFor({ timeout: 10000 });
// The footer is still settling for a moment after the first input mounts (measured ~6-11px at that instant), so wait
// for the layout to settle; an overflow that persists for the whole wait still fails.
const measureOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
let overflow = await measureOverflow();
for (let i = 0; i < 30 && overflow > 0; i++) { await page.waitForTimeout(100); overflow = await measureOverflow(); }
ok("auto: bill form has no horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}`);
ok("auto: phone rows show Qty / Rate / Amount labels", await page.locator(".memo-row").first().locator(".memo-mlabel").evaluateAll((els) => els.length === 3 && els.every((e) => getComputedStyle(e).display !== "none")));
await page.screenshot({ path: `${OUT}/auto-edit-390.png`, fullPage: true });
await page.screenshot({ path: `${OUT}/auto-create.png`, fullPage: true });

// Phone billing list: the sort is a "Sort by" menu above the cards.
await page.goto(BASE + "/automobile/billing");
await page.getByText("TN52AB1234").first().waitFor({ timeout: 10000 });
await page.locator(".m-sort select").selectOption("total:desc");
await page.waitForTimeout(400);
lp = listParams[listParams.length - 1];
ok("auto: phone 'Sort by' menu sorts on the server", lp.sortBy === "total" && lp.sortDir === "desc", JSON.stringify(lp));

// Inventory page.
await page.setViewportSize({ width: 1300, height: 1000 });
await page.goto(BASE + "/automobile/inventory");
await page.getByText("Brake Shoe").first().waitFor({ timeout: 10000 });
ok("auto: sidebar has Inventory", /Inventory/.test(await page.locator(".sidebar-nav").innerText()));
const kpis = await page.locator(".kpi").allInnerTexts();
ok("auto: inventory KPIs: units in stock, stock value, sales, profit", kpis.length === 4 && /5/.test(kpis[0]) && /3,000/.test(kpis[1]) && /2,220/.test(kpis[3]), JSON.stringify(kpis));
ok("auto: an oversold part shows 'Short by 2'; a stocked part its count", (await page.getByText("Short by 2").count()) === 1 && (await page.getByText("5 in stock").count()) === 1);
await page.locator("thead").getByRole("button", { name: "In stock" }).click();
const firstPart = (await page.locator(".list-card tbody tr").first().innerText()).split("\n")[0];
ok("auto: sorting by In stock (low first) puts the short part on top", /Oil Filter/.test(firstPart), firstPart);
await page.getByRole("button", { name: "Show history for Oil Filter" }).click();
await page.getByText("Bill 9 · TN09MM0001").waitFor({ timeout: 5000 });
ok("auto: a part's history lists its purchases and the bills it was sold on", (await page.getByText("Stock in", { exact: true }).count()) >= 1);
await page.screenshot({ path: `${OUT}/auto-inventory.png`, fullPage: true });

// Add stock: required fields, then the payload.
await page.locator(".page-header").getByRole("button", { name: "Add stock" }).click();
await page.locator(".ui-modal-foot").getByRole("button", { name: "Add stock" }).click();
ok("auto: add stock asks for part, qty and buy price", (await page.getByText("Pick a part").count()) === 1 && (await page.getByText("Qty must be more than 0").count()) === 1 && (await page.getByText("Enter the buy price per unit").count()) === 1);
await page.locator("#stock-part").click({ force: true });
await page.getByText("Brake Shoe", { exact: true }).last().click();
await page.locator("#stock-qty").fill("12");
await page.locator("#stock-price").fill("550");
await page.locator("#stock-supplier").fill("Sri Parts");
ok("auto: add stock shows the total cost", /6,600/.test(await page.locator(".ui-modal").innerText()));
await page.locator(".ui-modal-foot").getByRole("button", { name: "Add stock" }).click();
for (let i = 0; i < 30 && !stockPosts.length; i++) await page.waitForTimeout(100);
const sp = stockPosts[0];
ok("auto: add stock posts part, date, qty, buy price and supplier", sp?.partRef === "brake-shoe" && sp?.qty === 12 && sp?.buyPrice === 550 && sp?.supplier === "Sri Parts" && /^\d{4}-\d{2}-\d{2}$/.test(sp?.date), JSON.stringify(sp));

// Purchases tab: sorted on the server.
await page.getByRole("tab", { name: "Purchases" }).click();
await page.getByText("INV-9").waitFor({ timeout: 5000 });
await page.locator("thead").getByRole("button", { name: "Qty" }).click();
await page.waitForTimeout(400);
const ep = entryParams[entryParams.length - 1];
ok("auto: purchases sort by qty on the server", ep.sortBy === "qty" && ep.sortDir === "asc", JSON.stringify(ep));

// ---- Parts catalog: names are judged as shown, like the tyre catalog ----
await page.goto(BASE + "/settings");
await page.getByRole("tab", { name: "Parts Catalog" }).click();
// A part added here, renamed, then added again under its old name: the second add did nothing at all (the renamed
// part still holds the stored value that name makes).
const addPartRow = async (label, rate) => {
  await page.locator("#new-part-label").fill(label);
  await page.locator("#new-part-rate").fill(rate);
  await page.getByRole("button", { name: "Add", exact: true }).click();
};
await addPartRow("Air Filter", "250");
await page.getByLabel("Air Filter name").fill("Air Filter (old)");
await addPartRow("Air Filter", "300");
const partNames = await page.locator(".matrix-parts tbody th input").evaluateAll((els) => els.map((e) => e.value));
ok("auto: a part can be added under a renamed part's old name", partNames.includes("Air Filter") && partNames.includes("Air Filter (old)"), partNames.join(" | "));
// Two parts under one name, or a part with no name, are not saved.
const savePuts = async () => { const n = settingsPuts.length; await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click(); await page.waitForTimeout(600); return settingsPuts.length - n; };
await page.getByLabel("Brake Shoe name").fill("oil filter ");
const dupSaves = await savePuts();
const dupAlert = (await page.locator("[role=alert]").allTextContents()).join(" ");
ok("auto: two parts with the same name are not saved", dupSaves === 0 && /oil filter.*twice/i.test(dupAlert), `${dupSaves} saves; "${dupAlert.slice(-120)}"`);
await page.getByLabel("oil filter name").first().fill("");
const blankSaves = await savePuts();
ok("auto: a part with no name is not saved", blankSaves === 0, `${blankSaves} saves`);

ok("auto: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
