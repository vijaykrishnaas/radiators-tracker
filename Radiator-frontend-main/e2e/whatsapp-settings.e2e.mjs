// Settings › WhatsApp tab: only when the super admin enabled WhatsApp for the company. API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node --experimental-test-module-mocks e2e/whatsapp-settings.e2e.mjs`
import { execSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mockApi, settingsFor } from "./fixtures.mjs";

const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";

const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const browser = await chromium.launch();
const errors = [];

const open = async (whatsappEnabled) => {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  const settings = settingsFor("radiator");
  settings.whatsapp = { billDefaultTick: false, receipt: false, receiptPdf: false, ownerSummary: false, ownerPhone: "", summaryTime: "20:00", ...(settings.whatsapp || {}) };
  settings.whatsappEnabled = whatsappEnabled;
  const calls = await mockApi(page, "radiator", { settings });
  const wa = [];
  await page.route("http://localhost:5000/whatsapp/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    wa.push(`${req.method()} ${p}`);
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/whatsapp/status") return json({ success: true, enabled: true, provider: "meta", displayPhone: "+91 98765 43210", verifiedName: "Sri Velavan Radiators",
      templates: { bill_document: { status: "APPROVED" }, payment_receipt: { status: "PENDING" }, owner_daily_summary: { status: "REJECTED", reason: "Too many variables" }, payment_receipt_document: { status: "MISSING" } } });
    if (p === "/whatsapp/test") return json({ success: true, message: "Test message sent" });
    return json({ success: true });
  });
  await page.goto(BASE + "/issueCounter/login");
  await page.evaluate(() => {
    localStorage.setItem("svr_token", "x");
    localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
  });
  await page.goto(BASE + "/settings");
  await page.getByText("Company profile").first().waitFor({ timeout: 10000 });
  return { page, calls, wa };
};

// Disabled: no tab.
{
  const { page } = await open(false);
  ok("whatsapp settings: no WhatsApp tab when it is not enabled for the company", (await page.getByRole("tab", { name: "WhatsApp" }).count()) === 0);
  await page.close();
}

// Enabled: tab, status, switches, save body.
{
  const { page, calls, wa } = await open(true);
  await page.getByRole("tab", { name: "WhatsApp" }).click();
  await page.getByText("Verified name").first().waitFor({ timeout: 10000 });
  const body = async () => (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  ok("whatsapp settings: the tab shows number, verified name and template badges", /\+91 98765 43210/.test(await body()) && /Bill \/ challan APPROVED/.test(await body())
    && /Payment receipt PENDING/.test(await body()) && /Too many variables/.test(await body()) && wa.includes("GET /whatsapp/status"));
  ok("whatsapp settings: the four switches are there, and the PDF switch waits for receipts", await page.getByLabel("Tick 'Send on WhatsApp' by default when saving a bill").isVisible()
    && await page.getByLabel("Send a payment receipt").isVisible() && await page.getByLabel("Daily summary to owner").isVisible()
    && await page.getByLabel("Attach the updated bill PDF to receipts").isDisabled());
  ok("whatsapp settings: the auto-reply note shows Company phone 1", /98430 12345/.test(await body()));

  // Owner summary on without a number: blocked, nothing saved.
  await page.getByLabel("Daily summary to owner").check();
  const putsBefore = calls.filter((c) => c.m === "PUT" && c.p === "/settings").length;
  await page.getByRole("button", { name: "Save All Settings" }).last().click();
  await page.getByText(/Enter the owner's WhatsApp number/).waitFor({ timeout: 5000 });
  ok("whatsapp settings: the summary needs an owner number before it saves", calls.filter((c) => c.m === "PUT" && c.p === "/settings").length === putsBefore);

  await page.getByLabel("Send a payment receipt").check();
  await page.getByLabel("Owner's WhatsApp number").fill("9876543210");
  await page.getByLabel("Summary time").fill("21:30");
  await page.getByRole("button", { name: "Save All Settings" }).last().click();
  await page.waitForTimeout(600);
  const put = calls.filter((c) => c.m === "PUT" && c.p === "/settings").pop();
  ok("whatsapp settings: saving sends settings.whatsapp", !!put && put.body.whatsapp.receipt === true && put.body.whatsapp.ownerSummary === true
    && put.body.whatsapp.ownerPhone === "9876543210" && put.body.whatsapp.summaryTime === "21:30", JSON.stringify(put?.body?.whatsapp));
  ok("whatsapp settings: … but never whatsappEnabled", !!put && !("whatsappEnabled" in put.body));

  await page.getByRole("button", { name: "Send test message to owner" }).click();
  await page.waitForTimeout(500);
  ok("whatsapp settings: the test button posts to /whatsapp/test", wa.includes("POST /whatsapp/test"));
  await page.close();
}

ok("whatsapp settings: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
