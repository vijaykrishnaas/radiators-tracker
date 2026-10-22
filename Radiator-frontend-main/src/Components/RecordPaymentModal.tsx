import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { Field, SegmentedControl } from "./ui/Basics";
import { AffixInput } from "./ui/Inputs";
import { money } from "../Utils/format";

export const PAYMENT_MODE_OPTIONS = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];

/** One installment row the payment can go to (tyre challans). */
export type PayableInstallment = { id: string; label: string; dueDate: string; balance: number; overdue?: boolean };

/**
 * Record Payment (spec §5): summary strip, optional discount, amount received now, and — for
 * Engineering — payment mode. Validation and the API call stay in each screen (`onSubmit`).
 * With `installments` (tyre challans on a plan) the discount is replaced by a choice of installment, and the
 * amount is limited to what is left on it.
 */
export default function RecordPaymentModal({
    open,
    title,
    totalLabel = "Total",
    total,
    received,
    pending,
    withMode = false,
    discountHelpInline = true,
    installments,
    initialInstallmentId,
    busy,
    onClose,
    onSubmit,
}: {
    open: boolean;
    title: string;
    totalLabel?: string;
    total: number;
    received: number;
    pending: number;
    withMode?: boolean;
    /** Radiator/automobile show "— optional, reduces the amount owed" in the label; engineering as helper text. */
    discountHelpInline?: boolean;
    /** Unpaid installments, earliest first. When given, the payment is recorded against the chosen one. */
    installments?: PayableInstallment[];
    initialInstallmentId?: string;
    busy: boolean;
    onClose: () => void;
    onSubmit: (v: { amount: string; discount: string; mode: string; installmentId?: string }) => void;
}) {
    const [amount, setAmount] = useState("");
    const [discount, setDiscount] = useState("");
    const [mode, setMode] = useState("cash");
    const [instId, setInstId] = useState("");
    const plan = installments && installments.length > 0 ? installments : null;
    const chosen = plan?.find((r) => r.id === instId) || null;
    // Opening on an installment pre-fills what is left on it (the usual case: the customer pays the month in full).
    const pickInstallment = (id: string) => {
        setInstId(id);
        const r = plan?.find((x) => x.id === id);
        setAmount(r ? String(r.balance) : "");
    };
    useEffect(() => {
        if (!open) return;
        setDiscount(""); setMode("cash");
        if (plan) pickInstallment(plan.find((r) => r.id === initialInstallmentId)?.id || plan[0].id);
        else { setAmount(""); setInstId(""); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const disc = Number(discount) || 0;
    const upTo = chosen ? chosen.balance : Math.max(pending - disc, 0);
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            busy={busy}
            initialFocus="#payment-amount"
            as="form"
            onSubmit={(e) => { e.preventDefault(); onSubmit({ amount, discount: plan ? "" : discount, mode, ...(plan ? { installmentId: instId } : {}) }); }}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || pending <= 0}>
                        {busy && <span className="spinner" aria-hidden="true" />}
                        {busy ? "Saving..." : "Record Payment"}
                    </button>
                </>
            }
        >
            <dl className="modal-summary">
                <div><dt>{totalLabel}</dt><dd>{money(total)}</dd></div>
                <div><dt>Received so far</dt><dd className="t-success">{money(received)}</dd></div>
                <div><dt>Pending</dt><dd className="t-error">{money(pending)}</dd></div>
            </dl>
            <div className="d-grid gap-3">
                {plan && (
                    <Field label="Installment" htmlFor="payment-installment" help={chosen ? `${money(chosen.balance)} left · due ${new Date(chosen.dueDate).toLocaleDateString("en-IN")}${chosen.overdue ? " (overdue)" : ""}` : undefined}>
                        <select id="payment-installment" className="form-select" value={instId} onChange={(e) => pickInstallment(e.target.value)}>
                            {plan.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.label} · {money(r.balance)}{r.overdue ? " · overdue" : ""}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                {!plan && (
                <Field
                    label={discountHelpInline ? <>Discount (₹) <span className="t-xs t-muted">— optional, reduces the amount owed</span></> : "Discount (₹)"}
                    htmlFor="payment-discount"
                    help={!discountHelpInline ? "Optional. Reduces the amount owed." : undefined}
                >
                    <AffixInput id="payment-discount" aria-describedby={!discountHelpInline ? "payment-discount-help" : undefined} prefix="₹" type="number" inputMode="decimal" min={0} max={pending}
                        value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} />
                    {disc > 0 && (
                        <p className="t-sm t-muted mt-2 mb-0 d-flex justify-content-between">
                            <span>Pending after discount</span>
                            <span className="t-strong t-semibold tabular">{money(Math.max(pending - disc - (Number(amount) || 0), 0))}</span>
                        </p>
                    )}
                </Field>
                )}
                <Field label="Amount received now (₹)" htmlFor="payment-amount">
                    <AffixInput id="payment-amount" prefix="₹" type="number" inputMode="decimal" min={0} max={upTo}
                        value={amount} placeholder={`Up to ${upTo}`} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                {withMode && (
                    <div className="field">
                        <span className="form-label d-block" id="payment-mode-label">Payment mode</span>
                        <SegmentedControl radio label="Payment mode" options={PAYMENT_MODE_OPTIONS} value={mode} onChange={setMode} full />
                    </div>
                )}
            </div>
        </Modal>
    );
}
