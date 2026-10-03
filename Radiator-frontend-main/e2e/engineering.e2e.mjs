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
  const bill = {
    _id: "b1", billNo: 802, billDate: "2026-09-16T00:00:00.000Z", vehicleNo: "TN52J2622", lorryAddress: "Sankari",
    mechanic: "Ramesh", phone: "", services: [{ type: "turbo", typeLabel: "Turbo", bsModel: "bs3",
      items: [{ item: "hold-set", label: "Hold set", qty: 1, rate: 4850, amount: 4850 }], subtotal: 4850 }],
    typeTotals: { turbo: 4850 }, total: 4850, discount: 50, netTotal: 4800, amountReceived: 0, balance: 4800, paymentStatus: "Not Received",
  };
  await page.route("http://localhost:5000/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/settings") return json({ settings: settingsFor(type) });
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
    const nav = await page.locator(".navbar-nav-header").innerText();
    ok("radiator: header still has Expenses/Bonus/Salary", /Expenses/.test(nav) && /Bonus/.test(nav) && /Salary/.test(nav), nav.replace(/\s+/g, " "));
    ok("radiator: stays on radiator dashboard", page.url().endsWith("/issueCounter/dashboard"), page.url());
    await page.goto(BASE + "/engineering/dashboard");
    await page.waitForTimeout(1500);
    ok("radiator: engineering route redirects away", !page.url().includes("/engineering/"), page.url());
    await page.goto(BASE + "/settings");
    await page.waitForTimeout(1500);
    const tabs = await page.locator(".settings-tabs").innerText();
    ok("radiator: settings tabs unchanged", /Catalog & Pricing/.test(tabs) && /Bonus/.test(tabs) && !/Service Catalog/.test(tabs), tabs.replace(/\s+/g, " "));
    // Logout: radiator keeps the generic login page even when the session carries a business code.
    await page.evaluate(() => localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1", code: "acme" })));
    await page.goto(BASE + "/issueCounter/dashboard");
    await page.locator(".navbar .dropdown-toggle", { hasText: "Admin" }).first().click();
    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForTimeout(500);
    ok("radiator: logout still goes to the generic login page", page.url().endsWith("/issueCounter/login"), page.url());
    ok("radiator: no page errors", errors.length === 0, errors.join(" | "));
    await browser.close();
    return;
  }

  // Engineering tenant: login lands on radiator dashboard path → redirected
  await page.goto(BASE + "/issueCounter/dashboard");
  await page.waitForTimeout(2500);
  ok("eng: /issueCounter/dashboard redirects to /engineering/dashboard", page.url().endsWith("/engineering/dashboard"), page.url());
  const nav = await page.locator(".navbar-nav-header").innerText();
  ok("eng: header shows only Dashboard + Bills", /Dashboard/.test(nav) && /Bills/.test(nav) && !/Expenses|Bonus|Salary/.test(nav), nav.replace(/\s+/g, " "));
  ok("eng: dashboard KPIs render", (await page.getByText("Outstanding").count()) > 0);
  await page.screenshot({ path: `${S}/eng-dashboard.png`, fullPage: true });
  ok("eng: dashboard shows 4 KPI tiles", (await page.locator(".eng-kpi").count()) === 4);
  ok("eng: 'This FY' is the active range by default", (await page.locator(".eng-seg-btn.is-active").innerText()) === "This FY");
  ok("eng: by-service-type legend lists Turbo with 100%", /Turbo/.test(await page.locator(".eng-legend-list").innerText()) && /100%/.test(await page.locator(".eng-legend-list").innerText()));
  await page.getByRole("radio", { name: "Today" }).click();
  await page.waitForTimeout(500);
  ok("eng: choosing 'Today' makes it the active range", (await page.locator(".eng-seg-btn.is-active").innerText()) === "Today");
  ok("eng: range control keeps keyboard focus after a click", (await page.evaluate(() => document.activeElement?.textContent)) === "Today");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: dashboard has no horizontal overflow at 390px", dashOverflow <= 0, `overflow=${dashOverflow}`);
  const dateRight = await page.locator(".eng-range-dates input").last().evaluate((el) => el.getBoundingClientRect().right);
  const cardRight = await page.locator(".eng-range").evaluate((el) => el.getBoundingClientRect().right);
  ok("eng: phone date inputs stay inside their card", dateRight <= cardRight, `${dateRight} <= ${cardRight}`);
  await page.setViewportSize({ width: 1300, height: 1000 });

  await page.goto(BASE + "/engineering/dashboard/create");
  await page.waitForTimeout(2000);
  await page.getByPlaceholder("Enter Truck Number").fill("tn52q0127");
  await page.getByPlaceholder("Enter Truck Number").blur();
  await page.waitForTimeout(500);
  ok("eng: truck uppercased", (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN52Q0127");
  ok("eng: autofill lorry address from past bill", (await page.getByPlaceholder("Enter Lorry Address").inputValue()) === "Sri Velavan Radiators");

  // Save with nothing → validation
  await page.getByRole("button", { name: "Save service" }).click();
  ok("eng: mechanic required error", (await page.getByText("Mechanic is required").count()) > 0);
  ok("eng: service required error", (await page.getByText("Add at least one service with an item").count()) > 0);

  // Mechanic
  await page.getByText("Select Mechanic Name").click({ force: true });
  await page.getByText("Ramesh", { exact: true }).last().click();
  // One BS model for the whole bill (header), then service type Turbo on the card.
  ok("eng: BS model is a bill-level header field (no BS select inside the service card)", (await page.getByText("BS model", { exact: true }).count()) === 1 && (await page.locator(".border.rounded.p-3").first().getByText("BS model").count()) === 0);
  await page.getByText("Select BS model").click({ force: true });
  await page.getByText("BS-3", { exact: true }).last().click();
  const card = page.locator(".border.rounded.p-3").first();
  await card.getByText("Select...").first().click({ force: true });
  await page.getByText("Turbo", { exact: true }).last().click();
  await card.getByText("Select items").click({ force: true });
  await page.getByText("Hold set", { exact: true }).last().click();
  await page.getByText("O-ring kit change", { exact: true }).last().click();
  await page.getByText("Other", { exact: true }).last().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${S}/eng-form-turbo.png`, fullPage: true });
  const rateInputs = card.locator('input[placeholder="Rate"]');
  ok("eng: 3 item rows added", (await rateInputs.count()) === 3, String(await rateInputs.count()));
  ok("eng: Hold set rate auto-filled from BS-3 price (500)", (await rateInputs.nth(0).inputValue()) === "500", await rateInputs.nth(0).inputValue());
  ok("eng: O-ring rate auto-filled (2000)", (await rateInputs.nth(1).inputValue()) === "2000");
  await card.locator('input[placeholder="Qty"]').nth(0).fill("2");
  await rateInputs.nth(2).fill("50");
  // Other without description → error
  await page.getByRole("button", { name: "Save service" }).click();
  ok("eng: Other requires description", (await page.getByText("Describe the work").count()) > 0);
  await page.waitForTimeout(450); // border-color has a 150ms transition
  const errBorder = await page.locator(".eng-line-comment.has-error .form-control").first().evaluate((el) => getComputedStyle(el).borderTopColor);
  ok("eng: missing description field is marked with the error colour", /^rgb\(231, ?74, ?74\)$/.test(errBorder), errBorder);
  await card.getByPlaceholder("Describe the work").fill("Bearing clean");
  // 2*500 + 2000 + 50 = 3050
  const subtotalText = await card.getByText(/Subtotal:/).innerText();
  ok("eng: card subtotal = ₹3,050.00", subtotalText.includes("3,050.00"), subtotalText);
  const heights = await page.evaluate(() => {
    const h = (el) => Math.round(el.getBoundingClientRect().height);
    const inputs = [...document.querySelectorAll(".eng-form input.form-control")].filter((e) => e.type === "text" || e.type === "date").map(h);
    const selects = [...document.querySelectorAll('.eng-form div[class*="-control"]')].filter((e) => !e.className.includes("form-control") && !e.closest(".eng-line")).map(h);
    return { inputs: [...new Set(inputs)], selects: [...new Set(selects)] };
  });
  ok("eng: dropdowns are the same height as text inputs (no 38px vs 44px mismatch)", heights.inputs.length === 1 && heights.inputs[0] === 44 && heights.selects.length > 0 && heights.selects.every((v) => v >= 44), JSON.stringify(heights));
  const align = await page.evaluate(() => {
    const L = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { q: L(".eng-line-qty").left - L(".eng-lh-qty").left, r: L(".eng-line-rate").left - L(".eng-lh-rate").left, a: L(".eng-lh-amt").right - L(".eng-line-amt").right };
  });
  ok("eng: item column headers line up with the fields (<=2px)", Math.abs(align.q) <= 2 && Math.abs(align.r) <= 2 && Math.abs(align.a) <= 2, JSON.stringify(align));

  // Quick-add chips follow the mockup: tinted pill in the brand colour, not a grey button.
  const chipStyle = await page.evaluate(() => {
    const chip = document.querySelector(".eng-quick");
    const brand = getComputedStyle(document.querySelector(".btn-primary")).backgroundColor;
    if (!chip) return { found: false, brand };
    const cs = getComputedStyle(chip);
    return { found: true, color: cs.color, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, brand };
  });
  ok("eng: quick-add chip is brand-coloured text on a tinted pill (mockup)", chipStyle.found && chipStyle.color === chipStyle.brand && /(rgba\([^)]*,\s*0?\.\d+\)|color\(srgb [^)]*\/\s*0?\.\d+\))$/.test(chipStyle.bg) && parseFloat(chipStyle.radius) >= 12, JSON.stringify(chipStyle));
  // Quick add chip (compressor piston) -> new card
  await page.getByRole("button", { name: "Air Compressor · Piston" }).click();
  await page.waitForTimeout(300);
  ok("eng: quick-add created compressor card with Piston row", (await page.locator(".border.rounded.p-3").count()) === 2 && (await page.locator(".border.rounded.p-3").nth(1).getByText("Piston", { exact: true }).count()) > 0);

  // BS-6 (bill-level) hides Block bush change for compressor
  const c2 = page.locator(".border.rounded.p-3").nth(1);
  await page.locator(".eng-form").getByText("BS-3", { exact: true }).first().click({ force: true });
  await page.getByText("BS-6", { exact: true }).last().click();
  await c2.locator("[class*='control']").nth(1).click({ force: true });
  await page.waitForTimeout(300);
  const menu = await page.locator("[class*='menu']").last().innerText();
  ok("eng: BS-6 compressor hides 'Block bush change', shows 'Sleeve fixing'", !/Block bush change/.test(menu) && /Sleeve fixing/.test(menu), menu.replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  // Back to BS-3: the change re-applies catalog rates on every card, so retype the manual values afterwards.
  await page.locator(".eng-form").getByText("BS-6", { exact: true }).first().click({ force: true });
  await page.getByText("BS-3", { exact: true }).last().click();
  await card.locator('input[placeholder="Qty"]').nth(0).fill("2");
  await rateInputs.nth(2).fill("50");
  await c2.locator('input[placeholder="Rate"]').fill("1000");

  // Footer shows only the total; discount / received / mode are entered later via Record payment.
  const footer = await page.locator(".font-w700.font-s20").innerText();
  ok("eng: footer total ₹4,050.00", footer.includes("4,050.00"), footer);
  const footText = await page.locator(".eng-foot").innerText();
  ok("eng: create footer has no discount / per-type totals, form has no payment fields", !/Discount|Amount received|Payment mode|Turbo|Air Compressor/i.test(footText) && (await page.locator("label:has-text('Discount'), label:has-text('Amount received'), label:has-text('Payment mode')").count()) === 0, footText.replace(/\s+/g, " "));
  await page.screenshot({ path: `${S}/eng-form-full.png`, fullPage: true });

  await page.getByRole("button", { name: "Save service" }).click();
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
    const th = (t) => [...document.querySelectorAll(".eng-table thead th")].find((e) => e.textContent.trim() === t);
    const row = document.querySelector(".eng-table tbody tr");
    const net = row.querySelector(".eng-c-net"), truck = row.querySelector(".eng-c-truck");
    return { thNet: getComputedStyle(th("Total")).textAlign, thBal: getComputedStyle(th("Balance")).textAlign, tdNet: getComputedStyle(net).textAlign, tabular: getComputedStyle(net).fontVariantNumeric, truckW: getComputedStyle(truck).fontWeight };
  });
  ok("eng: billing money columns are right-aligned (header + cells) with tabular numerals", tbl.thNet === "right" && tbl.thBal === "right" && tbl.tdNet === "right" && /tabular-nums/.test(tbl.tabular), JSON.stringify(tbl));
  ok("eng: billing table column is labelled Total (not Net)", (await page.locator(".eng-table thead th").allTextContents()).some((t) => t.trim() === "Total") && !(await page.locator(".eng-table thead th").allTextContents()).some((t) => t.trim() === "Net"));
  ok("eng: billing truck number is emphasised (semibold)", parseInt(tbl.truckW, 10) >= 600, tbl.truckW);
  const firstTd = page.locator(".eng-table tbody tr").first().locator("td").nth(2);
  const bgBefore = await firstTd.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator(".eng-table tbody tr").first().hover();
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
    new MutationObserver(() => { if (document.querySelector(".eng-empty-state")) window.__sawEmpty = true; }).observe(document, { childList: true, subtree: true });
  });
  await page.route("http://localhost:5000/**", emptyHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.waitForTimeout(350);
  const sawEmptyEarly = await page.evaluate(() => window.__sawEmpty);
  ok("eng: billing never renders the empty state before the first response (first paint)", sawEmptyEarly === false, `sawEmpty=${sawEmptyEarly}`);
  ok("eng: billing shows a loading skeleton (not 'no bills') while data is on its way", (await page.locator(".eng-skel").count()) > 0 && (await page.locator(".eng-empty-state").count()) === 0, `skel=${await page.locator(".eng-skel").count()} empty=${await page.locator(".eng-empty-state").count()}`);
  await page.waitForTimeout(1500);
  const emptyTxt = await page.locator(".eng-table tbody").innerText();
  ok("eng: billing empty state (no filters) says 'No bills yet' and offers New service", /No bills yet/.test(emptyTxt) && (await page.locator(".eng-empty-state").getByRole("button", { name: "New service" }).count()) === 1, emptyTxt.replace(/\s+/g, " "));
  await page.getByPlaceholder(/Search Truck/).fill("ZZZ");
  await page.waitForTimeout(1900);
  const filteredTxt = await page.locator(".eng-table tbody").innerText();
  ok("eng: billing empty state with a filter says 'No bills match' and offers Clear filters", /No bills match these filters/.test(filteredTxt) && (await page.locator(".eng-empty-state").getByRole("button", { name: "Clear filters" }).count()) === 1, filteredTxt.replace(/\s+/g, " "));
  await page.unroute("http://localhost:5000/**", emptyHandler);
  let failNext = true;
  const failHandler = async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" || u.pathname !== "/engbills" || !failNext) return route.fallback();
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "boom" }) });
  };
  await page.route("http://localhost:5000/**", failHandler);
  await page.goto(BASE + "/engineering/billing");
  await page.waitForTimeout(1200);
  const failTxt = await page.locator(".eng-table tbody").innerText();
  ok("eng: billing failed load says 'Couldn't load bills' with Retry (not 'No bills yet')", /Couldn.t load bills/.test(failTxt) && !/No bills yet/.test(failTxt) && (await page.locator(".eng-empty-state").getByRole("button", { name: "Retry" }).count()) === 1, failTxt.replace(/\s+/g, " "));
  failNext = false;
  await page.locator(".eng-empty-state").getByRole("button", { name: "Retry" }).click().catch(() => {});
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
  await page.locator(".modal-footer").getByRole("button", { name: "Record Payment" }).click();
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
    const content = document.querySelector(".modal-content").getBoundingClientRect();
    const label = document.querySelector('label[for="payment-discount"]');
    const hint = document.querySelector(".eng-modal .eng-hint");
    const lcs = getComputedStyle(label);
    const hcs = hint ? getComputedStyle(hint) : { textTransform: "missing", fontWeight: "missing" };
    const kids = [...document.querySelectorAll(".modal-body *")].map((e) => e.getBoundingClientRect().right);
    const input = document.querySelector("#payment-amount").getBoundingClientRect();
    const btns = [...document.querySelectorAll(".modal-footer .btn")].map((b) => b.getBoundingClientRect());
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
  const hintOwnText = await page.evaluate(() => (document.querySelector(".eng-modal .eng-hint")?.textContent || "").trim());
  ok("eng: discount field is described by its hint for screen readers (aria-describedby)", hintOwnText.length > 0 && desc.text === hintOwnText, JSON.stringify({ desc, hintOwnText }));
  await page.locator(".modal-footer").getByRole("button", { name: "Cancel" }).click();
  await page.setViewportSize({ width: 1300, height: 1000 });

  await page.goto(BASE + "/settings");
  await page.waitForTimeout(1500);
  const tabs = await page.locator(".settings-tabs").innerText();
  ok("eng: settings tabs = Company/Service Catalog/Mechanics/Invoice", /Service Catalog/.test(tabs) && /Mechanics/.test(tabs) && !/Bonus|Salary|Catalog & Pricing/.test(tabs), tabs.replace(/\s+/g, " "));
  await page.getByRole("tab", { name: "Service Catalog" }).click();
  await page.waitForTimeout(500);
  ok("eng: catalog table shows Turbo items", (await page.locator(".eng-item input[value='Hold set']").count()) > 0);
  await page.locator(".eng-type", { hasText: "Air Compressor" }).click();
  await page.waitForTimeout(300);
  ok("eng: type rail switches to Air Compressor items", (await page.locator(".eng-item input[value='Sleeve fixing']").count()) > 0);
  await page.screenshot({ path: `${S}/eng-settings.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: catalog has no horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}`);
  ok("eng: catalog items render as cards on phone (price labels visible)", await page.locator(".eng-item .eng-price-label").first().isVisible());
  await page.setViewportSize({ width: 1300, height: 1000 });

  // TailAdmin token layer: every Engineering page root carries `eng-theme`, which defines the --eng-* tokens;
  // the section card uses them (16px radius, gray-200 hairline).
  const themeProbe = () => page.evaluate(() => {
    const t = document.querySelector(".eng-theme");
    if (!t) return null;
    const cs = getComputedStyle(t);
    const card = document.querySelector(".eng-card");
    const cc = card ? getComputedStyle(card) : null;
    return { gray200: cs.getPropertyValue("--eng-gray-200").trim().toLowerCase(), radius: cs.getPropertyValue("--eng-radius-lg").trim(),
      ring: cs.getPropertyValue("--eng-ring").trim(), shadow: cs.getPropertyValue("--eng-shadow-xs").trim(),
      cardRadius: cc && cc.borderTopLeftRadius, cardBorder: cc && cc.borderTopColor };
  });
  for (const [label, url, ready] of [
    ["settings catalog", null, null],
    ["dashboard", "/engineering/dashboard", ".eng-kpi"],
    ["billing", "/engineering/billing", ".eng-table"],
    ["service form", "/engineering/dashboard/create", ".eng-form"],
  ]) {
    if (url) { await page.goto(BASE + url); await page.locator(ready).first().waitFor({ timeout: 10000 }); }
    const th = await themeProbe();
    ok(`eng: ${label} root carries eng-theme tokens`, !!th && th.gray200 === "#e4e7ec" && th.radius === "16px" && /^0 0 0 4px/.test(th.ring) && /rgba\(16, 24, 40, 0?\.05\)/.test(th.shadow), JSON.stringify(th));
    if (th && th.cardRadius) ok(`eng: ${label} section card = 16px radius + gray-200 border`, th.cardRadius === "16px" && th.cardBorder === "rgb(228, 231, 236)", `${th.cardRadius} ${th.cardBorder}`);
  }


  // TailAdmin metric card + chart card recipe (desktop): stacked icon chip / label / big value, 18px panel titles.
  await page.goto(BASE + "/engineering/dashboard");
  await page.locator(".eng-kpi").first().waitFor({ timeout: 10000 });
  const kpiM = await page.evaluate(() => {
    const k = document.querySelector(".eng-kpi"); const ic = k.querySelector(".eng-kpi-icon");
    const l = k.querySelector(".eng-kpi-label"); const v = k.querySelector(".eng-kpi-value");
    const t = document.querySelector(".eng-panel-title");
    const kb = k.getBoundingClientRect(), ib = ic.getBoundingClientRect(), lb = l.getBoundingClientRect(), vb = v.getBoundingClientRect();
    return { dir: getComputedStyle(k).flexDirection, icon: Math.round(ib.width), iconR: getComputedStyle(ic).borderTopLeftRadius,
      labelPx: getComputedStyle(l).fontSize, labelW: getComputedStyle(l).fontWeight, valuePx: getComputedStyle(v).fontSize, valueW: getComputedStyle(v).fontWeight,
      stacked: ib.bottom <= lb.top + 1 && lb.bottom <= vb.top + 1, leftAligned: Math.abs(ib.left - lb.left) < 1 && Math.abs(lb.left - vb.left) < 1,
      titlePx: t && getComputedStyle(t).fontSize, valueColor: getComputedStyle(v).color, kpiRadius: getComputedStyle(k).borderTopLeftRadius,
      kpiBorder: getComputedStyle(k).borderTopColor };
  });
  ok("eng: KPI card stacks icon chip / label / value, left-aligned", kpiM.dir === "column" && kpiM.stacked && kpiM.leftAligned, JSON.stringify(kpiM));
  ok("eng: KPI icon chip is 44px with 12px radius", kpiM.icon === 44 && kpiM.iconR === "12px", `${kpiM.icon}px ${kpiM.iconR}`);
  ok("eng: KPI label 13/500, value 28/600", kpiM.labelPx === "13px" && kpiM.labelW === "500" && kpiM.valuePx === "28px" && kpiM.valueW === "600", `${kpiM.labelPx}/${kpiM.labelW} ${kpiM.valuePx}/${kpiM.valueW}`);
  ok("eng: KPI card = 16px radius + gray-200 border", kpiM.kpiRadius === "16px" && kpiM.kpiBorder === "rgb(228, 231, 236)", `${kpiM.kpiRadius} ${kpiM.kpiBorder}`);
  ok("eng: chart panel title is 18px", kpiM.titlePx === "18px", String(kpiM.titlePx));

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
    await page.locator(".eng-kpi-value", { hasText: "12,34,56,789" }).first().waitFor({ timeout: 10000 });
    const clip = await page.evaluate(() => [...document.querySelectorAll(".eng-kpi-value")].filter((e) => e.scrollWidth > e.clientWidth).map((e) => `${e.textContent} ${e.scrollWidth}>${e.clientWidth}`));
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
  ok("eng: edit shows the net total (4,800) and no discount field", (await page.locator(".font-w700.font-s20").innerText()).includes("4,800.00") && (await page.locator("label:has-text('Discount')").count()) === 0);
  await page.locator('input[placeholder="Qty"]').first().fill("2");
  await page.getByRole("button", { name: "Update service" }).click();
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
  // Cancel on an empty new bill leaves immediately; with entries it asks first and can be declined.
  let dialogs = [];
  const onDialog = async (d) => { dialogs.push(d.message()); await (dialogs.length === 1 ? d.dismiss() : d.accept()); };
  page.on("dialog", onDialog);
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByRole("button", { name: "Cancel" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  ok("eng: Cancel on an empty new bill leaves without asking", page.url().endsWith("/engineering/billing") && dialogs.length === 0, `${page.url()} dialogs=${dialogs.length}`);
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByPlaceholder("Enter Truck Number").fill("TN01X1");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);
  ok("eng: Cancel with entries asks to discard; declining keeps the form", dialogs.length === 1 && /Discard/i.test(dialogs[0]) && page.url().endsWith("/engineering/dashboard/create") && (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN01X1", `${dialogs.join("|")} ${page.url()}`);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  ok("eng: accepting the discard prompt returns to the bills list", dialogs.length === 2 && page.url().endsWith("/engineering/billing"), `${dialogs.length} ${page.url()}`);
  page.off("dialog", onDialog);
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
  await page.getByRole("button", { name: "Update service" }).click();
  for (let i = 0; i < 50 && !putBody; i++) await page.waitForTimeout(100);
  ok("eng: saving a mixed-BS bill keeps each card's own BS model", putBody?.services?.[0]?.bsModel === "bs3" && putBody?.services?.[1]?.bsModel === "bs6", JSON.stringify(putBody?.services?.map((x) => x.bsModel)));
  await page.unroute("http://localhost:5000/**", mixedHandler);

  // Logout returns to the company login (/t/<code>/login); without a code it falls back to the generic login.
  await page.evaluate(() => localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1", code: "acme" })));
  await page.goto(BASE + "/engineering/billing");
  await page.locator(".navbar .dropdown-toggle", { hasText: "Admin" }).first().click();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForTimeout(500);
  ok("eng: logout goes to the company login URL with the business code", page.url().endsWith("/t/acme/login"), page.url());
  await page.evaluate(() => { localStorage.setItem("svr_token", "x"); localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" })); });
  await page.goto(BASE + "/engineering/billing");
  await page.locator(".navbar .dropdown-toggle", { hasText: "Admin" }).first().click();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForTimeout(500);
  ok("eng: logout without a stored code falls back to the generic login", page.url().endsWith("/issueCounter/login"), page.url());
  await page.evaluate(() => { localStorage.setItem("svr_token", "x"); localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" })); });

  // View mode is read-only.
  await page.goto(BASE + "/engineering/dashboard/view/b1");
  await page.getByPlaceholder("Enter Truck Number").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok("eng: view mode disables inputs and hides save", (await page.getByPlaceholder("Enter Truck Number").isDisabled()) && (await page.getByRole("button", { name: /Save service|Update service/ }).count()) === 0);
  const viewAlign = await page.evaluate(() => {
    const L = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { q: L(".eng-line-qty").left - L(".eng-lh-qty").left, r: L(".eng-line-rate").left - L(".eng-lh-rate").left, a: L(".eng-lh-amt").right - L(".eng-line-amt").right };
  });
  ok("eng: view mode item column headers line up too (no remove button)", Math.abs(viewAlign.q) <= 2 && Math.abs(viewAlign.r) <= 2 && Math.abs(viewAlign.a) <= 2, JSON.stringify(viewAlign));

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
    ok("eng: bill PDF carries amount in words and plate", /Rupees Four Thousand Eight Hundred/.test(raw) && /TN 52 J 2622/.test(raw));
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
  // Phone layouts: bills become cards, filters collapse, Save stays reachable on the form.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/engineering/billing");
  await page.getByText("TN52J2622").first().waitFor({ timeout: 10000 });
  const billOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("eng: billing has no horizontal overflow at 390px", billOverflow <= 0, `overflow=${billOverflow}`);
  ok("eng: billing table header hidden on phone (card mode)", !(await page.locator(".eng-table thead").isVisible()));
  ok("eng: bill card shows status pill", await page.locator(".eng-table .eng-c-status").first().isVisible());
  ok("eng: secondary filters collapsed on phone", !(await page.locator("#from-date").isVisible()));
  await page.getByRole("button", { name: "More filters" }).click();
  ok("eng: 'More filters' reveals date filters", await page.locator("#from-date").isVisible());
  await page.goto(BASE + "/engineering/dashboard/create");
  await page.getByRole("button", { name: "Save service" }).waitFor({ timeout: 10000 });
  const saveBox = await page.getByRole("button", { name: "Save service" }).boundingBox();
  ok("eng: Save service is inside the viewport without scrolling (sticky bar)", !!saveBox && saveBox.y + saveBox.height <= 844 && saveBox.y >= 0, JSON.stringify(saveBox));
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
