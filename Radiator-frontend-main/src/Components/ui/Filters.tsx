import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import debounce from "lodash.debounce";
import Icons from "../../Components/Icons";
import { trapTab, useDocumentKeydown, useMediaQuery, usePhone, useReturnFocus, useScrollLock } from "./hooks";

/* ---------------- Search (§4.9: debounce 200ms, fires at ≥3 chars or when cleared) ---------------- */
export function SearchInput({
    id,
    placeholder,
    onSearch,
    label,
    defaultValue = "",
}: {
    id: string;
    placeholder: string;
    onSearch: (term: string) => void;
    label?: string;
    defaultValue?: string;
}) {
    const [text, setText] = useState(defaultValue);
    const cb = useRef(onSearch);
    cb.current = onSearch;
    const fire = useMemo(() => debounce((v: string) => {
        if (v.length > 2 || v.length === 0) cb.current(v);
    }, 200), []);
    useEffect(() => () => fire.cancel(), [fire]);
    const hint = text.length > 0 && text.length < 3;
    return (
        <div className="filter-search">
            <label className="form-label" htmlFor={id}>{label || "Search"}</label>
            <div className="input-icon search-box">
                <Icons iconName="search" className="is-left" />
                <input
                    id={id}
                    type="search"
                    className="form-control has-left"
                    placeholder={placeholder}
                    value={text}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                    onChange={(e) => { setText(e.target.value); fire(e.target.value.trim()); }}
                />
                {hint && <span className="search-hint" id={`${id}-hint`}>Type at least 3 characters</span>}
            </div>
        </div>
    );
}

/* ---------------- Filter bar (§4.9) ---------------- */
export type FilterDef = {
    id: string;
    label: string;
    node: React.ReactNode;
    /** Shown inline at 768–1279 (first two are used if none are marked). */
    primary?: boolean;
};

function FilterField({ f }: { f: FilterDef }) {
    return (
        <div className="filter-item">
            <label className="form-label" htmlFor={f.id}>{f.label}</label>
            {f.node}
        </div>
    );
}

export function FilterBar({
    search,
    filters,
    activeCount = 0,
    onClear,
    tools,
    helper,
}: {
    search?: React.ReactNode;
    filters: FilterDef[];
    activeCount?: number;
    onClear?: () => void;
    tools?: React.ReactNode;
    helper?: React.ReactNode;
}) {
    const wide = useMediaQuery("(min-width: 1280px)");
    const phone = usePhone();
    const [moreOpen, setMoreOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    const clearBtn = onClear && activeCount > 0 && (
        <button type="button" className="btn btn-link px-1" onClick={onClear}>Clear filters</button>
    );
    const countBadge = activeCount > 0 && <span className="filter-count" aria-label={`${activeCount} active`}>{activeCount}</span>;

    if (wide || filters.length <= 1) {
        return (
            <div className="filter-bar">
                <div className="filter-grid">
                    {search}
                    {filters.map((f) => <FilterField key={f.id} f={f} />)}
                    {(clearBtn || tools) && <div className="filter-tools">{clearBtn}{tools}</div>}
                </div>
                {helper && <p className="field-help mb-0 mt-2">{helper}</p>}
            </div>
        );
    }

    if (phone) {
        return (
            <div className="filter-bar">
                <div className="filter-phone">
                    {search}
                    <div className={search ? "pt-4" : "w-100"}>
                        <button type="button" className={`btn btn-secondary${search ? " mt-1" : " w-100"}`} aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
                            <Icons iconName="filter" />Filters {countBadge}
                        </button>
                    </div>
                </div>
                {helper && <p className="field-help mb-0 mt-2">{helper}</p>}
                <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onClear={onClear} activeCount={activeCount}>
                    {filters.map((f) => <FilterField key={f.id} f={f} />)}
                    {tools && <div className="filter-tools">{tools}</div>}
                </FilterSheet>
            </div>
        );
    }

    // 768–1279: search + up to 2 primary filters inline; the rest expand below.
    const marked = filters.filter((f) => f.primary);
    const inline = (marked.length ? marked : filters).slice(0, 2);
    const rest = filters.filter((f) => !inline.includes(f));
    return (
        <div className="filter-bar">
            <div className="filter-row">
                {search}
                {inline.map((f) => <FilterField key={f.id} f={f} />)}
                <div className="filter-tools">
                    {rest.length > 0 && (
                        <button type="button" className="btn btn-secondary" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
                            <Icons iconName="filter" />Filters {countBadge}
                        </button>
                    )}
                    {clearBtn}
                    {tools}
                </div>
            </div>
            {moreOpen && rest.length > 0 && (
                <div className="filter-more">{rest.map((f) => <FilterField key={f.id} f={f} />)}</div>
            )}
            {helper && <p className="field-help mb-0 mt-2">{helper}</p>}
        </div>
    );
}

function FilterSheet({ open, onClose, onClear, activeCount, children }: {
    open: boolean; onClose: () => void; onClear?: () => void; activeCount: number; children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useScrollLock(open);
    useReturnFocus(open);
    useEffect(() => {
        if (open) setTimeout(() => ref.current?.querySelector<HTMLElement>(".sheet-head .btn-icon")?.focus(), 0);
    }, [open]);
    useDocumentKeydown(open, (e) => {
        if (ref.current?.contains(document.activeElement)) return;
        if (e.key === "Escape") { onClose(); return; }
        trapTab(e, ref.current);
    });
    if (!open) return null;
    return createPortal(
        <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div
                ref={ref}
                className="sheet"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="filter-sheet-title"
                onKeyDown={(e) => {
                    if (e.key === "Escape" && (e.target as HTMLElement).getAttribute("aria-expanded") !== "true") { e.stopPropagation(); onClose(); }
                    trapTab(e, ref.current);
                }}
            >
                <div className="sheet-head">
                    <h2 className="ui-modal-title" id="filter-sheet-title">Filters</h2>
                    <button type="button" className="btn btn-icon is-round" aria-label="Close" onClick={onClose}><Icons iconName="x" /></button>
                </div>
                <div className="sheet-body">{children}</div>
                <div className="sheet-foot">
                    {onClear && activeCount > 0 ? (
                        <button type="button" className="btn btn-link px-0" onClick={onClear}>Clear filters</button>
                    ) : <span />}
                    <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
