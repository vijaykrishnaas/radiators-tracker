import React, { useId, useMemo, useState } from "react";
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
                    <span className="pager-rows">
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
                {/* Badges and the ⋮ menu wrap as one group, so the menu is never left alone on a line. */}
                {(badge || menu) && <span className="m-card-tail">{badge}{menu}</span>}
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
    /** Server-sorted lists (DataList gets `onSort`): the sortBy key the API understands. */
    sortKey?: string;
    /** Lists sorted in the browser: the value this column sorts by. */
    sortValue?: (row: T) => string | number | null | undefined;
    /** Name for the phone "Sort by" menu when the header is not plain text. */
    sortLabel?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" };
/** Query params for a server-sorted list (empty = the list's default order). */
export const sortParams = (s: SortState | null) => (s ? { sortBy: s.key, sortDir: s.dir } : {});
/** One click sorts A→Z / low→high, the next Z→A / high→low, the third goes back to the list's default order. */
export const nextSort = (cur: SortState | null, key: string): SortState | null =>
    cur?.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function compareValues(a: unknown, b: unknown) {
    const blank = (v: unknown) => v === null || v === undefined || v === "";
    if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1; // blanks last
    if (typeof a === "number" && typeof b === "number") return a - b;
    return collator.compare(String(a), String(b));
}

/** Header cell content: a button that cycles the sort, with an arrow for the current direction. */
export function SortButton({ label, active, onClick }: { label: React.ReactNode; active?: "asc" | "desc"; onClick: () => void }) {
    return (
        <button type="button" className={`th-sort${active ? " is-active" : ""}`} onClick={onClick}>
            <span>{label}</span>
            <Icons iconName={active === "asc" ? "arrow-up" : active === "desc" ? "arrow-down" : "arrow-up-down"} className="th-sort-icon" />
        </button>
    );
}

/** Browser-side sorting for small tables outside DataList (e.g. a dashboard table). */
export function useClientSort<T>(rows: T[], value: (row: T, key: string) => unknown, initial: SortState | null = null) {
    const [sort, setSort] = useState<SortState | null>(initial);
    const sorted = useMemo(() => {
        if (!sort) return rows;
        const out = [...rows].sort((a, b) => compareValues(value(a, sort.key), value(b, sort.key)));
        return sort.dir === "desc" ? out.reverse() : out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sort]);
    const header = (key: string, label: React.ReactNode) => (
        <SortButton label={label} active={sort?.key === key ? sort.dir : undefined} onClick={() => setSort((s) => nextSort(s, key))} />
    );
    const ariaSort = (key: string) => (sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined);
    return { sorted, sort, setSort, header, ariaSort };
}

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
    sort,
    onSort,
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
    /** Server-sorted list: the current order and a setter (reset to page 1 and refetch on change). */
    sort?: SortState | null;
    onSort?: (s: SortState | null) => void;
}) {
    const phone = usePhone();
    const showRows = status === "ready" && rows.length > 0;

    // Without onSort, columns with a sortValue sort the rows here in the browser.
    const serverSort = !!onSort;
    const [localSort, setLocalSort] = useState<SortState | null>(null);
    const active = serverSort ? sort ?? null : localSort;
    const setActive = serverSort ? onSort! : setLocalSort;
    const sortKeyOf = (c: Column<T>) => (serverSort ? c.sortKey : c.sortValue ? c.key : undefined);
    const sortable = columns.filter((c) => sortKeyOf(c));
    const shown = useMemo(() => {
        if (serverSort || !active) return rows;
        const col = columns.find((c) => c.key === active.key);
        if (!col?.sortValue) return rows;
        const out = [...rows].sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b)));
        return active.dir === "desc" ? out.reverse() : out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, active, serverSort]);
    const labelOf = (c: Column<T>) => c.sortLabel ?? (typeof c.header === "string" ? c.header : c.key);
    // Phones show cards, not headers: the same sort is a "Sort by" menu above them.
    const phoneSort = sortable.length > 0 && (
        <div className="m-sort">
            <label htmlFor={`${caption || "list"}-sort`.replace(/\s+/g, "-")} className="m-sort-label">Sort by</label>
            <select id={`${caption || "list"}-sort`.replace(/\s+/g, "-")} className="form-select"
                value={active ? `${active.key}:${active.dir}` : ""}
                onChange={(e) => {
                    const [key, dir] = e.target.value.split(":");
                    setActive(key ? { key, dir: dir as "asc" | "desc" } : null);
                }}>
                <option value="">Default order</option>
                {sortable.flatMap((c) => {
                    const k = sortKeyOf(c)!;
                    return [
                        <option key={`${k}:asc`} value={`${k}:asc`}>{labelOf(c)} ↑</option>,
                        <option key={`${k}:desc`} value={`${k}:desc`}>{labelOf(c)} ↓</option>,
                    ];
                })}
            </select>
        </div>
    );

    let body: React.ReactNode;
    if (status === "loading") body = phone ? <SkeletonCards /> : <SkeletonRows />;
    else if (status === "error") body = <ErrorState title={errorTitle} onRetry={onRetry} />;
    else if (!rows.length) body = <EmptyState {...empty} />;
    else if (phone) {
        body = (
            <>
                {mobileSummary && <div className="m-summary">{mobileSummary}</div>}
                {phoneSort}
                <div className="m-list">{shown.map((r, i) => <React.Fragment key={rowKey(r, i)}>{mobileCard(r, i)}</React.Fragment>)}</div>
            </>
        );
    } else {
        body = (
            <div className="table-wrap">
                <table className="table">
                    {caption && <caption className="visually-hidden">{caption}</caption>}
                    <thead>
                        <tr>
                            {columns.map((c) => {
                                const k = sortKeyOf(c);
                                const dir = k && active?.key === k ? active.dir : undefined;
                                return (
                                    <th key={c.key} scope="col" className={c.headerClassName ?? (c.className?.includes("num") ? "num" : undefined)} style={c.width ? { width: c.width } : undefined}
                                        aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                                        {k ? <SortButton label={c.header} active={dir} onClick={() => setActive(nextSort(active, k))} /> : c.header}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r, i) => {
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
