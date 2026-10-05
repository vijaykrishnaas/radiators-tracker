import React, { useRef } from "react";
import { Link } from "react-router-dom";
import Icons from "../../Components/Icons";
import { ActionMenu, type MenuItem } from "./Menu";
import { usePhone } from "./hooks";

/* ---------------- Page header (§3.2.8) ---------------- */
export type HeaderAction = {
    label: string;
    icon?: string;
    onClick: () => void;
    disabled?: boolean;
    /** Exports etc.: collapse into the "More" menu on phones. */
    collapse?: boolean;
};

export function PageHeader({
    title,
    subtitle,
    back,
    actions = [],
    primary,
    children,
}: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    back?: { to: string; label: string } | { onClick: () => void; label: string };
    actions?: HeaderAction[];
    primary?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const phone = usePhone();
    const visible = phone ? actions.filter((a) => !a.collapse) : actions;
    const collapsed = phone ? actions.filter((a) => a.collapse) : [];
    return (
        <div className="page-header">
            <div className="page-header-text">
                {back && ("to" in back ? (
                    <Link to={back.to} className="page-back"><Icons iconName="arrow-left" />{back.label}</Link>
                ) : (
                    <button type="button" className="page-back btn btn-link p-0" onClick={back.onClick}><Icons iconName="arrow-left" />{back.label}</button>
                ))}
                <h1 className="page-title">{title}</h1>
                {subtitle && <div className="page-subtitle">{subtitle}</div>}
            </div>
            {(actions.length > 0 || primary || children) && (
                <div className="page-actions">
                    {children}
                    {collapsed.length > 0 && (
                        <ActionMenu
                            label="More actions"
                            icon="more-h"
                            text="More"
                            buttonClassName="btn btn-secondary"
                            items={collapsed.map<MenuItem>((a) => ({ label: a.label, icon: a.icon, onClick: a.onClick, disabled: a.disabled }))}
                        />
                    )}
                    {visible.map((a) => (
                        <button key={a.label} type="button" className="btn btn-secondary" onClick={a.onClick} disabled={a.disabled}>
                            {a.icon && <Icons iconName={a.icon} />}
                            {a.label}
                        </button>
                    ))}
                    {primary}
                </div>
            )}
        </div>
    );
}

/* ---------------- Card header ---------------- */
export function CardHead({ title, subtitle, actions, as: Tag = "h2" }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; as?: "h2" | "h3" }) {
    return (
        <div className="card-head">
            <div className="min-w-0">
                <Tag className="card-title">{title}</Tag>
                {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

export const SectionDivider = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <div className="section-divider"><span>{label}</span>{children}</div>
);

/* ---------------- Field ---------------- */
export function Field({
    label,
    htmlFor,
    required,
    error,
    help,
    className = "",
    children,
    labelId,
}: {
    label?: React.ReactNode;
    htmlFor?: string;
    required?: boolean;
    error?: React.ReactNode;
    help?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
    labelId?: string;
}) {
    const errId = htmlFor ? `${htmlFor}-error` : undefined;
    return (
        <div className={`field${error ? " has-error" : ""} ${className}`}>
            {label && (
                <label className="form-label" htmlFor={htmlFor} id={labelId}>
                    {label}
                    {required && <span className="req" aria-hidden="true"> *</span>}
                </label>
            )}
            {children}
            {error ? <span className="field-error" id={errId} role="alert">{error}</span> : help ? <span className="field-help" id={htmlFor ? `${htmlFor}-help` : undefined}>{help}</span> : null}
        </div>
    );
}

/* ---------------- Badges (§4.12) ---------------- */
export type Tone = "success" | "warning" | "error" | "info" | "neutral" | "brand";
export const Badge = ({ tone = "neutral", dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) => (
    <span className={`badge badge-${tone}`}>{dot && <span className="badge-dot" aria-hidden="true" />}{children}</span>
);
export const paymentTone = (s: string): Tone => (s === "Received" ? "success" : s === "Partial" ? "warning" : "error");
export const PaymentBadge = ({ status }: { status: string }) => <Badge tone={paymentTone(status)} dot>{status}</Badge>;

/* ---------------- KPI tile (§4.13) ---------------- */
export type KpiTone = "neutral" | "brand" | "success" | "error";
export function KpiCard({ label, value, icon, tone = "neutral", caption, loading, valueTone }: {
    label: string; value: React.ReactNode; icon: string; tone?: KpiTone; caption?: string; loading?: boolean; valueTone?: "error";
}) {
    return (
        <div className="kpi">
            <div className={`kpi-icon${tone !== "neutral" ? ` is-${tone}` : ""}`} aria-hidden="true"><Icons iconName={icon} /></div>
            <p className="kpi-label">{label}</p>
            {loading ? (
                <span className="skel mt-2" style={{ height: 24, width: "70%" }} aria-hidden="true" />
            ) : (
                <p className={`kpi-value${valueTone === "error" ? " is-error" : ""}`}>{value}</p>
            )}
            {caption && <p className="kpi-caption">{caption}</p>}
        </div>
    );
}
export const KpiGrid = ({ count, children }: { count: 3 | 4 | 6; children: React.ReactNode }) => (
    <div className={`kpi-grid is-${count}`}>{children}</div>
);

/* ---------------- States (§4.17) ---------------- */
export function EmptyState({ icon = "receipt-text", title, text, action }: { icon?: string; title: string; text?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="empty-state" role="status">
            <span className="empty-tile" aria-hidden="true"><Icons iconName={icon} /></span>
            <p className="empty-title">{title}</p>
            {text && <p className="empty-text">{text}</p>}
            {action}
        </div>
    );
}
export function ErrorState({ title, onRetry }: { title: string; onRetry?: () => void }) {
    return (
        <div className="empty-state" role="alert">
            <span className="empty-tile is-error" aria-hidden="true"><Icons iconName="alert-circle" /></span>
            <p className="empty-title">{title}</p>
            <p className="empty-text">Check your connection and try again.</p>
            {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Retry</button>}
        </div>
    );
}
export const SkeletonRows = ({ rows = 5 }: { rows?: number }) => (
    <div className="skel-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="skel-row"><span className="skel" /><span className="skel" /><span className="skel" /><span className="skel" /></div>
        ))}
    </div>
);
export const SkeletonCards = ({ count = 3 }: { count?: number }) => (
    <div className="m-list" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
            <div key={i} className="m-card"><span className="skel mb-2" style={{ width: "50%", height: 16 }} /><span className="skel mb-3" style={{ width: "70%" }} /><span className="skel" /></div>
        ))}
    </div>
);

/* ---------------- Callout (inline alert) ---------------- */
export function Callout({ tone = "info", title, children }: { tone?: "success" | "warning" | "error" | "info"; title?: string; children: React.ReactNode }) {
    const icon = tone === "success" ? "check-circle" : tone === "warning" ? "alert-triangle" : tone === "error" ? "alert-circle" : "info";
    return (
        <div className={`callout tone-${tone}`} role={tone === "error" || tone === "warning" ? "alert" : "status"}>
            <Icons iconName={icon} />
            <div className="callout-body">
                {title && <span className="callout-title">{title}</span>}
                <div>{children}</div>
            </div>
        </div>
    );
}

/* ---------------- Busy overlay (PDF/Excel generation, login) ---------------- */
export const BusyOverlay = ({ show, label = "Preparing…" }: { show: boolean; label?: string }) =>
    show ? (
        <div className="busy-overlay" role="status" aria-live="assertive">
            <div className="busy-tile"><span className="spinner" aria-hidden="true" />{label}</div>
        </div>
    ) : null;

/* ---------------- Segmented control (§4.18) ---------------- */
export function SegmentedControl<T extends string>({
    options, value, onChange, label, full = false, className = "", radio = false,
}: {
    options: { value: T; label: string }[];
    value: T | null;
    onChange: (v: T) => void;
    label: string;
    full?: boolean;
    className?: string;
    /** A form value (payment mode, attendance mode): radiogroup semantics instead of tabs. */
    radio?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const itemRole = radio ? "radio" : "tab";
    const onKey = (e: React.KeyboardEvent, i: number) => {
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = options.length - 1;
        if (next < 0) return;
        e.preventDefault();
        onChange(options[next].value);
        ref.current?.querySelectorAll<HTMLButtonElement>(`[role='${itemRole}']`)[next]?.focus();
    };
    const activeIndex = options.findIndex((o) => o.value === value);
    return (
        <div ref={ref} className={`segmented${full ? " is-full" : ""} ${className}`} role={radio ? "radiogroup" : "tablist"} aria-label={label}>
            {options.map((o, i) => (
                <button
                    key={o.value}
                    type="button"
                    role={itemRole}
                    className="segmented-btn"
                    aria-selected={radio ? undefined : o.value === value}
                    aria-checked={radio ? o.value === value : undefined}
                    tabIndex={o.value === value || (activeIndex < 0 && i === 0) ? 0 : -1}
                    onClick={() => onChange(o.value)}
                    onKeyDown={(e) => onKey(e, i)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/* ---------------- Sticky form footer (§4.18) ---------------- */
export function FormFooter({ totalLabel, total, children }: { totalLabel?: string; total?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="form-footer">
            {total !== undefined && (
                <div className="form-footer-total" aria-live="polite">
                    <span>{totalLabel || "Total amount"}</span>
                    <strong>{total}</strong>
                </div>
            )}
            <div className="form-footer-actions">{children}</div>
        </div>
    );
}

/* ---------------- Progress ---------------- */
export const ProgressBar = ({ value, label }: { value: number; label: string }) => (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
);

/* ---------------- Spinner button content ---------------- */
export const BtnSpinner = ({ show }: { show: boolean }) => (show ? <span className="spinner" aria-hidden="true" /> : null);

/* ---------------- Horizontally scrolling tab strip; fades edges only when it overflows (§4.18) ---------------- */
export function TabsScroll({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = React.useState(false);
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return <div ref={ref} className={`tabs-scroll${overflowing ? " is-overflowing" : ""}`}>{children}</div>;
}
