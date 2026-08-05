// Shared types for the automobile-vertical billing screens. Parallel of the
// RadiatorRecord/ServiceItem types in ../IssueCounter/Dashboard/Index.tsx —
// kept separate so radiator pages are never coupled to this module.

export type AutoBillItem = {
    particulars: string;
    partRef?: string | null;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
};

export type AutoBillRecord = {
    _id: string;
    billDate: string;
    billNo: number;
    vehicleNumber: string;
    customerName?: string;
    phoneNumber?: string;
    mechanicName: string;
    labourName: string[];
    items: AutoBillItem[];
    notes?: string;
    totalAmount: number;
    discount: number;
    netAmount: number;
    receivedAmount: number;
    pendingAmount: number;
    status: "Not Received" | "Partial" | "Received";
};

export const itemsText = (record: AutoBillRecord) =>
    (record.items || []).map((i) => `${i.particulars} (${i.qty}${i.unit ? " " + i.unit : ""})`).join(", ") || "—";
