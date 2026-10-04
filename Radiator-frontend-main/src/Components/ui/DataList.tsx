import React, { useId } from "react";
import { Link } from "react-router-dom";
import Icons from "../../Components/Icons";
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from "./Basics";
import { usePhone } from "./hooks";

/* ---------------- Pagination (§4.10) ---------------- */
const LIMITS = [10, 20, 30, 50, 100];
export function Pagination({ page, totalPages, total, limit, onPage, onLimit }: {
    page: number; totalPages: number; total: number; limit: number; onPage: (p: number) => void; onLimit?: (n: number) => void;
}) {
    const id = useId();
    const pages = Math.max(1, totalPages || 1);
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    const limits = LIMITS.includes(limit) ? LIMITS : [...LIMITS, limit].sort((a, b) => a - b);
    return (
        <nav className="pager" aria-label="Pagination">
            <div className="pager-left">
                {onLimit && (
                    <span className="pager-rows d-flex align-items-center gap-2">
                        <label htmlFor={id} className="mb-0">Rows per page</label>
                        <select id={id} className="form-select" value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
                            {limits.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </span>
                )}
                <span className="tabular">{from}–{to} of {total}</span>
            </div>
            <div className="pager-right">
                <span className="tabular">Page {page} of {pages}</span>
                <button type="button" className="btn btn-icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                    <Icons iconName="chevron-left" />
                </button>
                <button type="button" className="btn btn-icon" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                    <Icons iconName="chevron-right" />
                </button>
            </div>
        </nav>
    );
}

/* ---------------- Mobile card (§4.8) ---------------- */
export type CardAmount = { label: string; value: React.ReactNode; tone?: "error" | "success" };
export function MobileCard({ title, to, onOpen, badge, menu, meta, meta2, amounts, right, leading, children }: {
    title: React.ReactNode;
    to?: string;
    onOpen?: () => void;
    badge?: React.ReactNode;
    menu?: React.ReactNode;
    meta?: (React.ReactNode | null | undefined | false)[];
    meta2?: React.ReactNode;
    amounts?: CardAmount[];
    right?: React.ReactNode;
    leading?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const metaParts = (meta || []).filter((m) => m !== null && m !== undefined && m !== false && m !== "");
    return (
        <article className="m-card">
            <div className="m-card-top">
                {leading}
                <h3 className="m-card-key">
                    {to ? <Link to={to} className="stretched-link">{title}</Link>
                        : onOpen ? <button type="button" className="btn btn-link p-0 m-0 stretched-link text-start t-md t-semibold t-strong" style={{ minHeight: 0 }} onClick={onOpen}>{title}</button>
                            : title}
                </h3>
                {right && <span className="m-card-right">{right}</span>}
                {badge}
                {menu}
            </div>
            {metaParts.length > 0 && (
                <p className="m-card-meta">{metaParts.map((m, i) => <React.Fragment key={i}>{i > 0 && " · "}{m}</React.Fragment>)}</p>
            )}
            {meta2 && <p className="m-card-meta is-clamp">{meta2}</p>}
            {amounts && amounts.length > 0 && (
                <dl className="m-card-amounts">
                    {amounts.map((a) => (
                        <div key={a.label}>
                            <dt>{a.label}</dt>
                            <dd className={a.tone === "error" ? "t-error" : a.tone === "success" ? "t-success" : undefined}>{a.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {children && <div className="m-card-extra">{children}</div>}
        </article>
    );
}

/* ---------------- Data list: table ≥768, cards <768, with states (§4.7, §4.8, §4.17) ---------------- */
export type Column<T> = {
    key: string;
    header: React.ReactNode;
    cell: (row: T, index: number) => React.ReactNode;
    /** "num" right-aligned tabular, "key" strong cell, "nowrap", "cell-actions". */
    className?: string;
    headerClassName?: string;
    width?: number | string;
};

export type ListStatus = "loading" | "error" | "ready";

export function DataList<T>({
    rows,
    rowKey,
    columns,
    status,
    refetching = false,
    onRetry,
    errorTitle,
    empty,
    mobileCard,
    expanded,
    footer,
    mobileSummary,
    toolbar,
    summary,
    above,
    pagination,
    caption,
}: {
    rows: T[];
    rowKey: (row: T, index: number) => string;
    columns: Column<T>[];
    status: ListStatus;
    refetching?: boolean;
    onRetry?: () => void;
    errorTitle: string;
    empty: { icon?: string; title: string; text?: React.ReactNode; action?: React.ReactNode };
    mobileCard: (row: T, index: number) => React.ReactNode;
    expanded?: (row: T) => React.ReactNode | null;
    footer?: React.ReactNode;
    mobileSummary?: React.ReactNode;
    toolbar?: React.ReactNode;
    summary?: React.ReactNode;
    above?: React.ReactNode;
    pagination?: React.ReactNode;
    caption?: string;
}) {
    const phone = usePhone();
    const showRows = status === "ready" && rows.length > 0;

    let body: React.ReactNode;
    if (status === "loading") body = phone ? <SkeletonCards /> : <SkeletonRows />;
    else if (status === "error") body = <ErrorState title={errorTitle} onRetry={onRetry} />;
    else if (!rows.length) body = <EmptyState {...empty} />;
    else if (phone) {
        body = (
            <>
                {mobileSummary && <div className="m-summary">{mobileSummary}</div>}
                <div className="m-list">{rows.map((r, i) => <React.Fragment key={rowKey(r, i)}>{mobileCard(r, i)}</React.Fragment>)}</div>
            </>
        );
    } else {
        body = (
            <div className="table-wrap">
                <table className="table">
                    {caption && <caption className="visually-hidden">{caption}</caption>}
                    <thead>
                        <tr>
                            {columns.map((c) => (
                                <th key={c.key} scope="col" className={c.headerClassName ?? (c.className?.includes("num") ? "num" : undefined)} style={c.width ? { width: c.width } : undefined}>
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const extra = expanded?.(r);
                            return (
                                <React.Fragment key={rowKey(r, i)}>
                                    <tr>
                                        {columns.map((c) => <td key={c.key} className={c.className}>{c.cell(r, i)}</td>)}
                                    </tr>
                                    {extra && (
                                        <tr className="row-expanded">
                                            <td colSpan={columns.length}>{extra}</td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    {footer && <tfoot>{footer}</tfoot>}
                </table>
            </div>
        );
    }

    return (
        <div className={`card list-card${refetching && showRows ? " is-refetching" : ""}`} aria-busy={status === "loading" || refetching}>
            {refetching && <div className="list-loading-bar" aria-hidden="true" />}
            {toolbar}
            {above}
            {summary && status === "ready" && <div className="list-summary">{summary}</div>}
            <div className="list-body">{body}</div>
            {pagination && status === "ready" && rows.length > 0 && pagination}
        </div>
    );
}

/** Uniform "no data yet" vs "no matches" empty copy (§4.17). */
export const emptyCopy = (opts: {
    filtered: boolean;
    noun: string;
    noDataText: string;
    noMatchText: string;
    onClear: () => void;
    action?: React.ReactNode;
    icon?: string;
}) => opts.filtered
    ? {
        icon: opts.icon,
        title: "No records match these filters",
        text: opts.noMatchText,
        action: <button type="button" className="btn btn-link" onClick={opts.onClear}>Clear filters</button>,
    }
    : { icon: opts.icon, title: `No ${opts.noun} yet`, text: opts.noDataText, action: opts.action };
