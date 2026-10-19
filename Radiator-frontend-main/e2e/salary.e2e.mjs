// Salary settle page + payslip checks: real app on the Vite dev server, API mocked with page.route.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node e2e/salary.e2e.mjs`
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
settings.company.name = "Salary Test";

// ₹5,000 advance against ₹3,000 gross: ₹3,000 recovered now, ₹2,000 carried forward.
const preview = {
  employeeId: "e1", employeeName: "Ramesh", workingDays: 30, presentDaysComputed: 30, presentDaysMode: "daily",
  presentDaysUsed: 30, baseSalary: 3000, grossAmount: 3000,
  advancesApplied: [{ advanceId: "a1", amount: 5000, date: "2026-09-05", reason: "Festival advance" }],
  advancesDeducted: 3000, advancesCarriedForward: 2000, deductions: [], deductionsTotal: 0, netAmount: 0,
};
const period = {
  _id: "p1", employeeName: "Ramesh", periodStart: "2026-09-01", periodEnd: "2026-09-30", periodKey: "2026-09",
  workingDays: 30, presentDaysUsed: 30, presentDaysMode: "daily", baseSalary: 3000, grossAmount: 3000,
  advancesApplied: preview.advancesApplied, advancesDeducted: 3000, advancesCarriedForward: 2000,
  deductions: [], deductionsTotal: 0, netAmount: 0, status: "paid", paidAt: "2026-09-30T10:00:00.000Z", adjustments: [],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.route("http://localhost:5000/**", async (route) => {
  const p = new URL(route.request().url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (p === "/settings") return json({ settings });
  if (p === "/employees") return json({ success: true, employees: [{ _id: "e1", name: "Ramesh", baseSalary: 3000 }] });
  if (p === "/salary/attendance") return json({ success: true, days: [] });
  if (p === "/salary/advances") return json({ success: true, advances: [{ _id: "a1", amount: 5000, date: "2026-09-05", reason: "Festival advance", status: "unapplied" }] });
  if (p === "/salary/preview") return json({ success: true, ...preview });
  if (p === "/salary/history") return json({ success: true, rows: [period], total: 1, page: 1, totalPages: 1 });
  if (p === "/salary/p1/payslip") return json({ success: true, period });
  return json({ success: true, data: [], mechdata: [], records: [] });
});

await page.goto(BASE + "/issueCounter/login");
await page.evaluate(() => {
  localStorage.setItem("svr_token", "x");
  localStorage.setItem("svr_user", JSON.stringify({ userId: "admin", name: "Admin", role: "admin", clientId: "c1" }));
});
await page.goto(BASE + "/salary/settle");
await page.waitForTimeout(1500);
// Pick the employee in the first react-select on the page.
await page.locator("#settle-employee").click({ force: true });
await page.getByText("Ramesh", { exact: true }).last().click();
await page.getByText("Advances deducted").waitFor({ timeout: 10000 });

const previewText = await page.locator("dl.key-values").filter({ hasText: "Advances deducted" }).first().innerText();
ok("salary: preview shows ₹3,000 advances deducted", /Advances deducted\s*-\s*₹3,000\.00/.test(previewText), previewText.replace(/\s+/g, " "));
ok("salary: preview shows ₹2,000 carried forward", /carried forward to next settlement\s*₹2,000\.00/.test(previewText), previewText.replace(/\s+/g, " "));
ok("salary: preview net payable ₹0", /Net Payable\s*₹0\.00/.test(previewText));

const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
await page.getByRole("button", { name: "Actions for 2026-09" }).first().click();
await page.getByRole("menuitem", { name: "View Payslip" }).click();
const download = await dl;
ok("salary: payslip downloads a PDF", !!download && /Payslip-2026-09-Ramesh\.pdf$/.test(download.suggestedFilename()), download ? download.suggestedFilename() : "no download");
if (download) {
  const pdf = readFileSync(await download.path()).toString("latin1");
  ok("salary: payslip lists the carried-forward advance", pdf.includes("Advance carried forward to next settlement"), pdf.includes("Advance carried forward to next settlement") ? "" : "text not found in PDF");
}

ok("salary: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
