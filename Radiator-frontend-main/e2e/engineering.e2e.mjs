// Engineering Works browser checks: real app on the Vite dev server, API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then
//   node e2e/engineering.e2e.mjs
// Playwright is resolved from the global install (PLAYWRIGHT_MODULE overrides); no live backend/DB needed.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { defaultSettings } = await import(pathToFileURL(join(here, "../../Radiator-backend-main/src/config/defaultSettings.js")).href);
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";
const S = process.env.E2E_OUT || join(here, ".out");
mkdirSync(S, { recursive: true });
const results = [];
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function settingsFor(type) {
  const s = structuredClone(defaultSettings);
  s.businessType = type;
  s.company.name = "Test Works";
  s.mechanics = ["Ramesh", "Suresh"];
  // BS-3 Turbo prices for math check
  const turbo = s.engineering.serviceTypes.find((t) => t.value === "turbo");
  turbo.items.find((i) => i.value === "hold-set").prices.bs3 = 500;
  turbo.items.find((i) => i.value === "o-ring-kit-change").prices.bs3 = 2000;
  s.engineering.quickAdd = [{ type: "compressor", item: "piston" }];
  return s;
}

async function run(type) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let posted = null;
  let paid = null;
  let putBody = null;
  let fyMonth = null; // test hook: override settings.engineering.fyStartMonth
  const bill = {
    _id: "b1", billNo: 802, billDate: "2026-09-16T00:00:00.000Z", vehicleNo: "TN52J2622", lorryAddress: "Sankari",
    mechanic: "Ramesh", phone: "", services: [{ type: "turbo", typeLabel: "Turbo", bsModel: "bs3",
      items: [{ item: "hold-set", label: "Hold set", qty: 1, rate: 4850, amount: 4850 }], subtotal: 4850 }],
    typeTotals: { turbo: 4850 }, total: 4850, discount: 50, netTotal: 4800, amountReceived: 0, balance: 4800, paymentStatus: "Not Received",
  };
  await page.route("http://localhost:5000/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/settings") { const st = settingsFor(type); if (fyMonth) st.engineering.fyStartMonth = fyMonth; return json({ settings: st }); }
    if (p === "/bonus/pending") return json({ success: true, rows: [{ beneficiary: "Ramesh", operations: 3, totalBusiness: 10000, totalCollected: 6000, accruedBonus: 1000, payableBonus: 600, paidBonus: 0, status: "pending" }] });
    if (p === "/mechanic") return json({ success: true, mechdata: ["Ramesh", "Suresh"] });
    if (p === "/engbills/mechanics") return json({ success: true, mechanics: ["Ramesh", "Suresh"] });
    if (p === "/engbills/lookup-vehicle") return json({ success: true, match: { lorryAddress: "Sri Velavan Radiators", phone: "8870713151" } });
    if (p === "/engbills/analytics") return json({ kpis: { totalBills: 1, totalBilled: 4850, totalReceived: 0, totalOutstanding: 4850 },
      byMonth: [{ month: "2026-09", billed: 4850, received: 0, count: 1 }], byServiceType: [{ type: "turbo", label: "Turbo", amount: 4850, count: 1 }], byMechanic: [{ mechanic: "Ramesh", billed: 4850, count: 1 }] });
    if (p === "/engbills/b1" && req.method() === "GET") return json({ success: true, bill });
    if (p === "/engbills/b1" && req.method() === "PUT") { putBody = req.postDataJSON(); return json({ success: true, message: "Service updated ✅", bill }); }
    if (p === "/engbills/b1/payment" && req.method() === "POST") { paid = req.postDataJSON(); return json({ success: true, message: "Payment recorded ✅", bill }); }
    if (p === "/engbills" && req.method() === "POST") { posted = req.postDataJSON(); return json({ success: true, message: "Service saved ✅", bill }); }
    if (p === "/engbills") return json({ success: true, currentPage: 1, totalPages: 1, totalRecords: 1, bills: [bill] });
    return json({ success: true, data: [], mechdata: [], autoBillData: [], radiatorData: [], records: [] });
  });
  await page.goto(BASE + "/issueCounter/login");
  await page.evaluate((t) => {
    localStorage.setItem("svr_token", "x");
    localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
  }, type);

  if (type === "radiator") {
    await page.goto(BASE + "/issueCounter/dashboard");
    await page.waitForTimeout(2500);
    const nav = await page.locator('aside[aria-label="Main navigation"]').innerText();
    ok("radiator: header still has Expenses/Bonus/Salary", /Expenses/.test(nav) && /Bonus/.test(nav) && /Salary/.test(nav), nav.replace(/\s+/g, " "));
    ok("radiator: stays on radiator dashboard", page.url().endsWith("/issueCounter/dashboard"), page.url());
    await page.goto(BASE + "/engineering/dashboard");
    await page.waitForTimeout(1500);
    ok("radiator: engineering route redirects away", !page.url().includes("/engineering/"), page.url());
    await page.goto(BASE + "/settings");
    await page.waitForTimeout(1500);
    const tabs = await page.getByRole("tablist").innerText();
    ok("radiator: settings tabs unchanged", /Catalog & Pricing/.test(tabs) && /Bonus/.test(tabs) && !/Service Catalog/.test(tabs), tabs.replace(/\s+/g, " "));
    // Logout: every tenant type returns to its company login (/t/<code>/login) when the session carries a business code.
    await page.evaluate(() => localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1", code: "acme" })));
    await page.goto(BASE + "/issueCounter/dashboard");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Logout" }).click();
    await page.waitForTimeout(500);
    ok("radiator: logout goes to the company login URL with the business code", page.url().endsWith("/t/acme/login"), page.url());
    ok("radiator: no page errors", errors.length === 0, errors.join(" | "));
    await browser.close();
    return;
  }

  // Engineering tenant: login lands on radiator dashboard path → redirected
  await page.goto(BASE + "/issueCounter/dashboard");
  await page.waitForTimeout(2500);
  ok("eng: /issueCounter/dashboard redirects to /engineering/dashboard", page.url().endsWith("/engineering/dashboard"), page.url());
  const nav = await page.locator('aside[aria-label="Main navigation"]').innerText();
  ok("eng: header shows Dashboard + Bills + Bonus (no Expenses / Salary)", /Dashboard/.test(nav) && /Bills/.test(nav) && /Bonus/.test(nav) && !/Expenses|Salary/.test(nav), nav.replace(/\s+/g, " "));
  ok("eng: dashboard KPIs render", (await page.getByText("Outstanding").count()) > 0);
  await page.screenshot({ path: `${S}/eng-dashboard.png`, fullPage: true });
  ok("eng: dashboard shows 4 KPI tiles", (await page.locator(".kpi").count()) === 4);
  const SEL = '[role="tab"][aria-selected="true"]';
  ok("eng: 'This FY' is the active range by default", (await page.locator(SEL).innerText()) === "This FY");
  ok("eng: by-service-type legend lists Turbo with 100%", /Turbo/.test(await page.locator(".legend-list").innerText()) && /100%/.test(await page.locator(".legend-list").innerText()));
  await page.getByRole("tab", { name: "Today" }).click();
  await page.waitForTimeout(500);
  ok("eng: choosing 'Today' makes it the active range", (await page.locator(SEL).innerText()) === "Today");
  ok("eng: range control keeps keyboard focus after a click", (await page.evaluate(() => document.activeElement?.textContent)) === "Today");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: dashboard has no horizontal overflow at 390px", dashOverflow <= 0, `overflow=${dashOverflow}`);
  const dateRight = await page.locator(".eng-range-dates input").last().evaluate((el) => el.getBoundingClientRect().right);
  const cardRight = await page.locator(".eng-range").evaluate((el) => el.getBoundingClientRect().right);
  ok("eng: phone date inputs stay inside their card", dateRight <= cardRight, `${dateRight} <= ${cardRight}`);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await page.setViewportSize({ width: 1300, height: 1000 });

  await page.goto(BASE + "/engineering/dashboard/create");
  await page.locator(".form-footer .btn-primary").waitFor({ timeout: 10000 });
  await page.getByPlaceholder("Enter Truck Number").fill("tn52q0127");
  await page.getByPlaceholder("Enter Truck Number").blur();
  await page.waitForTimeout(500);
  ok("eng: truck uppercased", (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN52Q0127");
  ok("eng: autofill lorry address from past bill", (await page.getByPlaceholder("Enter Lorry Address").inputValue()) === "Sri Velavan Radiators");
  ok("eng: autofill shows 'Filled from last bill' helper, then clears it", (await page.getByText("Filled from last bill").count()) === 1);
  await page.waitForTimeout(3300);
  ok("eng: 'Filled from last bill' disappears after ~3s", (await page.getByText("Filled from last bill").count()) === 0);
  ok("eng: service form title and back link", (await page.getByRole("heading", { name: "Turbo & air compressor service" }).count()) === 1 && (await page.getByRole("link", { name: "Bills" }).count()) >= 1);

  // Save with nothing → validation
  await page.getByRole("button", { name: "Create bill" }).click();
  ok("eng: mechanic required error", (await page.getByText("Mechanic is required").count()) > 0);
  ok("eng: service required error", (await page.getByText("Add at least one service with an item").count()) > 0);

  // Mechanic
  await page.getByText("Select Mechanic Name").click({ force: true });
  await page.getByText("Ramesh", { exact: true }).last().click();
  // One BS model for the whole bill (header), then service type Turbo on the card.
  ok("eng: BS model is a bill-level header field (no BS select inside the service card)", (await page.getByText("BS model", { exact: true }).count()) === 1 && (await page.locator(".memo").first().getByText("BS model").count()) === 0);
  await page.getByText("Select BS model").click({ force: true });
  await page.getByText("BS-3", { exact: true }).last().click();
  const card = page.locator(".memo").first();
  await card.getByText("Select service type").first().click({ force: true });
  await page.getByText("Turbo", { exact: true }).last().click();
  for (const it of ["Hold set", "O-ring kit change", "Other"]) {
    await card.getByText("+ Add item").click({ force: true });
    await page.getByText(it, { exact: true }).last().click();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${S}/eng-form-turbo.png`, fullPage: true });
  const rateInputs = card.locator('input[placeholder="Rate"]');
  ok("eng: 3 item rows added", (await rateInputs.count()) === 3, String(await rateInputs.count()));
  ok("eng: Hold set rate auto-filled from BS-3 price (500)", (await rateInputs.nth(0).inputValue()) === "500", await rateInputs.nth(0).inputValue());
  ok("eng: O-ring rate auto-filled (2000)", (await rateInputs.nth(1).inputValue()) === "2000");
  await card.locator('input[placeholder="Qty"]').nth(0).fill("2");
  await rateInputs.nth(2).fill("50");
  // Other without description → error
  await page.getByRole("button", { name: "Create bill" }).click();
  ok("eng: Other requires description", (await page.getByText("Describe the work").count()) > 0);
  await page.waitForTimeout(450); // border-color has a 150ms transition
  const errBorder = await page.locator(".eng-line-comment.has-error .form-control").first().evaluate((el) => getComputedStyle(el).borderTopColor);
  const okBorder = await page.locator("#eng-lorry-address").evaluate((el) => getComputedStyle(el).borderTopColor);
  ok("eng: missing description field is marked with the error colour", errBorder !== okBorder, `${errBorder} vs ${okBorder}`);
  await card.getByPlaceholder("Describe the work").fill("Bearing clean");
  // 2*500 + 2000 + 50 = 3050
  const subtotalText = await card.locator(".eng-subtotal").innerText();
  ok("eng: card subtotal = ₹3,050.00", subtotalText.includes("3,050.00"), subtotalText);
  const heights = await page.evaluate(() => {
    const h = (el) => Math.round(el.getBoundingClientRect().height);
    const inputs = [...document.querySelectorAll(".card-stack input.form-control")].filter((e) => !e.closest(".eng-line")).filter((e) => e.type === "text" || e.type === "date" || e.type === "tel").map(h);
    const selects = [...document.querySelectorAll('.card-stack div[class*="-control"]')].filter((e) => !e.className.includes("form-control") && !e.closest(".eng-line")).map(h);
    return { inputs: [...new Set(inputs)], selects: [...new Set(selects)] };
  });
  ok("eng: dropdowns are the same height as text inputs (no 38px vs 44px mismatch)", heights.inputs.length === 1 && heights.inputs[0] === 44 && heights.selects.length > 0 && heights.selects.every((v) => v >= 44), JSON.stringify(heights));
  const lineShape = await page.evaluate(() => [...document.querySelectorAll(".eng-line")].slice(0, 3).map((l) => ({ bg: getComputedStyle(l).backgroundColor !== "rgba(0, 0, 0, 0)", hasX: !!l.querySelector('[aria-label="Remove item"]'), amt: !!l.querySelector(".eng-line-amt") })));
  ok("eng: item rows are tinted rows with amount and an icon remove button", lineShape.length === 3 && lineShape.every((l) => l.bg && l.hasX && l.amt), JSON.stringify(lineShape));

  // Quick-add chips: "Quick add" label + pill chips with a plus icon.
  const chipStyle = await page.evaluate(() => {
    const chip = document.querySelector(".eng-quick-row .chip-btn");
    if (!chip) return { found: false };
    const cs = getComputedStyle(chip);
    return { found: true, radius: cs.borderTopLeftRadius, icon: !!chip.querySelector("svg"), label: document.querySelector(".eng-quick-row > span")?.textContent };
  });
  ok("eng: quick-add is a 'Quick add' label with pill chips carrying a plus icon", chipStyle.found && chipStyle.icon && chipStyle.label === "Quick add" && parseFloat(chipStyle.radius) >= 12, JSON.stringify(chipStyle));
  // Quick add chip (compressor piston) -> new card
  await page.getByRole("button", { name: "Air Compressor · Piston" }).click();
  await page.waitForTimeout(300);
  ok("eng: quick-add created compressor card with Piston row", (await page.locator(".memo").count()) === 2 && (await page.locator(".memo").nth(1).getByText("Piston", { exact: true }).count()) > 0);

  // BS-6 (bill-level) hides Block bush change for compressor
  const c2 = page.locator(".memo").nth(1);
  await page.locator("#eng-bs").focus(); await page.keyboard.press("ArrowDown");
  await page.getByText("BS-6", { exact: true }).last().click();
  await c2.getByText("+ Add item").click({ force: true });
  await page.waitForTimeout(300);
  const menu = await page.locator("[class*='menu']").last().innerText();
  ok("eng: BS-6 compressor hides 'Block bush change', shows 'Sleeve fixing'", !/Block bush change/.test(menu) && /Sleeve fixing/.test(menu), menu.replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  // Back to BS-3: the change re-applies catalog rates on every card, so retype the manual values afterwards.
  await page.locator("#eng-bs").focus(); await page.keyboard.press("ArrowDown");
  await page.getByText("BS-3", { exact: true }).last().click();
  await card.locator('input[placeholder="Qty"]').nth(0).fill("2");
  await rateInputs.nth(2).fill("50");
  await c2.locator('input[placeholder="Rate"]').fill("1000");


  // Footer shows only the total; discount / received / mode are entered later via Record payment.
  const footer = await page.locator(".form-footer-total strong").innerText();
  ok("eng: footer total ₹4,050.00", footer.includes("4,050.00"), footer);
  const footText = await page.locator(".form-footer").innerText();
  ok("eng: create footer has no discount / per-type totals, form has no payment fields", !/Discount|Amount received|Payment mode|Turbo|Air Compressor/i.test(footText) && (await page.locator("label:has-text('Discount'), label:has-text('Amount received'), label:has-text('Payment mode')").count()) === 0, footText.replace(/\s+/g, " "));
  await page.screenshot({ path: `${S}/eng-form-full.png`, fullPage: true });

  await page.getByRole("button", { name: "Create bill" }).click();
  await page.waitForTimeout(1500);
  ok("eng: POST payload sent", !!posted);
  if (posted) {
    ok("eng: payload truck uppercase", posted.vehicleNo === "TN52Q0127");
    ok("eng: payload 2 services", posted.services.length === 2, JSON.stringify(posted.services.map((s) => [s.type, s.bsModel, s.items.length])));
    ok("eng: payload turbo bsModel bs3, qty 2 on Hold set", posted.services[0].bsModel === "bs3" && posted.services[0].items[0].qty === 2);
    ok("eng: payload Other has comment", posted.services[0].items.some((i) => i.item === "other" && i.comment === "Bearing clean"));
    ok("eng: payload discount 0, received 0 (paid later via Record payment)", posted.discount === 0 && posted.amountReceived === 0);
  }
  ok("eng: navigated to billing after save", page.url().endsWith("/engineering/billing"), page.url());
  await page.waitForTimeout(1000);
  ok("eng: billing list shows bill row", (await page.getByText("TN52J2622").count()) > 0);
  await page.screenshot({ path: `${S}/eng-billing.png`, fullPage: true });
  // Desktop table polish: money columns right-aligned with tabular numerals, row hover, truck number emphasised.
  const tbl = await page.evaluate(() => {
    const th = (t) => [...document.querySelectorAll(".table thead th")].find((e) => e.textContent.trim() === t);
    const row = document.querySelector(".table tbody tr");
    const net = row.querySelector("td.num"), truck = row.querySelector("td.key");
    return { thNet: getComputedStyle(th("Total")).textAlign, thBal: getComputedStyle(th("Balance")).textAlign, tdNet: getComputedStyle(net).textAlign, tabular: getComputedStyle(net).fontVariantNumeric, truckW: getComputedStyle(truck).fontWeight };
  });
  ok("eng: billing money columns are right-aligned (header + cells) with tabular numerals", tbl.thNet === "right" && tbl.thBal === "right" && tbl.tdNet === "right" && /tabular-nums/.test(tbl.tabular), JSON.stringify(tbl));
  ok("eng: billing table column is labelled Total (not Net)", (await page.locator(".table thead th").allTextContents()).some((t) => t.trim() === "Total") && !(await page.locator(".table thead th").allTextContents()).some((t) => t.trim() === "Net"));
  ok("eng: billing truck number is emphasised (semibold)", parseInt(tbl.truckW, 10) >= 500, tbl.truckW);
  const firstTd = page.locator(".table tbody tr").first().locator("td").nth(2);
  const bgBefore = await firstTd.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator(".table tbody tr").first().hover();
  await page.waitForTimeout(350);
  const bgHover = await firstTd.evaluate((el) => getComputedStyle(el).backgroundColor);
  ok("eng: billing rows have a hover state", bgHover !== bgBefore, `${bgBefore} -> ${bgHover}`);
  await page.mouse.move(5, 5);

  // Empty + loading states of the Billing list (API mocked empty, with a delay to observe the skeleton).
  const emptyHandler = async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" || u.pathname !== "/engbills") return route.fallback();
    await new Promise((r) => setTimeout(r, 900));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, currentPage: 1, totalPages: 1, totalRecords: 0, bills: [] }) });
  };
  await page.addInitScript(() => {
    window.__sawEmpty = false;
    new MutationObserver(() => { if (document.querySelector(".empty-state")) window.__sawEmpty = true; }).observe(document, { childList: true, subtree: true });
  });
  await page.route("http://localhost:5000/**", emptyHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.locator(".skel-rows").first().waitFor({ timeout: 3000 }).catch(() => {});
  const sawEmptyEarly = await page.evaluate(() => window.__sawEmpty);
  ok("eng: billing never renders the empty state before the first response (first paint)", sawEmptyEarly === false, `sawEmpty=${sawEmptyEarly}`);
  ok("eng: billing shows a loading skeleton (not 'no bills') while data is on its way", (await page.locator(".skel-rows").count()) > 0 && (await page.locator(".empty-state").count()) === 0, `skel=${await page.locator(".skel-rows").count()} empty=${await page.locator(".empty-state").count()}`);
  await page.waitForTimeout(1500);
  const emptyTxt = await page.locator(".list-body").innerText();
  ok("eng: billing empty state (no filters) says 'No bills yet' and offers New service", /No bills yet/.test(emptyTxt) && /Create your first service bill and it will show up here\./.test(emptyTxt) && (await page.locator(".empty-state").getByRole("button", { name: "New service" }).count()) === 1, emptyTxt.replace(/\s+/g, " "));
  await page.getByPlaceholder(/Search Truck/).fill("ZZZ");
  await page.waitForTimeout(1900);
  const filteredTxt = await page.locator(".list-body").innerText();
  ok("eng: billing empty state with a filter says 'No bills match' and offers Clear filters", /No bills match these filters/.test(filteredTxt) && /Try a different truck number, mechanic or date range\./.test(filteredTxt) && (await page.locator(".empty-state").getByRole("button", { name: "Clear filters" }).count()) === 1, filteredTxt.replace(/\s+/g, " "));
  await page.unroute("http://localhost:5000/**", emptyHandler);
  let failNext = true;
  const failHandler = async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" || u.pathname !== "/engbills" || !failNext) return route.fallback();
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "boom" }) });
  };
  await page.route("http://localhost:5000/**", failHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.locator(".empty-state").waitFor({ timeout: 10000 }).catch(() => {});
  const failTxt = await page.locator(".list-body").innerText();
  ok("eng: billing failed load says 'Couldn't load bills' with Retry (not 'No bills yet')", /Couldn.t load bills/.test(failTxt) && !/No bills yet/.test(failTxt) && (await page.locator(".empty-state").getByRole("button", { name: "Retry" }).count()) === 1, failTxt.replace(/\s+/g, " "));
  failNext = false;
  await page.locator(".empty-state").getByRole("button", { name: "Retry" }).click().catch(() => {});
  await page.waitForTimeout(900);
  ok("eng: Retry reloads the list", (await page.getByText("TN52J2622").count()) > 0);
  await page.unroute("http://localhost:5000/**", failHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });

  // Record Payment: the modal's discount is extra on top of the bill's existing ₹50 discount,
  // and the API expects the bill's total discount → must send 50 + 100 = 150.
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: "Record Payment" }).click();
  await page.locator("#payment-discount").fill("100");
  await page.locator(".ui-modal-foot").getByRole("button", { name: "Record Payment" }).click();
  await page.waitForTimeout(800);
  ok("eng: payment modal sends existing + new discount (150)", paid?.discount === 150, JSON.stringify(paid));

  // Payment modal layout: hint is quiet sentence-case text; nothing overflows the modal at 390px; footer buttons align with the fields.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: "Record Payment" }).click();
  await page.locator("#payment-discount").waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const modalM = await page.evaluate(() => {
    const content = document.querySelector(".ui-modal").getBoundingClientRect();
    const label = document.querySelector('label[for="payment-discount"]');
    const hint = document.querySelector(".ui-modal .field-help");
    const lcs = getComputedStyle(label);
    const hcs = hint ? getComputedStyle(hint) : { textTransform: "missing", fontWeight: "missing" };
    const kids = [...document.querySelectorAll(".ui-modal-body *")].map((e) => e.getBoundingClientRect().right);
    const input = document.querySelector("#payment-amount").closest(".input-group").getBoundingClientRect();
    const btns = [...document.querySelectorAll(".ui-modal-foot .btn")].map((b) => b.getBoundingClientRect());
    return {
      overflowPx: Math.round(Math.max(...kids) - content.right),
      labelTransform: lcs.textTransform, hintTransform: hcs.textTransform, hintWeight: hcs.fontWeight,
      footerLeftVsInput: Math.round(Math.min(...btns.map((b) => b.left)) - input.left),
      footerRightVsInput: Math.round(Math.max(...btns.map((b) => b.right)) - input.right),
    };
  });
  ok("eng: payment modal has no horizontal overflow at 390px", modalM.overflowPx <= 0, JSON.stringify(modalM));
  ok("eng: payment modal hint is quiet sentence-case text (not loud capitals)", modalM.hintTransform === "none" && parseInt(modalM.hintWeight, 10) <= 400, JSON.stringify({ t: modalM.hintTransform, w: modalM.hintWeight }));
  ok("eng: payment modal footer buttons align with the fields (<=2px)", Math.abs(modalM.footerLeftVsInput) <= 2 && Math.abs(modalM.footerRightVsInput) <= 2, JSON.stringify({ l: modalM.footerLeftVsInput, r: modalM.footerRightVsInput }));
  const desc = await page.evaluate(() => {
    const input = document.querySelector("#payment-discount");
    const ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    return { ids, text: ids.map((id) => document.getElementById(id)?.textContent || "").join(" ").trim() };
  });
  const hintOwnText = await page.evaluate(() => (document.querySelector(".ui-modal .field-help")?.textContent || "").trim());
  ok("eng: discount field is described by its hint for screen readers (aria-describedby)", hintOwnText.length > 0 && desc.text === hintOwnText, JSON.stringify({ desc, hintOwnText }));
  await page.locator(".ui-modal-foot").getByRole("button", { name: "Cancel" }).click();
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Settings tabs: segmented tablist on desktop, a "Section" select on phones.
  const openSettingsTab = async (name) => {
    const sel = page.locator("#settings-section");
    if (await sel.isVisible().catch(() => false)) await sel.selectOption({ label: name });
    else await page.getByRole("tab", { name, exact: true }).click();
  };
  await page.goto(BASE + "/settings");
  await page.waitForTimeout(1500);
  const tabs = await page.getByRole("tablist").innerText();
  ok("eng: settings tabs = Company/Service Catalog/Mechanics/Bonus/Invoice", /Service Catalog/.test(tabs) && /Mechanics/.test(tabs) && /Bonus/.test(tabs) && !/Salary|Catalog & Pricing/.test(tabs), tabs.replace(/\s+/g, " "));
  await openSettingsTab("Bonus");
  const pct = page.getByLabel("Mechanic bonus % (of net bill total)");
  ok("eng: Settings Bonus tab has a mechanic bonus % (default 0, no labour %)", (await pct.count()) === 1 && (await pct.inputValue()) === "0" && (await page.getByLabel(/Labour bonus/i).count()) === 0, String(await pct.count() && await pct.inputValue()));
  await pct.fill("7.5");
  ok("eng: bonus % can be changed", (await pct.inputValue()) === "7.5");
  await openSettingsTab("Service Catalog");
  await page.waitForTimeout(500);
  ok("eng: catalog grid shows Turbo items", (await page.locator(".cat-item input[value='Hold set']").count()) > 0);
  // Bill numbering input and Financial year select should look like one control family (44px, 8px, white, same type).
  const numCtl = await page.evaluate(() => [...document.querySelectorAll("#cat-bill-start, #cat-fy-month")].map((e) => { const c = getComputedStyle(e); return { tag: e.tagName, h: Math.round(e.getBoundingClientRect().height), r: c.borderTopLeftRadius, bg: c.backgroundColor, fs: c.fontSize, fw: c.fontWeight }; }));
  ok("eng: bill-numbering input and financial-year select match (44px, 8px, white, same type)", numCtl.length === 2 && numCtl.every((c) => c.h === 44 && c.r === "8px" && c.bg === "rgb(255, 255, 255)") && numCtl[0].fs === numCtl[1].fs && numCtl[0].fw === numCtl[1].fw, JSON.stringify(numCtl));
  const fySel = page.getByLabel("Financial year starts in");
  ok("eng: Settings has a financial-year start month (default April)", (await fySel.count()) === 1 && (await fySel.inputValue()) === "4", String(await fySel.count() && await fySel.inputValue()));
  await fySel.selectOption("10");
  ok("eng: financial-year month can be changed in Settings", (await fySel.inputValue()) === "10");
  await page.locator(".cat-type", { hasText: "Air Compressor" }).click();
  await page.waitForTimeout(300);
  ok("eng: type rail switches to Air Compressor items", (await page.locator(".cat-item input[value='Sleeve fixing']").count()) > 0);
  await page.screenshot({ path: `${S}/eng-settings.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: catalog has no horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}`);
  ok("eng: catalog items render as cards on phone (price labels visible)", await page.locator(".cat-item .cat-price-label").first().isVisible());
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Service Catalog uses the shared kit: card radius 16px, gray-200 border.
  const catCard = await page.evaluate(() => { const c = document.querySelector(".card"); const cs = c && getComputedStyle(c); return cs && { r: cs.borderTopLeftRadius, b: cs.borderTopColor }; });
  ok("eng: settings catalog section card = 16px radius + gray-200 border", !!catCard && catCard.r === "16px" && catCard.b === "rgb(228, 231, 236)", JSON.stringify(catCard));

  // Dashboard metric + chart cards (desktop) and the bills table use the shared kit.
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(BASE + "/engineering/dashboard");
  await page.locator(".kpi").first().waitFor({ timeout: 10000 });
  const kpiM = await page.evaluate(() => ({ n: document.querySelectorAll(".kpi").length, grid: document.querySelector(".kpi-grid").className,
    outstanding: [...document.querySelectorAll(".kpi")].find((k) => /Outstanding/.test(k.textContent))?.querySelector(".kpi-value")?.className,
    titles: [...document.querySelectorAll(".chart-card .card-title")].map((t) => t.textContent) }));
  ok("eng: dashboard has a 4-up KPI grid with Outstanding in the error tone", kpiM.n === 4 && /is-4/.test(kpiM.grid) && /is-error/.test(kpiM.outstanding || ""), JSON.stringify(kpiM));
  ok("eng: dashboard chart cards are Revenue by month / By service type / Revenue by mechanic", ["Revenue by month", "By service type", "Revenue by mechanic"].every((t) => kpiM.titles.includes(t)), JSON.stringify(kpiM.titles));
  await page.setViewportSize({ width: 1300, height: 1000 });

  await page.goto(BASE + "/engineering/billing");
  await page.locator(".table tbody tr td .badge").first().waitFor({ timeout: 10000 });
  const tb = await page.evaluate(() => {
    const row = document.querySelector(".table tbody tr");
    return { badge: row.querySelector("td:nth-last-child(2) .badge").className, types: [...row.querySelectorAll("td .badge-neutral")].map((b) => b.textContent), bal: row.querySelector("td.num:nth-last-child(3) span")?.className || "" };
  });
  ok("eng: status badge is a payment-status badge and service types are neutral badges", /badge-error/.test(tb.badge) && tb.types.includes("Turbo"), JSON.stringify(tb));
  ok("eng: balance is red when > 0", /t-error/.test(tb.bal), tb.bal);

  // Financial-year start comes from Settings: default April; October when configured.
  const fyExpect = (mth) => { const n = new Date(); const y = n.getMonth() + 1 >= mth ? n.getFullYear() : n.getFullYear() - 1; return `${y}-${String(mth).padStart(2, "0")}-01`; };
  await page.goto(BASE + "/engineering/dashboard");
  await page.locator("#eng-from").waitFor({ timeout: 10000 });
  ok("eng: dashboard start date defaults to April 1 of the current financial year", (await page.locator("#eng-from").inputValue()) === fyExpect(4), await page.locator("#eng-from").inputValue());
  fyMonth = new Date().getMonth() + 1 === 10 ? 7 : 10; // any month other than the current one (else FY start == month start and "This month" wins)
  await page.goto(BASE + "/engineering/dashboard");
  await page.locator("#eng-from").waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  ok("eng: dashboard start date follows the Settings financial-year month", (await page.locator("#eng-from").inputValue()) === fyExpect(fyMonth), `${await page.locator("#eng-from").inputValue()} vs ${fyExpect(fyMonth)}`);
  ok("eng: 'This FY' is highlighted for the configured start", (await page.locator('[role="tab"][aria-selected="true"]').innerText()).trim() === "This FY");
  fyMonth = null;

  // Button/input recipe inside the service form: inputs and dropdowns share one 8px radius, footer buttons are r8 and >= 44px.
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.locator(".form-footer .btn-primary").waitFor({ timeout: 10000 });
  const bi = await page.evaluate(() => {
    const g = (el) => { const c = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), r: c.borderTopLeftRadius }; };
    return { input: g(document.querySelector(".card-stack input.form-control")), select: g([...document.querySelectorAll('.card-stack div[class*="-control"]')][0]),
      save: g(document.querySelector(".form-footer .btn-primary")), cancel: g(document.querySelector(".form-footer .btn-secondary")),
      add: g(document.querySelector(".memo-new")), remove: g(document.querySelector(".eng-svc-remove")) };
  });
  ok("eng: form inputs and dropdowns share the 8px radius", bi.input.r === "8px" && bi.select.r === "8px", `input ${bi.input.r} select ${bi.select.r}`);
  ok("eng: footer buttons are 8px radius and at least 44px tall", bi.save.r === "8px" && bi.cancel.r === "8px" && bi.save.h >= 44 && bi.cancel.h >= 44, JSON.stringify({ save: bi.save, cancel: bi.cancel }));
  const ctlRadii = await page.evaluate(() => [...document.querySelectorAll('.card-stack div[class*="-control"]')].filter((e) => !e.className.includes("form-control")).map((e) => getComputedStyle(e).borderTopLeftRadius));
  ok("eng: every dropdown in the form (incl. the service-items picker) is 8px radius", ctlRadii.length >= 3 && ctlRadii.every((r) => r === "8px"), JSON.stringify(ctlRadii));
  ok("eng: small form buttons (Add New Service / Remove service) are 8px radius", bi.add.r === "8px" && bi.remove.r === "8px", `${bi.add.r} ${bi.remove.r}`);

  // Phone: footer actions stay at least 44px tall and inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.locator(".form-footer .btn-primary").waitFor({ timeout: 10000 });
  const pf = await page.evaluate(() => [...document.querySelectorAll(".form-footer .btn")].map((b) => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), right: Math.round(r.right) }; }));
  ok("eng: phone footer buttons are >= 44px tall and inside the viewport", pf.length === 2 && pf.every((b) => b.h >= 44 && b.right <= 390), JSON.stringify(pf));
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Button/input recipe on Billing: the filter row and the payment dialog use one 8px control radius, 44px fields, >=40px buttons.
  await page.goto(BASE + "/engineering/billing");
  await page.locator("#from-date").waitFor({ timeout: 10000 });
  const bf = await page.evaluate(() => {
    const g = (el) => { if (!el) return null; const c = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), r: c.borderTopLeftRadius }; };
    const btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
    return { search: g(document.querySelector(".filter-bar input.form-control")), date: g(document.querySelector("#from-date")),
      selects: [...document.querySelectorAll('.filter-bar div[class*="-control"]')].filter((e) => !e.className.includes("form-control")).map(g),
      add: g(btn(/Add New/)), excel: g(btn(/Excel/)) };
  });
  ok("eng: billing filter inputs and dropdowns share an 8px radius", bf.search.r === "8px" && bf.date.r === "8px" && bf.selects.length >= 3 && bf.selects.every((x) => x.r === "8px"), JSON.stringify({ s: bf.search.r, d: bf.date.r, sel: bf.selects.map((x) => x.r) }));
  ok("eng: billing filter dropdowns are as tall as the inputs (44px)", bf.selects.every((x) => x.h >= 44) && bf.search.h >= 44, JSON.stringify({ search: bf.search.h, sel: bf.selects.map((x) => x.h) }));
  ok("eng: billing buttons (Add New / Excel) are 8px radius and >= 40px", [bf.add, bf.excel].every((x) => x && x.r === "8px" && x.h >= 40), JSON.stringify({ add: bf.add, excel: bf.excel }));
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: /Record Payment/i }).click();
  await page.locator(".ui-modal").first().waitFor({ timeout: 10000 });
  await page.locator(".ui-modal input.form-control").first().waitFor({ timeout: 10000 });
  const dlg = page.getByRole("dialog", { name: /Record Payment/ });
  ok("eng: payment dialog is a named modal dialog (role + aria-modal + accessible name)", (await dlg.count()) === 1 && (await dlg.getAttribute("aria-modal")) === "true", `named dialogs=${await dlg.count()}`);
  ok("eng: payment dialog title carries vehicle and bill no", /TN52J2622 \(Bill 802\)/.test(await dlg.innerText()) && /Net total/.test(await dlg.innerText()));
  ok("eng: payment dialog offers a payment mode choice", (await dlg.getByRole("radio").count()) === 5);
  const pm = await page.evaluate(() => {
    const g = (el) => { const c = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), r: c.borderTopLeftRadius }; };
    return { inputs: [...document.querySelectorAll(".ui-modal .input-group")].map((e) => ({ ...g(e), r: getComputedStyle(e.querySelector(".input-group-text")).borderTopLeftRadius })), btns: [...document.querySelectorAll(".ui-modal-foot .btn")].map(g) };
  });
  ok("eng: payment dialog inputs are 8px radius / 44px and footer buttons 8px / >= 40px", pm.inputs.length === 2 && pm.inputs.every((x) => x.r === "8px" && x.h === 44) && pm.btns.length === 2 && pm.btns.every((x) => x.r === "8px" && x.h >= 40), JSON.stringify(pm));
  // Phone: header buttons and the dialog's footer buttons meet the 44px touch target.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const pt = await page.evaluate(() => [...document.querySelectorAll(".ui-modal-foot .btn")].map((b) => Math.round(b.getBoundingClientRect().height)));
  ok("eng: phone payment dialog footer buttons are >= 44px", pt.length === 2 && pt.every((h) => h >= 44), JSON.stringify(pt));
  await page.locator(".ui-modal-foot").getByRole("button", { name: "Cancel" }).click();
  await page.locator(".ui-modal").first().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  const ph = await page.evaluate(() => [...document.querySelectorAll(".page-actions .btn")].map((b) => Math.round(b.getBoundingClientRect().height)));
  ok("eng: phone header buttons (More / Add New) are >= 44px", ph.length === 2 && ph.every((h) => h >= 44), JSON.stringify(ph));
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Dashboard date inputs follow the control recipe (44px / 8px / brand focus ring) and the arrow sits between them.
  await page.goto(BASE + "/engineering/dashboard");
  await page.locator("#eng-from").waitFor({ timeout: 10000 });
  const dd = await page.evaluate(() => ["#eng-from", "#eng-to"].map((s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return { h: Math.round(e.getBoundingClientRect().height), r: c.borderTopLeftRadius, b: c.borderTopColor }; }));
  ok("eng: dashboard date inputs are 44px tall with an 8px radius", dd.length === 2 && dd.every((d) => d.h === 44 && d.r === "8px"), JSON.stringify(dd));
  await page.locator("#eng-from").focus();
  await page.waitForTimeout(250);
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return { shadow: c.boxShadow, border: c.borderTopColor }; });
  ok("eng: dashboard date input shows a focus ring and highlighted border", ring.shadow !== "none" && ring.border !== dd[0].b, JSON.stringify({ ring, base: dd[0].b }));
  const sepDelta = await page.evaluate(() => { const i = document.querySelector("#eng-from").getBoundingClientRect(); const g = document.querySelector(".eng-range-sep").getBoundingClientRect(); return { dy: Math.round(Math.abs((i.top + i.height / 2) - (g.top + g.height / 2))), between: g.left >= i.right && g.right <= document.querySelector("#eng-to").getBoundingClientRect().left }; });
  ok("eng: the From/To arrow icon sits between and is centred on the date inputs (<= 2px)", sepDelta.dy <= 2 && sepDelta.between, JSON.stringify(sepDelta));
  // Settings numbering/financial-year controls keep 16px on phones (no iOS zoom on focus).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/settings");
  await page.locator("#settings-section").selectOption({ label: "Service Catalog" });
  await page.locator("#cat-bill-start").waitFor({ timeout: 10000 });
  const phoneFs = await page.evaluate(() => [...document.querySelectorAll("#cat-bill-start, #cat-fy-month")].map((e) => getComputedStyle(e).fontSize));
  ok("eng: phone numbering/financial-year controls use 16px text", phoneFs.length === 2 && phoneFs.every((f) => f === "16px"), JSON.stringify(phoneFs));
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Accessibility: the service form's text fields are programmatically labelled (visible label <-> input), not placeholder-only.
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.locator(".form-footer .btn-primary").waitFor({ timeout: 10000 });
  const labelled = {};
  for (const l of ["Bill date", "Truck number", "Lorry address", "Phone number"]) labelled[l] = await page.getByLabel(new RegExp("^" + l)).count();
  ok("eng: service form date/truck/address/phone inputs are labelled for assistive tech", Object.values(labelled).every((n) => n === 1), JSON.stringify(labelled));

  // Reduced motion: no Engineering page runs transitions or animations when the user asks for less motion.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motionOffenders = [];
  for (const [label, url, tab] of [["dashboard", "/engineering/dashboard", null], ["billing", "/engineering/billing", null], ["form", "/engineering/dashboard/create", null], ["catalog", "/settings", "Service Catalog"]]) {
    await page.goto(BASE + url);
    await page.locator(label === "dashboard" ? ".kpi" : label === "billing" ? ".table" : label === "form" ? ".form-footer" : ".form-footer").first().waitFor({ timeout: 10000 });
    if (tab) { await page.getByRole("tab", { name: tab }).click(); await page.locator(".cat-item").first().waitFor({ timeout: 10000 }); }
    await page.waitForTimeout(400);
    const bad = await page.evaluate(() => [...document.querySelectorAll("main *, .page-header *, .form-footer *")].filter((e) => { const c = getComputedStyle(e); const td = c.transitionDuration.split(",").some((d) => parseFloat(d) > 0.001); const an = c.animationName !== "none" && parseFloat(c.animationDuration) > 0.001; return td || an; }).map((e) => (e.tagName + "." + (e.className + "")).replace(/\s+/g, ".")));
    motionOffenders.push(...[...new Set(bad)].slice(0, 8).map((b) => `${label}:${b}`));
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  ok("eng: no Engineering element animates when the user prefers reduced motion", motionOffenders.length === 0, motionOffenders.join(" | "));

  // Long money values must not be clipped by the nowrap/ellipsis KPI value on narrower desktops (1024 / 1100).
  const longKpi = async (route) => {
    if (new URL(route.request().url()).pathname !== "/engbills/analytics") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      kpis: { totalBills: 12, totalBilled: 123456789, totalReceived: 123456789, totalOutstanding: 3345.5 },
      byMonth: [], byServiceType: [], byMechanic: [] }) });
  };
  await page.route("http://localhost:5000/**", longKpi);
  for (const w of [1024, 1100, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + "/engineering/dashboard");
    await page.locator(".kpi-value", { hasText: "12,34,56,789" }).first().waitFor({ timeout: 10000 });
    const clip = await page.evaluate(() => [...document.querySelectorAll(".kpi-value")].filter((e) => e.scrollWidth > e.clientWidth).map((e) => `${e.textContent} ${e.scrollWidth}>${e.clientWidth}`));
    ok(`eng: 9-digit KPI values are not clipped at ${w}px`, clip.length === 0, clip.join(" | "));
  }
  await page.unroute("http://localhost:5000/**", longKpi);
  await page.setViewportSize({ width: 1300, height: 1000 });

  // Edit existing bill: form loads stored values; update sends PUT with them.
  await page.goto(BASE + "/engineering/dashboard/edit/b1");
  await page.getByPlaceholder("Enter Truck Number").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok("eng: edit loads truck number", (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN52J2622");
  ok("eng: edit loads item rate 4850", (await page.locator('input[placeholder="Rate"]').first().inputValue()) === "4850");
  ok("eng: edit shows the net total (4,800) and no discount field", (await page.locator(".form-footer-total strong").innerText()).includes("4,800.00") && (await page.locator("label:has-text('Discount')").count()) === 0);
  await page.locator('input[placeholder="Qty"]').first().fill("2");
  await page.getByRole("button", { name: "Update bill" }).click();
  for (let i = 0; i < 50 && !putBody; i++) await page.waitForTimeout(100);
  ok("eng: edit sends PUT with updated qty and leaves discount to the server", putBody?.services?.[0]?.items?.[0]?.qty === 2 && putBody?.discount === undefined && putBody?.vehicleNo === "TN52J2622", JSON.stringify(putBody && { qty: putBody.services?.[0]?.items?.[0]?.qty, discount: putBody.discount }));

  // Edit keeps the stored payment fields although the form no longer shows them.
  ok("eng: edit PUT omits discount/received/mode so the server keeps stored values", putBody && !("discount" in putBody) && !("amountReceived" in putBody) && !("paymentMode" in putBody), JSON.stringify(putBody && { d: putBody.discount, r: putBody.amountReceived, m: putBody.paymentMode }));
  // Cancel on edit goes straight to the bills list.
  await page.goto(BASE + "/engineering/dashboard/edit/b1");
  await page.getByRole("button", { name: "Cancel" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  ok("eng: Cancel on edit returns to the bills list", page.url().endsWith("/engineering/billing"), page.url());
  // Cancel on an empty new bill leaves immediately; with entries it asks first (ConfirmDialog) and can be declined.
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByRole("button", { name: "Cancel" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  ok("eng: Cancel on an empty new bill leaves without asking", page.url().endsWith("/engineering/billing") && (await page.getByRole("dialog").count()) === 0, page.url());
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByPlaceholder("Enter Truck Number").fill("TN01X1");
  await page.getByRole("button", { name: "Cancel" }).click();
  const discard = page.getByRole("dialog", { name: "Discard this bill?" });
  await discard.waitFor({ timeout: 5000 }).catch(() => {});
  ok("eng: Cancel with entries opens a 'Discard this bill?' dialog (no window.confirm)", (await discard.count()) === 1 && /Anything entered will be lost/.test(await discard.innerText()));
  await discard.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);
  ok("eng: declining the discard dialog keeps the form", page.url().endsWith("/engineering/dashboard/create") && (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN01X1" && (await page.getByRole("dialog").count()) === 0, page.url());
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog", { name: "Discard this bill?" }).getByRole("button", { name: "Discard" }).click();
  await page.waitForTimeout(500);
  ok("eng: accepting the discard dialog returns to the bills list", page.url().endsWith("/engineering/billing"), page.url());
  ok("eng: no Clear form button anymore", (await (async () => { await page.goto(BASE + "/engineering/dashboard/create"); await page.getByRole("button", { name: "Cancel" }).waitFor(); return page.getByRole("button", { name: "Clear form" }).count(); })()) === 0);

  // A legacy bill whose cards had different BS models shows "Mixed" and is not silently rewritten on save.
  const mixedBill = { ...bill, services: [bill.services[0], { ...bill.services[0], type: "compressor", typeLabel: "Air Compressor", bsModel: "bs6", items: [{ item: "kit", label: "Kit", qty: 1, rate: 100, amount: 100 }] }] };
  const mixedHandler = async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/engbills/b1" && route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, bill: mixedBill }) });
    return route.fallback();
  };
  await page.route("http://localhost:5000/**", mixedHandler);
  putBody = null;
  await page.goto(BASE + "/engineering/dashboard/edit/b1");
  await page.getByPlaceholder("Enter Truck Number").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok("eng: legacy mixed-BS bill shows 'Mixed' in the BS field", (await page.getByText("Mixed", { exact: true }).count()) === 1);
  await page.getByRole("button", { name: "Update bill" }).click();
  for (let i = 0; i < 50 && !putBody; i++) await page.waitForTimeout(100);
  ok("eng: saving a mixed-BS bill keeps each card's own BS model", putBody?.services?.[0]?.bsModel === "bs3" && putBody?.services?.[1]?.bsModel === "bs6", JSON.stringify(putBody?.services?.map((x) => x.bsModel)));
  await page.unroute("http://localhost:5000/**", mixedHandler);

  // Bonus: header link opens the existing Mechanic Bonus page, defaulting to the configured financial year.
  await page.goto(BASE + "/engineering/billing");
  await page.locator('aside[aria-label="Main navigation"]').getByText("Bonus", { exact: true }).click();
  await page.getByRole("heading", { name: "Mechanic Bonus" }).waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  ok("eng: header Bonus link opens the Mechanic Bonus page", page.url().endsWith("/bonus/mechanics") && (await page.getByText("Mechanic Bonus").count()) > 0, page.url());
  ok("eng: bonus page lists the mechanic row with payable bonus", (await page.getByText("Ramesh").count()) > 0 && (await page.getByText("600").count()) > 0);
  const bonusFrom = await page.locator('input[type="date"]').first().inputValue();
  ok("eng: bonus page starts from the financial-year start", bonusFrom === fyExpect(4), `${bonusFrom} vs ${fyExpect(4)}`);

  fyMonth = new Date().getMonth() + 1 === 10 ? 7 : 10;
  await page.goto(BASE + "/bonus/mechanics");
  await page.waitForTimeout(1200);
  const bonusFrom2 = await page.locator('input[type="date"]').first().inputValue();
  ok("eng: bonus year start follows the Settings financial-year month", bonusFrom2 === fyExpect(fyMonth), `${bonusFrom2} vs ${fyExpect(fyMonth)}`);
  fyMonth = null;

  // Logout returns to the company login (/t/<code>/login); without a code it falls back to the generic login.
  await page.evaluate(() => localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1", code: "acme" })));
  await page.goto(BASE + "/engineering/billing");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.waitForTimeout(500);
  ok("eng: logout goes to the company login URL with the business code", page.url().endsWith("/t/acme/login"), page.url());
  await page.evaluate(() => { localStorage.setItem("svr_token", "x"); localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" })); });
  await page.goto(BASE + "/engineering/billing");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.waitForTimeout(500);
  ok("eng: logout without a stored code falls back to the generic login", page.url().endsWith("/issueCounter/login"), page.url());
  await page.evaluate(() => { localStorage.setItem("svr_token", "x"); localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" })); });

  // View mode is read-only.
  await page.goto(BASE + "/engineering/dashboard/view/b1");
  await page.getByPlaceholder("Enter Truck Number").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok("eng: view mode disables inputs and hides save", (await page.getByPlaceholder("Enter Truck Number").isDisabled()) && (await page.getByRole("button", { name: /Create bill|Update bill/ }).count()) === 0);
  ok("eng: view mode has no remove-item / remove-service buttons", (await page.getByRole("button", { name: /Remove (item|service)/ }).count()) === 0);

  // Print from billing downloads a PDF without errors.
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });
  const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: "Print" }).click();
  const download = await dl;
  ok("eng: print downloads an invoice PDF", !!download && /\.pdf$/i.test(download.suggestedFilename()), download ? download.suggestedFilename() : "no download");
  if (download) {
    const { readFileSync } = await import("node:fs");
    const pdfPath = await download.path();
    const raw = readFileSync(pdfPath).toString("latin1");
    ok("eng: bill PDF is a real PDF named with the bill no.", raw.startsWith("%PDF") && /Bill-802-/.test(download.suggestedFilename()), download.suggestedFilename());
    ok("eng: bill PDF uses the radiator layout (masthead with bill no., Billed to / Details, plain table, signatory)", /\(Bill No: 802\)/.test(raw) && /\(BILLED TO\)/.test(raw) && /\(DETAILS\)/.test(raw) && /\(Particulars\)/.test(raw) && /\(Authorised signatory\)/.test(raw), "layout markers");
    ok("eng: bill PDF carries plate, mechanic, service group tag and totals", /TN 52 J 2622/.test(raw) && /\(Ramesh\)/.test(raw) && /\(TURBO · BS-3\)/.test(raw) && /\(Subtotal\)/.test(raw) && /\(Total\)/.test(raw) && /\(Discount\)/.test(raw), "content");
    ok("eng: bill PDF no longer prints the old mockup extras (amount in words, PHONE / WHATSAPP band label)", !/Rupees Four Thousand/.test(raw) && !/PHONE \/ WHATSAPP/.test(raw), "legacy markers absent");
  }
  // A new tenant has not filled in Company settings yet: the bill must not print a "?" logo or a dangling "For".
  const noNameHandler = async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" || u.pathname !== "/settings") return route.fallback();
    const st = settingsFor("engineering");
    st.company.name = "";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: st }) });
  };
  await page.route("http://localhost:5000/**", noNameHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });
  const dl2 = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: "Print" }).click();
  const download2 = await dl2;
  if (download2) {
    const { readFileSync } = await import("node:fs");
    const raw2 = readFileSync(await download2.path()).toString("latin1");
    ok("eng: bill PDF without a company name has no '?' logo placeholder", !raw2.includes("(?)"), raw2.includes("(?)") ? "found (?)" : "clean");
    ok("eng: bill PDF without a company name has no dangling 'For' footer", !raw2.includes("(For)"), raw2.includes("(For)") ? "found (For)" : "clean");
    ok("eng: bill PDF without a company name still carries the bill title", /CASH \/ CREDIT BILL/i.test(raw2), "title");
  } else {
    ok("eng: bill PDF without a company name downloads", false, "no download");
  }
  await page.unroute("http://localhost:5000/**", noNameHandler);
  // Phone layouts: bills become cards, filters collapse into a sheet, Save stays reachable on the form.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });
  const billOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: billing has no horizontal overflow at 390px", billOverflow <= 0, `overflow=${billOverflow}`);
  ok("eng: billing table hidden on phone (card mode)", (await page.locator(".table thead").count()) === 0 && (await page.locator(".m-card").count()) > 0);
  ok("eng: bill card shows status pill", await page.locator(".m-card .badge").first().isVisible());
  ok("eng: secondary filters collapsed on phone", !(await page.locator("#from-date").isVisible()));
  await page.getByRole("button", { name: /^Filters/ }).click();
  ok("eng: 'Filters' sheet reveals date filters", await page.locator("#from-date").isVisible());
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByRole("button", { name: "Create bill" }).waitFor({ timeout: 10000 });
  const saveBox = await page.getByRole("button", { name: "Create bill" }).boundingBox();
  ok("eng: Create bill is inside the viewport without scrolling (sticky bar)", !!saveBox && saveBox.y + saveBox.height <= 844 && saveBox.y >= 0, JSON.stringify(saveBox));
  const formOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: service form has no horizontal overflow at 390px", formOverflow <= 0, `overflow=${formOverflow}`);
  await page.setViewportSize({ width: 1300, height: 1000 });
  ok("eng: no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
}

try { await run("engineering"); } catch (e) { results.push("ERROR eng: " + e.message.split("\n")[0]); }
try { await run("radiator"); } catch (e) { results.push("ERROR rad: " + e.message.split("\n")[0]); }
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
