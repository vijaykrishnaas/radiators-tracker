import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { parsePaging } from "../utils/sanitize.js";
import {
  getExpenses,
  getExpensesForExport,
  getExpenseAnalytics,
  createExpense,
  updateExpense,
  deleteExpense,
} from "../dao/expense.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const { from = "", to = "", expenseType = "", search = "", minAmount = "", maxAmount = "" } = req.query;
    const data = await getExpenses(req.user.clientId, { from, to, expenseType, search, minAmount, maxAmount }, page, limit);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const { from = "", to = "" } = req.query;
    const data = await getExpenseAnalytics(req.user.clientId, { from, to });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const { from = "", to = "", expenseType = "", search = "", minAmount = "", maxAmount = "" } = req.query;
    const expenses = await getExpensesForExport(req.user.clientId, { from, to, expenseType, search, minAmount, maxAmount });
    res.json({ success: true, expenses });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { expenseType, date, amount } = req.body || {};
    if (!expenseType || !date || (!amount && expenseType === "others")) {
      return res.status(400).json({ success: false, message: "expenseType, date, and amount are required" });
    }
    const result = await createExpense(req.user.clientId, req.body);
    res.status(201).json({ success: true, message: "Expense saved ✅", id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }
    await updateExpense(req.user.clientId, req.params.id, req.body);
    res.json({ success: true, message: "Expense updated ✅" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }
    await deleteExpense(req.user.clientId, req.params.id);
    res.json({ success: true, message: "Expense deleted ✅" });
  } catch (error) {
    next(error);
  }
});

export default router;
