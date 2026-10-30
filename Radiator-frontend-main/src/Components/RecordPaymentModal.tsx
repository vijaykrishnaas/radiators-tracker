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
    const [errs, setErrs] = useState<{ amount?: string; discount?: string }>({});
    const plan = installments && installments.length > 0 ? installments : null;
    const chosen = plan?.find((r) => r.id === instId) || null;
    // Opening on an installment pre-fills what is left on it (the usual case: the customer pays the month in full).
    const pickInstallment = (id: string) => {
        setInstId(id);
        const r = plan?.find((x) => x.id === id);
        setAmount(r ? String(r.balance) : "");
        setErrs({});
    };
    useEffect(() => {
        if (!open) return;
        setDiscount(""); setMode("cash"); setErrs({});
        if (plan) pickInstallment(plan.find((r) => r.id === initialInstallmentId)?.id || plan[0].id);
        else { setAmount(""); setInstId(""); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const disc = Number(discount) || 0;
    // To the paisa: some verticals send pending with float noise (1234.56 − 1000.01 = 234.54999999999995), and a
    // discount or payment of exactly what is left must still pass the checks below.
    const owed = Math.round(pending * 100) / 100;
    const upTo = chosen ? chosen.balance : Math.max(Math.round((owed - disc) * 100) / 100, 0);
    // The form skips the browser's own checks (see Modal), so the max on the inputs below is only a hint: without this
    // an amount above what is owed was sent, and the server quietly kept only what was owed.
    const submit = () => {
        const e: { amount?: string; discount?: string } = {};
        if (!plan && disc > owed) e.discount = `The discount can't be more than the ${money(owed)} pending`;
        else if ((Number(amount) || 0) > upTo) e.amount = `Only ${money(upTo)} is left${chosen ? ` on ${chosen.label}` : " to collect"}`;
        setErrs(e);
        if (!e.amount && !e.discount) onSubmit({ amount, discount: plan ? "" : discount, mode, ...(plan ? { installmentId: instId } : {}) });
    };
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            busy={busy}
            initialFocus="#payment-amount"
            as="form"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
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
                    error={errs.discount}
                    help={!discountHelpInline ? "Optional. Reduces the amount owed." : undefined}
                >
                    <AffixInput id="payment-discount" aria-describedby={!discountHelpInline ? "payment-discount-help" : undefined} prefix="₹" type="number" inputMode="decimal" min={0} max={pending}
                        value={discount} placeholder="0" onChange={(e) => { setDiscount(e.target.value); setErrs({}); }} />
                    {disc > 0 && (
                        <p className="t-sm t-muted mt-2 mb-0 d-flex justify-content-between">
                            <span>Pending after discount</span>
                            <span className="t-strong t-semibold tabular">{money(Math.max(pending - disc - (Number(amount) || 0), 0))}</span>
                        </p>
                    )}
                </Field>
                )}
                <Field label="Amount received now (₹)" htmlFor="payment-amount" error={errs.amount}>
                    <AffixInput id="payment-amount" prefix="₹" type="number" inputMode="decimal" min={0} max={upTo}
                        value={amount} placeholder={`Up to ${upTo}`} onChange={(e) => { setAmount(e.target.value); setErrs({}); }} />
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
