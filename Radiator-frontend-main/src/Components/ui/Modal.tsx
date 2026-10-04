import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Icons from "../../Components/Icons";
import { focusables, trapTab, useReturnFocus, useScrollLock } from "./hooks";

type Size = "sm" | "md" | "lg";

/**
 * Accessible dialog (spec §4.16): role=dialog, aria-modal, labelled; focus moves in, is trapped,
 * returns to the trigger; Esc closes unless `busy`; body scroll locked.
 * `initialFocus`: "first" (first field, default) | "confirm" (the last footer button) | a CSS selector.
 */
export default function Modal({
    open,
    onClose,
    title,
    description,
    size = "md",
    busy = false,
    footer,
    children,
    danger = false,
    initialFocus = "first",
    as = "div",
    onSubmit,
}: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    description?: React.ReactNode;
    size?: Size;
    busy?: boolean;
    footer?: React.ReactNode;
    children?: React.ReactNode;
    danger?: boolean;
    initialFocus?: "first" | "confirm" | string;
    /** Render the panel as a <form> so Enter submits. */
    as?: "div" | "form";
    onSubmit?: (e: React.FormEvent) => void;
}) {
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();
    const descId = useId();
    useScrollLock(open);
    useReturnFocus(open);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => {
            const root = panelRef.current;
            if (!root) return;
            let target: HTMLElement | null = null;
            if (initialFocus === "confirm") {
                const btns = root.querySelectorAll<HTMLElement>(".ui-modal-foot .btn:not([disabled])");
                target = btns[btns.length - 1] || null;
            } else if (initialFocus !== "first") {
                target = root.querySelector<HTMLElement>(initialFocus);
            }
            if (!target) {
                target = root.querySelector<HTMLElement>(".ui-modal-body input:not([disabled]):not([type='hidden']), .ui-modal-body textarea:not([disabled]), .ui-modal-body select:not([disabled])");
            }
            if (!target) target = focusables(root).find((el) => !el.classList.contains("ui-modal-close")) || root;
            target.focus();
        }, 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            // A react-select with its menu open handles Esc itself.
            const t = e.target as HTMLElement;
            if (t.getAttribute("aria-expanded") === "true") return;
            e.stopPropagation();
            if (!busy) onClose();
            return;
        }
        trapTab(e, panelRef.current);
    };

    const Panel = as as "div";
    return createPortal(
        <div
            className="ui-modal-backdrop"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
        >
            <Panel
                ref={panelRef as React.Ref<HTMLDivElement>}
                className={`ui-modal is-${size}`}
                role={danger ? "alertdialog" : "dialog"}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descId : undefined}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                {...(as === "form" ? { onSubmit, noValidate: true } : {})}
            >
                <div className="ui-modal-head">
                    <div className="ui-modal-head-text">
                        {danger && (
                            <span className="ui-modal-danger-tile" aria-hidden="true"><Icons iconName="alert-triangle" /></span>
                        )}
                        <h2 className="ui-modal-title" id={titleId}>{title}</h2>
                        {description && <p className="ui-modal-desc" id={descId}>{description}</p>}
                    </div>
                    <button type="button" className="btn btn-icon ui-modal-close" aria-label="Close" onClick={onClose} disabled={busy}>
                        <Icons iconName="x" />
                    </button>
                </div>
                {children !== undefined && <div className="ui-modal-body">{children}</div>}
                {footer && <div className="ui-modal-foot">{footer}</div>}
            </Panel>
        </div>,
        document.body,
    );
}

/** Small confirm dialog (danger by default). Copy is passed in unchanged from each screen. */
export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    busyLabel,
    onConfirm,
    onCancel,
    busy = false,
    danger = true,
    disabled = false,
    children,
}: {
    open: boolean;
    title: React.ReactNode;
    message?: React.ReactNode;
    confirmLabel: string;
    busyLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
    danger?: boolean;
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={title}
            size="sm"
            danger={danger}
            busy={busy}
            initialFocus={children ? "first" : "confirm"}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy || disabled}>
                        {busy && <span className="spinner" aria-hidden="true" />}
                        {busy && busyLabel ? busyLabel : confirmLabel}
                    </button>
                </>
            }
        >
            {message && <p className="t-sm t-muted mb-0">{message}</p>}
            {children}
        </Modal>
    );
}
