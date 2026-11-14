import { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { findSuperAdmin, verifyPassword, createClientAdmin, resetClientAdminPassword } from "../dao/user.dao.js";
import {
  findClientByCode,
  getClientById,
  createClient,
  listClients,
  updateClient,
  offboardClient,
  exportClientData,
  normalizeCode,
  normalizeBusinessType,
  BUSINESS_TYPES,
  CODE_REGEX,
} from "../dao/client.dao.js";
import { seedSettingsForClient, peekSettings } from "../dao/settings.dao.js";
import { backupSummary, exportBackup, importBackup } from "../dao/backup.dao.js";
import { logAudit, listAudit } from "../dao/audit.dao.js";
import { loginLimiter, accountLockout, recordFailure, recordSuccess } from "../middleware/rateLimit.js";
import { parsePaging } from "../utils/sanitize.js";
import {
  getAccount, saveAccount, removeAccount, maskedAccount, accountContext, listEnabledAccounts, usage as whatsappUsage, istMonthOf,
} from "../dao/whatsapp.dao.js";
import { getProvider } from "../services/whatsapp/providers/index.js";
import { DOC_TEMPLATES, TEMPLATE_NAMES, samplePdf, templateDefs } from "../services/whatsapp/templates.js";

const router = Router();

// --- Super-admin login (open) ----------------------------------------------
router.post("/login", loginLimiter, accountLockout, async (req, res, next) => {
  try {
    const { userId, password } = req.body || {};
    if (!userId || !password) {
      return res.status(400).json({ success: false, message: "User ID and password are required" });
    }
    const user = await findSuperAdmin(userId);
    const valid = user && (await verifyPassword(user, password));
    if (!valid) {
      recordFailure(req);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    recordSuccess(req);
    const token = jwt.sign(
      { sub: user._id.toString(), userId: user.userId, name: user.name, role: "superadmin" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );
    res.json({
      success: true,
      token,
      user: { userId: user.userId, name: user.name, role: "superadmin", mustChangePassword: !!user.mustChangePassword },
    });
  } catch (error) {
    next(error);
  }
});

// --- Everything below requires a super-admin token --------------------------
router.use(authenticate, requireSuperAdmin);

router.get("/clients", async (req, res, next) => {
  try {
    const [rows, enabled] = await Promise.all([listClients(), listEnabledAccounts()]);
    const on = new Set(enabled.map((a) => String(a.clientId)));
    const clients = rows.map((c) => ({ ...c, whatsappEnabled: on.has(String(c._id)) }));
    res.json({ success: true, clients });
  } catch (error) {
    next(error);
  }
});

function vErr(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

// Validates + provisions one client (client doc → settings → admin), with
// rollback so a partial failure never leaves a ghost. Throws (with .statusCode)
// on validation/duplicate. Shared by the single create and the Excel import.
async function provisionClient(actor, { name, code, adminUserId, adminPassword, businessType }) {
  const nm = String(name || "").trim();
  const normCode = normalizeCode(code);
  const uid = String(adminUserId || "").trim();
  const pwd = String(adminPassword || "");
  // Absent/unknown values fall back to "radiator", but an explicit wrong value
  // is rejected so a typo in an import sheet can't silently mis-type a tenant.
  if (businessType != null && businessType !== "" && !BUSINESS_TYPES.includes(businessType)) {
    throw vErr(`businessType must be one of: ${BUSINESS_TYPES.join(", ")}`);
  }
  const btype = normalizeBusinessType(businessType);

  if (!nm) throw vErr("Business name is required");
  if (!CODE_REGEX.test(normCode)) throw vErr("Code must be 2-40 chars: lowercase letters, numbers, hyphens");
  if (!uid) throw vErr("Admin user ID is required");
  if (pwd.length < 6) throw vErr("Admin password must be at least 6 characters");
  if (await findClientByCode(normCode)) { const e = new Error("That business code is already taken"); e.statusCode = 409; throw e; }

  const client = await createClient({ name: nm, code: normCode, adminUserId: uid, businessType: btype });
  try {
    await seedSettingsForClient(client._id, client.name, client.businessType);
    await createClientAdmin({ clientId: client._id, userId: uid, password: pwd, name: nm });
  } catch (provisionErr) {
    try { await offboardClient(client._id); } catch (e) { console.error("Provisioning rollback failed for", client.code, e.message); }
    throw provisionErr;
  }
  await logAudit({
    action: "client.create",
    clientId: client._id, clientCode: client.code,
    actorUserId: actor.userId, actorRole: actor.role,
    details: { name: nm, adminUserId: uid, businessType: client.businessType },
  });
  return { client, adminUserId: uid, tempPassword: pwd };
}

router.post("/clients", async (req, res, next) => {
  try {
    const { client, adminUserId, tempPassword } = await provisionClient(req.user, req.body || {});
    res.status(201).json({
      success: true,
      message: "Client created ✅",
      client: { _id: client._id, name: client.name, code: client.code, businessType: client.businessType, status: client.status },
      handover: {
        loginUrl: `/t/${client.code}/login`,
        code: client.code,
        adminUserId,
        tempPassword,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Bulk-create clients from a parsed spreadsheet. Body: { clients: [{ name, code,
// adminUserId, adminPassword }] }. Per-row result so partial imports are clear.
router.post("/clients/import", async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.clients) ? req.body.clients : [];
    if (!list.length) return res.status(400).json({ success: false, message: "No client rows provided" });
    if (list.length > 500) return res.status(400).json({ success: false, message: "Too many rows (max 500 per import)" });

    const results = [];
    for (const row of list) {
      try {
        const { client } = await provisionClient(req.user, row);
        results.push({ name: client.name, code: client.code, status: "created" });
      } catch (e) {
        results.push({
          name: String(row?.name || "").trim() || "(unnamed)",
          code: normalizeCode(row?.code) || "(no code)",
          status: e.statusCode === 409 ? "skipped" : "error",
          message: e.message,
        });
      }
    }
    const created = results.filter((r) => r.status === "created").length;
    res.json({ success: true, created, total: list.length, results });
  } catch (error) {
    next(error);
  }
});

router.patch("/clients/:id", async (req, res, next) => {
  try {
    const { name, status } = req.body || {};
    if (status && status !== "active" && status !== "suspended") {
      return res.status(400).json({ success: false, message: "status must be 'active' or 'suspended'" });
    }
    const existing = await getClientById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Client not found" });

    const updated = await updateClient(req.params.id, { name, status });

    const action =
      status && status !== existing.status
        ? (status === "suspended" ? "client.suspend" : "client.reactivate")
        : "client.rename";
    await logAudit({
      action,
      clientId: existing._id, clientCode: existing.code,
      actorUserId: req.user.userId, actorRole: req.user.role,
      details: { name: name ?? existing.name, status: status ?? existing.status },
    });

    res.json({ success: true, message: "Client updated ✅", client: updated });
  } catch (error) {
    next(error);
  }
});

// Reset a client's admin password (re-arms the forced first-login change).
router.post("/clients/:id/reset-password", async (req, res, next) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });

    await resetClientAdminPassword(client._id, client.adminUserId, newPassword);
    await logAudit({
      action: "client.reset_password",
      clientId: client._id, clientCode: client.code,
      actorUserId: req.user.userId, actorRole: req.user.role,
      details: { adminUserId: client.adminUserId },
    });

    res.json({
      success: true,
      message: "Password reset ✅",
      handover: {
        loginUrl: `/t/${client.code}/login`,
        code: client.code,
        adminUserId: client.adminUserId,
        tempPassword: newPassword,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Full data export for a client (used before delete, or on demand).
router.get("/clients/:id/export", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const data = await exportClientData(client._id);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

// Backup & restore: record counts per section, a backup file of the chosen sections, and an add-only import.
router.get("/clients/:id/backup/summary", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    res.json({ success: true, sections: await backupSummary(client._id) });
  } catch (error) {
    next(error);
  }
});

router.get("/clients/:id/backup", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const backup = await exportBackup(client._id, client, req.query.sections);
    await logAudit({
      action: "client.backup.export",
      clientId: client._id, clientCode: client.code,
      actorUserId: req.user.userId, actorRole: req.user.role,
      details: { sections: backup.sections },
    });
    res.json({ success: true, backup });
  } catch (error) {
    next(error);
  }
});

router.post("/clients/:id/backup/import", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const { backup, sections } = req.body || {};
    const results = await importBackup(client._id, client, backup, sections);
    await logAudit({
      action: "client.backup.import",
      clientId: client._id, clientCode: client.code,
      actorUserId: req.user.userId, actorRole: req.user.role,
      details: { from: backup?.company?.code || "", sections: Object.keys(results), results },
    });
    const added = Object.values(results).reduce((n, r) => n + r.added, 0);
    res.json({ success: true, message: `${added} record${added === 1 ? "" : "s"} added ✅`, results });
  } catch (error) {
    next(error);
  }
});

// Read-only view of a single client: provisioning meta + its full settings
// (what the super-admin set up at creation plus what the client configured).
router.get("/clients/:id/settings", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const settings = await peekSettings(client._id);
    res.json({
      success: true,
      client: {
        id: String(client._id),
        name: client.name,
        code: client.code,
        businessType: client.businessType || "radiator",
        status: client.status,
        adminUserId: client.adminUserId,
        lastLoginAt: client.lastLoginAt || null,
        createdAt: client.createdAt || null,
        updatedAt: client.updatedAt || null,
      },
      settings: settings || null,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/clients/:id", async (req, res, next) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const counts = await offboardClient(client._id);
    await logAudit({
      action: "client.delete",
      clientId: client._id, clientCode: client.code,
      actorUserId: req.user.userId, actorRole: req.user.role,
      details: { name: client.name, counts },
    });
    res.json({ success: true, message: "Client and all data deleted ✅", counts });
  } catch (error) {
    next(error);
  }
});

// --- WhatsApp (per-client account; secrets are write-only) --------------------

const waAudit = (req, client, action, details = {}) =>
  logAudit({ action, clientId: client._id, clientCode: client.code, actorUserId: req.user.userId, actorRole: req.user.role, details });

async function waClient(req, res) {
  const client = await getClientById(req.params.id);
  if (!client) res.status(404).json({ success: false, message: "Client not found" });
  return client;
}

router.get("/clients/:id/whatsapp", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    res.json({ success: true, account: maskedAccount(await getAccount(client._id)) });
  } catch (error) {
    next(error);
  }
});

router.put("/clients/:id/whatsapp", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    const b = req.body || {};
    const provider = String(b.provider || "meta");
    getProvider(provider); // unknown provider -> 400
    const numberType = b.numberType === "existing" ? "existing" : "new";
    const enabled = b.enabled === true;
    const existing = await getAccount(client._id);
    const phoneNumberId = String(b.phoneNumberId ?? existing?.phoneNumberId ?? "").trim();
    const wabaId = String(b.wabaId ?? existing?.wabaId ?? "").trim();
    // Optional: the Meta app's id, needed only to upload the sample PDF that document templates are approved with.
    const appId = String(b.appId ?? existing?.appId ?? "").trim();
    const accessToken = String(b.accessToken || "").trim();
    const appSecret = String(b.appSecret || "").trim();
    if (b.enabled !== undefined && typeof b.enabled !== "boolean") throw vErr("enabled must be true or false");
    if ((phoneNumberId && !/^\d{5,30}$/.test(phoneNumberId)) || (wabaId && !/^\d{5,30}$/.test(wabaId)) || (appId && !/^\d{5,30}$/.test(appId))) {
      throw vErr("Phone number ID, WhatsApp business account ID and App ID are numbers");
    }
    const hasToken = !!(accessToken || existing?.secretsEnc?.token);
    const hasSecret = !!(appSecret || existing?.secretsEnc?.appSecret);
    if (enabled) {
      const missing = [!phoneNumberId && "Phone number ID", !wabaId && "WhatsApp business account ID", !hasToken && "Access token", !hasSecret && "App secret"].filter(Boolean);
      if (missing.length) throw vErr(`${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required to enable WhatsApp`);
    }
    const changed = !existing || phoneNumberId !== existing.phoneNumberId || wabaId !== existing.wabaId || !!accessToken || !!appSecret;

    // A live check against the provider first: nothing is saved unless it passes.
    let identity = {};
    if ((enabled || changed) && phoneNumberId && hasToken) {
      const probe = await saveProbeContext(existing, { phoneNumberId, wabaId, accessToken, appSecret });
      identity = await getProvider(provider).testConnection(probe);
    }

    const wasEnabled = !!existing?.enabled;
    const wabaChanged = existing && existing.wabaId !== wabaId;
    const account = await saveAccount(client._id, {
      enabled, provider, numberType, phoneNumberId, wabaId, appId, accessToken, appSecret,
      ...(identity.displayPhone !== undefined ? { displayPhone: identity.displayPhone, verifiedName: identity.verifiedName } : {}),
      ...(enabled && !wasEnabled ? { enabledAt: new Date(), enabledBy: req.user.userId } : {}),
      ...(wabaChanged ? { templates: {} } : {}),
    });
    const action = enabled && !wasEnabled ? "whatsapp.enable" : !enabled && wasEnabled ? "whatsapp.disable" : "whatsapp.account";
    await waAudit(req, client, action, { provider, numberType, phoneNumberId, wabaId });
    res.json({ success: true, message: enabled ? "WhatsApp enabled ✅" : "WhatsApp details saved", account: maskedAccount(account) });
  } catch (error) {
    next(error);
  }
});

// Context for a live test: what was just typed, falling back to what is stored.
async function saveProbeContext(existing, { phoneNumberId, wabaId, accessToken, appSecret }) {
  const stored = existing?.secretsEnc ? accountContext(existing) : {};
  return { phoneNumberId, wabaId, token: accessToken || stored.token, appSecret: appSecret || stored.appSecret };
}

router.delete("/clients/:id/whatsapp", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    await removeAccount(client._id);
    await waAudit(req, client, "whatsapp.account", { removed: true });
    res.json({ success: true, message: "WhatsApp details removed" });
  } catch (error) {
    next(error);
  }
});

router.post("/clients/:id/whatsapp/test", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    const account = await getAccount(client._id);
    if (!account?.phoneNumberId || !account.secretsEnc?.token) throw vErr("Save the WhatsApp details first");
    const { displayPhone, verifiedName } = await getProvider(account.provider || "meta").testConnection(accountContext(account));
    await saveAccount(client._id, { displayPhone, verifiedName });
    res.json({ success: true, displayPhone, verifiedName });
  } catch (error) {
    next(error);
  }
});

// Creates the templates the provider doesn't have yet, then syncs every template's approval status.
router.post("/clients/:id/whatsapp/templates", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    const account = await getAccount(client._id);
    if (!account?.wabaId || !account.secretsEnc?.token) throw vErr("Save the WhatsApp details first");
    const p = getProvider(account.provider || "meta");
    const ctx = accountContext(account);
    const have = new Set((await p.listTemplates(ctx)).map((t) => t.name));
    const problems = {};
    // Document templates are approved against a sample PDF: upload one through the app when they still need creating.
    let sampleHandle = process.env.WHATSAPP_SAMPLE_DOC_HANDLE || "";
    if (!sampleHandle && DOC_TEMPLATES.some((n) => !have.has(n))) {
      if (!ctx.appId) {
        for (const n of DOC_TEMPLATES) if (!have.has(n)) problems[n] = "Add the App ID (Meta app › App settings › Basic) so a sample PDF can be uploaded for approval";
      } else {
        try { sampleHandle = await p.uploadSampleHandle(ctx, samplePdf()); } catch (e) { for (const n of DOC_TEMPLATES) if (!have.has(n)) problems[n] = e.message; }
      }
    }
    const defs = templateDefs(sampleHandle);
    for (const name of TEMPLATE_NAMES) {
      if (have.has(name) || problems[name]) continue;
      try { await p.createTemplate(ctx, defs[name]); } catch (e) { problems[name] = e.message; }
    }
    const templates = {};
    for (const t of await p.listTemplates(ctx)) if (TEMPLATE_NAMES.includes(t.name)) templates[t.name] = { status: t.status, reason: t.reason || "" };
    for (const [name, reason] of Object.entries(problems)) if (!templates[name]) templates[name] = { status: "MISSING", reason };
    const saved = await saveAccount(client._id, { templates });
    await waAudit(req, client, "whatsapp.templates", { created: TEMPLATE_NAMES.filter((n) => !have.has(n) && !problems[n]) });
    res.json({ success: true, templates: maskedAccount(saved).templates });
  } catch (error) {
    next(error);
  }
});

router.get("/clients/:id/whatsapp/usage", async (req, res, next) => {
  try {
    const client = await waClient(req, res);
    if (!client) return;
    const month = String(req.query.month || istMonthOf());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw vErr("month must be YYYY-MM");
    res.json({ success: true, ...(await whatsappUsage(client._id, month)) });
  } catch (error) {
    next(error);
  }
});

router.get("/audit", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, { defaultLimit: 20, maxLimit: 100 });
    const { clientCode = "", action = "", from = "", to = "", search = "" } = req.query;
    const data = await listAudit({ page, limit, clientCode, action, from, to, search: String(search), sortQuery: req.query });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

export default router;
