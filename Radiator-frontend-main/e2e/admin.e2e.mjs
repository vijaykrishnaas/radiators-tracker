// Super admin › Clients › Backup & Restore, driven in the browser against the REAL backup DAO on the in-memory fake DB.
// Run: (in Radiator-frontend-main) `npx vite --port 5173 &` then `node --experimental-test-module-mocks e2e/admin.e2e.mjs`
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const backend = (p) => pathToFileURL(join(here, "../../Radiator-backend-main", p)).href;
const pwPath = process.env.PLAYWRIGHT_MODULE || join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const { createRequire } = await import("node:module");
const { ObjectId } = createRequire(join(here, "../../Radiator-backend-main/package.json"))("mongodb");
const { FakeDb } = await import(backend("test/helpers/fakeDb.js"));
const BASE = process.env.E2E_BASE_URL || "http://localhost:5173";

const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);

const fakeDb = new FakeDb();
mock.module(backend("src/config/db.js"), { namedExports: { connectDB: async () => fakeDb } });
const backup = await import(backend("src/dao/backup.dao.js"));

const A = new ObjectId(), B = new ObjectId(), T = new ObjectId();
const now = new Date().toISOString();
const clients = [
  { _id: String(A), name: "Sri Murugan Engineering", code: "smew", businessType: "engineering", status: "active", adminUserId: "admin", lastLoginAt: now, createdAt: now },
  { _id: String(B), name: "Velu Engineering", code: "velu", businessType: "engineering", status: "active", adminUserId: "velu", lastLoginAt: now, createdAt: now },
  { _id: String(T), name: "Kannan Tyres", code: "kannan", businessType: "tyre", status: "active", adminUserId: "kannan", lastLoginAt: now, createdAt: now },
];
const byId = (id) => clients.find((c) => c._id === id);
await fakeDb.collection("engbills").insertOne({ clientId: A, billNo: 1, billDate: new Date("2026-11-01T00:00:00Z"), vehicleNo: "TN52J2622", netTotal: 3350 });
await fakeDb.collection("engbills").insertOne({ clientId: A, billNo: 2, billDate: new Date("2026-11-02T00:00:00Z"), vehicleNo: "TN01AB1234", netTotal: 900 });
await fakeDb.collection("expenses").insertOne({ clientId: A, date: new Date("2026-11-05T00:00:00Z"), expenseType: "others", amount: 250 });
await fakeDb.collection("employees").insertOne({ clientId: A, name: "Kumar", monthlySalary: 15000 });
await fakeDb.collection("settings").insertOne({ _id: A, businessType: "engineering", company: { name: "Sri Murugan Engineering" } });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.route("http://localhost:5000/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  const run = async (fn) => { try { return json(await fn()); } catch (e) { return json({ success: false, message: e.message }, e.statusCode || 500); } };
  if (p === "/admin/clients" && req.method() === "GET") return json({ success: true, clients });
  let m = /^\/admin\/clients\/([a-f0-9]{24})\/backup\/summary$/.exec(p);
  if (m) return run(async () => ({ success: true, sections: await backup.backupSummary(m[1]) }));
  m = /^\/admin\/clients\/([a-f0-9]{24})\/backup$/.exec(p);
  if (m) return run(async () => ({ success: true, backup: await backup.exportBackup(m[1], byId(m[1]), url.searchParams.get("sections")) }));
  m = /^\/admin\/clients\/([a-f0-9]{24})\/backup\/import$/.exec(p);
  if (m) return run(async () => {
    const { backup: file, sections } = req.postDataJSON();
    const r = await backup.importBackup(m[1], byId(m[1]), file, sections);
    const added = Object.values(r).reduce((n, x) => n + x.added, 0);
    return { success: true, message: `${added} records added`, results: r };
  });
  return json({ success: true, data: [], rows: [] });
});

await page.goto(BASE + "/admin/login");
await page.evaluate(() => {
  localStorage.setItem("svr_token", "x");
  localStorage.setItem("svr_user", JSON.stringify({ userId: "root", name: "Platform Admin", role: "superadmin" }));
});
const openBackup = async (name) => {
  await page.goto(BASE + "/admin/clients");
  await page.getByText(name).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: `Actions for ${name}` }).first().click();
  await page.getByRole("menuitem", { name: "Backup & Restore" }).click();
  await page.getByRole("dialog").waitFor();
};
const dialogText = async () => (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");

// ---- Export: counts per section, untick one, download ----
await openBackup("Sri Murugan Engineering");
await page.getByText("Bills and challans").waitFor({ timeout: 10000 });
ok("admin: backup dialog lists each section with its record count", /Bills and challans 2 records/.test(await dialogText()) && /Expenses 1 record/.test(await dialogText()), (await dialogText()).slice(0, 300));
await page.getByLabel(/^Salary/).uncheck();
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: "Download backup" }).click()]);
const dir = mkdtempSync(join(tmpdir(), "svr-backup-"));
const file = join(dir, dl.suggestedFilename());
await dl.saveAs(file);
const saved = JSON.parse(readFileSync(file, "utf8"));
ok("admin: the backup file holds only the ticked sections", /^smew-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && !saved.sections.includes("salary")
  && saved.sections.includes("bills") && saved.data.engbills.length === 2 && !saved.data.employees, JSON.stringify(saved.sections));
await page.keyboard.press("Escape");

// ---- Import back into the same company after a bill was deleted: only the missing bill comes back ----
await fakeDb.collection("engbills").deleteOne({ clientId: A, billNo: 2 });
await openBackup("Sri Murugan Engineering");
await page.getByRole("radio", { name: "Import" }).click();
await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(file);
await page.getByText("smew-backup").first().waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Import", exact: true }).click();
await page.getByText(/added/).last().waitFor({ timeout: 10000 });
const after = await dialogText();
ok("admin: import adds only the missing bill and reports what was already there", /Bills and challans: 1 added, 1 already here/.test(after) && /Expenses: 0 added, 1 already here/.test(after), after.slice(-260));
ok("admin: the restored bill is back in the company", (await fakeDb.collection("engbills").find({ clientId: A }).toArray()).length === 2);
await page.keyboard.press("Escape");

// ---- A file that isn't a backup is refused before anything is sent ----
const junk = join(dir, "notes.json");
writeFileSync(junk, JSON.stringify({ hello: "world" }));
await openBackup("Velu Engineering");
await page.getByRole("radio", { name: "Import" }).click();
await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(junk);
await page.waitForTimeout(400);
ok("admin: a file that isn't a backup shows an error and Import stays off", /not a company backup/.test(await dialogText()) && await page.getByRole("button", { name: "Import", exact: true }).isDisabled());
await page.keyboard.press("Escape");

// ---- Another company type: warned, and bills are refused by the server ----
await openBackup("Kannan Tyres");
await page.getByRole("radio", { name: "Import" }).click();
await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(file);
await page.getByText("smew-backup").first().waitFor({ timeout: 10000 });
ok("admin: importing an engineering backup into a tyre company warns first", /from an engineering company and Kannan Tyres is tyre/.test(await dialogText()));
ok("admin: … with Bills and Settings unticked and locked", await page.getByLabel("Bills and challans").isDisabled() && !(await page.getByLabel("Bills and challans").isChecked())
  && await page.getByLabel("Settings and bill numbering").isDisabled() && await page.getByLabel("Expenses").isChecked());
await page.getByRole("button", { name: "Import", exact: true }).click();
await page.getByText(/Expenses: 0 added/).waitFor({ timeout: 10000 });
ok("admin: … the import runs for Expenses only, and no bill reaches the tyre company", /Expenses: 0 added, 1 skipped \(still in another company\)/.test(await dialogText()) && !/Bills and challans:/.test(await dialogText())
  && (await fakeDb.collection("engbills").find({ clientId: T }).toArray()).length === 0, (await dialogText()).slice(-200));

ok("admin: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
