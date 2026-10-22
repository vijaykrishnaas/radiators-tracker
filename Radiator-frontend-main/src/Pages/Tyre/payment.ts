// Recording a payment on a tyre challan, shared by the challan list and the challan view.
import { postData } from "../../Services/ApiServices";
import type { PayableInstallment } from "../../Components/RecordPaymentModal";
import type { TyreBill } from "./types";

/** The challan's unpaid installments, earliest due first, for the payment modal's picker. */
export const payableRows = (b: TyreBill): PayableInstallment[] | undefined =>
    b.paymentType === "installment"
        ? b.installments
            .filter((r) => r.balance > 0)
            .sort((x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime())
            .map((r) => ({ id: r.id, label: r.label, dueDate: r.dueDate, balance: r.balance, overdue: r.rowStatus === "Overdue" }))
        : undefined;

type Alert = (msg: string, tone: "success" | "error") => void;

/** Validates and sends the payment. Returns true when it was recorded. */
export async function submitTyrePayment(
    b: TyreBill,
    v: { amount: string; discount: string; mode: string; installmentId?: string },
    alert: Alert,
): Promise<boolean> {
    const amount = Number(v.amount) || 0;
    const discount = Number(v.discount) || 0;
    if (amount < 0 || discount < 0) {
        alert("Amount and discount must not be negative", "error");
        return false;
    }
    if (b.paymentType === "installment") {
        const row = b.installments.find((r) => r.id === v.installmentId);
        if (!row) { alert("Choose which installment this payment is for", "error"); return false; }
        if (amount <= 0) { alert("Enter the amount paid", "error"); return false; }
        if (amount > row.balance) { alert(`Only ₹${row.balance.toLocaleString("en-IN")} is left on ${row.label}`, "error"); return false; }
    } else if (amount <= 0 && discount <= 0) {
        alert("Enter a payment amount and/or a discount", "error");
        return false;
    }
    try {
        const res = await postData(`tyrebills/${b._id}/payment`, b.paymentType === "installment"
            ? { amount, mode: v.mode, installmentId: v.installmentId }
            // The API sets the challan's total discount, so send the existing discount plus the extra one entered now.
            : { amount, mode: v.mode, discount: (Number(b.discount) || 0) + discount });
        alert(res.message || "Payment recorded", "success");
        return true;
    } catch (err: any) {
        alert(err?.message || "Failed to record payment", "error");
        return false;
    }
}
