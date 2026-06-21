import { Router } from "express";
import { findClientByCode } from "../dao/client.dao.js";
import { peekSettings } from "../dao/settings.dao.js";
import { streamLogo, streamQr } from "../dao/logo.dao.js";

const router = Router();

// Unauthenticated branding lookup used by /t/:code/login to theme the login
// screen (business name, colours, logo) before the user authenticates.
// Codes are not secrets; returns 404 for unknown codes.
router.get("/clients/:code", async (req, res, next) => {
  try {
    const client = await findClientByCode(req.params.code);
    if (!client) {
      return res.status(404).json({ success: false, message: "Unknown business code" });
    }
    const settings = await peekSettings(client._id);
    res.json({
      success: true,
      client: {
        name: client.name,
        code: client.code,
        status: client.status,
        companyName: settings?.company?.name || client.name,
        logoUrl: settings?.company?.logoUrl || "",
        branding: settings?.branding || { primaryColor: "#2264E5", accentColor: "#f47f6b" },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Streams a client's logo image (used by the branded login page + header).
router.get("/clients/:code/logo", async (req, res, next) => {
  try {
    const client = await findClientByCode(req.params.code);
    if (!client) return res.status(404).end();
    const ok = await streamLogo(client._id, res);
    if (!ok) return res.status(404).end();
  } catch (error) {
    next(error);
  }
});

// Streams a client's payment QR image (used by the invoice/bill print).
router.get("/clients/:code/qr", async (req, res, next) => {
  try {
    const client = await findClientByCode(req.params.code);
    if (!client) return res.status(404).end();
    const ok = await streamQr(client._id, res);
    if (!ok) return res.status(404).end();
  } catch (error) {
    next(error);
  }
});

export default router;
