import { Router } from "express";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { listAudit } from "../dao/audit.dao.js";
import { parsePaging } from "../utils/sanitize.js";

const router = Router();

router.use(authenticate, loadActiveTenant);

// A client's own activity log — always scoped to req.user.clientId (a client can
// only ever see their own entries).
router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, { defaultLimit: 20, maxLimit: 100 });
    const { action = "", from = "", to = "" } = req.query;
    const data = await listAudit({ page, limit, clientId: req.user.clientId, action, from, to });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

export default router;
