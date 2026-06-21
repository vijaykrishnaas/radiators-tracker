import { Router } from "express";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import {
  getMechanicBonus,
  getLabourBonus,
  markPaid,
  markPaidByRange,
  getReviewData,
  backfill,
} from "../dao/bonus.dao.js";
import { getSettings } from "../dao/settings.dao.js";

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
    res.json({ success: true, message: `${count} bonus entr${count === 1 ? "y" : "ies"} marked paid ✅`, count });
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
