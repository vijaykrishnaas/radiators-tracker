import { Router } from "express";
import multer from "multer";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { whatsappSendLimiter } from "../middleware/rateLimit.js";
import { auditClient } from "../utils/clientAudit.js";
import { getAccount, isWhatsAppEnabled, messagesForRef } from "../dao/whatsapp.dao.js";
import { templateStatuses } from "../services/whatsapp/templates.js";
import { sendBill, sendTest, attachReceiptPdf } from "../services/whatsapp/notify.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

// Upload errors (too large, ...) become clean 400s instead of reaching the global handler as a 500.
function uploadPdf(req, res, next) {
  upload.single("pdf")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "PDF must be 2MB or smaller" : "Invalid PDF upload";
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "A PDF file (field \"pdf\") is required" });
    next();
  });
}

// Every tenant route is closed unless the super admin enabled WhatsApp for this company.
export async function requireWhatsApp(req, res, next) {
  try {
    if (!(await isWhatsAppEnabled(req.user?.clientId))) {
      return res.status(403).json({ success: false, message: "WhatsApp is not enabled for this company" });
    }
    next();
  } catch (error) {
    next(error);
  }
}

router.use(authenticate, loadActiveTenant, requireWhatsApp);

router.get("/status", async (req, res, next) => {
  try {
    const a = await getAccount(req.user.clientId);
    res.json({ success: true, enabled: true, provider: a.provider || "meta", displayPhone: a.displayPhone || "", verifiedName: a.verifiedName || "", templates: templateStatuses(a) });
  } catch (error) {
    next(error);
  }
});

router.post("/test", whatsappSendLimiter, async (req, res, next) => {
  try {
    const r = await sendTest(req.user.clientId);
    await auditClient(req, "whatsapp.send", { kind: "test", vertical: "", refId: "", status: r.status });
    if (r.status === "failed") return res.status(400).json({ success: false, message: r.error || "Test message failed" });
    res.json({ success: true, message: "Test message sent to the owner's number ✅" });
  } catch (error) {
    next(error);
  }
});

router.post("/send/bill/:vertical/:id", whatsappSendLimiter, uploadPdf, async (req, res, next) => {
  try {
    const { vertical, id } = req.params;
    const updated = req.query.updated === "1" || req.query.updated === "true";
    const w = await sendBill(req.user.clientId, vertical, id, req.file.buffer, { updated, actor: req.user.userId });
    await auditClient(req, "whatsapp.send", { kind: updated ? "bill_update" : "bill", vertical, refId: id, status: w.status });
    const failed = w.status === "failed";
    res.json({
      success: !failed,
      message: failed ? w.error || "Could not send on WhatsApp" : w.status === "pending" ? "Sending… will retry shortly" : "Sent on WhatsApp ✅",
      whatsapp: { status: w.status, at: w.at, error: w.error, kind: w.kind },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/receipts/:receiptId/pdf", whatsappSendLimiter, uploadPdf, async (req, res, next) => {
  try {
    const w = await attachReceiptPdf(req.user.clientId, req.params.receiptId, req.file.buffer);
    await auditClient(req, "whatsapp.send", { kind: "receipt", vertical: "", refId: req.params.receiptId, status: w.status });
    res.json({ success: w.status !== "failed", message: w.status === "failed" ? w.error || "Receipt failed" : "Receipt sent on WhatsApp ✅" });
  } catch (error) {
    next(error);
  }
});

router.get("/messages", async (req, res, next) => {
  try {
    const refId = String(req.query.refId || "");
    if (!refId) return res.status(400).json({ success: false, message: "refId is required" });
    const rows = await messagesForRef(req.user.clientId, refId);
    res.json({
      success: true,
      messages: rows.map((m) => ({ _id: m._id, kind: m.kind, to: m.to, status: m.status, error: m.error || "", at: m.at, statusAt: m.statusAt || m.at })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
