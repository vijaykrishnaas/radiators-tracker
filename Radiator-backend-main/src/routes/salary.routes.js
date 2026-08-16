import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { auditClient } from "../utils/clientAudit.js";
import { markAttendance, getAttendanceForPeriod } from "../dao/attendance.dao.js";
import {
  previewSettlement,
  settlePeriod,
  addAdjustment,
  getSettlementHistory,
  getPayslipData,
  listAdvances,
  recordAdvance,
} from "../dao/salary.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

function validId(paramName) {
  return (req, res, next) => {
    if (!ObjectId.isValid(req.params[paramName])) {
      return res.status(400).json({ success: false, message: `Invalid ${paramName}` });
    }
    next();
  };
}

// ---- Attendance ----

router.get("/attendance", async (req, res, next) => {
  try {
    const { employeeId, from, to } = req.query;
    if (!employeeId || !ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: "Valid employeeId is required" });
    }
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to are required" });
    }
    const days = await getAttendanceForPeriod(req.user.clientId, employeeId, from, to);
    res.json({ success: true, days });
  } catch (error) {
    next(error);
  }
});

router.post("/attendance", async (req, res, next) => {
  try {
    const { employeeId, date, status } = req.body || {};
    if (!employeeId || !ObjectId.isValid(employeeId) || !date || !status) {
      return res.status(400).json({ success: false, message: "employeeId, date, and status are required" });
    }
    await markAttendance(req.user.clientId, employeeId, date, status, req.user.userId || "");
    await auditClient(req, "salary.attendance.mark", { employeeId, date, status });
    res.json({ success: true, message: "Attendance recorded ✅" });
  } catch (error) {
    next(error);
  }
});

// ---- Advances ----

router.get("/advances", async (req, res, next) => {
  try {
    const { employeeId, status = "" } = req.query;
    if (!employeeId || !ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: "Valid employeeId is required" });
    }
    const advances = await listAdvances(req.user.clientId, employeeId, status);
    res.json({ success: true, advances });
  } catch (error) {
    next(error);
  }
});

router.post("/advances", async (req, res, next) => {
  try {
    const { employeeId, date, amount, reason = "" } = req.body || {};
    if (!employeeId || !ObjectId.isValid(employeeId) || !date || !amount) {
      return res.status(400).json({ success: false, message: "employeeId, date, and amount are required" });
    }
    const result = await recordAdvance(req.user.clientId, employeeId, { date, amount, reason });
    await auditClient(req, "salary.advance.record", { employeeId, amount });
    res.status(201).json({ success: true, message: "Advance recorded ✅", id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

// ---- Settlement ----

router.get("/preview", async (req, res, next) => {
  try {
    const { employeeId, periodStart, periodEnd, presentDaysManual } = req.query;
    if (!employeeId || !ObjectId.isValid(employeeId) || !periodStart || !periodEnd) {
      return res.status(400).json({ success: false, message: "employeeId, periodStart, and periodEnd are required" });
    }
    const data = await previewSettlement(req.user.clientId, employeeId, periodStart, periodEnd, {
      presentDaysManual: presentDaysManual !== undefined ? presentDaysManual : null,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.post("/settle", async (req, res, next) => {
  try {
    const { employeeId, periodStart, periodEnd, presentDaysManual, deductions = [], note = "" } = req.body || {};
    if (!employeeId || !ObjectId.isValid(employeeId) || !periodStart || !periodEnd) {
      return res.status(400).json({ success: false, message: "employeeId, periodStart, and periodEnd are required" });
    }
    const period = await settlePeriod(req.user.clientId, employeeId, periodStart, periodEnd, {
      presentDaysManual, deductions, note,
    });
    await auditClient(req, "salary.settle", { employeeId, periodKey: period.periodKey, netAmount: period.netAmount });
    res.status(201).json({ success: true, message: "Salary settled ✅", period });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/adjust", validId("id"), async (req, res, next) => {
  try {
    const { type = "correction", amount, reason = "" } = req.body || {};
    if (amount == null) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }
    const entry = await addAdjustment(req.user.clientId, req.params.id, { type, amount, reason });
    await auditClient(req, "salary.adjust", { id: req.params.id, amount, reason });
    res.status(201).json({ success: true, message: "Adjustment recorded ✅", adjustment: entry });
  } catch (error) {
    next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const { employeeId = "", from = "", to = "", page = 1, limit = 10 } = req.query;
    const data = await getSettlementHistory(req.user.clientId, {
      employeeId, from, to, page: Number(page) || 1, limit: Number(limit) || 10,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/payslip", validId("id"), async (req, res, next) => {
  try {
    const period = await getPayslipData(req.user.clientId, req.params.id);
    res.json({ success: true, period });
  } catch (error) {
    next(error);
  }
});

export default router;
