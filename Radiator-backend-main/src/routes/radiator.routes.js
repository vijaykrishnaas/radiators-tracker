import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { parsePaging } from "../utils/sanitize.js";
import {
  createRadiator,
  getAllRadiators,
  getAllRadiatorsForExport,
  getRadiatorAnalytics,
  getAllmechanics,
  getById,
  updateRadiator,
  deleteRadiator,
  recordPayment,
} from "../dao/radiator.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid record id" });
  }
  next();
}

function validateRecordBody(req, res, next) {
  const { billDate, truckNumber, transportName, mechanicName, serviceInfo } = req.body || {};
  const missing = [];
  if (!billDate) missing.push("billDate");
  if (!truckNumber) missing.push("truckNumber");
  if (!transportName) missing.push("transportName");
  if (!mechanicName) missing.push("mechanicName");
  if (!Array.isArray(serviceInfo) || serviceInfo.length === 0) missing.push("serviceInfo");

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
    const { truckNumber = "", mechanicName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = req.query;
    const data = await getRadiatorAnalytics(req.user.clientId, { truckNumber, mechName: mechanicName, fromDate, toDate, status, radiatorType, serviceType });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const { truckNumber = "", mechanicName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = req.query;
    const radiatorData = await getAllRadiatorsForExport(req.user.clientId, { truckNumber, mechName: mechanicName, fromDate, toDate, status, radiatorType, serviceType });
    res.json({ success: true, radiatorData });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const { truckNumber = "", mechanicName = "", fromDate = "", toDate = "", status = "", radiatorType = "", serviceType = "" } = req.query;

    const data = await getAllRadiators(req.user.clientId, page, limit, truckNumber, mechanicName, fromDate, toDate, status, radiatorType, serviceType);

    res.json({
      success: true,
      currentPage: data.page,
      totalPages: data.totalPages,
      totalRecords: data.total,
      radiatorData: data.radiatorData,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add", validateRecordBody, async (req, res, next) => {
  try {
    const result = await createRadiator(req.user.clientId, req.body);
    res.status(201).json({
      success: true,
      message: "Radiator entry saved ✅",
      id: result.insertedId,
      billNo: result.billNo,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validId, async (req, res, next) => {
  try {
    const radiator = await getById(req.user.clientId, req.params.id);
    if (!radiator) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    res.json(radiator);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validId, validateRecordBody, async (req, res, next) => {
  try {
    const updated = await updateRadiator(req.user.clientId, req.params.id, req.body);
    res.json({ success: true, message: "Radiator updated ✅", radiator: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validId, async (req, res, next) => {
  try {
    await deleteRadiator(req.user.clientId, req.params.id);
    res.json({ success: true, message: "Radiator deleted ✅" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/payment", validId, async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "A positive payment amount is required" });
    }
    const updated = await recordPayment(req.user.clientId, req.params.id, amount);
    res.json({
      success: true,
      message: `Payment of ₹${amount} recorded ✅`,
      radiator: updated,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

// Mechanic list lives on a separate path for backward compatibility (GET /mechanic)
export const mechanicRouter = Router();
mechanicRouter.get("/", authenticate, loadActiveTenant, async (req, res, next) => {
  try {
    const data = await getAllmechanics(req.user.clientId);
    res.json({ success: true, mechdata: data });
  } catch (error) {
    next(error);
  }
});
