// Tyre browser checks: real app on the Vite dev server, API intercepted with page.route. Unlike the other suites, the
// challan endpoints are answered by the REAL backend code (dao/tyrebill.dao.js on the in-memory fake Mongo from the
// backend tests), so creating, editing and paying a challan goes through the actual validation and money rules.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then
//      `node --experimental-test-module-mocks e2e/tyre.e2e.mjs`
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const backend = (p) => pathToFileURL(join(here, "../../Radiator-backend-main", p)).href;
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { defaultSettings } = await import(backend("src/config/defaultSettings.js"));
const { FakeDb } = await import(backend("test/helpers/fakeDb.js"));
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";
const OUT = process.env.E2E_OUT || join(here, ".out");
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const settings = structuredClone(defaultSettings);
settings.businessType = "tyre";
settings.company.name = "Sri Murugan Tyres";
settings.company.address = "4, Bypass Road, Madurai";
settings.company.phone1 = "98430 55555";
settings.mechanics = ["Ramesh"];
settings.labour = ["Kumar", "Siva"];
settings.tyre.brands = [
  { label: "MRF", value: "mrf", models: [{ label: "10.00-20 Steel Muscle", value: "10-00-20-steel-muscle", rate: 24250 }] },
  { label: "Apollo", value: "apollo", models: [{ label: "9.00-20 XT-7", value: "9-00-20-xt-7", rate: 19000 }] },
];
settings.tyre.bonus.mechanicPercent = 2;

const fakeDb = new FakeDb();
mock.module(backend("src/config/db.js"), { namedExports: { connectDB: async () => fakeDb } });
mock.module(backend("src/dao/settings.dao.js"), { namedExports: { getSettings: async () => settings } });
const dao = await import(backend("src/dao/tyrebill.dao.js"));
const CLIENT = "650000000000000000000001";

const settingsPuts = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
  const run = async (fn) => {
    try { return json(await fn()); } catch (e) { return json({ success: false, message: e.message }, e.statusCode || 500); }
  };
  const q = Object.fromEntries(url.searchParams);
  if (p === "/settings" && req.method() === "PUT") { settingsPuts.push(req.postDataJSON()); return json({ success: true, message: "Settings saved", settings }); }
  if (p === "/settings") return json({ settings });
  if (p === "/tyre-mechanic") return json({ success: true, mechdata: ["Ramesh"] });
  if (p === "/inventory/levels") return json({ success: true, levels: { "mrf:10-00-20-steel-muscle": 1 } });
  if (p === "/inventory/summary") return json({ success: true, rows: [], totals: { parts: 0, inStock: 0, stockValue: 0, sales: 0, profit: 0, outOfStock: 0 } });
  if (p === "/inventory/entries") return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 0, entries: [] });
  if (p === "/tyrebills/analytics") {
    return run(async () => ({
      success: true,
      kpis: { totalBills: 1, tyreRevenue: 48500, interestTotal: 800, payableTotal: 49300, totalCollected: 0, totalPending: 49300, totalDiscount: 0, installmentBills: 1, tyresSold: 2, collectionRate: 0, avgBillValue: 49300 },
      byMonth: [], byStatus: [], byBrand: [], topMechanics: [],
      installments: await dao.getInstallmentFollowUp(CLIENT),
    }));
  }
  if (p === "/tyrebills/add") return run(async () => { const b = await dao.createTyreBill(CLIENT, req.postDataJSON()); return { success: true, message: "Challan saved ✅", id: b._id }; });
  let m = /^\/tyrebills\/([a-f0-9]{24})\/payment$/.exec(p);
  if (m) return run(async () => ({ success: true, message: "Payment recorded ✅", tyreBill: await dao.recordTyrePayment(CLIENT, m[1], req.postDataJSON()) }));
  m = /^\/tyrebills\/([a-f0-9]{24})$/.exec(p);
  if (m && req.method() === "GET") return run(() => dao.getTyreBillById(CLIENT, m[1]));
  if (m && req.method() === "PUT") return run(async () => ({ success: true, message: "Challan updated ✅", tyreBill: await dao.updateTyreBill(CLIENT, m[1], req.postDataJSON()) }));
  if (p === "/tyrebills") {
    return run(async () => {
      const d = await dao.getAllTyreBills(CLIENT, { search: q.search || "" }, 1, 10, q);
      return { success: true, currentPage: 1, totalPages: d.totalPages, totalRecords: d.total, tyreBillData: d.tyreBillData };
    });
  }
  return json({ success: true, data: [], mechdata: [], records: [], rows: [] });
});

const pick = async (inputSelector, text) => {
  const input = page.locator(inputSelector).first();
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
};

await page.goto(BASE + "/issueCounter/login");
await page.evaluate(() => {
  localStorage.setItem("svr_token", "x");
  localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
});

// ---- Gating and navigation ----
await page.goto(BASE + "/issueCounter/dashboard");
await page.waitForURL(/\/tyre\//, { timeout: 10000 }).catch(() => {});
ok("tyre: radiator dashboard redirects to the tyre dashboard", page.url().includes("/tyre/dashboard"), page.url());
const nav = (await page.locator(".sidebar-nav").innerText()).replace(/\s+/g, " ");
ok("tyre: sidebar has Challans, Inventory, Expenses, Bonus, Salary", ["Challans", "Inventory", "Expenses", "Bonus", "Salary"].every((w) => nav.includes(w)), nav);
await page.goto(BASE + "/automobile/billing");
await page.waitForTimeout(1200);
ok("tyre: automobile route redirects away", !page.url().includes("/automobile/"), page.url());

// ---- New challan on installments (the paper challan's example) ----
await page.goto(BASE + "/tyre/dashboard/create");
await page.locator("#ty-vehicle").waitFor({ timeout: 10000 });
// Saving an untouched form: the tyre fields say what to fill in; the empty plan rows don't repeat "enter an amount".
await page.locator(".form-footer").getByRole("button", { name: "Save challan" }).click();
await page.waitForTimeout(300);
ok("tyre: untouched form doesn't flag every installment row", (await page.getByText("Enter an amount").count()) === 0 && (await page.getByText("Choose a brand").count()) === 1);
await page.locator("#ty-vehicle").fill("tn58ab1234");
await page.locator("#ty-customer").fill("Murugan");
await page.locator("#ty-phone").fill("9876543210");
await page.locator("#ty-address").fill("12, Anna Nagar, Madurai");
await pick("#ty-mechanic", "Ramesh");
await pick("[id^=ty-brand-]", "MRF");
await pick("[id^=ty-model-]", "10.00-20");
ok("tyre: picking a model fills its rate from the catalog", (await page.locator("[id^=ty-rate-]").first().inputValue()) === "24250");
const modelCut = await page.locator(".tyre-item").first().evaluate((f) => {
  const el = [...f.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.includes("Steel Muscle"));
  return el ? el.scrollWidth - el.clientWidth : -1;
});
ok("tyre: the chosen model / size is shown in full on desktop", modelCut === 0, `cut ${modelCut}px`);
await page.locator("[id^=ty-qty-]").first().fill("2");
await page.locator("[id^=ty-serial-]").first().fill("MRF-77881, MRF-77882");
ok("tyre: stock warning when the challan needs more than is in stock", /Only 1 in stock/.test(await page.locator(".tyre-warn").innerText().catch(() => "")));

const fillRow = async (label, principal, interest) => {
  await page.getByLabel(`Principal for ${label}`).fill(String(principal));
  await page.getByLabel(`Interest for ${label}`).fill(String(interest));
};
await fillRow("Initial amount", 28500, 0);
await fillRow("1st month", 10400, 400);
await fillRow("2nd month", 10000, 400);
ok("tyre: plan check flags principal above the tyre amount", /Principal is more by\s*₹400/.test(await page.locator(".tyre-check").innerText()));
await page.locator(".form-footer").getByRole("button", { name: "Save challan" }).click();
await page.waitForTimeout(500);
ok("tyre: a plan that doesn't add up is not saved", page.url().includes("/create") && fakeDb.collection("tyrebills").docs.length === 0);
await fillRow("1st month", 10000, 400);
ok("tyre: plan check matches once principals add up", /Matches the tyre amount/.test(await page.locator(".tyre-check").innerText()));
ok("tyre: footer shows tyres + interest", /₹49,300\.00/.test(await page.locator(".form-footer").innerText()));
await page.screenshot({ path: join(OUT, "tyre-create.png"), fullPage: true });
await page.locator(".form-footer").getByRole("button", { name: "Save challan" }).click();
await page.waitForURL(/\/tyre\/billing/, { timeout: 10000 }).catch(() => {});
const saved = fakeDb.collection("tyrebills").docs[0];
ok("tyre: challan saved through the real DAO", !!saved && saved.payableTotal === 49300 && saved.tyreAmount === 48500 && saved.interestTotal === 800,
  saved ? JSON.stringify({ t: saved.tyreAmount, i: saved.interestTotal, p: saved.payableTotal }) : "none");
ok("tyre: lines saved with brand/model refs, tyre number, flap and capitals", !!saved && saved.items[0].partRef === "mrf:10-00-20-steel-muscle"
  && saved.items[0].tyreNumber === "MRF-77881, MRF-77882" && saved.items[0].flap === true && saved.vehicleNumber === "TN58AB1234");

// ---- List + pay a chosen installment ----
await page.getByText("TN58AB1234").first().waitFor({ timeout: 10000 });
const heads = await page.locator(".list-card thead th").allInnerTexts();
ok("tyre: list starts with D.C. No and shows Next due", heads[0].trim() === "D.C. No" && heads.some((h) => /Next due/.test(h)), JSON.stringify(heads));
await page.getByRole("button", { name: `Actions for D.C. ${saved.billNo}` }).click();
await page.getByRole("menuitem", { name: "Record Payment" }).click();
await page.locator("#payment-installment").waitFor();
ok("tyre: payment modal has no discount on an installment challan", (await page.locator("#payment-discount").count()) === 0);
ok("tyre: payment modal starts on the earliest unpaid installment, amount filled", (await page.locator("#payment-amount").inputValue()) === "28500");
const m1 = saved.installments[1].id;
await page.locator("#payment-installment").selectOption(m1);
ok("tyre: choosing another installment fills what is left on it", (await page.locator("#payment-amount").inputValue()) === "10400");
await page.locator("#payment-amount").fill("5000");
await page.locator(".ui-modal-foot").getByRole("button", { name: "Record Payment" }).click();
await page.waitForTimeout(800);
const afterPay = fakeDb.collection("tyrebills").docs[0];
ok("tyre: payment recorded against the chosen installment", afterPay.installments[1].payments?.[0]?.amount === 5000 && afterPay.receivedAmount === 5000 && afterPay.status === "Partial",
  JSON.stringify({ rec: afterPay.receivedAmount, st: afterPay.status }));

// ---- View: statuses + print ----
await page.goto(BASE + `/tyre/dashboard/view/${saved._id}`);
await page.locator(".tyre-plan-row").first().waitFor({ timeout: 10000 });
const planText = await page.locator(".tyre-plan").innerText();
ok("tyre: view shows the paid amount on the part-paid installment", /₹5,000\.00 paid/.test(planText) && /Partly paid|Overdue/.test(planText), planText.replace(/\s+/g, " ").slice(0, 200));
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
  page.getByRole("button", { name: "Print" }).click(),
]);
ok("tyre: Print produces the challan PDF", !!download && /^Challan-\d+-.*\.pdf$/.test(download.suggestedFilename()), download?.suggestedFilename() || "no download");

// ---- Edit: paid row locked; unpaid rows can be re-planned ----
await page.goto(BASE + `/tyre/dashboard/edit/${saved._id}`);
await page.getByLabel("Principal for 1st month").waitFor({ timeout: 10000 });
ok("tyre: the installment with a payment is locked", await page.getByLabel("Principal for 1st month").isDisabled());

ok("tyre: unpaid installments stay editable", !(await page.getByLabel("Principal for 2nd month").isDisabled()));
ok("tyre: payment type is locked once paid", /payment type can't change/.test(await page.locator(".tyre-paytype").innerText()));
await page.getByRole("button", { name: "Add month" }).click();
await fillRow("2nd month", 5000, 200);
await fillRow("3rd month", 5000, 200);
await page.locator(".form-footer").getByRole("button", { name: "Update challan" }).click();
await page.waitForURL(/\/tyre\/billing/, { timeout: 10000 }).catch(() => {});
const edited = fakeDb.collection("tyrebills").docs[0];
ok("tyre: re-planned challan keeps the paid row and its payment", edited.installments.length === 4 && edited.installments[1].id === m1 && edited.receivedAmount === 5000 && edited.payableTotal === 49300,
  JSON.stringify({ n: edited.installments.length, p: edited.payableTotal }));

// ---- Edit with an overdue row: badge + remove button beside each total, which must still fit ----
const ymdOffset = (months) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
const overdueBill = await dao.createTyreBill(CLIENT, {
  billDate: ymdOffset(-2), vehicleNumber: "TN01OD0001", mechanicName: "Ramesh",
  items: [{ brandRef: "mrf", modelRef: "10-00-20-steel-muscle", qty: 5, rate: 24250 }],
  paymentType: "installment",
  installments: [
    { label: "Initial amount", dueDate: ymdOffset(-2), principal: 101250, interest: 0 },
    { label: "1st month", dueDate: ymdOffset(-1), principal: 10000, interest: 1000 },
    { label: "2nd month", dueDate: ymdOffset(1), principal: 10000, interest: 1000 },
  ],
});
await page.goto(BASE + `/tyre/dashboard/edit/${overdueBill._id}`);
await page.getByLabel("Principal for 1st month").waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
// The status cell overflows to the left when too narrow, painting the badge over the total: compare the boxes.
const clipped = await page.locator(".tyre-plan-row").evaluateAll((rows) => rows.filter((r) => {
  const total = r.querySelector(".tyre-plan-total")?.getBoundingClientRect();
  const first = r.querySelector(".tyre-plan-end > *")?.getBoundingClientRect();
  return total && first && first.left < total.right - 1;
}).length);
ok("tyre: installment totals aren't covered by an Overdue badge", clipped === 0, `${clipped} covered`);

// ---- Dashboard follow-up ----
await page.goto(BASE + "/tyre/dashboard");
await page.getByText("Installments to collect").waitFor({ timeout: 10000 });
// The follow-up table renders once analytics arrive; wait for it rather than reading the loading skeleton.
const dueRow = await page.locator(".dash-grid table").getByText("Initial amount").first().waitFor({ timeout: 10000 }).then(() => true, () => false);
ok("tyre: dashboard lists the initial amount due today", dueRow);

// ---- Settings: catalog tab adds a brand and model ----
await page.goto(BASE + "/settings");
await page.getByRole("tab", { name: "Tyre Catalog" }).click();
await page.locator("#new-tyre-brand").fill("CEAT");
await page.getByRole("button", { name: "Add brand" }).click();
await page.getByLabel("New CEAT model / size").fill("10.00-20 Mile XL");
await page.getByLabel("New CEAT model rate").fill("21500");
await page.getByRole("button", { name: "Add CEAT model" }).click();
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const put = settingsPuts[settingsPuts.length - 1];
const ceat = put?.tyre?.brands?.find((b) => b.value === "ceat");
ok("tyre: settings save sends the new brand and model with its rate", !!ceat && ceat.models[0]?.rate === 21500 && ceat.models[0]?.value === "10-00-20-mile-xl", JSON.stringify(ceat));
const tabs = await page.locator(".settings-nav").innerText();
ok("tyre: settings tabs are the tyre set", /Tyre Catalog/.test(tabs) && /Labels & Challan/.test(tabs) && !/Parts Catalog|Catalog & Pricing/.test(tabs), tabs.replace(/\s+/g, " "));

// ---- Inventory uses tyre wording ----
await page.goto(BASE + "/tyre/inventory");
await page.getByText("Stock by tyre").first().waitFor({ timeout: 10000 }).catch(() => {});
ok("tyre: inventory page speaks tyres", (await page.getByText("Stock by tyre").count()) > 0);

// ---- Phone width: no sideways scroll on the challan form ----
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(BASE + "/tyre/dashboard/create");
await page.locator("#ty-vehicle").waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok("tyre: challan form fits a 390px phone", overflow <= 0, `overflow ${overflow}px`);
const rowBoxes = await page.locator(".tyre-plan-row").evaluateAll((rows) => rows.map((r) => {
  const box = r.getBoundingClientRect();
  const x = r.querySelector(".tyre-plan-end button")?.getBoundingClientRect();
  const label = r.querySelector(".tyre-plan-label input")?.getBoundingClientRect();
  return { h: Math.round(box.height), xBeside: !!x && !!label && x.top < label.bottom && x.left >= label.right };
}));
// Type a 5-digit amount on the phone plan and make sure it is readable, not cut to a digit.
await page.getByLabel("Principal for Initial amount").fill("28500");
await page.getByLabel("Interest for 1st month").fill("12400");
const amountCut = await page.locator(".tyre-plan-row input[type=number]").evaluateAll((els) => els.filter((e) => e.value && e.scrollWidth > e.clientWidth).length);
ok("tyre: phone installment amounts are fully visible", amountCut === 0, `${amountCut} cut`);
ok("tyre: phone installment rows are compact, remove sits beside the name", rowBoxes.length > 0 && rowBoxes.every((r) => r.h <= 280 && r.xBeside), JSON.stringify(rowBoxes));
await page.screenshot({ path: join(OUT, "tyre-create-390.png"), fullPage: true });

// Phone dashboard: each installment to chase shows its balance and a call button inside the screen (no hidden columns).
await page.goto(BASE + "/tyre/dashboard");
await page.locator(".tyre-due").first().waitFor({ timeout: 10000 }).catch(() => {});
const dues = await page.locator(".tyre-due").evaluateAll((els) => els.map((e) => {
  const bal = e.querySelector(".tyre-due-bottom strong")?.getBoundingClientRect();
  const call = e.querySelector("a[href^='tel:']")?.getBoundingClientRect();
  // A challan saved without a phone number has no call button.
  return { bal: !!bal && bal.right <= window.innerWidth, call: call ? call.right <= window.innerWidth : null };
}));
ok("tyre: phone dashboard shows balance and a call button for each installment",
  dues.length > 0 && dues.every((d) => d.bal && d.call !== false) && dues.some((d) => d.call === true), JSON.stringify(dues));

// Phone list: the ⋮ menu stays on the title line, also beside the wide "Not Received" badge.
await dao.createTyreBill(CLIENT, { billDate: new Date().toISOString().slice(0, 10), vehicleNumber: "TN21AB1011", mechanicName: "Ramesh", paymentType: "full",
  items: [{ brandRef: "apollo", modelRef: "9-00-20-xt-7", qty: 4, rate: 19000 }] });
await page.goto(BASE + "/tyre/billing");
await page.locator(".m-card").first().waitFor({ timeout: 10000 });
const cards = await page.locator(".m-card").evaluateAll((cs) => cs.map((c) => {
  const key = c.querySelector(".m-card-key").getBoundingClientRect();
  const menu = c.querySelector(".m-card-top > :last-child").getBoundingClientRect();
  return { badge: c.querySelector(".badge")?.textContent, wrapped: menu.top >= key.bottom - 2 };
}));
ok("tyre: phone challan cards keep the menu on the title line", cards.some((c) => /Not Received/.test(c.badge || "")) && cards.every((c) => !c.wrapped), JSON.stringify(cards));

ok("tyre: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
