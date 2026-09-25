import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { getClientById } from "../dao/client.dao.js";
import { getSettings } from "../dao/settings.dao.js";
import { parsePaging } from "../utils/sanitize.js";
import { auditClient } from "../utils/clientAudit.js";
import {
  createEngBill,
  updateEngBill,
  deleteEngBill,
  recordEngPayment,
  getEngBillById,
  listEngBills,
  listEngBillsForExport,
  lookupVehicle,
  getEngAnalytics,
} from "../dao/engbill.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

async function requireEngineeringTenant(req, res, next) {
  try {
    const client = await getClientById(req.user.clientId);
    if (!client || client.businessType !== "engineering") {
      return res.status(403).json({ success: false, message: "This endpoint is only available to engineering-vertical tenants" });
    }
    next();
  } catch (error) {
    next(error);
  }
}
router.use(requireEngineeringTenant);

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid record id" });
  }
  next();
}

function filtersFrom(q) {
  const { vehicleNo = "", mechanic = "", fromDate = "", toDate = "", status = "", serviceType = "", bsModel = "" } = q;
  return { vehicleNo, mechanic, fromDate, toDate, status, serviceType, bsModel };
}

router.get("/analytics", async (req, res, next) => {
  try {
    const data = await getEngAnalytics(req.user.clientId, filtersFrom(req.query));
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const bills = await listEngBillsForExport(req.user.clientId, filtersFrom(req.query));
    res.json({ success: true, bills });
  } catch (error) {
    next(error);
  }
});

router.get("/lookup-vehicle", async (req, res, next) => {
  try {
    const match = await lookupVehicle(req.user.clientId, req.query.vehicleNo);
    res.json({ success: true, match });
  } catch (error) {
    next(error);
  }
});

router.get("/mechanics", async (req, res, next) => {
  try {
    const settings = await getSettings(req.user.clientId);
    const names = (Array.isArray(settings?.mechanics) ? settings.mechanics : []).filter(Boolean);
    res.json({ success: true, mechanics: [...new Set(names)].sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const data = await listEngBills(req.user.clientId, filtersFrom(req.query), page, limit);
    res.json({
      success: true,
      currentPage: data.page,
      totalPages: data.totalPages,
      totalRecords: data.total,
      bills: data.bills,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const bill = await createEngBill(req.user.clientId, req.body || {});
    await auditClient(req, "engbill.create", { billNo: bill.billNo, vehicleNo: bill.vehicleNo, netTotal: bill.netTotal });
    res.status(201).json({ success: true, message: "Service saved ✅", bill });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validId, async (req, res, next) => {
  try {
    const bill = await getEngBillById(req.user.clientId, req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, bill });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validId, async (req, res, next) => {
  try {
    const bill = await updateEngBill(req.user.clientId, req.params.id, req.body || {});
    await auditClient(req, "engbill.update", { billNo: bill.billNo, vehicleNo: bill.vehicleNo, netTotal: bill.netTotal });
    res.json({ success: true, message: "Service updated ✅", bill });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validId, async (req, res, next) => {
  try {
    await deleteEngBill(req.user.clientId, req.params.id);
    await auditClient(req, "engbill.delete", { id: req.params.id });
    res.json({ success: true, message: "Bill deleted ✅" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/payment", validId, async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount) || 0;
    const discount = req.body?.discount === "" || req.body?.discount == null ? null : req.body.discount;
    if (amount < 0 || (amount <= 0 && discount == null)) {
      return res.status(400).json({ success: false, message: "Enter a payment amount and/or a discount" });
    }
    const bill = await recordEngPayment(req.user.clientId, req.params.id, { amount, discount, mode: req.body?.mode });
    await auditClient(req, "engbill.payment", { billNo: bill.billNo, amount, discount });
    res.json({ success: true, message: "Payment recorded ✅", bill });
  } catch (error) {
    next(error);
  }
});

export default router;
