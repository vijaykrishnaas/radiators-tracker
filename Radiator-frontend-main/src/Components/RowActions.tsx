import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowAction = {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
};

/**
 * A table-row "⋯" action menu whose dropdown is rendered into <body> via a
 * portal and positioned fixed. Because it lives outside the table, it can never
 * be clipped by the card's overflow nor elongate a horizontally-scrolling table
 * (the failure modes of the old Bootstrap dropdowns inside overflow containers).
 */
const RowActions: React.FC<{ items: RowAction[]; ariaLabel?: string }> = ({ items, ariaLabel = "Row actions" }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const place = () => {
        const b = btnRef.current?.getBoundingClientRect();
        if (!b) return;
        const menuW = 200;
        const menuH = Math.min(items.length * 40 + 12, 360);
        let left = b.right - menuW;
        if (left < 8) left = 8;
        if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
        let top = b.bottom + 6;
        if (top + menuH > window.innerHeight - 8) top = b.top - menuH - 6; // flip up
        if (top < 8) top = 8;
        setPos({ top, left });
    };

    useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: Event) => {
            if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        const onMove = () => setOpen(false); // close on scroll/resize so it never floats stale
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
        };
    }, [open]);

    return (
        <>
            <button ref={btnRef} type="button" className="row-actions-trigger" aria-label={ariaLabel}
                aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
                </svg>
            </button>
            {open && pos && createPortal(
                <div ref={menuRef} className="row-actions-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
                    {items.map((it, i) => (
                        <button key={i} type="button" role="menuitem" disabled={it.disabled}
                            className={`row-actions-item${it.danger ? " is-danger" : ""}`}
                            onClick={() => { if (it.disabled) return; setOpen(false); it.onClick(); }}>
                            {it.icon && <span className="row-actions-icon">{it.icon}</span>}
                            {it.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
};

export default RowActions;
