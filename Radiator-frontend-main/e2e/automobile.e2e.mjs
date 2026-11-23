// Automobile browser checks: real app on the Vite dev server, API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node e2e/automobile.e2e.mjs`
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { defaultSettings } = await import(pathToFileURL(join(here, "../../Radiator-backend-main/src/config/defaultSettings.js")).href);
import { mockWhatsApp, until } from "./wa-helpers.mjs";
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
settings.automobile.parts = [{ label: "Oil Filter", value: "oil-filter", unit: "pcs", rate: 320 }, { label: "Brake Shoe", value: "brake-shoe", rate: 900 }];

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
const renames = [];

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings" && req.method() === "PUT") { settingsPuts.push(req.postDataJSON()); return json({ success: true, message: "Settings saved" }); }
  if (p === "/settings") return json({ settings });
  if (p === "/settings/names") return json({ success: true, kinds: [{ kind: "part", label: "Part" }, { kind: "unit", label: "Unit" }, { kind: "mechanic", label: "Mechanic" }] });
  if (p === "/settings/names/part") return json({ success: true, names: [{ name: "Engin oil", bills: 3 }, { name: "Oil Filter", bills: 1 }] });
  if (p.startsWith("/settings/names/") && req.method() === "GET") return json({ success: true, names: [] });
  if (p === "/settings/names/rename") { renames.push(req.postDataJSON()); return json({ success: true, bills: 3, message: "Renamed on 3 bills ✅" }); }
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
ok("auto: picking a catalog part fills its unit; the lines have a Unit column", (await page.locator("#unit-1").inputValue()) === "pcs" && /Unit/i.test(await page.locator(".memo-cols").first().innerText()),
  await page.locator("#unit-1").inputValue());
const unitOpts = await page.locator("#unit-0 option").allInnerTexts();
ok("auto: the unit list on a line comes from Settings", JSON.stringify(unitOpts) === JSON.stringify(["—", ...settings.automobile.units]), JSON.stringify(unitOpts));
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
ok("auto: payload vehicle number in capitals; each line carries its unit (blank when none)", created?.vehicleNumber === "TN01X9999" && JSON.stringify(created?.items?.map((i) => i.unit)) === JSON.stringify(["", "pcs", ""]), JSON.stringify({ v: created?.vehicleNumber, i: created?.items }));
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
ok("auto: phone rows show Qty / Unit / Rate / Amount labels", await page.locator(".memo-row").first().locator(".memo-mlabel").evaluateAll((els) => els.length === 4 && els.every((e) => getComputedStyle(e).display !== "none")));
ok("auto: an edited bill loads each line's saved unit", (await page.locator("#unit-0").inputValue()) === "pcs");
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

// ---- Units: a list in Settings, a default unit per catalog part ----
await page.goto(BASE + "/settings");
await page.getByRole("tab", { name: "Parts Catalog" }).click();
ok("auto: Parts Catalog shows each part's unit", (await page.getByLabel("Oil Filter unit").inputValue()) === "pcs");
await page.getByLabel("Brake Shoe unit").selectOption("set");
await page.locator("#unit-list").fill("box");
await page.locator("#unit-list").press("Enter");
await page.locator("#new-part-label").fill("Grease");
await page.locator("#new-part-unit").selectOption("box");
await page.locator("#new-part-rate").fill("60");
await page.getByRole("button", { name: "Add", exact: true }).click();
const unitSaves = await savePuts();
const lastPut = settingsPuts[settingsPuts.length - 1];
ok("auto: units and part units are saved from Settings", unitSaves === 1 && lastPut.automobile.units.includes("box")
  && lastPut.automobile.parts.find((x) => x.value === "brake-shoe")?.unit === "set" && lastPut.automobile.parts.find((x) => x.label === "Grease")?.unit === "box",
  JSON.stringify({ units: lastPut?.automobile?.units, parts: lastPut?.automobile?.parts }));

// The printed bill shows the unit next to the quantity.
await page.goto(BASE + "/automobile/billing");
await page.getByText("TN52AB1234").first().waitFor({ timeout: 10000 });
const dlUnit = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
await page.getByRole("button", { name: "Actions for TN52AB1234" }).click();
await page.getByRole("menuitem", { name: "Print" }).click();
const pdfUnit = await dlUnit;
const rawUnit = pdfUnit ? readFileSync(await pdfUnit.path()).toString("latin1") : "";
ok("auto: the printed bill shows '2 L' in the Qty column", /\(2 L\)/.test(rawUnit), pdfUnit ? "no '2 L' in the PDF" : "no download");

// ---- Fix a name on past bills ----
await page.goto(BASE + "/settings");
await page.getByRole("tab", { name: "Fix names" }).click();
await page.locator("#fix-from").waitFor({ timeout: 10000 });
ok("auto: Fix names offers Part, Unit and Mechanic", JSON.stringify(await page.locator("#fix-kind option").allInnerTexts()) === JSON.stringify(["Part", "Unit", "Mechanic"]));
await page.locator("#fix-from").selectOption("Engin oil");
await page.locator("#fix-to").fill("Engine oil");
await page.getByRole("button", { name: "Rename on 3 bills" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Rename", exact: true }).click();
for (let i = 0; i < 30 && !renames.length; i++) await page.waitForTimeout(100);
ok("auto: renaming posts the kind, the old and the correct name", JSON.stringify(renames[0]) === JSON.stringify({ kind: "part", from: "Engin oil", to: "Engine oil" }), JSON.stringify(renames));

// ---- WhatsApp: everything hidden unless the company has it; send-on-save, edit-after-sent, row menu, failed filter, receipts ----
{
  const wbill = (id, no, vehicle, phone, whatsapp) => ({
    _id: id, billNo: no, billDate: "2026-09-20T00:00:00.000Z", vehicleNumber: vehicle, customerName: "Velu", phoneNumber: phone, mechanicName: "Ramesh", labourName: [], notes: "",
    items: [{ particulars: "Engine oil", partRef: null, qty: 2, unit: "L", rate: 450, amount: 900 }],
    totalAmount: 900, discount: 0, netAmount: 900, receivedAmount: 200, pendingAmount: 700, status: "Partial", ...(whatsapp ? { whatsapp } : {}),
  });
  const failedWa = { status: "failed", at: "2026-11-12T10:00:00.000Z", error: "Template awaiting approval", kind: "bill" };
  const bills = {
    a11: wbill("a11", 11, "TN11WA0001", "9843012345"),
    a12: wbill("a12", 12, "TN12WA0002", "9843012345", failedWa),
    a13: wbill("a13", 13, "TN13WA0003", ""),
    a15: wbill("a15", 15, "TN15WA0005", "9843012345", { status: "delivered", at: "2026-11-13T09:30:00.000Z", kind: "bill" }),
    a19: wbill("a19", 19, "TN19WA0009", "9843012345"),
  };
  const open = async (enabled, width = 1300) => {
    const pg = await browser.newPage({ viewport: { width, height: 1000 } });
    pg.on("pageerror", (e) => errors.push(e.message));
    const s = structuredClone(settings);
    s.whatsappEnabled = enabled;
    s.whatsapp = { ...(s.whatsapp || {}), billDefaultTick: true, receipt: true, receiptPdf: true };
    const rec = { lists: [], exports: [], created: null, updated: null, payments: [] };
    await pg.route("http://localhost:5000/**", async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const p = u.pathname;
      const m = req.method();
      const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
      if (p === "/settings") return json({ settings: s });
      if (p === "/auto-mechanic") return json({ success: true, mechdata: ["Ramesh"] });
      if (p === "/inventory/levels") return json({ success: true, levels: {} });
      if (p === "/autobills/add") { rec.created = req.postDataJSON(); return json({ success: true, message: "Bill saved ✅", id: "a19" }); }
      if (p === "/autobills" || p === "/autobills/export") {
        const q = Object.fromEntries(u.searchParams);
        (p === "/autobills" ? rec.lists : rec.exports).push(q);
        const rows = Object.values(bills).filter((b) => b._id !== "a19" && b._id !== "a15" && (q.waFailed !== "1" || b.whatsapp?.status === "failed"));
        return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: rows.length, autoBillData: rows });
      }
      const mm = p.match(/^\/autobills\/(a\d+)(\/payment)?$/);
      if (mm && mm[2]) { rec.payments.push(req.postDataJSON()); return json({ success: true, message: "ok", autoBill: bills[mm[1]], whatsappReceiptId: "rc1" }); }
      if (mm && m === "PUT") { rec.updated = req.postDataJSON(); return json({ success: true, message: "Updated" }); }
      if (mm) return json(bills[mm[1]]);
      return json({ success: true, data: [], mechdata: [], records: [] });
    });
    const wa = await mockWhatsApp(pg);
    await pg.goto(BASE + "/issueCounter/login");
    await pg.evaluate(() => {
      localStorage.setItem("svr_token", "x");
      localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
    });
    return { pg, wa, rec };
  };
  const fillBill = async (pg, phone) => {
    await pg.locator("#vehicle-number").waitFor({ timeout: 10000 });
    await pg.locator("#vehicle-number").fill("TN19WA0009");
    await pg.locator("#agent").click({ force: true });
    await pg.getByText("Ramesh", { exact: true }).last().click();
    await pg.locator("#particulars-0").fill("Brake pads");
    await pg.locator("#qty-0").fill("2");
    await pg.locator("#rate-0").fill("750");
    await pg.locator("#phone").fill(phone);
    await pg.locator('input[name="day"]').fill("20");
    await pg.locator('input[name="month"]').fill("09");
    await pg.locator('input[name="year"]').fill("2026");
  };

  // Disabled: nothing about WhatsApp on screen.
  {
    const { pg } = await open(false);
    await pg.goto(BASE + "/automobile/dashboard/create");
    await pg.locator("#vehicle-number").waitFor({ timeout: 10000 });
    ok("auto wa: no tick on the bill form when WhatsApp is off", (await pg.locator("#wa-send").count()) === 0 && !/WhatsApp/.test(await pg.locator(".form-footer").innerText()));
    await pg.goto(BASE + "/automobile/billing");
    await pg.getByText("TN11WA0001").first().waitFor({ timeout: 10000 });
    await pg.getByRole("button", { name: "Actions for TN11WA0001" }).click();
    ok("auto wa: no row-menu item when WhatsApp is off", (await pg.getByRole("menuitem", { name: /on WhatsApp/ }).count()) === 0);
    await pg.keyboard.press("Escape");
    ok("auto wa: no WhatsApp failed filter or badge when WhatsApp is off", (await pg.locator("#f-wa-failed").count()) === 0 && (await pg.getByText("Failed", { exact: true }).count()) === 0);
    await pg.close();
  }

  // Enabled: create with the tick.
  {
    const { pg, wa, rec } = await open(true);
    await pg.goto(BASE + "/automobile/dashboard/create");
    await pg.locator("#vehicle-number").waitFor({ timeout: 10000 });
    ok("auto wa: no phone → tick is disabled with a hint", await pg.locator("#wa-send").isDisabled() && /Add a valid 10-digit phone to send/.test(await pg.locator(".form-footer").innerText()));
    await fillBill(pg, "12345");
    ok("auto wa: an invalid phone keeps the tick disabled", await pg.locator("#wa-send").isDisabled() && !(await pg.locator("#wa-send").isChecked()));
    await pg.locator("#phone").fill("9843012345");
    ok("auto wa: a valid phone enables the tick, ticked by the company default", !(await pg.locator("#wa-send").isDisabled()) && (await pg.locator("#wa-send").isChecked()));
    await pg.getByRole("button", { name: "Create bill", exact: true }).click();
    await until(pg, () => wa.some((w) => w.path.startsWith("/whatsapp/send/bill/")));
    await pg.waitForTimeout(800);
    const sends = wa.filter((w) => w.path.startsWith("/whatsapp/send/bill/"));
    ok("auto wa: saving posts exactly once to /whatsapp/send/bill/automobile/<id> with a PDF", sends.length === 1 && sends[0].path === "/whatsapp/send/bill/automobile/a19" && sends[0].pdf && /multipart\/form-data/.test(sends[0].type) && !("updated" in sends[0].query), JSON.stringify(sends));
    ok("auto wa: the bill save itself is unchanged (no whatsapp fields in the payload)", rec.created && !("whatsapp" in rec.created));
    ok("auto wa: success toast", (await pg.getByText("Sent to WhatsApp").count()) > 0);

    // Untick → nothing is sent.
    wa.length = 0; rec.created = null;
    await pg.goto(BASE + "/automobile/dashboard/create");
    await fillBill(pg, "9843012345");
    await pg.locator("#wa-send").uncheck();
    await pg.getByRole("button", { name: "Create bill", exact: true }).click();
    await until(pg, () => rec.created);
    await pg.waitForTimeout(1200);
    ok("auto wa: an unticked save sends nothing", wa.length === 0);

    // Edit a delivered bill.
    await pg.goto(BASE + "/automobile/dashboard/edit/a15");
    await pg.locator("#wa-send").waitFor({ timeout: 10000 });
    await pg.locator("#particulars-0").waitFor();
    ok("auto wa: editing a sent bill shows 'Already sent on' and an unticked box", /Already sent on 13\/11\/2026/.test(await pg.locator(".form-footer").innerText()) && !(await pg.locator("#wa-send").isChecked()));
    await pg.getByRole("button", { name: "Update bill", exact: true }).click();
    await until(pg, () => rec.updated);
    await pg.waitForTimeout(800);
    ok("auto wa: updating without the tick sends nothing", wa.length === 0);
    await pg.goto(BASE + "/automobile/dashboard/edit/a15");
    await pg.locator("#particulars-0").waitFor({ timeout: 10000 });
    await pg.locator("#wa-send").check();
    rec.updated = null;
    await pg.getByRole("button", { name: "Update bill", exact: true }).click();
    await until(pg, () => wa.length);
    await pg.waitForTimeout(500);
    ok("auto wa: ticking an already-sent bill sends the updated bill (updated=1)", wa.length === 1 && wa[0].path === "/whatsapp/send/bill/automobile/a15" && wa[0].query.updated === "1" && wa[0].pdf, JSON.stringify(wa));

    // View page: status line + Resend.
    wa.length = 0;
    await pg.goto(BASE + "/automobile/dashboard/view/a15");
    await pg.getByTestId("wa-status-line").waitFor({ timeout: 10000 });
    ok("auto wa: the view page shows 'WhatsApp: Delivered · 13/11/2026'", /WhatsApp: Delivered · 13\/11\/2026/.test(await pg.getByTestId("wa-status-line").innerText()));
    await pg.getByTestId("wa-status-line").getByRole("button", { name: "Resend" }).click();
    await until(pg, () => wa.length);
    ok("auto wa: Resend on the view page posts the PDF with updated=0", wa.length === 1 && wa[0].path === "/whatsapp/send/bill/automobile/a15" && !("updated" in wa[0].query) && wa[0].pdf, JSON.stringify(wa));
    await pg.close();
  }

  // Enabled: list.
  {
    const { pg, wa, rec } = await open(true);
    await pg.goto(BASE + "/automobile/billing");
    await pg.getByText("TN12WA0002").first().waitFor({ timeout: 10000 });
    const failBadge = pg.getByTestId("wa-badge").first();
    ok("auto wa: a failed bill shows a Failed badge with the reason as its tooltip", (await failBadge.innerText()).trim() === "Failed" && (await failBadge.getAttribute("title")) === "Template awaiting approval");
    ok("auto wa: only the bill that has a WhatsApp status gets a badge", (await pg.getByTestId("wa-badge").count()) === 1);
    await pg.getByRole("button", { name: "Actions for TN13WA0003" }).click();
    const noPhone = pg.getByRole("menuitem", { name: "Send on WhatsApp" });
    ok("auto wa: a bill with no phone has the item disabled with a reason", await noPhone.isDisabled() && /No valid phone/.test(await pg.locator("[role=menu]").innerText()));
    await pg.keyboard.press("Escape");
    await pg.getByRole("button", { name: "Actions for TN11WA0001" }).click();
    ok("auto wa: an unsent bill offers 'Send on WhatsApp'", (await pg.getByRole("menuitem", { name: "Send on WhatsApp" }).count()) === 1);
    await pg.keyboard.press("Escape");
    await pg.getByRole("button", { name: "Actions for TN12WA0002" }).click();
    await pg.getByRole("menuitem", { name: "Resend on WhatsApp" }).click();
    await until(pg, () => wa.length);
    ok("auto wa: 'Resend on WhatsApp' posts the PDF", wa.length === 1 && wa[0].path === "/whatsapp/send/bill/automobile/a12" && wa[0].pdf, JSON.stringify(wa));

    // Failed filter.
    await pg.locator("#f-wa-failed").check();
    await pg.waitForTimeout(600);
    ok("auto wa: the 'WhatsApp failed' filter adds waFailed=1 to the list", rec.lists[rec.lists.length - 1].waFailed === "1", JSON.stringify(rec.lists[rec.lists.length - 1]));
    ok("auto wa: and only failed bills remain", (await pg.getByText("TN11WA0001").count()) === 0 && (await pg.getByText("TN12WA0002").count()) > 0);
    await pg.getByRole("button", { name: "Excel" }).first().click();
    await until(pg, () => rec.exports.length);
    ok("auto wa: the export carries waFailed=1 too", rec.exports[0]?.waFailed === "1", JSON.stringify(rec.exports));

    // Receipt with PDF.
    await pg.locator("#f-wa-failed").uncheck();
    await pg.getByText("TN11WA0001").first().waitFor();
    wa.length = 0;
    await pg.getByRole("button", { name: "Actions for TN11WA0001" }).click();
    await pg.getByRole("menuitem", { name: "Record Payment" }).click();
    await pg.locator("#payment-amount").fill("100");
    await pg.locator(".ui-modal-foot").getByRole("button", { name: "Record Payment" }).click();
    await until(pg, () => wa.some((w) => w.path.startsWith("/whatsapp/receipts/")));
    await pg.waitForTimeout(600);
    const rc = wa.filter((w) => w.path.startsWith("/whatsapp/receipts/"));
    ok("auto wa: a payment with whatsappReceiptId posts one receipt PDF", rec.payments.length === 1 && rc.length === 1 && rc[0].path === "/whatsapp/receipts/rc1/pdf" && rc[0].pdf, JSON.stringify(rc));
    await pg.close();
  }

  // Phone: the form footer with the tick fits.
  {
    const { pg } = await open(true, 390);
    await pg.goto(BASE + "/automobile/dashboard/edit/a15");
    await pg.locator("#wa-send").waitFor({ timeout: 10000 });
    const ov = () => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    let o = await ov();
    for (let i = 0; i < 30 && o > 0; i++) { await pg.waitForTimeout(100); o = await ov(); }
    const box = await pg.locator(".wa-tick").boundingBox();
    ok("auto wa: the form footer with the tick has no horizontal scroll at 390px", o <= 0 && box && box.x >= 0 && box.x + box.width <= 390, `overflow=${o} box=${JSON.stringify(box)}`);
    await pg.screenshot({ path: `${OUT}/auto-wa-390.png`, fullPage: true });
    await pg.close();
  }
}

ok("auto: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
