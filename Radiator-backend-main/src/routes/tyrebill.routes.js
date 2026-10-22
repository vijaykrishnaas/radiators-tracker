import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { getClientById } from "../dao/client.dao.js";
import { parsePaging } from "../utils/sanitize.js";
import { auditClient } from "../utils/clientAudit.js";
import {
  createTyreBill,
  updateTyreBill,
  deleteTyreBill,
  recordTyrePayment,
  getTyreBillById,
  getAllTyreBills,
  getAllTyreBillsForExport,
  getTyreAnalytics,
  getAllTyreMechanics,
} from "../dao/tyrebill.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

// Defense-in-depth: this module is for tyre tenants only.
async function requireTyreTenant(req, res, next) {
  try {
    const client = await getClientById(req.user.clientId);
    if (!client || client.businessType !== "tyre") {
      return res.status(403).json({ success: false, message: "This endpoint is only available to tyre-vertical tenants" });
    }
    next();
  } catch (error) {
    next(error);
  }
}
router.use(requireTyreTenant);

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid record id" });
  }
  next();
}

// Same required fields as the automobile bill: date, vehicle number and at least one line.
function validateRecordBody(req, res, next) {
  const { billDate, vehicleNumber, items } = req.body || {};
  const missing = [];
  if (!billDate) missing.push("billDate");
  if (!String(vehicleNumber || "").trim()) missing.push("vehicleNumber");
  if (!Array.isArray(items) || items.length === 0) missing.push("items");
  if (missing.length) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(", ")}` });
  }
  next();
}

function filtersFrom(q) {
  return {
    vehicleNumber: String(q.vehicleNumber || ""),
    customerName: String(q.customerName || ""),
    mechName: String(q.mechanicName || ""),
    fromDate: q.fromDate || "",
    toDate: q.toDate || "",
    status: String(q.status || ""),
    paymentType: String(q.paymentType || ""),
    brandRef: String(q.brandRef || ""),
    overdue: q.overdue === "1" || q.overdue === "true",
    search: String(q.search || ""),
  };
}

router.get("/analytics", async (req, res, next) => {
  try {
    const data = await getTyreAnalytics(req.user.clientId, { ...filtersFrom(req.query), search: "" });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const tyreBillData = await getAllTyreBillsForExport(req.user.clientId, filtersFrom(req.query), req.query);
    res.json({ success: true, tyreBillData });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const data = await getAllTyreBills(req.user.clientId, filtersFrom(req.query), page, limit, req.query);
    res.json({
      success: true,
      currentPage: data.page,
      totalPages: data.totalPages,
      totalRecords: data.total,
      tyreBillData: data.tyreBillData,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add", validateRecordBody, async (req, res, next) => {
  try {
    const bill = await createTyreBill(req.user.clientId, req.body);
    await auditClient(req, "tyrebill.create", { billNo: bill.billNo, vehicleNumber: bill.vehicleNumber, paymentType: bill.paymentType });
    res.status(201).json({ success: true, message: "Challan saved ✅", id: bill._id });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validId, async (req, res, next) => {
  try {
    const bill = await getTyreBillById(req.user.clientId, req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Not found" });
    res.json(bill);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validId, validateRecordBody, async (req, res, next) => {
  try {
    const updated = await updateTyreBill(req.user.clientId, req.params.id, req.body);
    await auditClient(req, "tyrebill.update", { billNo: updated?.billNo, vehicleNumber: updated?.vehicleNumber });
    res.json({ success: true, message: "Challan updated ✅", tyreBill: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validId, async (req, res, next) => {
  try {
    await deleteTyreBill(req.user.clientId, req.params.id);
    await auditClient(req, "tyrebill.delete", { id: req.params.id });
    res.json({ success: true, message: "Challan deleted ✅" });
  } catch (error) {
    next(error);
  }
});

// Body: { amount, mode, installmentId } for an installment challan; { amount, discount, mode } for full payment.
router.post("/:id/payment", validId, async (req, res, next) => {
  try {
    const { amount = 0, discount = null, mode = "cash", installmentId = null } = req.body || {};
    const updated = await recordTyrePayment(req.user.clientId, req.params.id, { amount, discount, mode, installmentId });
    const row = installmentId ? updated.installments.find((r) => r.id === installmentId) : null;
    await auditClient(req, "tyrebill.payment", {
      billNo: updated?.billNo,
      vehicleNumber: updated?.vehicleNumber,
      amount: Number(amount) || 0,
      discount: Number(discount) || 0,
      mode,
      ...(row ? { installment: row.label } : {}),
    });
    const amt = `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
    const msg = row
      ? `Payment of ${amt} recorded for ${row.label} ✅`
      : Number(discount) > 0
        ? `Recorded ${amt} paid + ₹${Number(discount).toLocaleString("en-IN")} discount ✅`
        : `Payment of ${amt} recorded ✅`;
    res.json({ success: true, message: msg, tyreBill: updated });
  } catch (error) {
    next(error);
  }
});

export default router;

// Tyre mechanic dropdown, mirroring the automobile /auto-mechanic route.
export const tyreMechanicRouter = Router();
tyreMechanicRouter.get("/", authenticate, loadActiveTenant, requireTyreTenant, async (req, res, next) => {
  try {
    res.json({ success: true, mechdata: await getAllTyreMechanics(req.user.clientId) });
  } catch (error) {
    next(error);
  }
});
