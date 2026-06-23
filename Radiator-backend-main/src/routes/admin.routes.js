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
  CODE_REGEX,
} from "../dao/client.dao.js";
import { seedSettingsForClient, peekSettings } from "../dao/settings.dao.js";
import { logAudit, listAudit } from "../dao/audit.dao.js";
import { loginLimiter, accountLockout, recordFailure, recordSuccess } from "../middleware/rateLimit.js";
import { parsePaging } from "../utils/sanitize.js";

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
    const clients = await listClients();
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
async function provisionClient(actor, { name, code, adminUserId, adminPassword }) {
  const nm = String(name || "").trim();
  const normCode = normalizeCode(code);
  const uid = String(adminUserId || "").trim();
  const pwd = String(adminPassword || "");

  if (!nm) throw vErr("Business name is required");
  if (!CODE_REGEX.test(normCode)) throw vErr("Code must be 2-40 chars: lowercase letters, numbers, hyphens");
  if (!uid) throw vErr("Admin user ID is required");
  if (pwd.length < 6) throw vErr("Admin password must be at least 6 characters");
  if (await findClientByCode(normCode)) { const e = new Error("That business code is already taken"); e.statusCode = 409; throw e; }

  const client = await createClient({ name: nm, code: normCode, adminUserId: uid });
  try {
    await seedSettingsForClient(client._id, client.name);
    await createClientAdmin({ clientId: client._id, userId: uid, password: pwd, name: nm });
  } catch (provisionErr) {
    try { await offboardClient(client._id); } catch (e) { console.error("Provisioning rollback failed for", client.code, e.message); }
    throw provisionErr;
  }
  await logAudit({
    action: "client.create",
    clientId: client._id, clientCode: client.code,
    actorUserId: actor.userId, actorRole: actor.role,
    details: { name: nm, adminUserId: uid },
  });
  return { client, adminUserId: uid, tempPassword: pwd };
}

router.post("/clients", async (req, res, next) => {
  try {
    const { client, adminUserId, tempPassword } = await provisionClient(req.user, req.body || {});
    res.status(201).json({
      success: true,
      message: "Client created ✅",
      client: { _id: client._id, name: client.name, code: client.code, status: client.status },
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

router.get("/audit", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, { defaultLimit: 20, maxLimit: 100 });
    const { clientCode = "", action = "", from = "", to = "" } = req.query;
    const data = await listAudit({ page, limit, clientCode, action, from, to });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

export default router;
