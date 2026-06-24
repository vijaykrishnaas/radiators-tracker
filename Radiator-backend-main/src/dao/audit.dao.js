import { connectDB } from "../config/db.js";
import { toClientId } from "../utils/tenant.js";

const COLLECTION = "audit_log";

// Records a super-admin OR a client action. Never throws into the caller's flow —
// auditing must not break the operation it records. clientId is normalized to an
// ObjectId so super-admin (client._id) and client-side (req.user.clientId string)
// entries are filterable together.
export async function logAudit({ action, clientId = null, clientCode = "", actorUserId = "", actorRole = "", details = {} }) {
  try {
    const db = await connectDB();
    await db.collection(COLLECTION).insertOne({
      action,
      clientId: clientId ? toClientId(clientId) : null,
      clientCode,
      actorUserId,
      actorRole,
      details,
      at: new Date(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}

export async function listAudit({ page = 1, limit = 20, clientCode = "", clientId = null, action = "", from = "", to = "" } = {}) {
  const db = await connectDB();
  const coll = db.collection(COLLECTION);
  const query = {};
  if (clientId) query.clientId = toClientId(clientId);
  if (clientCode) query.clientCode = clientCode;
  if (action) query.action = action;
  if (from || to) {
    query.at = {};
    if (from) query.at.$gte = new Date(from);
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); query.at.$lte = end; }
  }
  const total = await coll.countDocuments(query);
  const entries = await coll
    .find(query, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  return { entries, total, totalPages: Math.ceil(total / limit) || 1, currentPage: page };
}
