import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { getClientById } from "../dao/client.dao.js";
import { parsePaging } from "../utils/sanitize.js";
import { auditClient } from "../utils/clientAudit.js";
import {
  addStockEntry,
  updateStockEntry,
  deleteStockEntry,
  listStockEntries,
  getInventorySummary,
  getPartMovements,
  getStockLevels,
} from "../dao/inventory.dao.js";

const router = Router();
router.use(authenticate, loadActiveTenant);

// Inventory belongs to the automobile vertical (its parts catalog); other tenants get a 403.
router.use(async (req, res, next) => {
  try {
    const client = await getClientById(req.user.clientId);
    if (!client || client.businessType !== "automobile") {
      return res.status(403).json({ success: false, message: "Inventory is only available to automobile tenants" });
    }
    next();
  } catch (error) {
    next(error);
  }
});

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid entry id" });
  next();
}

router.get("/summary", async (req, res, next) => {
  try {
    res.json({ success: true, ...(await getInventorySummary(req.user.clientId)) });
  } catch (error) {
    next(error);
  }
});

// { partRef: inStock } for the bill form's stock warning.
router.get("/levels", async (req, res, next) => {
  try {
    res.json({ success: true, levels: await getStockLevels(req.user.clientId) });
  } catch (error) {
    next(error);
  }
});

router.get("/movements", async (req, res, next) => {
  try {
    const partRef = String(req.query.partRef || "");
    if (!partRef) return res.status(400).json({ success: false, message: "partRef is required" });
    res.json({ success: true, movements: await getPartMovements(req.user.clientId, partRef) });
  } catch (error) {
    next(error);
  }
});

router.get("/entries", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const { partRef = "", search = "", from = "", to = "" } = req.query;
    const data = await listStockEntries(req.user.clientId, { partRef: String(partRef), search: String(search), from, to }, page, limit, req.query);
    res.json({ success: true, currentPage: data.page, totalPages: data.totalPages, totalRecords: data.total, entries: data.entries });
  } catch (error) {
    next(error);
  }
});

router.post("/entries", async (req, res, next) => {
  try {
    const entry = await addStockEntry(req.user.clientId, req.body || {});
    await auditClient(req, "inventory.add", { part: entry.partLabel, qty: entry.qty, buyPrice: entry.buyPrice, supplier: entry.supplier });
    res.status(201).json({ success: true, message: "Stock added ✅", entry });
  } catch (error) {
    next(error);
  }
});

router.put("/entries/:id", validId, async (req, res, next) => {
  try {
    const entry = await updateStockEntry(req.user.clientId, req.params.id, req.body || {});
    await auditClient(req, "inventory.update", { part: entry.partLabel, qty: entry.qty, buyPrice: entry.buyPrice });
    res.json({ success: true, message: "Stock entry updated ✅", entry });
  } catch (error) {
    next(error);
  }
});

router.delete("/entries/:id", validId, async (req, res, next) => {
  try {
    const entry = await deleteStockEntry(req.user.clientId, req.params.id);
    await auditClient(req, "inventory.delete", { part: entry.partLabel, qty: entry.qty });
    res.json({ success: true, message: "Stock entry deleted ✅" });
  } catch (error) {
    next(error);
  }
});

export default router;
