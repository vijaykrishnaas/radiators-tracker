import type { AppSettings, EngItem } from "../../Context/SettingsContext";

export type EngBillItem = {
    item: string;
    label: string;
    comment?: string;
    requiresComment?: boolean;
    qty: number;
    rate: number;
    amount: number;
};

export type EngService = {
    type: string;
    typeLabel?: string;
    bsModel: string;
    items: EngBillItem[];
    subtotal: number;
};

export type EngPaymentStatus = "Not Received" | "Partial" | "Received";

export type EngBill = {
    _id: string;
    billNo: number;
    billDate: string;
    vehicleNo: string;
    lorryAddress?: string;
    mechanic: string;
    phone?: string;
    services: EngService[];
    typeTotals: Record<string, number>;
    total: number;
    discount: number;
    netTotal: number;
    amountReceived: number;
    balance: number;
    paymentMode?: string;
    paymentStatus: EngPaymentStatus;
};

export const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

export const PAYMENT_MODES = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];

// "Other"-style items print their description instead of the label.
export const itemText = (i: { label: string; comment?: string; requiresComment?: boolean }) =>
    i.requiresComment && i.comment ? i.comment : i.label;

export const bsLabel = (settings: AppSettings, value: string) =>
    (settings.engineering?.bsModels || []).find((b) => b.value === value)?.label || value || "";

export const typeLabel = (settings: AppSettings, value: string) =>
    (settings.engineering?.serviceTypes || []).find((t) => t.value === value)?.label || value;

// A number (including 0) means offered for that BS model; null/undefined/""
// means not offered. With no BS model chosen, every item is offered.
export const isOffered = (item: EngItem, bsModel: string) => {
    if (!bsModel) return true;
    const p = item.prices?.[bsModel];
    return p !== null && p !== undefined && (p as unknown) !== "";
};

export const defaultRate = (item: EngItem | undefined, bsModel: string) => {
    if (!item || !bsModel) return 0;
    const p = item.prices?.[bsModel];
    return typeof p === "number" ? p : 0;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
