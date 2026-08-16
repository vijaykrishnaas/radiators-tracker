import { Router } from "express";
import { ObjectId } from "mongodb";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { auditClient } from "../utils/clientAudit.js";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} from "../dao/employee.dao.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

function validId(req, res, next) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid employee id" });
  }
  next();
}

router.get("/", async (req, res, next) => {
  try {
    const { active = "", role = "", search = "" } = req.query;
    const employees = await listEmployees(req.user.clientId, { active, role, search });
    res.json({ success: true, employees });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validId, async (req, res, next) => {
  try {
    const employee = await getEmployee(req.user.clientId, req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, employee });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const result = await createEmployee(req.user.clientId, req.body);
    await auditClient(req, "employee.create", { name: req.body?.name });
    res.status(201).json({ success: true, message: "Employee saved ✅", id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validId, async (req, res, next) => {
  try {
    await updateEmployee(req.user.clientId, req.params.id, req.body);
    await auditClient(req, "employee.update", { id: req.params.id });
    res.json({ success: true, message: "Employee updated ✅" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validId, async (req, res, next) => {
  try {
    const result = await deactivateEmployee(req.user.clientId, req.params.id);
    await auditClient(req, "employee.deactivate", { id: req.params.id, hardDeleted: result.hardDeleted });
    res.json({
      success: true,
      message: result.hardDeleted ? "Employee deleted ✅" : "Employee deactivated ✅",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
