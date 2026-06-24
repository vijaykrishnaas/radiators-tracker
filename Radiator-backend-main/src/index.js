import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Resolve .env relative to this file so the server works from any cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { connectDB } from "./config/db.js";
import { seedSuperAdmin } from "./dao/user.dao.js";
import { ensureIndexes, ensureUsersUniqueIndex } from "./config/ensureIndexes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import publicRoutes from "./routes/public.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import radiatorRoutes, { mechanicRouter } from "./routes/radiator.routes.js";
import bonusRoutes from "./routes/bonus.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import auditRoutes from "./routes/audit.routes.js";

const app = express();

// CORS: if ALLOWED_ORIGINS is set (comma-separated list), restrict to those
// origins; otherwise allow all (local dev, or before the frontend origin is
// known). Set ALLOWED_ORIGINS=https://your-site.netlify.app on the host to
// lock it down. JWT travels in the Authorization header (not cookies), so the
// open default is not a credential-leak risk.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors(
    allowedOrigins.length
      ? {
          origin(origin, cb) {
            // Allow non-browser clients (no Origin header) and listed origins.
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error("Not allowed by CORS"));
          },
        }
      : undefined
  )
);
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "Welcome to Radiator API 🚗🔥" });
});

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/public", publicRoutes);
app.use("/settings", settingsRoutes);
app.use("/radiators", radiatorRoutes);
app.use("/mechanic", mechanicRouter);
app.use("/bonus", bonusRoutes);
app.use("/expenses", expenseRoutes);
app.use("/audit", auditRoutes);

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler — keeps route handlers free of response formatting
app.use((err, req, res, next) => {
  console.error("API Error:", err.message);
  // Honor explicit statuses from boundary validation (err.statusCode = 400, etc.).
  const status = err.statusCode || (err.message === "Radiator not found" ? 404 : 500);
  // Don't leak internal error text on 5xx.
  const message = status >= 500 ? "Internal server error" : (err.message || "Request failed");
  res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    await connectDB();
    await ensureIndexes();
    await seedSuperAdmin();
    // Safe post-migration; tolerant during the pre-migration window where two
    // untagged admins could transiently collide.
    try {
      await ensureUsersUniqueIndex();
    } catch (e) {
      console.warn("Deferred users unique index (run migration):", e.message);
    }
  } catch (err) {
    console.error("Startup error (DB/seed):", err.message);
  }
});
