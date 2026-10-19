import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import Icons from "../../Components/Icons";
import { inSelectPortal, trapTab } from "./hooks";

export type MenuItem =
    | { divider: true }
    | {
        divider?: false;
        label: string;
        icon?: string | React.ReactNode;
        onClick?: () => void;
        to?: string;
        danger?: boolean;
        disabled?: boolean;
        /** Visible reason under a disabled item (spec §4.11), e.g. "Fully paid". */
        reason?: string;
    };

type TriggerProps = {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    "aria-haspopup": "menu" | "dialog";
    "aria-expanded": boolean;
    "aria-controls"?: string;
};

let menuSeq = 0;

/**
 * Popover anchored to a trigger, rendered in a portal (escapes table overflow), positioned fixed.
 * Closes on outside click, Esc (focus returns to the trigger), scroll and resize.
 */
export function Popover({
    trigger,
    children,
    align = "end",
    role = "dialog",
    width,
    onOpenChange,
    className = "",
    offset = 6,
    label,
}: {
    trigger: (p: TriggerProps) => React.ReactNode;
    children: (close: () => void) => React.ReactNode;
    align?: "start" | "end";
    role?: "menu" | "dialog";
    width?: number;
    onOpenChange?: (open: boolean) => void;
    className?: string;
    offset?: number;
    /** Accessible name of the panel. */
    label?: string;
}) {
    const [open, setOpenState] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(`popover-${++menuSeq}`);

    const setOpen = useCallback((v: boolean) => { setOpenState(v); onOpenChange?.(v); }, [onOpenChange]);
    const close = useCallback((refocus = true) => {
        setOpen(false);
        setPos(null);
        if (refocus) btnRef.current?.focus();
    }, [setOpen]);

    const place = useCallback(() => {
        const b = btnRef.current?.getBoundingClientRect();
        const p = panelRef.current;
        if (!b || !p) return false;
        // Trigger scrolled out of view: the menu has nothing to anchor to.
        if (b.bottom < 0 || b.top > window.innerHeight || b.right < 0 || b.left > window.innerWidth) return false;
        const w = p.offsetWidth;
        const h = p.offsetHeight;
        let left = align === "end" ? b.right - w : b.left;
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        let top = b.bottom + offset;
        if (top + h > window.innerHeight - 8 && b.top - h - offset > 8) top = b.top - h - offset;
        top = Math.max(8, top);
        setPos({ top, left });
        return true;
    }, [align, offset]);

    useLayoutEffect(() => { if (open) place(); }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: Event) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
            // Clicks inside a react-select menu portal (opened from this panel) must not close it.
            if (inSelectPortal(t)) return;
            close(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // A react-select inside the panel with its menu open handles Esc itself.
            if ((document.activeElement as HTMLElement | null)?.getAttribute("aria-expanded") === "true" && panelRef.current?.contains(document.activeElement)) return;
            e.stopPropagation();
            close(true);
        };
        // Follow the trigger when the page or a table scrolls; close only once it leaves the viewport.
        const onScroll = (e: Event) => {
            if (panelRef.current?.contains(e.target as Node) || inSelectPortal(e.target)) return;
            if (!place()) close(false);
        };
        let lastW = window.innerWidth;
        const onResize = () => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; close(false); } };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("touchstart", onDown);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("touchstart", onDown);
            document.removeEventListener("keydown", onKey, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open, close, place]);

    // Move focus into the panel once it is positioned.
    useEffect(() => {
        if (!open || !pos) return;
        const first = panelRef.current?.querySelector<HTMLElement>("[data-menu-item]:not([aria-disabled='true']), input, button, a[href], select");
        first?.focus();
    }, [open, pos]);

    const onTriggerKey = (e: React.KeyboardEvent) => {
        if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open) { e.preventDefault(); setOpen(true); }
    };

    const onPanelKey = (e: React.KeyboardEvent) => {
        if (e.key === "Tab") {
            // Tab must not reach a parent dialog's focus trap: the panel lives in a portal.
            e.stopPropagation();
            if (role === "menu") { e.preventDefault(); close(true); }
            else trapTab(e, panelRef.current);
            return;
        }
        if (role !== "menu") return;
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([aria-disabled='true'])") || []);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
    };

    return (
        <>
            {trigger({
                ref: btnRef,
                onClick: () => (open ? close(false) : setOpen(true)),
                onKeyDown: onTriggerKey,
                "aria-haspopup": role,
                "aria-expanded": open,
                "aria-controls": open ? idRef.current : undefined,
            })}
            {open && createPortal(
                <div
                    ref={panelRef}
                    id={idRef.current}
                    role={role}
                    aria-label={label}
                    tabIndex={-1}
                    className={`menu-panel ${className}`}
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, visibility: pos ? "visible" : "hidden" }}
                    onKeyDown={onPanelKey}
                >
                    {children(() => close(true))}
                </div>,
                document.body,
            )}
        </>
    );
}

export const renderIcon = (icon: string | React.ReactNode) =>
    typeof icon === "string" ? <Icons iconName={icon} /> : icon;

/** Menu items list (used inside Popover with role="menu"). */
export function MenuItems({ items, close }: { items: MenuItem[]; close: () => void }) {
    return (
        <>
            {items.map((it, i) => {
                if (it.divider) return <div key={`d${i}`} role="separator" className="menu-divider" />;
                const content = (
                    <>
                        {it.icon && renderIcon(it.icon)}
                        <span className="menu-item-text">
                            {it.label}
                            {it.disabled && it.reason && <span className="menu-item-reason">{it.reason}</span>}
                        </span>
                    </>
                );
                const cls = `menu-item${it.danger ? " is-danger" : ""}`;
                if (it.to && !it.disabled) {
                    return (
                        <Link key={i} to={it.to} role="menuitem" data-menu-item className={cls} tabIndex={-1} onClick={() => close()}>
                            {content}
                        </Link>
                    );
                }
                return (
                    <button
                        key={i}
                        type="button"
                        role="menuitem"
                        data-menu-item
                        tabIndex={-1}
                        className={cls}
                        aria-disabled={it.disabled || undefined}
                        onClick={() => {
                            if (it.disabled) return;
                            close();
                            it.onClick?.();
                        }}
                    >
                        {content}
                    </button>
                );
            })}
        </>
    );
}

/** Dots icon button + action menu. */
export function ActionMenu({
    items,
    label,
    icon = "more",
    buttonClassName = "btn btn-icon",
    text,
}: {
    items: MenuItem[];
    label: string;
    icon?: string;
    buttonClassName?: string;
    text?: string;
}) {
    return (
        <Popover
            role="menu"
            label={label}
            trigger={(p) => (
                <button type="button" className={buttonClassName} aria-label={text ? undefined : label} title={text ? undefined : label} {...p}>
                    <Icons iconName={icon} />
                    {text}
                </button>
            )}
        >
            {(close) => <MenuItems items={items} close={close} />}
        </Popover>
    );
}
