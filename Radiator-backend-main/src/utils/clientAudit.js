import { logAudit } from "../dao/audit.dao.js";

// Fire-and-forget audit entry for a client-side action, scoped to req.user's
// tenant. logAudit never throws, so this is safe to await inline.
export function auditClient(req, action, details = {}) {
  return logAudit({
    action,
    clientId: req.user?.clientId,
    clientCode: req.user?.code,
    actorUserId: req.user?.userId,
    actorRole: req.user?.role,
    details,
  });
}
