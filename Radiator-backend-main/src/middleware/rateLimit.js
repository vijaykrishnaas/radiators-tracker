import rateLimit from "express-rate-limit";

// Per-IP throttle on auth endpoints to blunt brute-force / credential stuffing.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

// Per-account lockout: after several consecutive failures for the same
// (code,userId) — or (userId) for the super-admin — block that account briefly.
// In-memory store is fine for a single-instance deployment; swap for Redis if scaled.
const FAILS = new Map(); // key -> { count, until, last }
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000; // 10 minutes
const STALE_MS = 15 * 60 * 1000; // forget an idle key after 15 min
const MAX_KEYS = 10000; // hard cap so a username-spraying attacker can't OOM us

const keyOf = (req) => `${(req.body?.code || "").toLowerCase()}::${req.body?.userId || ""}`;

// An entry is disposable once it's neither locked nor recently active.
function isStale(rec, now) {
  return rec.until <= now && now - rec.last > STALE_MS;
}

// Drops stale entries. Falls back to clearing the whole map if it somehow still
// exceeds the cap (degrades to coarse IP-only limiting rather than unbounded RAM).
function sweep() {
  const now = Date.now();
  for (const [k, rec] of FAILS) {
    if (isStale(rec, now)) FAILS.delete(k);
  }
  if (FAILS.size > MAX_KEYS) FAILS.clear();
}

// Periodic sweep; unref so it never keeps the process alive on its own.
const sweepTimer = setInterval(sweep, 5 * 60 * 1000);
if (typeof sweepTimer.unref === "function") sweepTimer.unref();

export function accountLockout(req, res, next) {
  const key = keyOf(req);
  const rec = FAILS.get(key);
  const now = Date.now();
  if (rec && rec.until > now) {
    const mins = Math.ceil((rec.until - now) / 60000);
    return res.status(429).json({ success: false, message: `Account locked. Try again in ${mins} min.` });
  }
  // Opportunistic bound: sweep when the map gets large between timer ticks.
  if (FAILS.size > MAX_KEYS) sweep();
  next();
}

// Routes call these to record the outcome of an attempt.
export function recordFailure(req) {
  const key = keyOf(req);
  const now = Date.now();
  const rec = FAILS.get(key) || { count: 0, until: 0, last: now };
  rec.count += 1;
  rec.last = now;
  if (rec.count >= MAX_FAILS) {
    rec.until = now + LOCK_MS;
    rec.count = 0;
  }
  FAILS.set(key, rec);
}

export function recordSuccess(req) {
  FAILS.delete(keyOf(req));
}
