// Screenshot sweep for the redesign (spec §16): every screen at several widths, API mocked.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then
//   node e2e/screens.mjs [filter] [--widths=390,820,1280,1440]
// Output: e2e/.out/screens/<vertical>-<screen>-<width>.png
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mockApi, loginAs } from "./fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";
const OUT = join(here, ".out", "screens");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith("--")) || "";
const widthsArg = args.find((a) => a.startsWith("--widths="));
const WIDTHS = widthsArg ? widthsArg.slice(9).split(",").map(Number) : [390, 820, 1280, 1440];
const full = !args.includes("--viewport");

const SCREENS = [
  ["radiator", "dashboard", "/issueCounter/dashboard"],
  ["radiator", "bills", "/issueCounter/billing"],
  ["radiator", "bill-create", "/issueCounter/dashboard/create"],
  ["radiator", "bill-view", "/issueCounter/dashboard/view/r3"],
  ["radiator", "expenses", "/issueCounter/expenses"],
  ["radiator", "bonus", "/bonus/mechanics"],
  ["radiator", "bonus-labour", "/bonus/labour"],
  ["radiator", "review", "/bonus/mechanics/review"],
  ["radiator", "employees", "/salary/employees"],
  ["radiator", "settle", "/salary/settle"],
  ["radiator", "settings", "/settings"],
  ["radiator", "audit", "/audit"],
  ["radiator", "change-password", "/change-password"],
  ["automobile", "dashboard", "/automobile/dashboard"],
  ["automobile", "bills", "/automobile/billing"],
  ["automobile", "bill-edit", "/automobile/dashboard/edit/a1"],
  ["automobile", "settings", "/settings"],
  ["engineering", "dashboard", "/engineering/dashboard"],
  ["engineering", "bills", "/engineering/billing"],
  ["engineering", "service-create", "/engineering/dashboard/create"],
  ["engineering", "service-edit", "/engineering/dashboard/edit/e2"],
  ["engineering", "settings", "/settings"],
  ["admin", "clients", "/admin/clients"],
  ["admin", "audit", "/admin/audit"],
  ["public", "login", "/t/velavan/login"],
  ["public", "admin-login", "/admin/login"],
];

const browser = await chromium.launch();
const errors = [];
for (const [vertical, name, route] of SCREENS) {
  const id = `${vertical}-${name}`;
  if (filter && !id.includes(filter)) continue;
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 768 ? 844 : 900 } });
    page.on("pageerror", (e) => errors.push(`${id}@${w}: ${e.message}`));
    await mockApi(page, vertical === "admin" || vertical === "public" ? "radiator" : vertical);
    if (vertical === "admin") await loginAs(page, BASE, "superadmin");
    else if (vertical !== "public") await loginAs(page, BASE, "admin");
    await page.goto(BASE + route);
    await page.waitForTimeout(1200);
    if (name === "review") {
      const sel = page.locator("[class*='-control']").first();
      if (await sel.count()) { await sel.click(); await page.keyboard.press("Enter"); await page.waitForTimeout(900); }
    }
    if (name === "settle") {
      const sel = page.locator("[class*='-control']").first();
      if (await sel.count()) { await sel.click(); await page.keyboard.press("Enter"); await page.waitForTimeout(900); }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) errors.push(`${id}@${w}: horizontal page overflow ${overflow}px`);
    await page.screenshot({ path: join(OUT, `${id}-${w}.png`), fullPage: full });
    await page.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no page errors / overflow");
