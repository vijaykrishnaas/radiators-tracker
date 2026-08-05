import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { getClientById } from "../dao/client.dao.js";
import { parsePaging } from "../utils/sanitize.js";
import { auditClient } from "../utils/clientAudit.js";
import {
  createAutoBill,
  getAllAutoBills,
  getAllAutoBillsForExport,
  getAutoAnalytics,
  getAllAutoMechanics,
  getById,
  updateAutoBill,
  deleteAutoBill,
  recordPayment,
} from "../dao/autobill.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

// Defense-in-depth: this module is for automobile tenants only. A radiator
// tenant's token can never carry an automobile clientId, but this guard makes
// the boundary explicit rather than relying solely on the frontend not linking here.
async function requireAutomobileTenant(req, res, next) {
  try {
    const client = await getClientById(req.user.clientId);
    if (!client || client.businessType !== "automobile") {
      return res.status(403).json({ success: false, message: "This endpoint is only available to automobile-vertical tenants" });
    }
    next();
  } catch (error) {
    next(error);
  }
}
router.use(requireAutomobileTenant);

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid record id" });
  }
  next();
}

function validateRecordBody(req, res, next) {
  const { billDate, vehicleNumber, items } = req.body || {};
  const missing = [];
  if (!billDate) missing.push("billDate");
  if (!vehicleNumber) missing.push("vehicleNumber");
  if (!Array.isArray(items) || items.length === 0) missing.push("items");

  if (missing.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missing.join(", ")}`,
    });
  }
  next();
}

router.get("/analytics", async (req, res, next) => {
  try {
    const { vehicleNumber = "", customerName = "", mechanicName = "", fromDate = "", toDate = "", status = "", partRef = "" } = req.query;
    const data = await getAutoAnalytics(req.user.clientId, { vehicleNumber, customerName, mechName: mechanicName, fromDate, toDate, status, partRef });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const { vehicleNumber = "", customerName = "", mechanicName = "", fromDate = "", toDate = "", status = "", partRef = "" } = req.query;
    const autoBillData = await getAllAutoBillsForExport(req.user.clientId, { vehicleNumber, customerName, mechName: mechanicName, fromDate, toDate, status, partRef });
    res.json({ success: true, autoBillData });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const { vehicleNumber = "", customerName = "", mechanicName = "", fromDate = "", toDate = "", status = "", partRef = "" } = req.query;

    const data = await getAllAutoBills(req.user.clientId, page, limit, vehicleNumber, mechanicName, fromDate, toDate, status, customerName, partRef);

    res.json({
      success: true,
      currentPage: data.page,
      totalPages: data.totalPages,
      totalRecords: data.total,
      autoBillData: data.autoBillData,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add", validateRecordBody, async (req, res, next) => {
  try {
    const result = await createAutoBill(req.user.clientId, req.body);
    await auditClient(req, "autobill.create", { vehicleNumber: req.body?.vehicleNumber, mechanicName: req.body?.mechanicName });
    res.status(201).json({
      success: true,
      message: "Bill saved ✅",
      id: result.insertedId,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validId, async (req, res, next) => {
  try {
    const bill = await getById(req.user.clientId, req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    res.json(bill);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validId, validateRecordBody, async (req, res, next) => {
  try {
    const updated = await updateAutoBill(req.user.clientId, req.params.id, req.body);
    await auditClient(req, "autobill.update", { vehicleNumber: updated?.vehicleNumber });
    res.json({ success: true, message: "Bill updated ✅", autoBill: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validId, async (req, res, next) => {
  try {
    await deleteAutoBill(req.user.clientId, req.params.id);
    await auditClient(req, "autobill.delete", { id: req.params.id });
    res.json({ success: true, message: "Bill deleted ✅" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/payment", validId, async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount) || 0;
    const discount = Math.max(Number(req.body?.discount) || 0, 0);
    if (amount < 0 || (amount <= 0 && discount <= 0)) {
      return res.status(400).json({ success: false, message: "Enter a payment amount and/or a discount" });
    }
    const updated = await recordPayment(req.user.clientId, req.params.id, amount, discount);
    await auditClient(req, "autobill.payment", { vehicleNumber: updated?.vehicleNumber, amount, discount });
    const msg = discount > 0
      ? `Recorded ₹${amount} paid + ₹${discount} discount ✅`
      : `Payment of ₹${amount} recorded ✅`;
    res.json({ success: true, message: msg, autoBill: updated });
  } catch (error) {
    next(error);
  }
});

export default router;

// Automobile mechanic dropdown, mirroring the radiator /mechanic route.
export const autoMechanicRouter = Router();
autoMechanicRouter.get("/", authenticate, loadActiveTenant, requireAutomobileTenant, async (req, res, next) => {
  try {
    const data = await getAllAutoMechanics(req.user.clientId);
    res.json({ success: true, mechdata: data });
  } catch (error) {
    next(error);
  }
});
