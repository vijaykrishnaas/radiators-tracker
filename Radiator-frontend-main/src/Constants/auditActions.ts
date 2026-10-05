// Plain-language names for audit-log actions (spec §10.7). Keys are the backend's `auditClient` /
// `logAudit` action strings (routes/*.routes.js). Unknown keys fall back to the raw key (shown in mono).
import type { BusinessType } from "../Context/SettingsContext";

export type AuditEntry = {
    action: string;
    clientCode?: string;
    actorUserId?: string;
    actorRole?: string;
    details?: Record<string, any>;
    at: string;
};

const LABELS: Record<string, string> = {
    // Radiator bills
    "radiator.create": "Created bill",
    "radiator.update": "Updated bill",
    "radiator.delete": "Deleted bill",
    "radiator.payment": "Recorded payment",
    // Automobile bills
    "autobill.create": "Created bill",
    "autobill.update": "Updated bill",
    "autobill.delete": "Deleted bill",
    "autobill.payment": "Recorded payment",
    // Engineering service bills
    "engbill.create": "Created service bill",
    "engbill.update": "Updated service bill",
    "engbill.delete": "Deleted service bill",
    "engbill.payment": "Recorded payment",
    // Expenses
    "expense.create": "Added expense",
    "expense.update": "Updated expense",
    "expense.delete": "Deleted expense",
    // Settings
    "settings.update": "Updated settings",
    "settings.upload": "Uploaded asset",
    // Bonus
    "bonus.payout": "Issued bonus",
    "bonus.manual": "Manual bonus",
    "bonus.adjust": "Corrected bonus",
    // Salary management
    "employee.create": "Added employee",
    "employee.update": "Updated employee",
    "employee.deactivate": "Removed employee",
    "salary.attendance.mark": "Marked attendance",
    "salary.advance.record": "Recorded advance",
    "salary.settle": "Settled salary",
    "salary.adjust": "Added salary adjustment",
    // Auth
    "auth.login": "Logged in",
    // Super-admin
    "client.create": "Created client",
    "client.rename": "Renamed client",
    "client.suspend": "Suspended client",
    "client.reactivate": "Reactivated client",
    "client.reset_password": "Reset password",
    "client.delete": "Deleted client",
};

const VERTICAL_SUFFIX: Record<string, string> = { radiator: " (radiator)", autobill: " (automobile)", engbill: " (engineering)" };

/** Readable name, or null when the key is unknown (caller shows the raw key in mono). */
export const actionLabel = (key: string, qualified = false): string | null => {
    const base = LABELS[key];
    if (!base) return null;
    return qualified ? base + (VERTICAL_SUFFIX[key.split(".")[0]] || "") : base;
};

const BILL_PREFIX: Record<BusinessType, string> = { radiator: "radiator.", automobile: "autobill.", engineering: "engbill." };

/** Action filter options for a tenant: its own bill actions plus the shared ones. */
export const clientActionOptions = (businessType: BusinessType) =>
    Object.keys(LABELS)
        .filter((k) => !k.startsWith("client."))
        .filter((k) => !/^(radiator|autobill|engbill)\./.test(k) || k.startsWith(BILL_PREFIX[businessType]))
        .map((value) => ({ value, label: LABELS[value] }));

/** All actions, bill actions qualified by vertical (super-admin audit). */
export const adminActionOptions = () =>
    Object.keys(LABELS).map((value) => ({ value, label: actionLabel(value, true) as string }));

const rs = (n: unknown) => `₹${Number(n).toLocaleString("en-IN")}`;

/** Condense the per-action details object into a short human string. */
export const detailText = (e: AuditEntry): string => {
    const d = e.details || {};
    const join = (...parts: unknown[]) => parts.filter((p) => p !== undefined && p !== null && p !== "").join(" · ");
    switch (e.action) {
        case "radiator.create":
        case "radiator.update":
        case "radiator.delete":
            return d.truckNumber ? `${d.truckNumber}` : "";
        case "radiator.payment":
            return join(d.truckNumber, d.amount ? `paid ${rs(d.amount)}` : "", d.discount ? `discount ${rs(d.discount)}` : "");
        case "autobill.create":
            return join(d.vehicleNumber, d.mechanicName);
        case "autobill.update":
            return d.vehicleNumber ? `${d.vehicleNumber}` : "";
        case "autobill.payment":
            return join(d.vehicleNumber, d.amount ? `paid ${rs(d.amount)}` : "", d.discount ? `discount ${rs(d.discount)}` : "");
        case "engbill.create":
        case "engbill.update":
            return join(d.billNo != null ? `Bill ${d.billNo}` : "", d.vehicleNo, d.netTotal != null ? rs(d.netTotal) : "");
        case "engbill.payment":
            return join(d.billNo != null ? `Bill ${d.billNo}` : "", d.amount ? `paid ${rs(d.amount)}` : "", d.discount ? `discount ${rs(d.discount)}` : "");
        case "expense.create":
        case "expense.update":
            return join(d.expenseType, d.amount ? rs(d.amount) : "");
        case "bonus.payout":
            return join(d.type, d.beneficiary, d.count != null ? `${d.count} entr${d.count === 1 ? "y" : "ies"}` : "", d.amount ? rs(d.amount) : "");
        case "bonus.manual":
        case "bonus.adjust":
            return join(d.type, d.beneficiary, d.amount ? rs(d.amount) : "");
        case "settings.upload":
            return d.asset ? `${d.asset}` : "";
        case "employee.create":
            return d.name ? `${d.name}` : "";
        case "employee.deactivate":
            return d.hardDeleted ? "Deleted (no history)" : "Marked inactive";
        case "salary.attendance.mark":
            return join(d.date ? new Date(d.date).toLocaleDateString("en-IN") : "", d.status);
        case "salary.advance.record":
            return d.amount ? rs(d.amount) : "";
        case "salary.settle":
            return join(d.periodKey, d.netAmount != null ? rs(d.netAmount) : "");
        case "salary.adjust":
            return join(d.amount ? rs(d.amount) : "", d.reason);
        default:
            // Super-admin client actions and anything new: name + record counts when present.
            return [
                d.name ? `name: ${d.name}` : "",
                d.counts ? `(${Object.entries(d.counts).map(([k, v]) => `${k}:${v}`).join(", ")})` : "",
            ].filter(Boolean).join(" ");
    }
};
