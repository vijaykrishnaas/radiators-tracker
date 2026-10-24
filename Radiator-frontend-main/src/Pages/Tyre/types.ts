// Shared types and helpers for the tyre-vertical delivery-challan screens. Shapes mirror dao/tyrebill.dao.js.

export type TyreItem = {
    brandRef: string | null;
    brandLabel: string;
    modelRef: string | null;
    modelLabel: string;
    partRef?: string | null;
    particulars: string;
    tyreNumber: string;
    tubeType: "tube" | "tubeless";
    flap: boolean;
    qty: number;
    rate: number;
    amount: number;
};

export type InstallmentPayment = { date: string; amount: number; mode: string };

export type RowStatus = "Paid" | "Overdue" | "Partly paid" | "Due";

export type Installment = {
    id: string;
    label: string;
    dueDate: string;
    principal: number;
    interest: number;
    payments: InstallmentPayment[];
    // Worked out by the server when the challan is read.
    total: number;
    paid: number;
    balance: number;
    rowStatus: RowStatus;
};

export type TyreBill = {
    _id: string;
    billNo: number;
    billDate: string;
    vehicleNumber: string;
    customerName?: string;
    phoneNumber?: string;
    address?: string;
    mechanicName?: string;
    labourName: string[];
    notes?: string;
    items: TyreItem[];
    paymentType: "full" | "installment";
    installments: Installment[];
    payments: (InstallmentPayment & { installmentId?: string; label?: string })[];
    tyreAmount: number;
    interestTotal: number;
    discount: number;
    payableTotal: number;
    receivedAmount: number;
    pendingAmount: number;
    status: "Not Received" | "Partial" | "Received";
    nextDue: { id: string; label: string; dueDate: string; amount: number } | null;
    overdueAmount: number;
    overdueCount: number;
};

export type FollowUpRow = {
    billId: string;
    billNo: number;
    customerName?: string;
    phoneNumber?: string;
    vehicleNumber: string;
    installmentId: string;
    label: string;
    dueDate: string;
    balance: number;
    overdue: boolean;
};

export type TyreAnalytics = {
    kpis: {
        totalBills: number;
        tyreRevenue: number;
        interestTotal: number;
        payableTotal: number;
        totalCollected: number;
        totalPending: number;
        totalDiscount: number;
        installmentBills: number;
        tyresSold: number;
        collectionRate: number;
        avgBillValue: number;
    };
    byMonth: Array<{ month: string; revenue: number; collected: number; count: number }>;
    byStatus: Array<{ status: string; count: number; revenue: number }>;
    byBrand: Array<{ brand: string; qty: number; revenue: number }>;
    topMechanics: Array<{ mechanic: string; count: number; revenue: number }>;
    installments: { overdueAmount: number; overdueBills: number; dueThisMonth: number; rows: FollowUpRow[] };
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const TUBE_LABEL: Record<string, string> = { tube: "Tube type", tubeless: "Tubeless" };

// Default installment names, as on the paper challan: "Initial amount", "1st month", "2nd month", ...
const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const rowLabel = (i: number) => (i === 0 ? "Initial amount" : `${ordinal(i)} month`);

const pad = (n: number) => String(n).padStart(2, "0");
/** The date `months` after `ymd` (YYYY-MM-DD) on the same day, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export const addMonths = (ymd: string, months: number) => {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const first = new Date(y, m - 1 + months, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, last))}`;
};

/** Whole months from `from` to `to` (both YYYY-MM-DD), by calendar month: 2026-10-31 → 2026-11-01 is 1. */
export const monthsBetween = (from: string, to: string) => {
    const [y1, m1] = from.split("-").map(Number);
    const [y2, m2] = to.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
};

export const itemsText = (b: TyreBill) =>
    (b.items || []).map((i) => `${i.particulars}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(", ") || "—";

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");

export const rowTone = (s: RowStatus) => (s === "Paid" ? "success" : s === "Overdue" ? "error" : s === "Partly paid" ? "warning" : "neutral");
