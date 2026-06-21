import jwt from "jsonwebtoken";
import { getClientStatus } from "../dao/client.dao.js";

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

// Gate for the super-admin portal routes.
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Super-admin access required" });
  }
  next();
}

// Per-request tenant enforcement for all client-scoped routes. Re-checks the
// client on every request so suspending or deleting a client takes effect
// immediately, even for sessions already holding a valid token.
export async function loadActiveTenant(req, res, next) {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) {
      return res.status(403).json({ success: false, message: "Tenant context required" });
    }
    const client = await getClientStatus(clientId);
    if (!client) {
      // Deleted out from under a live session — signal the SPA to end it.
      return res.status(401).json({ success: false, tenantInactive: true, message: "Account no longer exists" });
    }
    if (client.status === "suspended") {
      return res.status(403).json({ success: false, tenantInactive: true, message: "This account is suspended" });
    }
    next();
  } catch (err) {
    next(err);
  }
}
