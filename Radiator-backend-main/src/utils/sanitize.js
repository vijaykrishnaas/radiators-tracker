// Input-hardening helpers used at the route/DAO boundary.

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// Escapes regex metacharacters so user input matches as a literal substring —
// prevents both query crashes ("(") and catastrophic-backtracking ReDoS.
export function escapeRegex(str) {
  return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Coerces to a finite, non-negative number; throws a 400 on garbage so it never
// reaches the DB as NaN (which silently poisons $sum aggregations).
export function toMoney(val, field = "amount") {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest(`${field} must be a non-negative number`);
  }
  return n;
}

// Coerces a non-negative integer (quantity); defaults blank to the given value.
export function toCount(val, field = "quantity", fallback = 1) {
  if (val === "" || val === null || val === undefined) return fallback;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 0) {
    throw badRequest(`${field} must be a non-negative whole number`);
  }
  return n;
}

// Parses to a valid Date or throws a 400 (never stores an Invalid Date).
export function toValidDate(val, field = "date") {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    throw badRequest(`${field} is not a valid date`);
  }
  return d;
}

// Clamps pagination so a client can't request a negative page (negative $skip
// → Mongo error) or an unbounded limit (memory/DoS).
export function parsePaging(query = {}, { defaultLimit = 10, maxLimit = 200 } = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit };
}
