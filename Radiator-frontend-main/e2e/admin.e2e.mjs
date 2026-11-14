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
const waStore = {};
const waPuts = [];
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
  m = /^\/admin\/clients\/([a-f0-9]{24})\/whatsapp(\/test|\/templates|\/usage)?$/.exec(p);
  if (m) {
    const id = m[1], sub = m[2], acc = waStore[id];
    const view = (a) => a && ({ enabled: a.enabled, provider: "meta", numberType: a.numberType, phoneNumberId: a.phoneNumberId, wabaId: a.wabaId, displayPhone: "+91 98765 43210", verifiedName: "Velu Engineering",
      hasToken: true, hasAppSecret: true, tokenMasked: "EAAB••••" + a.token.slice(-4), templates: a.templates, enabledAt: a.enabledAt });
    if (sub === "/usage") return json({ success: true, month: url.searchParams.get("month"), byKind: { bill: { sent: 12, failed: 1 }, receipt: { sent: 7, failed: 0 }, summary: { sent: 3, failed: 2 } }, total: { sent: 22, failed: 3 } });
    if (sub === "/test") return acc ? json({ success: true, displayPhone: "+91 98765 43210", verifiedName: "Velu Engineering" }) : json({ success: false, message: "No details saved" }, 400);
    if (sub === "/templates") { if (acc) acc.templates.payment_receipt_document = { status: "PENDING" }; return json({ success: true, templates: acc?.templates || {} }); }
    if (req.method() === "GET") return json({ success: true, account: view(acc) || null });
    if (req.method() === "DELETE") { delete waStore[id]; byId(id).whatsappEnabled = false; return json({ success: true, message: "Removed" }); }
    if (req.method() === "PUT") {
      const b = req.postDataJSON();
      waPuts.push(b);
      if (b.enabled && b.phoneNumberId === "BAD") return json({ success: false, message: "Invalid OAuth access token (code 190)" }, 400);
      const prev = waStore[id];
      waStore[id] = { ...(prev || {}), enabled: b.enabled, numberType: b.numberType, phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, token: b.accessToken || prev?.token || "", enabledAt: prev?.enabledAt || (b.enabled ? now : null),
        templates: prev?.templates || { bill_document: { status: "APPROVED" }, payment_receipt: { status: "PENDING" }, owner_daily_summary: { status: "REJECTED", reason: "Variable at the start" }, payment_receipt_document: { status: "MISSING" } } };
      byId(id).whatsappEnabled = !!b.enabled;
      return json({ success: true, message: "Saved", account: view(waStore[id]) });
    }
  }
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
ok("admin: import adds only the missing bill and reports what was already there", /Bills and challans: 1 added, 1 already here Stock/.test(after) && /Expenses: 0 added, 1 already here/.test(after), after.slice(-260));
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

// ---- Staging → production: the file goes into another company that already has its own bill 1 ----
// (Production is a separate database: the staging company's records aren't in it.)
for (const c of ["engbills", "expenses", "employees"]) await fakeDb.collection(c).deleteMany({ clientId: A });
await fakeDb.collection("engbills").insertOne({ clientId: B, billNo: 1, billDate: new Date("2026-11-10T00:00:00Z"), vehicleNo: "PROD1", netTotal: 50 });
await openBackup("Velu Engineering");
await page.getByRole("radio", { name: "Import" }).click();
await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(file);
await page.getByText("smew-backup").first().waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Import", exact: true }).click();
await page.getByText(/Bills and challans: 2 added/).waitFor({ timeout: 10000 });
const moved = (await fakeDb.collection("engbills").find({ clientId: B }).toArray()).map((b) => [b.billNo, b.vehicleNo, b.importedBillNo ?? null]).sort((x, y) => x[0] - y[0]);
ok("admin: staging bills moved into production get numbers after production's own", JSON.stringify(moved) === JSON.stringify([[1, "PROD1", null], [2, "TN52J2622", 1], [3, "TN01AB1234", 2]]), JSON.stringify(moved));
ok("admin: … and the dialog says they were renumbered", /given new numbers after this company's last bill/.test(await dialogText()));
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


// ---- WhatsApp: Super admin › Clients › ⋮ › WhatsApp (admin endpoints mocked, in-memory account) ----
const SECRET_TOKEN = "EAABsecretTOKEN123456789";
const openWa = async (name) => {
  await page.goto(BASE + "/admin/clients");
  await page.getByText(name).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: `Actions for ${name}` }).first().click();
  await page.getByRole("menuitem", { name: "WhatsApp" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Enable WhatsApp").waitFor();
};
await openWa("Velu Engineering");
ok("admin: the row menu opens the WhatsApp dialog with the client's name", /WhatsApp: Velu Engineering/.test(await dialogText()));
ok("admin: WhatsApp starts off with no form", !(await page.getByLabel("Enable WhatsApp").isChecked()) && (await page.locator("#wa-phone-id").count()) === 0);
await page.getByLabel("Enable WhatsApp").check();
ok("admin: Enable reveals provider, number type and the four detail fields", await page.locator("#wa-phone-id").isVisible() && await page.locator("#wa-waba-id").isVisible()
  && await page.locator("#wa-token").isVisible() && await page.locator("#wa-secret").isVisible() && /Meta WhatsApp Cloud API/.test(await dialogText()) && /Existing number \(coexistence\)/.test(await dialogText()));
await page.getByRole("button", { name: "Enable", exact: true }).click();
ok("admin: submitting empty shows field errors and sends nothing", /Enter the Phone number ID/.test(await dialogText()) && /Enter the WhatsApp Business Account ID/.test(await dialogText())
  && /Enter the access token/.test(await dialogText()) && /Enter the app secret/.test(await dialogText()) && waPuts.length === 0);

// Meta rejects the details: the message shows inline and the client stays disabled.
await page.locator("#wa-phone-id").fill("BAD");
await page.locator("#wa-waba-id").fill("2222");
await page.locator("#wa-token").fill(SECRET_TOKEN);
await page.locator("#wa-secret").fill("appsecret999");
await page.getByRole("button", { name: "Enable", exact: true }).click();
await page.getByText("Invalid OAuth access token (code 190)").waitFor({ timeout: 10000 });
ok("admin: a 400 from Meta shows its message inline in the dialog", /Invalid OAuth access token \(code 190\)/.test(await dialogText()) && waPuts.length === 1);
ok("admin: … and the client is still disabled", !waStore[String(B)] && !byId(String(B)).whatsappEnabled);
await page.keyboard.press("Escape");
await page.getByText("Velu Engineering").first().waitFor();
ok("admin: … with no WhatsApp badge in the list", (await page.locator(".badge", { hasText: "WhatsApp" }).count()) === 0);

// A good enable.
await openWa("Velu Engineering");
await page.getByLabel("Enable WhatsApp").check();
await page.locator("#wa-phone-id").fill("1111");
await page.locator("#wa-waba-id").fill("2222");
await page.locator("#wa-token").fill(SECRET_TOKEN);
await page.locator("#wa-secret").fill("appsecret999");
await page.getByRole("button", { name: "Enable", exact: true }).click();
await page.getByText("Verified name").first().waitFor({ timeout: 10000 });
const putBody = waPuts[waPuts.length - 1];
ok("admin: Enable sends all details once", putBody.enabled === true && putBody.phoneNumberId === "1111" && putBody.wabaId === "2222" && putBody.accessToken === SECRET_TOKEN && putBody.numberType === "new");
ok("admin: status shows number, verified name and per-template badges", /\+91 98765 43210/.test(await dialogText()) && /Velu Engineering/.test(await dialogText())
  && /Bill \/ challan APPROVED/.test(await dialogText()) && /Payment receipt PENDING/.test(await dialogText()) && /MISSING/.test(await dialogText()) && /REJECTED/.test(await dialogText()) && /Variable at the start/.test(await dialogText())
  && /A message type sends only after its template is approved/.test(await dialogText()));
ok("admin: usage counts render by kind with a total", /Bills\s*12 sent, 1 failed/.test(await dialogText()) && /Receipts\s*7 sent, 0 failed/.test(await dialogText()) && /Total\s*22 sent, 3 failed/.test(await dialogText()), (await dialogText()).slice(-300));
const html = await page.getByRole("dialog").innerHTML();
ok("admin: the token is never in the DOM, only the masked form", !html.includes(SECRET_TOKEN) && (await page.locator("#wa-token").inputValue()) === "" && (await page.locator("#wa-token").getAttribute("placeholder")) === "EAAB••••6789"
  && /Leave blank to keep the saved token/.test(await dialogText()));
await page.getByRole("button", { name: "Test connection" }).click();
await page.getByText(/Connected: \+91 98765 43210/).waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Create / sync templates" }).click();
await page.getByText("Templates synced").waitFor({ timeout: 10000 });
await page.keyboard.press("Escape");
await page.getByText("Velu Engineering").first().waitFor();
ok("admin: the client list shows a WhatsApp badge once enabled", (await page.locator(".badge", { hasText: "WhatsApp" }).count()) >= 1);

// Disable keeps the details.
await openWa("Velu Engineering");
await page.getByRole("button", { name: "Disable", exact: true }).click();
await page.getByText("Disabled", { exact: true }).first().waitFor({ timeout: 10000 });
ok("admin: Disable turns it off but keeps the saved details", waStore[String(B)] && waStore[String(B)].enabled === false && waStore[String(B)].phoneNumberId === "1111" && waStore[String(B)].token === SECRET_TOKEN
  && !(await page.getByLabel("Enable WhatsApp").isChecked()));
await page.keyboard.press("Escape");
await page.getByText("Velu Engineering").first().waitFor();
ok("admin: … and the badge is gone", (await page.locator(".badge", { hasText: "WhatsApp" }).count()) === 0);

// Phone width: no horizontal scroll in the dialog.
await page.setViewportSize({ width: 390, height: 844 });
await openWa("Velu Engineering");
await page.getByLabel("Enable WhatsApp").check();
const overflow = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const els = [d, ...d.querySelectorAll("*")];
  return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, dialog: Math.max(...els.map((e) => e.scrollWidth - e.clientWidth)) };
});
ok("admin: the WhatsApp dialog has no horizontal scroll at 390px", overflow.page <= 0 && overflow.dialog <= 0, JSON.stringify(overflow));
await page.screenshot({ path: join(tmpdir(), "wa-modal-390.png") });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1300, height: 1000 });

ok("admin: no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.join("\n"));
if (results.some((r) => !r.startsWith("PASS"))) process.exit(1);
