import { Router } from "express";
import multer from "multer";
import { authenticate, loadActiveTenant } from "../middleware/auth.js";
import { getSettings, updateSettings, setCompanyLogoUrl, setCompanyQrUrl, setCompanyLoginBgUrl } from "../dao/settings.dao.js";
import { saveLogo, saveQr, saveLoginBg } from "../dao/logo.dao.js";
import { auditClient } from "../utils/clientAudit.js";

const router = Router();

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
// Full-screen backgrounds: raster only (no SVG) — matches the Settings file
// picker and the route's advertised types.
const ALLOWED_BG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_LOGO_TYPES.includes(file.mimetype));
  },
});

// Wraps multer so upload errors (too large, etc.) become clean 400s instead of
// bubbling to the global handler as a 500.
function uploadLogo(req, res, next) {
  upload.single("logo")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Logo must be 1MB or smaller" : "Invalid logo upload";
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

// Login backgrounds are full-screen photos, so allow a larger file than logos/QRs.
const uploadBgMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_BG_TYPES.includes(file.mimetype));
  },
});

function uploadBg(req, res, next) {
  uploadBgMulter.single("logo")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Background must be 4MB or smaller" : "Invalid background upload";
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

router.use(authenticate, loadActiveTenant);

router.get("/", async (req, res, next) => {
  try {
    const settings = await getSettings(req.user.clientId);
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Settings body is required" });
    }
    const settings = await updateSettings(req.user.clientId, req.body);
    await auditClient(req, "settings.update", {});
    res.json({ success: true, settings, message: "Settings updated ✅" });
  } catch (error) {
    next(error);
  }
});

// Upload/replace this client's logo (stored in GridFS, served publicly by code).
router.post("/logo", uploadLogo, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "A logo image (png/jpeg/svg/webp, ≤1MB) is required" });
    }
    await saveLogo(req.user.clientId, req.file.buffer, req.file.mimetype);
    // Cache-busted URL so the browser refetches after replacement.
    const logoUrl = `/public/clients/${req.user.code}/logo?v=${Date.now()}`;
    await setCompanyLogoUrl(req.user.clientId, logoUrl);
    await auditClient(req, "settings.upload", { asset: "logo" });
    res.json({ success: true, message: "Logo updated ✅", logoUrl });
  } catch (error) {
    next(error);
  }
});

// Upload/replace this client's payment QR (printed on invoices).
router.post("/qr", uploadLogo, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "A QR image (png/jpeg/svg/webp, ≤1MB) is required" });
    }
    await saveQr(req.user.clientId, req.file.buffer, req.file.mimetype);
    const qrUrl = `/public/clients/${req.user.code}/qr?v=${Date.now()}`;
    await setCompanyQrUrl(req.user.clientId, qrUrl);
    await auditClient(req, "settings.upload", { asset: "qr" });
    res.json({ success: true, message: "Payment QR updated ✅", qrUrl });
  } catch (error) {
    next(error);
  }
});

// Upload/replace this client's login-page background (shown on /t/:code/login).
router.post("/login-bg", uploadBg, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "A background image (png/jpeg/webp, ≤4MB) is required" });
    }
    await saveLoginBg(req.user.clientId, req.file.buffer, req.file.mimetype);
    const loginBgUrl = `/public/clients/${req.user.code}/login-bg?v=${Date.now()}`;
    await setCompanyLoginBgUrl(req.user.clientId, loginBgUrl);
    await auditClient(req, "settings.upload", { asset: "login-bg" });
    res.json({ success: true, message: "Login background updated ✅", loginBgUrl });
  } catch (error) {
    next(error);
  }
});

export default router;
