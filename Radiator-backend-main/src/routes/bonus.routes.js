import { Router } from "express";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import {
  getMechanicBonus,
  getLabourBonus,
  getPendingByRange,
  markPaid,
  markPaidByRange,
  addManualBonus,
  adjustPendingPayable,
  getReviewData,
  backfill,
} from "../dao/bonus.dao.js";
import { getSettings } from "../dao/settings.dao.js";
import { auditClient } from "../utils/clientAudit.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

router.get("/mechanics", async (req, res, next) => {
  try {
    const { year, mechanicName = "", status = "" } = req.query;
    if (!year) {
      return res.status(400).json({ success: false, message: "year is required" });
    }
    const rows = await getMechanicBonus(req.user.clientId, year, mechanicName, status);
    res.json({ success: true, rows });
  } catch (error) {
    next(error);
  }
});

router.get("/labour", async (req, res, next) => {
  try {
    const { date, name = "", status = "" } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });
    }
    const rows = await getLabourBonus(req.user.clientId, date, name, status);
    res.json({ success: true, rows });
  } catch (error) {
    next(error);
  }
});

// Redesigned pages use this: pending (or paid) bonuses per beneficiary over a
// billDate range, for both mechanic and labour.
router.get("/pending", async (req, res, next) => {
  try {
    const { type, from, to, beneficiary = "", status = "" } = req.query;
    if (!["mechanic", "labour"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be mechanic or labour" });
    }
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to are required" });
    }
    const rows = await getPendingByRange(req.user.clientId, type, from, to, beneficiary, status);
    res.json({ success: true, rows });
  } catch (error) {
    next(error);
  }
});

router.get("/review", async (req, res, next) => {
  try {
    const { type, name, from, to } = req.query;
    if (!["mechanic", "labour"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be mechanic or labour" });
    }
    if (!name || !from || !to) {
      return res.status(400).json({ success: false, message: "name, from, to are required" });
    }
    const settings = await getSettings(req.user.clientId);
    const data = await getReviewData(req.user.clientId, type, name, from, to, settings);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.post("/payout", async (req, res, next) => {
  try {
    const { type, period, beneficiary = "", amount, from, to, notes = "" } = req.body || {};
    if (!["mechanic", "labour"].includes(type)) {
      return res.status(400).json({ success: false, message: "type ('mechanic' | 'labour') is required" });
    }
    let count;
    if (period) {
      count = await markPaid(req.user.clientId, type, period, beneficiary, amount, notes);
    } else if (from && to) {
      count = await markPaidByRange(req.user.clientId, type, beneficiary, from, to, amount, notes);
    } else {
      return res.status(400).json({ success: false, message: "period or from+to is required" });
    }
    await auditClient(req, "bonus.payout", { type, beneficiary, count, amount: amount ?? null });
    res.json({ success: true, message: `${count} bonus entr${count === 1 ? "y" : "ies"} marked paid ✅`, count });
  } catch (error) {
    next(error);
  }
});

// Discretionary manual bonus — owner gives any employee any amount, anytime,
// independent of the bill-based calculation.
router.post("/manual", async (req, res, next) => {
  try {
    const { type, beneficiary, amount, note = "", date = null } = req.body || {};
    if (!["mechanic", "labour"].includes(type)) {
      return res.status(400).json({ success: false, message: "type ('mechanic' | 'labour') is required" });
    }
    if (!beneficiary || !String(beneficiary).trim()) {
      return res.status(400).json({ success: false, message: "beneficiary is required" });
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: "a positive amount is required" });
    }
    const result = await addManualBonus(req.user.clientId, type, String(beneficiary).trim(), amt, note, date);
    await auditClient(req, "bonus.manual", { type, beneficiary, amount: result.amount });
    res.status(201).json({ success: true, message: `Manual bonus of ₹${result.amount} recorded for ${beneficiary} ✅`, ...result });
  } catch (error) {
    next(error);
  }
});

// Correct a person's "ready to pay" bonus for a date range — adjusts only the
// pending entries, leaving anything already paid untouched.
router.post("/adjust", async (req, res, next) => {
  try {
    const { type, beneficiary, from, to, amount, note = "" } = req.body || {};
    if (!["mechanic", "labour"].includes(type)) {
      return res.status(400).json({ success: false, message: "type ('mechanic' | 'labour') is required" });
    }
    if (!beneficiary || !String(beneficiary).trim()) {
      return res.status(400).json({ success: false, message: "beneficiary is required" });
    }
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to are required" });
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      return res.status(400).json({ success: false, message: "a valid amount (0 or more) is required" });
    }
    const result = await adjustPendingPayable(req.user.clientId, type, String(beneficiary).trim(), from, to, amt, note);
    if (result.modified === 0) {
      return res.status(404).json({ success: false, message: "No pending bonus to correct for this person in this range" });
    }
    await auditClient(req, "bonus.adjust", { type, beneficiary, amount: result.newPayable, count: result.modified });
    res.json({ success: true, message: `Bonus for ${beneficiary} corrected to ₹${result.newPayable} ✅`, ...result });
  } catch (error) {
    next(error);
  }
});

router.post("/sync", async (req, res, next) => {
  try {
    const { fromDate = "", toDate = "" } = req.body || {};
    const count = await backfill(req.user.clientId, fromDate, toDate);
    res.json({ success: true, message: `Synced bonuses for ${count} bill(s) ✅`, count });
  } catch (error) {
    next(error);
  }
});

export default router;
