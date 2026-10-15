import { connectDB } from "../config/db.js";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex } from "../utils/sanitize.js";
import { parseSort, findSortedPage } from "../utils/listSort.js";

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

// Sortable list columns.
const AUDIT_SORT = { when: "at", action: "action", client: "clientCode", by: "actorUserId" };

export async function listAudit({ page = 1, limit = 20, clientCode = "", clientId = null, action = "", from = "", to = "", search = "", sortQuery = {} } = {}) {
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
  // Search: who did it, which client, the action, or anything in the details.
  const text = String(search || "").trim();
  if (text) {
    const rx = { $regex: escapeRegex(text), $options: "i" };
    query.$or = [
      { actorUserId: rx }, { clientCode: rx }, { action: rx },
      ...["vehicleNumber", "truckNumber", "vehicleNo", "mechanicName", "name", "code", "note", "beneficiary", "id"].map((k) => ({ [`details.${k}`]: rx })),
    ];
  }
  const total = await coll.countDocuments(query);
  const entries = await findSortedPage(coll, query, parseSort(sortQuery, AUDIT_SORT, { at: -1 }), (page - 1) * limit, limit, { _id: 0 });
  return { entries, total, totalPages: Math.ceil(total / limit) || 1, currentPage: page };
}
