import { Router } from "express";
import jwt from "jsonwebtoken";
import { findUserByClient, verifyPassword, changeOwnPassword } from "../dao/user.dao.js";
import { findClientByCode, touchLastLogin } from "../dao/client.dao.js";
import { authenticate } from "../middleware/auth.js";
import { loginLimiter, accountLockout, recordFailure, recordSuccess } from "../middleware/rateLimit.js";

const router = Router();

router.post("/login", loginLimiter, accountLockout, async (req, res, next) => {
  try {
    const { code, userId, password } = req.body || {};

    if (!code || !userId || !password) {
      return res.status(400).json({
        success: false,
        message: "Business code, user ID and password are required",
      });
    }

    const client = await findClientByCode(code);
    // Generic message — don't reveal whether the code or the credentials failed.
    if (!client) {
      recordFailure(req);
      return res.status(401).json({ success: false, message: "Invalid business code or credentials" });
    }
    if (client.status === "suspended") {
      return res.status(403).json({ success: false, message: "This account is suspended" });
    }

    const user = await findUserByClient(client._id, userId);
    const valid = user && (await verifyPassword(user, password));
    if (!valid) {
      recordFailure(req);
      return res.status(401).json({ success: false, message: "Invalid business code or credentials" });
    }

    recordSuccess(req);
    await touchLastLogin(client._id);

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        userId: user.userId,
        name: user.name,
        role: user.role,
        clientId: client._id.toString(),
        code: client.code,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        clientId: client._id.toString(),
        code: client.code,
        companyName: client.name,
        mustChangePassword: !!user.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Used by both client admins and the super-admin to change their own password.
router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }
    await changeOwnPassword(req.user.sub, currentPassword, newPassword);
    res.json({ success: true, message: "Password changed ✅" });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
});

export default router;
