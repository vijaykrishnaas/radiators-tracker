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
  // Service type Turbo, BS-3
  const card = page.locator(".border.rounded.p-3").first();
  await card.getByText("Select...").first().click({ force: true });
  await page.getByText("Turbo", { exact: true }).last().click();
  await card.getByText("Select...").first().click({ force: true });
  await page.getByText("BS-3", { exact: true }).last().click();
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

  // BS-6 hides Block bush change for compressor
  const c2 = page.locator(".border.rounded.p-3").nth(1);
  await c2.getByText("Select...").first().click({ force: true });
  await page.getByText("BS-6", { exact: true }).last().click();
  await c2.locator("[class*='control']").nth(2).click({ force: true });
  await page.waitForTimeout(300);
  const menu = await page.locator("[class*='menu']").last().innerText();
  ok("eng: BS-6 compressor hides 'Block bush change', shows 'Sleeve fixing'", !/Block bush change/.test(menu) && /Sleeve fixing/.test(menu), menu.replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  // BS change re-applies the catalog rate for the new model, so type the manual rate afterwards.
  await c2.locator('input[placeholder="Rate"]').fill("1000");

  // Discount + received
  const moneyInputs = page.locator('input[type="number"]');
  await page.locator("label:has-text('Discount') + div input").fill("50");
  await page.locator("label:has-text('Amount received') + div input").fill("1000");
  const footer = await page.locator(".font-w700.font-s20").innerText();
  // total 3050 + 1000 = 4050 - 50 = 4000
  ok("eng: footer net total ₹4,000.00", footer.includes("4,000.00"), footer);
  await page.screenshot({ path: `${S}/eng-form-full.png`, fullPage: true });

  await page.getByRole("button", { name: "Save service" }).click();
  await page.waitForTimeout(1500);
  ok("eng: POST payload sent", !!posted);
  if (posted) {
    ok("eng: payload truck uppercase", posted.vehicleNo === "TN52Q0127");
    ok("eng: payload 2 services", posted.services.length === 2, JSON.stringify(posted.services.map((s) => [s.type, s.bsModel, s.items.length])));
    ok("eng: payload turbo bsModel bs3, qty 2 on Hold set", posted.services[0].bsModel === "bs3" && posted.services[0].items[0].qty === 2);
    ok("eng: payload Other has comment", posted.services[0].items.some((i) => i.item === "other" && i.comment === "Bearing clean"));
    ok("eng: payload discount 50, received 1000", posted.discount === 50 && posted.amountReceived === 1000);
  }
  ok("eng: navigated to billing after save", page.url().endsWith("/engineering/billing"), page.url());
  await page.waitForTimeout(1000);
  ok("eng: billing list shows bill row", (await page.getByText("TN52J2622").count()) > 0);
  await page.screenshot({ path: `${S}/eng-billing.png`, fullPage: true });

  // Record Payment: the modal's discount is extra on top of the bill's existing ₹50 discount,
  // and the API expects the bill's total discount → must send 50 + 100 = 150.
  await page.getByRole("button", { name: "Actions for TN52J2622" }).click();
  await page.getByRole("menuitem", { name: "Record Payment" }).click();
  await page.locator("#payment-discount").fill("100");
  await page.locator(".modal-footer").getByRole("button", { name: "Record Payment" }).click();
  await page.waitForTimeout(800);
  ok("eng: payment modal sends existing + new discount (150)", paid?.discount === 150, JSON.stringify(paid));

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

  // Edit existing bill: form loads stored values; update sends PUT with them.
  await page.goto(BASE + "/engineering/dashboard/edit/b1");
  await page.getByPlaceholder("Enter Truck Number").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok("eng: edit loads truck number", (await page.getByPlaceholder("Enter Truck Number").inputValue()) === "TN52J2622");
  ok("eng: edit loads item rate 4850", (await page.locator('input[placeholder="Rate"]').first().inputValue()) === "4850");
  ok("eng: edit loads discount 50", (await page.locator("label:has-text('Discount') + div input").inputValue()) === "50");
  await page.locator('input[placeholder="Qty"]').first().fill("2");
  await page.getByRole("button", { name: "Update service" }).click();
  for (let i = 0; i < 50 && !putBody; i++) await page.waitForTimeout(100);
  ok("eng: edit sends PUT with updated qty and kept discount", putBody?.services?.[0]?.items?.[0]?.qty === 2 && putBody?.discount === 50 && putBody?.vehicleNo === "TN52J2622", JSON.stringify(putBody && { qty: putBody.services?.[0]?.items?.[0]?.qty, discount: putBody.discount }));

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
