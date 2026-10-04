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

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings") return json({ settings });
  if (p === "/mechanic") return json({ success: true, mechdata: ["Ramesh"] });
  if (p === "/radiators/r1/payment") { payments.push(req.postDataJSON()); return json({ success: true, message: "ok", radiator: bill }); }
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

// Engineering routes stay gated away from radiator tenants.
await page.goto(BASE + "/engineering/dashboard");
await page.waitForTimeout(1500);
ok("radiator: engineering route redirects away", !page.url().includes("/engineering/"), page.url());

ok("radiator: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
