// WhatsApp send status of a bill: a small badge for list rows/cards, and a status line with Resend for the view page.
import { useState } from "react";
import { Badge, type Tone } from "./ui/Basics";
import type { WaSummary } from "../Services/WhatsAppApi";
import { waDate } from "../Utils/whatsapp";

const LABEL: Record<string, string> = { pending: "Sending", awaiting_pdf: "Sending", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed" };
const TONE: Record<string, Tone> = { pending: "neutral", awaiting_pdf: "neutral", sent: "success", delivered: "success", read: "success", failed: "error" };

/** Shown only when the bill has been through WhatsApp. */
export const WaBadge = ({ wa }: { wa?: WaSummary | null }) => {
    if (!wa?.status) return null;
    const failed = wa.status === "failed";
    return (
        <span className="wa-badge" data-testid="wa-badge" title={failed ? wa.error || "WhatsApp message failed" : `WhatsApp: ${LABEL[wa.status] || wa.status}`}>
            <Badge tone={TONE[wa.status] || "neutral"}>{LABEL[wa.status] || wa.status}</Badge>
        </span>
    );
};

/** "WhatsApp: Delivered · 13/11/2026" or "WhatsApp failed: <reason>", with a Resend button. */
export const WaStatusLine = ({ wa, onResend }: { wa?: WaSummary | null; onResend: () => Promise<unknown> }) => {
    const [busy, setBusy] = useState(false);
    if (!wa?.status) return null;
    const failed = wa.status === "failed";
    return (
        <div className="d-flex align-items-center flex-wrap gap-2 mt-3" data-testid="wa-status-line">
            <span className={`t-sm${failed ? " t-error" : " t-muted"}`}>
                {failed
                    ? `WhatsApp failed: ${wa.error || "message could not be sent"}`
                    : `WhatsApp: ${LABEL[wa.status] || wa.status}${wa.at ? ` · ${waDate(wa.at)}` : ""}`}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                onClick={async () => { setBusy(true); try { await onResend(); } finally { setBusy(false); } }}>
                {busy && <span className="spinner" aria-hidden="true" />}Resend
            </button>
        </div>
    );
};

/** True when a bill has already gone out (so editing it starts with the tick off). */
export const waAlreadySent = (wa?: WaSummary | null) => !!wa && ["sent", "delivered", "read"].includes(wa.status);

/** The "Send on WhatsApp" tick next to Save. The caller renders it only when WhatsApp is enabled. */
export const WaTick = ({ checked, onChange, phoneOk, sentAt }: { checked: boolean; onChange: (v: boolean) => void; phoneOk: boolean; sentAt?: string }) => (
    <label className="wa-tick" htmlFor="wa-send">
        <input id="wa-send" type="checkbox" className="form-check-input m-0" checked={checked && phoneOk} disabled={!phoneOk}
            onChange={(e) => onChange(e.target.checked)} />
        <span className="wa-tick-text">
            <span>Send on WhatsApp</span>
            {!phoneOk
                ? <small data-testid="wa-hint">Add a valid 10-digit phone to send</small>
                : sentAt ? <small data-testid="wa-hint">Already sent on {waDate(sentAt)}</small> : null}
        </span>
    </label>
);
