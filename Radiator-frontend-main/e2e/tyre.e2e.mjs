// Tyre browser checks: real app on the Vite dev server, API intercepted with page.route. Unlike the other suites, the
// challan endpoints are answered by the REAL backend code (dao/tyrebill.dao.js on the in-memory fake Mongo from the
// backend tests), so creating, editing and paying a challan goes through the actual validation and money rules.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then
//      `node --experimental-test-module-mocks e2e/tyre.e2e.mjs`
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
const inventory = await import(backend("src/dao/inventory.dao.js"));
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
  // The real summary: every catalog tyre, with what the challans so far have sold.
  if (p === "/inventory/summary") return json({ success: true, ...(await inventory.getInventorySummary(CLIENT)) });
  if (p === "/inventory/entries") return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 0, entries: [] });
  if (p === "/tyrebills/analytics") {
    // The real aggregation on the fake DB, with the filters mapped as routes/tyrebill.routes.js does.
    return run(async () => ({
      success: true,
      ...(await dao.getTyreAnalytics(CLIENT, { fromDate: q.fromDate || "", toDate: q.toDate || "", mechName: q.mechanicName || "", status: q.status || "" })),
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
// A tyre shop has challans, inventory and settings only: no Expenses, Bonus or Salary (asked by the user), and those
// pages, opened by address, send a tyre tenant to its dashboard.
ok("tyre: sidebar has Challans and Inventory, and no Expenses, Bonus or Salary", ["Challans", "Inventory"].every((w) => nav.includes(w)) && !/Expenses|Bonus|Salary/.test(nav), nav);
const strayPages = [];
for (const path of ["/issueCounter/expenses", "/bonus/mechanics", "/bonus/labour", "/salary/employees", "/salary/settle"]) {
  await page.goto(BASE + path);
  await page.waitForURL(/\/tyre\/dashboard/, { timeout: 5000 }).catch(() => {});
  if (!page.url().includes("/tyre/dashboard")) strayPages.push(path);
}
ok("tyre: expenses, bonus and salary pages send a tyre tenant to its dashboard", strayPages.length === 0, strayPages.join(", "));
const formFields = async () => page.evaluate(() => ["ty-address", "ty-mechanic", "ty-labour", "ty-notes"].filter((id) => document.getElementById(id)));
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
ok("tyre: the challan form has no address, mechanic, labour or notes", (await formFields()).length === 0, (await formFields()).join(","));
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
// The "Amount to collect" label sits on a tinted box: it must stay readable (WCAG AA, 4.5:1).
const totalContrast = await page.locator(".tyre-sum .is-total dt").evaluate((dt) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const fg = lum(rgb(getComputedStyle(dt).color)), bg = lum(rgb(getComputedStyle(dt.parentElement).backgroundColor));
  return Math.round(((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)) * 100) / 100;
});
ok("tyre: the Amount to collect label is readable on its tinted box (≥ 4.5:1)", totalContrast >= 4.5, `${totalContrast}:1`);
ok("tyre: footer shows tyres + interest", /₹49,300\.00/.test(await page.locator(".form-footer").innerText()));
// A rate typed with 3 decimals counts to the paisa, as the server stores it: 3 × ₹24,250.56 = ₹72,751.68 (the
// unrounded 72,751.665 showed ₹72,751.66, so a plan could never match what the server would save).
await page.locator("[id^=ty-qty-]").first().fill("3");
await page.locator("[id^=ty-rate-]").first().fill("24250.555");
const paiseCheck = await page.locator(".tyre-check").innerText();
ok("tyre: a 3-decimal rate totals to the paisa the server saves", /72,751\.68/.test(paiseCheck), paiseCheck.replace(/\s+/g, " "));
await page.locator("[id^=ty-qty-]").first().fill("2");
await page.locator("[id^=ty-rate-]").first().fill("24250");
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

// ---- Edit: removing an unpaid row before a paid one must not give two rows the paid row's name and due date ----
const outOfOrder = await dao.createTyreBill(CLIENT, {
  billDate: "2026-10-01", vehicleNumber: "TN01OO0001", mechanicName: "Ramesh",
  items: [{ brandRef: "mrf", modelRef: "10-00-20-steel-muscle", qty: 2, rate: 24250 }], paymentType: "installment",
  installments: [
    { label: "Initial amount", dueDate: "2026-10-01", principal: 28500, interest: 0 },
    { label: "1st month", dueDate: "2026-11-01", principal: 10000, interest: 400 },
    { label: "2nd month", dueDate: "2026-12-01", principal: 10000, interest: 400 },
  ],
});
await dao.recordTyrePayment(CLIENT, outOfOrder._id, { amount: 10400, installmentId: outOfOrder.installments[1].id });
await page.goto(BASE + `/tyre/dashboard/edit/${outOfOrder._id}`);
await page.getByRole("button", { name: "Remove Initial amount" }).waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Remove Initial amount" }).click();
await page.waitForTimeout(300);
const planAfter = await page.locator(".tyre-plan-row").evaluateAll((rows) => rows.map((r) => [r.querySelector(".tyre-plan-label input")?.value, r.querySelector("input[type=date]")?.value]));
ok("tyre: removing a row before a paid one keeps names and due dates distinct",
  JSON.stringify(planAfter) === JSON.stringify([["1st month", "2026-11-01"], ["2nd month", "2026-12-01"]]), JSON.stringify(planAfter));

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

// ---- Printed challan layout (needs poppler's pdftotext / pdfinfo; reported as SKIP without them) ----
const hasPoppler = (() => { try { execSync("pdftotext -v", { stdio: "ignore" }); return true; } catch { return false; } })();
const skip = (name) => results.push(`SKIP  ${name}  — pdftotext not installed`);
// Words on each page with their boxes, from `pdftotext -bbox`.
const pdfWords = (file) => {
  const html = execSync(`pdftotext -bbox "${file}" -`).toString();
  return html.split("<page").slice(1).map((pg) => [...pg.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] })));
};
// Two words overprint when their boxes overlap by more than a sliver.
const overprints = (pages) => pages.flatMap((ws, p) => {
  const hits = [];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const a = ws[i], b = ws[j];
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (w > 0.8 && h > 1.5) hits.push(`p${p + 1}: "${a.t}" × "${b.t}"`);
  }
  return hits;
});
const printPdf = async (id, file) => {
  await page.goto(BASE + `/tyre/dashboard/view/${id}`);
  await page.getByRole("button", { name: "Print" }).waitFor({ timeout: 10000 });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: "Print" }).click()]);
  const out = join(OUT, file);
  await dl.saveAs(out);
  return out;
};
if (!hasPoppler) {
  ["no words overprint", "a short challan with a long company name is one page", "every page of a long challan is numbered", "paise print as .50", "each tyre number prints whole", "a long title does not print over the company name", "a long subtitle and receiver's note wrap without printing over anything", "the challan prints no address or mechanic", "a long vehicle label wraps and the plate prints whole", "a seven-digit amount to collect does not run into its label", "5 tyres and a 3-row plan fit one page without a signature image"].forEach((n) => skip(`tyre pdf: ${n}`));
} else {
  // 14 tyres (long names, a ₹32,750.50 rate) and 12 installments: runs over pages. A long customer name and address.
  const lines = Array.from({ length: 14 }, (_, i) => ({
    brandRef: i % 2 ? "apollo" : "mrf", modelRef: i % 2 ? "9-00-20-xt-7" : "10-00-20-steel-muscle",
    // The first line carries ten 15-character serials (a whole-fleet line), the case that broke serials mid-way.
    tyreNumber: i === 0 ? Array.from({ length: 10 }, (_, k) => `MRF-2026-7788${10 + k}`).join(", ") : `SN-2026-${100000 + i}, SN-2026-${200000 + i}`, tubeType: i % 2 ? "tubeless" : "tube", flap: i % 2 === 0, qty: 1, rate: i % 2 ? 19000 : 32750.5,
  }));
  const amount = Math.round(lines.reduce((t, l) => t + l.rate, 0) * 100) / 100;
  const per = Math.floor(amount / 12);
  const big = await dao.createTyreBill(CLIENT, {
    billDate: "2026-10-05", vehicleNumber: "KA01MX4521", mechanicName: "Ramesh", phoneNumber: "9843012345",
    customerName: "Sri Murugan Roadways & Logistics Private Limited, Salem Branch Office",
    address: "Door No. 221/4, Omalur Main Road, Near New Bus Stand, Opposite Indian Oil Petrol Bunk, Salem, Tamil Nadu 636004",
    items: lines, paymentType: "installment",
    installments: Array.from({ length: 12 }, (_, i) => ({ dueDate: `2027-${String(i + 1).padStart(2, "0")}-05`, principal: i === 11 ? Math.round((amount - per * 11) * 100) / 100 : per, interest: i ? 750 : 0 })),
  });
  const bigPdf = await printPdf(big._id, "tyre-challan-long.pdf");
  const bigPages = pdfWords(bigPdf);
  const bigText = bigPages.map((ws) => ws.map((w) => w.t).join(" "));
  ok("tyre pdf: every page of a long challan is numbered", bigPages.length > 1 && bigText.every((t, i) => t.includes(`Page ${i + 1} of ${bigPages.length}`) && t.includes(`No ${big.billNo}`)),
    `${bigPages.length} pages`);
  // Every serial prints whole (one per line), never broken in the middle across lines.
  const words = new Set(bigPages.flat().map((w) => w.t.replace(/,$/, "")));
  const serialsWhole = lines.flatMap((l) => l.tyreNumber.split(", ")).filter((sn) => !words.has(sn));
  ok("tyre pdf: each tyre number prints whole", serialsWhole.length === 0, serialsWhole.slice(0, 4).join(" | "));
  ok("tyre pdf: paise print as .50", bigText.join(" ").includes("32,750.50") && !/32,750\.5(?!0)/.test(bigText.join(" ")));

  // 5 tyres and a 3-row plan fit one page when no signature image is printed: the image's space was reserved anyway
  // and pushed the challan onto a second page holding only the signature lines.
  const fits = await dao.createTyreBill(CLIENT, {
    billDate: "2026-10-05", vehicleNumber: "KA01FT0005", customerName: "Ravi", paymentType: "installment",
    items: Array.from({ length: 5 }, (_, k) => ({ brandRef: "mrf", modelRef: "10-00-20-steel-muscle", qty: 1, rate: 1000, tyreNumber: `SN${k}` })),
    installments: [{ dueDate: "2026-10-05", principal: 4400, interest: 0 }, { dueDate: "2026-11-05", principal: 300, interest: 50 }, { dueDate: "2026-12-05", principal: 300, interest: 50 }],
  });
  const fitsPages = pdfWords(await printPdf(fits._id, "tyre-challan-fits.pdf"));
  ok("tyre pdf: 5 tyres and a 3-row plan fit one page without a signature image", fitsPages.length === 1, `${fitsPages.length} pages; settings signature ${settings.company.signatureUrl ? "set" : "none"}`);

  // A seven-digit amount to collect: the bold "Amount to collect" ran into it ("Amount to collecRs 7,56,088.50").
  const fleet = await dao.createTyreBill(CLIENT, {
    billDate: "2026-10-05", vehicleNumber: "KA01FL0040", items: [{ brandRef: "mrf", modelRef: "10-00-20-steel-muscle", qty: 40, rate: 24999.5 }], paymentType: "installment",
    installments: [{ dueDate: "2026-10-05", principal: 499990, interest: 0 }, { dueDate: "2026-11-05", principal: 499990, interest: 12345.5 }],
  });
  const fleetWords = pdfWords(await printPdf(fleet._id, "tyre-challan-fleet.pdf")).flat();
  const collect = fleetWords.find((w) => w.t === "collect");
  const amountWord = collect && fleetWords.filter((w) => w !== collect && Math.abs(w.y0 - collect.y0) < 2 && w.x0 > collect.x0).sort((a, b) => a.x0 - b.x0)[0];
  ok("tyre pdf: a seven-digit amount to collect does not run into its label", !!amountWord && amountWord.x0 - collect.x1 >= 1,
    collect && amountWord ? `gap ${(amountWord.x0 - collect.x1).toFixed(1)}pt before "${amountWord.t}"` : "label or amount not found");

  // A long company name on an ordinary 3-installment challan must still fit one page.
  const saved = { ...settings.company };
  settings.company.name = "Sri Murugan Tyres & Wheel Alignment Centre (A Unit of Murugan Group)";
  settings.company.address = "Plot 14-B, SIDCO Industrial Estate, Kappalur, Thirumangalam Taluk, Madurai District, Tamil Nadu 625008";
  await page.goto(BASE + "/tyre/billing"); await page.reload();
  // The first challan of this run: 4 installments, one tyre line.
const shortPdf = await printPdf(fakeDb.collection("tyrebills").docs[0]._id, "tyre-challan-longco.pdf");
  const shortPages = pdfWords(shortPdf);
  ok("tyre pdf: a short challan with a long company name is one page", shortPages.length === 1, `${shortPages.length} pages`);
  const hits = [...overprints(bigPages), ...overprints(shortPages)];
  ok("tyre pdf: no words overprint", hits.length === 0, hits.slice(0, 6).join(" | "));
  // A long title from Settings (with the long company name still set) must wrap beside the name, not print over it.
  const savedTitle = settings.tyre.invoice.billTitle;
  settings.tyre.invoice.billTitle = "Delivery Challan cum Installment Agreement";
  await page.reload();
  const titlePdf = await printPdf(fakeDb.collection("tyrebills").docs[0]._id, "tyre-challan-longtitle.pdf");
  const titleHits = overprints(pdfWords(titlePdf));
  ok("tyre pdf: a long title does not print over the company name", titleHits.length === 0, titleHits.slice(0, 6).join(" | "));
  settings.tyre.invoice.billTitle = savedTitle;
  Object.assign(settings.company, saved);
  await page.reload();
  // A long line under the company and a long receiver's note from Settings wrap; neither prints over anything.
  // (A short company name with no address puts the line beside the date / D.C. No, the tightest case.)
  settings.company.address = ""; settings.company.phone1 = ""; settings.company.phone2 = "";
  const savedInv = { ...settings.tyre.invoice };
  settings.tyre.invoice.subtitle = "Goods delivered on approval basis only. Not a tax invoice. Subject to Madurai jurisdiction. E. & O.E. Goods once sold will not be taken back.";
  settings.tyre.invoice.footerNote = "Received the above tyres in good condition and agree to pay the installments on the due dates shown above without fail";
  await page.reload();
  const notesHits = overprints(pdfWords(await printPdf(fakeDb.collection("tyrebills").docs[0]._id, "tyre-challan-longnotes.pdf")));
  ok("tyre pdf: a long subtitle and receiver's note wrap without printing over anything", notesHits.length === 0, notesHits.slice(0, 6).join(" | "));
  Object.assign(settings.tyre.invoice, savedInv);
  Object.assign(settings.company, saved);
  await page.reload();
  // The challan prints no delivery address and no mechanic, even for an older challan that stored them.
  const longMech = await dao.createTyreBill(CLIENT, { billDate: "2026-10-05", vehicleNumber: "TN04LONG", customerName: "Kumar", mechanicName: "Thirunavukkarasu Subramaniam Pillai", address: "12, Anna Nagar, Madurai",
    items: [{ brandRef: "mrf", modelRef: "10-00-20-steel-muscle", qty: 1, rate: 24250 }], paymentType: "full" });
  const plainText = pdfWords(await printPdf(longMech._id, "tyre-challan-noaddr.pdf")).flat().map((w) => w.t).join(" ");
  ok("tyre pdf: the challan prints no address or mechanic", !/Anna|Nagar|Thirunavukkarasu|Mechanic/.test(plainText), plainText.slice(0, 160));
  // A very long vehicle label from Settings wraps beside the plate; the plate prints whole (it was squeezed to one
  // character per line once the value got only the room the label left).
  const savedLabel = settings.tyre.labels.vehicleNo;
  settings.tyre.labels.vehicleNo = "Lorry / Trailer / Tanker Vehicle Registration Number (RC)";
  await page.reload();
  const plateWords = pdfWords(await printPdf(longMech._id, "tyre-challan-longlabel.pdf"));
  ok("tyre pdf: a long vehicle label wraps and the plate prints whole", plateWords.flat().some((w) => w.t === "TN04LONG") && overprints(plateWords).length === 0,
    plateWords.flat().filter((w) => w.y0 < 120 && w.x0 > 280).map((w) => w.t).join(" ").slice(0, 160));
  settings.tyre.labels.vehicleNo = savedLabel;
  await page.reload();
}

// ---- Shared bill prints (radiator / automobile / engineering): a long name or detail wraps without printing over anything ----
// (Found while reviewing the tyre challan, whose Details block had the same fixed row step.)
if (!hasPoppler) ["long names and details wrap without printing over anything", "a long vehicle label wraps and the truck number prints whole"].forEach((n) => skip(`shared pdf: ${n}`));
else {
  const printWith = async (file, fn) => {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }),
      page.evaluate(fn, { s: structuredClone(settings), name: "Sri Murugan Roadways & Logistics Private Limited", mech: "Thirunavukkarasu Subramaniam Pillai Junior" })]);
    const out = join(OUT, file); await dl.saveAs(out); return out;
  };
  const files = [
    await printWith("shared-radiator-long.pdf", async ({ s, name, mech }) => (await import("/src/Components/PrintInvoice.ts")).printInvoice({ billNo: 7, billDate: "2026-10-05", transportName: name, phoneNumber: "9843012345", truckNumber: "TN01AB1234", mechanicName: mech, radiatorType: "Tata 1613 Copper 4-row heavy duty radiator core", particulars: [{ particulars: "Core", qty: 1, rate: 1000, amount: 1000 }], totalAmount: 1000, receivedAmount: 0 }, s)),
    await printWith("shared-auto-long.pdf", async ({ s, name, mech }) => (await import("/src/Components/PrintInvoice.ts")).printAutoInvoice({ billNo: 8, billDate: "2026-10-05", customerName: name, phoneNumber: "9843012345", vehicleNumber: "TN01AB1234", mechanicName: mech, items: [{ particulars: "Oil", qty: 1, rate: 500, amount: 500 }], totalAmount: 500, receivedAmount: 0 }, s)),
    await printWith("shared-eng-long.pdf", async ({ s, mech }) => (await import("/src/Components/PrintEngInvoice.ts")).printEngInvoice({ billNo: 9, billDate: "2026-10-05", vehicleNo: "TN01AB1234", mechanic: mech, services: [{ type: "x", typeLabel: "Engine", bsModel: "BS-VI Common Rail", items: [{ particulars: "Rebore", qty: 1, rate: 900, amount: 900 }] }, { type: "y", typeLabel: "Pump", bsModel: "BS-IV Mechanical Pump", items: [{ particulars: "Calibrate", qty: 1, rate: 500, amount: 500 }] }], totalAmount: 1400, receivedAmount: 0 }, s)),
  ];
  // A payslip for an employee with a long name: the name wraps in its column instead of running into "Period".
  files.push(await printWith("shared-payslip-longname.pdf", async ({ s }) => (await import("/src/Components/PrintPayslip.ts")).printPayslip({ employeeName: "Muthukumaraswamy Venkatasubramanian Iyer Rajagopal", periodStart: "2026-10-01", periodEnd: "2026-10-31", periodKey: "2026-10",
    workingDays: 26, presentDaysUsed: 24, presentDaysMode: "attendance", baseSalary: 18000, grossAmount: 16615, advancesDeducted: 0, deductionsTotal: 0, netAmount: 16615, status: "paid" }, s)));
  // The radiator bill with a very long vehicle label: the truck number must print whole.
  files.push(await printWith("shared-radiator-longlabel.pdf", async ({ s }) => (await import("/src/Components/PrintInvoice.ts")).printInvoice({ billNo: 10, billDate: "2026-10-05", transportName: "Kumar", truckNumber: "TN01AB1234", particulars: [{ particulars: "Core", qty: 1, rate: 1000, amount: 1000 }], totalAmount: 1000, receivedAmount: 0 },
    { ...s, labels: { ...s.labels, vehicleNo: "Lorry / Trailer / Tanker Vehicle Registration Number (RC)" } })));
  const plateWhole = pdfWords(files[files.length - 1]).flat().some((w) => w.t === "TN01AB1234");
  const sharedHits = files.flatMap((f) => overprints(pdfWords(f)).map((h) => `${f.split("/").pop()} ${h}`));
  ok("shared pdf: long names and details wrap without printing over anything", sharedHits.length === 0, sharedHits.slice(0, 6).join(" | "));
  ok("shared pdf: a long vehicle label wraps and the truck number prints whole", plateWhole);
}

// ---- PDF title colour: a pale brand colour (gold) must still print a readable title (≥ 4.5:1 on white) ----
{
  const savedBrand = settings.branding.primaryColor;
  settings.branding.primaryColor = "#FFD700";
  await page.reload();
  const pdfText = readFileSync(await printPdf(fakeDb.collection("tyrebills").docs[0]._id, "tyre-challan-gold.pdf"), "latin1");
  const m = /([\d.]+) ([\d.]+) ([\d.]+) rg\s+[^\n]*Td\s+\(DELIVERY CHALLAN\) Tj/.exec(pdfText);
  const lum = (c) => c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = m ? Math.round((1.05 / (lum([+m[1], +m[2], +m[3]]) + 0.05)) * 100) / 100 : 0;
  ok("tyre pdf: the title stays readable with a pale brand colour (≥ 4.5:1)", ratio >= 4.5, m ? `${m.slice(1).join(" ")} → ${ratio}:1` : "title colour not found");
  settings.branding.primaryColor = savedBrand;
  await page.reload();
}

// ---- Overdue filter and the address bar: Clear filters must not leave ?overdue=1 behind (reload brought it back) ----
await page.goto(BASE + "/tyre/billing?overdue=1");
await page.locator("#f-overdue").waitFor({ timeout: 10000 });
ok("tyre: ?overdue=1 opens the list with Overdue only ticked", await page.locator("#f-overdue").isChecked());
await page.getByRole("button", { name: "Clear filters" }).click();
await page.waitForTimeout(400);
await page.reload();
await page.locator("#f-overdue").waitFor({ timeout: 10000 });
ok("tyre: after Clear filters a reload doesn't bring the overdue filter back", !(await page.locator("#f-overdue").isChecked()) && !page.url().includes("overdue=1"), page.url());
await page.locator("#f-overdue").check();
await page.waitForTimeout(300);
ok("tyre: ticking Overdue only puts it in the address (reload / share keeps it)", page.url().includes("overdue=1"), page.url());

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
// Clearing a number box and typing a new value must give that value: the first D.C. number used to force 1 back into
// an emptied box, so "clear, type 501" saved 1501 (and the counter never comes back down); the rate showed "024250.50".
const startNo = page.locator("#tyre-start-no");
await startNo.click(); await startNo.press("Control+a"); await startNo.press("Backspace");
await page.keyboard.type("501");
const rateBox = page.getByLabel("CEAT 10.00-20 Mile XL rate");
await rateBox.click(); await rateBox.press("Control+a"); await rateBox.press("Backspace");
await page.keyboard.type("21500.50");
const rateShown = await rateBox.inputValue();
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const typedPut = settingsPuts[settingsPuts.length - 1]?.tyre;
const typedRate = typedPut?.brands?.find((b) => b.value === "ceat")?.models?.[0]?.rate;
ok("tyre: settings number boxes take what is typed after clearing (first D.C. no., rate)", typedPut?.billStartNumber === 501 && typedRate === 21500.5 && rateShown === "21500.50",
  `start ${typedPut?.billStartNumber}, rate ${typedRate}, box "${rateShown}"`);
await startNo.click(); await startNo.press("Control+a"); await startNo.press("Backspace");
await page.locator("#new-tyre-brand").click();
ok("tyre: an emptied first D.C. number goes back to 1", (await startNo.inputValue()) === "1", await startNo.inputValue());
// A brand renamed to nothing must not be saved: every new challan picking it was refused with "choose a brand".
const putsBefore = settingsPuts.length;
await page.locator("#tyre-brand-ceat").fill("");
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const blankMsg = (await page.locator("[role=alert]").allTextContents()).join(" ");
ok("tyre: a brand with no name is not saved", settingsPuts.length === putsBefore && /needs a name/.test(blankMsg), `${settingsPuts.length - putsBefore} saves; "${blankMsg.slice(0, 80)}"`);
// Renaming a brand to another brand's name (any case or spacing) must not save two "MRF"s: the challan form would offer
// two identical brands and inventory would list two "MRF …" rows. Adding a duplicate was already refused.
const putsBeforeDup = settingsPuts.length;
await page.locator("#tyre-brand-ceat").fill(" mrf ");
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const dupMsg = (await page.locator("[role=alert]").allTextContents()).join(" ");
ok("tyre: a brand renamed to another brand's name is not saved", settingsPuts.length === putsBeforeDup && /MRF.*(twice|more than once)/i.test(dupMsg), `${settingsPuts.length - putsBeforeDup} saves; "${dupMsg.slice(0, 120)}"`);
await page.locator("#tyre-brand-ceat").fill("CEAT");
// Catalog edits are kept only by Save All Settings. Leaving without saving used to drop them silently ("my catalog
// changes disappear"); now the footer says so and leaving asks first.
const unsavedNote = page.locator(".form-footer [role=status]");
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const cleanAfterSave = (await unsavedNote.count()) === 0;
await page.locator("#new-tyre-brand").fill("Bridgestone");
await page.getByRole("button", { name: "Add brand" }).click();
const noteShown = /Unsaved changes/.test((await unsavedNote.allTextContents()).join(" "));
const leaveDialogs = [];
const onDialog = (d) => { leaveDialogs.push(d.message()); d.dismiss(); };
page.on("dialog", onDialog);
await page.locator("a.sidebar-item").first().click();
await page.waitForTimeout(400);
page.off("dialog", onDialog);
const stayed = new URL(page.url()).pathname === "/settings" && (await page.locator("#tyre-brand-bridgestone").count()) === 1;
ok("tyre: unsaved catalog changes are flagged, and leaving asks first", cleanAfterSave && noteShown && leaveDialogs.length === 1 && stayed,
  `clean after save ${cleanAfterSave}, note ${noteShown}, dialogs ${leaveDialogs.length}, stayed ${stayed}`);
if (stayed) await page.getByRole("button", { name: "Remove Bridgestone and its models" }).click();
else { await page.goto(BASE + "/settings"); await page.getByRole("tab", { name: "Tyre Catalog" }).click(); }
const tabs = await page.locator(".settings-nav").innerText();
ok("tyre: settings tabs are the tyre set", /Tyre Catalog/.test(tabs) && /Labels & Challan/.test(tabs) && !/Parts Catalog|Catalog & Pricing/.test(tabs), tabs.replace(/\s+/g, " "));
// A renamed brand / model keeps its stored value; adding a new one under the old name must work and get its own value.
await page.locator("#tyre-brand-ceat").fill("CEAT (old stock)");
await page.getByLabel("CEAT (old stock) 10.00-20 Mile XL name").fill("Mile XL (old)");
await page.getByLabel("New CEAT (old stock) model / size").fill("10.00-20 Mile XL");
await page.getByRole("button", { name: "Add CEAT (old stock) model" }).click();
await page.locator("#new-tyre-brand").fill("CEAT");
await page.getByRole("button", { name: "Add brand" }).click();
await page.locator(".form-footer").getByRole("button", { name: "Save All Settings" }).click();
await page.waitForTimeout(600);
const renamed = (settingsPuts[settingsPuts.length - 1]?.tyre?.brands || []).filter((b) => /^ceat/.test(b.value)).map((b) => `${b.value}=${b.label}[${b.models.map((m) => `${m.value}=${m.label}`).join(",")}]`).join(" ");
ok("tyre: after renaming CEAT, a new CEAT brand and model can be added beside it", renamed === "ceat=CEAT (old stock)[10-00-20-mile-xl=Mile XL (old),10-00-20-mile-xl-2=10.00-20 Mile XL] ceat-2=CEAT[]", renamed);

// ---- Inventory uses tyre wording ----
await page.goto(BASE + "/tyre/inventory");
await page.getByText("Stock by tyre").first().waitFor({ timeout: 10000 }).catch(() => {});
ok("tyre: inventory page speaks tyres", (await page.getByText("Stock by tyre").count()) > 0);
// The name cell also holds the expand button: a short name like "MRF 10.00-20" broke as "MRF 10.00-" / "20".
await page.locator(".table tbody td.key").first().waitFor({ timeout: 10000 });
const nameLines = await page.locator(".table tbody td.key").evaluateAll((tds) => tds.flatMap((td) => {
  // The name is the first text in the cell outside the expand button.
  const walk = document.createTreeWalker(td, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest("button") ? 1 : 3) });
  const node = walk.nextNode();
  if (!node || node.textContent.trim().length >= 24) return [];
  const r = document.createRange(); r.selectNodeContents(node);
  return [{ name: node.textContent.trim(), lines: new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size }];
}));
const brokenNames = nameLines.filter((n) => n.lines > 1).map((n) => `${n.name} (${n.lines} lines)`);
ok("tyre: inventory keeps a short tyre name on one line", nameLines.length > 0 && brokenNames.length === 0, brokenNames.join(" | ") || `${nameLines.length} names checked`);

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

// Phone: a failed Save brings the first error into view (the form is several screens long).
const firstErrorInView = () => page.evaluate(() => {
  const e = document.querySelector(".field-error");
  if (!e) return { error: "none" };
  const r = e.getBoundingClientRect();
  return { text: e.textContent.slice(0, 40), inView: r.top >= 0 && r.bottom <= window.innerHeight, focus: document.activeElement?.id || "" };
});
await pick("[id^=ty-brand-]", "MRF");
await pick("[id^=ty-model-]", "10.00-20");
await page.getByLabel("Principal for Initial amount").fill("1000");
await page.locator("#ty-vehicle").fill("TN01AB0001");
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator(".form-footer").getByRole("button", { name: "Save challan" }).click();
await page.waitForTimeout(900);
const below = await firstErrorInView();
ok("tyre: phone Save scrolls down to an installment error", below.inView === true, JSON.stringify(below));
await page.getByLabel("Principal for Initial amount").fill("24250");
await page.locator("#ty-vehicle").fill("");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.locator(".form-footer").getByRole("button", { name: "Save challan" }).click();
await page.waitForTimeout(900);
const above = await firstErrorInView();
ok("tyre: phone Save scrolls up to a missing vehicle number and puts the cursor there", above.inView === true && above.focus === "ty-vehicle", JSON.stringify(above));
await page.screenshot({ path: join(OUT, "tyre-create-390.png"), fullPage: true });

// Phone settings: the tyre catalog (brand cards with their model tables) stays inside the screen.
await page.goto(BASE + "/settings");
await page.locator("#settings-section").selectOption({ label: "Tyre Catalog" });
await page.locator(".tyre-brand-card, .nested-card").first().waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
const catOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok("tyre: settings tyre catalog fits a 390px phone", catOverflow <= 0, `overflow ${catOverflow}px`);
// Each model's rate is on screen and readable, not cut off at the card edge (the table used to need a sideways scroll).
const rates = await page.locator(".tyre-brand-card").evaluateAll((cards) => cards.map((c) => {
  const wrap = c.querySelector(".matrix-wrap").getBoundingClientRect();
  const input = c.querySelector("tbody tr:first-child td input");
  const r = input.getBoundingClientRect();
  return { value: input.value, inside: r.left >= wrap.left && r.right <= wrap.right + 0.5, fits: input.scrollWidth <= input.clientWidth, width: Math.round(r.width) };
}));
ok("tyre: phone catalog shows each model's rate inside its card", rates.length === 2 && rates.every((r) => r.inside && r.fits && r.width >= 56), JSON.stringify(rates));
// A duplicate model on the last brand: its error shows next to that brand, not at the top of the catalog off screen.
const newApollo = page.getByLabel("New Apollo model / size");
await newApollo.scrollIntoViewIfNeeded();
await newApollo.fill("9.00-20 XT-7");
await page.getByRole("button", { name: "Add Apollo model" }).click();
await page.waitForTimeout(300);
const dupErr = await page.locator(".field-error[role=alert]").first().evaluate((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent, card: el.closest(".tyre-brand-card")?.getAttribute("aria-label") || null, inView: r.top >= 0 && r.bottom <= innerHeight } }).catch(() => null);
ok("tyre: a duplicate model's error shows beside its brand, on screen", dupErr?.inView === true && dupErr.card === "Apollo models", JSON.stringify(dupErr));

// Phone dashboard: each installment to chase shows its balance and a call button inside the screen (no hidden columns).
await page.goto(BASE + "/tyre/dashboard");
await page.locator(".tyre-due").first().waitFor({ timeout: 10000 }).catch(() => {});
// Its D.C. link sits in grey text of about the same lightness: it must be underlined to read as a link.
const dueLink = await page.locator(".tyre-due-meta a").first().evaluate((a) => getComputedStyle(a).textDecorationLine).catch(() => "none");
ok("tyre: the phone follow-up's D.C. link is underlined", /underline/.test(dueLink), dueLink);
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
// Badges and the ⋮ menu wrap as one group: the menu is never left alone on a line (it was, beside "Not Received").
const cards = await page.locator(".m-card").evaluateAll((cs) => cs.map((c) => {
  const badge = c.querySelector(".m-card-top .badge")?.getBoundingClientRect();
  const menu = c.querySelector(".m-card-top button[aria-label^='Actions']")?.getBoundingClientRect();
  // A short title (a vehicle number) keeps its badge on the same line; it used to drop below it next to "Not Received".
  const key = c.querySelector(".m-card-key a")?.getBoundingClientRect();
  const short = !!key && key.width < c.getBoundingClientRect().width / 2;
  return { badge: c.querySelector(".m-card-top .badge")?.textContent, apart: !badge || !menu || Math.abs((badge.top + badge.bottom) / 2 - (menu.top + menu.bottom) / 2) > 6,
    dropped: short && !!badge && Math.abs((badge.top + badge.bottom) / 2 - (key.top + key.bottom) / 2) > 6 };
}));
ok("tyre: phone challan cards keep the menu beside its badge", cards.some((c) => /Not Received/.test(c.badge || "")) && cards.every((c) => !c.apart), JSON.stringify(cards));
ok("tyre: a short vehicle number keeps its badge on the same line", cards.every((c) => !c.dropped), JSON.stringify(cards.filter((c) => c.dropped)));

// ---- Dashboard: the "To collect" breakdown adds up to its figure when a challan has a discount ----
const disc = await dao.createTyreBill(CLIENT, { billDate: new Date().toISOString().slice(0, 10), vehicleNumber: "TN01DS0001", mechanicName: "Ramesh",
  items: [{ brandRef: "apollo", modelRef: "9-00-20-xt-7", qty: 1, rate: 19000 }], paymentType: "full" });
await dao.recordTyrePayment(CLIENT, disc._id, { amount: 0, discount: 500 });
await page.goto(BASE + "/tyre/dashboard");
const collectCard = page.locator(".kpi").filter({ has: page.locator(".kpi-label", { hasText: /^To collect$/ }) });
await collectCard.locator(".kpi-caption").waitFor({ timeout: 10000 });
const rupees = (t) => (t.match(/₹[\d,]+(\.\d+)?/g) || []).map((x) => Number(x.replace(/[₹,]/g, "")));
const [shown] = rupees(await collectCard.locator(".kpi-value").innerText());
const capText = await collectCard.locator(".kpi-caption").innerText();
const parts = rupees(capText);
const sum = /discount/i.test(capText) ? parts[0] + parts[1] - parts[2] : parts[0] + parts[1];
ok("tyre: dashboard 'To collect' breakdown adds up when a challan has a discount", Math.abs(sum - shown) < 0.01, `${shown} vs "${capText}"`);

ok("tyre: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
