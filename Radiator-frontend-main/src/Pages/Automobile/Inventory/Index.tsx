import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import { getData, postData, putData, deleteData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today } from "../../../Utils/format";
import { PageHeader, KpiCard, KpiGrid, Badge, Callout, Field, SegmentedControl } from "../../../Components/ui/Basics";
import Modal, { ConfirmDialog } from "../../../Components/ui/Modal";
import { AffixInput } from "../../../Components/ui/Inputs";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, sortParams, type Column, type SortState } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

type StockRow = {
    partRef: string;
    label: string;
    inCatalog: boolean;
    rate: number;
    added: number;
    sold: number;
    remaining: number;
    avgCost: number;
    stockValue: number;
    sales: number;
    costOfSales: number;
    profit: number | null;
    bills: number;
    lastIn: string | null;
    lastSold: string | null;
};
type Totals = { parts: number; inStock: number; stockValue: number; sales: number; profit: number; outOfStock: number };
type Entry = { _id: string; partRef: string; partLabel: string; date: string; qty: number; buyPrice: number; supplier?: string; note?: string };
type Move = { kind: "in" | "out"; date: string; qty: number; buyPrice?: number; supplier?: string; note?: string; amount?: number; billNo?: number; vehicleNumber?: string; id: string };

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const isoDate = (s: string) => new Date(s).toISOString().slice(0, 10);

function stockBadge(r: StockRow) {
    if (r.remaining < 0) return <Badge tone="error" dot>Short by {qtyText(-r.remaining)}</Badge>;
    if (r.remaining === 0) return <Badge tone="warning" dot>Out of stock</Badge>;
    return <Badge tone="success" dot>{qtyText(r.remaining)} in stock</Badge>;
}

// Words and links that differ between the automobile (parts) and tyre (brand + model) inventories.
type Vocab = { item: string; items: string; sales: string; catalog: string; billBase: string; billWord: string; whole: boolean };
const AUTO_VOCAB: Vocab = { item: "Part", items: "parts", sales: "Parts sales", catalog: "Parts catalog", billBase: "/automobile", billWord: "Bill", whole: false };
const TYRE_VOCAB: Vocab = { item: "Tyre", items: "tyres", sales: "Tyre sales", catalog: "Tyre catalog", billBase: "/tyre", billWord: "D.C.", whole: true };

// Stock in (purchases) and out (bills) for one part, loaded when its row is opened.
function PartMovements({ part, v }: { part: StockRow; v: Vocab }) {
    const navigate = useNavigate();
    const [moves, setMoves] = useState<Move[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        getData("inventory/movements", { params: { partRef: part.partRef } })
            .then((r) => { if (alive) setMoves(r.movements || []); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [part.partRef]);
    if (failed) return <p className="t-sm t-error mb-0">Couldn't load the history for {part.label}.</p>;
    if (!moves) return <span className="skel" style={{ height: 60, width: "100%" }} aria-hidden="true" />;
    if (!moves.length) return <p className="t-sm t-muted mb-0">No purchases or sales of {part.label} yet.</p>;
    return (
        <>
            <p className="t-xs t-muted t-medium mb-2">Stock in and out for {part.label}</p>
            <div className="mini-table">
                <div className="table-wrap">
                    <table className="table mb-0">
                        <thead>
                            <tr><th scope="col">Date</th><th scope="col">Movement</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Price / amount</th><th scope="col">Details</th></tr>
                        </thead>
                        <tbody>
                            {moves.map((m) => (
                                <tr key={`${m.kind}-${m.id}`}>
                                    <td className="nowrap tabular">{fmtDate(m.date)}</td>
                                    <td>{m.kind === "in" ? <Badge tone="success">Stock in</Badge> : <Badge tone="brand">Sold</Badge>}</td>
                                    <td className="num">{m.kind === "in" ? "+" : "−"}{qtyText(m.qty)}</td>
                                    <td className="num">{m.kind === "in" ? `${money(m.buyPrice || 0)} each` : money(m.amount || 0)}</td>
                                    <td>
                                        {m.kind === "in" ? [m.supplier, m.note].filter(Boolean).join(" · ") || "—" : (
                                            <button type="button" className="btn btn-link p-0" style={{ minHeight: 0 }} onClick={() => navigate(`${v.billBase}/dashboard/view/${m.id}`)}>
                                                {v.billWord} {m.billNo} · {m.vehicleNumber}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

type Draft = { partRef: string; date: string; qty: string; buyPrice: string; supplier: string; note: string };
const emptyDraft = (partRef = ""): Draft => ({ partRef, date: today(), qty: "", buyPrice: "", supplier: "", note: "" });

const Inventory = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const v = settings.businessType === "tyre" ? TYRE_VOCAB : AUTO_VOCAB;
    // Tyre stock is kept per brand + model, keyed "<brand>:<model>" like the server (dao/inventory.dao.js).
    const parts = settings.businessType === "tyre"
        ? (settings.tyre.brands || []).flatMap((b) => (b.models || []).map((m) => ({ value: `${b.value}:${m.value}`, label: `${b.label} ${m.label}`.trim() })))
        : settings.automobile.parts || [];
    const partOptions = parts.map((p) => ({ value: p.value, label: p.label }));

    const [tab, setTab] = useState<"stock" | "entries">("stock");
    const [reloadKey, setReloadKey] = useState(0);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [partSearch, setPartSearch] = useState("");
    const [stockFilter, setStockFilter] = useState("");

    // ---- Stock by part (all parts, sorted in the browser) ----
    const summary = useRemoteList<StockRow, Totals>(async () => {
        const r = await getData("inventory/summary");
        return { rows: r.rows || [], extra: r.totals };
    }, [reloadKey]);
    const t = summary.extra;
    const stockRows = useMemo(() => {
        const q = partSearch.trim().toLowerCase();
        return summary.rows.filter((r) => (!q || r.label.toLowerCase().includes(q))
            && (!stockFilter || (stockFilter === "low" ? r.remaining <= 0 : r.remaining > 0)));
    }, [summary.rows, partSearch, stockFilter]);

    // ---- Purchases (stock entries, paged and sorted on the server) ----
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [entrySearch, setEntrySearch] = useState("");
    const [entryPart, setEntryPart] = useState("");
    const [entrySort, setEntrySort] = useState<SortState | null>(null);
    const [entriesKey, setEntriesKey] = useState(0);
    const entries = useRemoteList<Entry>(async () => {
        const r = await getData("inventory/entries", { params: { page, limit, search: entrySearch, partRef: entryPart, ...sortParams(entrySort) } });
        return { rows: r.entries || [], total: r.totalRecords || 0, totalPages: r.totalPages || 1 };
    }, [page, limit, entrySearch, entryPart, entrySort, reloadKey], { page, setPage });

    // ---- Add / edit stock ----
    const [editing, setEditing] = useState<Entry | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<Entry | null>(null);

    const openAdd = (partRef = "") => { setEditing(null); setErrors({}); setDraft(emptyDraft(partRef)); };
    const openEdit = (e: Entry) => {
        setEditing(e); setErrors({});
        setDraft({ partRef: e.partRef, date: isoDate(e.date), qty: String(e.qty), buyPrice: String(e.buyPrice), supplier: e.supplier || "", note: e.note || "" });
    };
    const patch = (p: Partial<Draft>) => {
        setDraft((d) => (d ? { ...d, ...p } : d));
        setErrors((er) => { const n = { ...er }; (Object.keys(p) as (keyof Draft)[]).forEach((k) => delete n[k]); return n; });
    };

    const save = async () => {
        if (!draft) return;
        const er: typeof errors = {};
        if (!draft.partRef) er.partRef = `Pick a ${v.item.toLowerCase()}`;
        if (!draft.date) er.date = "Pick the date";
        if (!(Number(draft.qty) > 0)) er.qty = "Qty must be more than 0";
        else if (v.whole && !Number.isInteger(Number(draft.qty))) er.qty = "Whole tyres only";
        if (draft.buyPrice.trim() === "" || !(Number(draft.buyPrice) >= 0)) er.buyPrice = "Enter the buy price per unit";
        setErrors(er);
        if (Object.keys(er).length) return;
        const body = { ...draft, qty: Number(draft.qty), buyPrice: Number(draft.buyPrice) };
        try {
            setSaving(true);
            const res = editing ? await putData(`inventory/entries/${editing._id}`, body) : await postData("inventory/entries", body);
            callAlertMsg(res.message || "Saved", "success");
            setDraft(null);
            setReloadKey((k) => k + 1);
        } catch (err: any) {
            callAlertMsg(err?.message || "Couldn't save the stock entry", "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!deleting) return;
        try {
            setSaving(true);
            const res = await deleteData(`inventory/entries/${deleting._id}`);
            callAlertMsg(res.message || "Deleted", "success");
            setDeleting(null);
            setReloadKey((k) => k + 1);
        } catch (err: any) {
            callAlertMsg(err?.message || "Couldn't delete the stock entry", "error");
        } finally {
            setSaving(false);
        }
    };

    const stockMenu = (r: StockRow) => (
        <RowActions ariaLabel={`Actions for ${r.label}`} items={[
            { label: "Add stock", icon: <Icons iconName="add" />, onClick: () => openAdd(r.partRef), disabled: !r.inCatalog, reason: `Not in the ${v.catalog.toLowerCase()}` },
            { label: expanded === r.partRef ? "Hide history" : "Show history", icon: <Icons iconName="history" />, onClick: () => setExpanded(expanded === r.partRef ? null : r.partRef) },
        ]} />
    );

    const stockColumns: Column<StockRow>[] = [
        {
            key: "part", sortValue: (r) => r.label, sortLabel: v.item, header: v.item, className: "key text",
            cell: (r) => (
                <>
                    <button type="button" className="expand-btn" aria-expanded={expanded === r.partRef}
                        aria-label={`${expanded === r.partRef ? "Hide" : "Show"} history for ${r.label}`}
                        onClick={() => setExpanded(expanded === r.partRef ? null : r.partRef)}>
                        <Icons iconName="chevron-right" />
                    </button>
                    {/* The expand button takes part of the cell, so a short name like "MRF 10.00-20" broke mid-size
                        ("MRF 10.00-" / "20"). Short names stay on one line; long ones still wrap. */}
                    <span className={r.label.length <= 24 ? "nowrap" : undefined}>{r.label}</span>
                    {!r.inCatalog && <span className="d-block t-xs t-muted">Removed from catalog</span>}
                </>
            ),
        },
        { key: "stock", sortValue: (r) => r.remaining, sortLabel: "In stock", header: "In stock", className: "nowrap", cell: stockBadge },
        { key: "added", sortValue: (r) => r.added, header: "Bought", className: "num", cell: (r) => qtyText(r.added) },
        { key: "sold", sortValue: (r) => r.sold, header: "Sold", className: "num", cell: (r) => qtyText(r.sold) },
        { key: "avg", sortValue: (r) => r.avgCost, header: "Avg cost", className: "num", cell: (r) => (r.added > 0 ? money(r.avgCost) : "—") },
        { key: "value", sortValue: (r) => r.stockValue, header: "Stock value", className: "num", cell: (r) => money(r.stockValue) },
        { key: "sales", sortValue: (r) => r.sales, header: "Sales", className: "num", cell: (r) => money(r.sales) },
        {
            key: "profit", sortValue: (r) => r.profit ?? Number.NEGATIVE_INFINITY, header: "Profit", className: "num",
            cell: (r) => (r.profit === null ? <span className="t-muted" title="No purchase recorded, so there is no buy price">—</span>
                : <span className={r.profit < 0 ? "t-error t-semibold" : "t-semibold"}>{money(r.profit)}</span>),
        },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: stockMenu },
    ];

    const entryMenu = (e: Entry) => (
        <RowActions ariaLabel={`Actions for ${e.partLabel} on ${fmtDate(e.date)}`} items={[
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(e) },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleting(e) },
        ]} />
    );
    const entryColumns: Column<Entry>[] = [
        { key: "date", sortKey: "date", header: "Date", className: "nowrap tabular", cell: (e) => fmtDate(e.date) },
        { key: "part", sortKey: "part", header: v.item, className: "key text", cell: (e) => e.partLabel },
        { key: "qty", sortKey: "qty", header: "Qty", className: "num", cell: (e) => qtyText(e.qty) },
        { key: "buy", sortKey: "buy", header: "Buy price", className: "num", cell: (e) => money(e.buyPrice) },
        { key: "value", sortKey: "value", header: "Total", className: "num t-semibold", cell: (e) => money(e.qty * e.buyPrice) },
        { key: "supplier", sortKey: "supplier", header: "Supplier", className: "text", cell: (e) => e.supplier || "—" },
        { key: "note", header: "Note", className: "text", cell: (e) => e.note || "—" },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: entryMenu },
    ];

    const total = draft ? (Number(draft.qty) || 0) * (Number(draft.buyPrice) || 0) : 0;
    const noCatalog = parts.length === 0;
    const STOCK_FILTERS = [{ value: "in", label: "In stock" }, { value: "low", label: "Out of stock / short" }];

    return (
        <>
            <PageHeader
                title="Inventory"
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => openAdd()} disabled={noCatalog}>
                        <Icons iconName="add" />Add stock
                    </button>
                }
            />
            <div className="dash-grid">
                {noCatalog && (
                    <Callout tone="info" title={`Add your ${v.items} first`}>
                        Stock is kept for the {v.items} in Settings<Icons iconName="chevron-right" className="icon-14 mx-1" />{v.catalog}.
                        <button type="button" className="btn btn-link p-0 ms-1" style={{ minHeight: 0 }} onClick={() => navigate("/settings")}>Open Settings</button>
                    </Callout>
                )}
                <KpiGrid count={4}>
                    <KpiCard loading={summary.status === "loading"} label="Units in stock" value={qtyText(t?.inStock || 0)} icon="package"
                        caption={t?.outOfStock ? `${t.outOfStock} ${v.item.toLowerCase()}${t.outOfStock === 1 ? "" : "s"} out of stock` : undefined} />
                    <KpiCard loading={summary.status === "loading"} label="Stock value" value={money(t?.stockValue || 0)} icon="currencyrupee" tone="brand" caption="At average buy price" />
                    <KpiCard loading={summary.status === "loading"} label={v.sales} value={money(t?.sales || 0)} icon="receipt-text" tone="success" />
                    <KpiCard loading={summary.status === "loading"} label={`Profit on ${v.items} sold`} value={money(t?.profit || 0)} icon="trendingup" tone="success"
                        valueTone={(t?.profit || 0) < 0 ? "error" : undefined} caption="Sales − average buy price" />
                </KpiGrid>

                <SegmentedControl label="Inventory view" options={[{ value: "stock", label: `Stock by ${v.item.toLowerCase()}` }, { value: "entries", label: "Purchases" }]}
                    value={tab} onChange={setTab} />

                {tab === "stock" ? (
                    <DataList<StockRow>
                        caption={`Stock by ${v.item.toLowerCase()}`}
                        toolbar={
                            <FilterBar
                                activeCount={(partSearch ? 1 : 0) + (stockFilter ? 1 : 0)}
                                onClear={() => { setPartSearch(""); setStockFilter(""); }}
                                search={<SearchInput value={partSearch} id="stock-search" label="Search" placeholder={`Search ${v.item.toLowerCase()}…`} onSearch={setPartSearch} />}
                                filters={[{
                                    id: "f-stock", label: "Stock", primary: true,
                                    node: <Selector inputId="f-stock" isClearable options={STOCK_FILTERS} placeholder="-- All --"
                                        value={STOCK_FILTERS.find((o) => o.value === stockFilter) || null} onChange={(o: any) => setStockFilter(o ? o.value : "")} />,
                                }]}
                            />
                        }
                        rows={stockRows}
                        rowKey={(r) => r.partRef}
                        columns={stockColumns}
                        status={summary.status}
                        refetching={summary.refetching}
                        onRetry={summary.reload}
                        errorTitle="Couldn't load stock"
                        expanded={(r) => (expanded === r.partRef ? <PartMovements part={r} v={v} /> : null)}
                        empty={partSearch || stockFilter
                            ? { icon: "package", title: `No ${v.items} match`, action: <button type="button" className="btn btn-link" onClick={() => { setPartSearch(""); setStockFilter(""); }}>Clear filters</button> }
                            : { icon: "package", title: `No ${v.items} yet`, text: `Add ${v.items} in Settings → ${v.catalog}, then record the stock you buy here.` }}
                        mobileCard={(r) => (
                            <MobileCard
                                title={r.label}
                                onOpen={() => setExpanded(expanded === r.partRef ? null : r.partRef)}
                                badge={stockBadge(r)}
                                menu={stockMenu(r)}
                                meta={[`Bought ${qtyText(r.added)}`, `Sold ${qtyText(r.sold)}`, r.added > 0 ? `Avg ${money(r.avgCost)}` : null]}
                                amounts={[
                                    { label: "Stock value", value: money(r.stockValue) },
                                    { label: "Sales", value: money(r.sales) },
                                    { label: "Profit", value: r.profit === null ? "—" : money(r.profit), tone: r.profit !== null && r.profit < 0 ? "error" : undefined },
                                ]}
                            >
                                {expanded === r.partRef && <PartMovements part={r} v={v} />}
                            </MobileCard>
                        )}
                    />
                ) : (
                    <DataList<Entry>
                        caption="Purchases"
                        sort={entrySort}
                        onSort={(next) => { setEntrySort(next); setPage(1); }}
                        toolbar={
                            <FilterBar
                                activeCount={(entrySearch ? 1 : 0) + (entryPart ? 1 : 0)}
                                onClear={() => { setEntrySearch(""); setEntryPart(""); setEntriesKey((k) => k + 1); setPage(1); }}
                                search={<SearchInput value={entrySearch} key={entriesKey} id="entry-search" label="Search" placeholder={`Search ${v.item.toLowerCase()}, supplier or note…`}
                                    onSearch={(v) => { setEntrySearch(v); setPage(1); }} />}
                                filters={[{
                                    id: "f-part", label: v.item, primary: true,
                                    node: <Selector inputId="f-part" isClearable options={partOptions} placeholder={`-- All ${v.items} --`}
                                        value={partOptions.find((o) => o.value === entryPart) || null} onChange={(o: any) => { setEntryPart(o ? o.value : ""); setPage(1); }} />,
                                }]}
                            />
                        }
                        rows={entries.rows}
                        rowKey={(e) => e._id}
                        columns={entryColumns}
                        status={entries.status}
                        refetching={entries.refetching}
                        onRetry={entries.reload}
                        errorTitle="Couldn't load purchases"
                        empty={entrySearch || entryPart
                            ? { icon: "package", title: "No purchases match", action: <button type="button" className="btn btn-link" onClick={() => { setEntrySearch(""); setEntryPart(""); setEntriesKey((k) => k + 1); }}>Clear filters</button> }
                            : { icon: "package", title: "No purchases yet", text: `Every time you buy ${v.items}, add them with Add stock.`, action: noCatalog ? undefined : <button type="button" className="btn btn-primary" onClick={() => openAdd()}><Icons iconName="add" />Add stock</button> }}
                        mobileCard={(e) => (
                            <MobileCard
                                title={e.partLabel}
                                menu={entryMenu(e)}
                                meta={[fmtDate(e.date), e.supplier, e.note]}
                                amounts={[
                                    { label: "Qty", value: qtyText(e.qty) },
                                    { label: "Buy price", value: money(e.buyPrice) },
                                    { label: "Total", value: money(e.qty * e.buyPrice) },
                                ]}
                            />
                        )}
                        pagination={
                            <Pagination page={page} totalPages={entries.totalPages} total={entries.total} limit={limit}
                                onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
                        }
                    />
                )}
            </div>

            <Modal
                open={!!draft}
                onClose={() => setDraft(null)}
                title={editing ? "Edit stock entry" : "Add stock"}
                description={settings.businessType === "tyre" ? "Tyres you bought. Challans that use these tyres take them out of stock." : "Parts you bought. Bills that use these parts take them out of stock."}
                busy={saving}
                initialFocus={editing ? "#stock-qty" : "#stock-part"}
                as="form"
                onSubmit={(e) => { e.preventDefault(); save(); }}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}
                            {saving ? "Saving..." : editing ? "Save changes" : "Add stock"}
                        </button>
                    </>
                }
            >
                {draft && (
                    <div className="d-grid gap-3">
                        <Field label={v.item} htmlFor="stock-part" required error={errors.partRef}>
                            <Selector inputId="stock-part" options={partOptions} placeholder={`Select ${v.item.toLowerCase()}`}
                                value={partOptions.find((o) => o.value === draft.partRef) || null}
                                onChange={(o: any) => patch({ partRef: o ? o.value : "" })} />
                        </Field>
                        <div className="form-grid">
                            <Field label="Date" htmlFor="stock-date" required error={errors.date}>
                                <input id="stock-date" type="date" className="form-control" value={draft.date} max={today()} onChange={(e) => patch({ date: e.target.value })} />
                            </Field>
                            <Field label="Qty" htmlFor="stock-qty" required error={errors.qty}>
                                <input id="stock-qty" type="number" inputMode={v.whole ? "numeric" : "decimal"} min="0" step={v.whole ? 1 : "any"} className="form-control tabular" value={draft.qty}
                                    aria-invalid={!!errors.qty || undefined} onChange={(e) => patch({ qty: e.target.value })} />
                            </Field>
                            <Field label="Buy price (per unit)" htmlFor="stock-price" required error={errors.buyPrice}>
                                <AffixInput id="stock-price" prefix="₹" type="number" inputMode="decimal" min="0" step="any" className="tabular" value={draft.buyPrice}
                                    invalid={!!errors.buyPrice} onChange={(e) => patch({ buyPrice: e.target.value })} />
                            </Field>
                            <Field label="Supplier" htmlFor="stock-supplier">
                                <input id="stock-supplier" type="text" className="form-control" maxLength={200} value={draft.supplier} placeholder="Optional"
                                    onChange={(e) => patch({ supplier: e.target.value })} />
                            </Field>
                        </div>
                        <Field label="Note" htmlFor="stock-note">
                            <input id="stock-note" type="text" className="form-control" maxLength={200} value={draft.note} placeholder="Optional, e.g. invoice no."
                                onChange={(e) => patch({ note: e.target.value })} />
                        </Field>
                        <p className="t-sm mb-0">Total cost: <strong className="tabular">{money(total)}</strong></p>
                    </div>
                )}
            </Modal>

            <ConfirmDialog
                open={!!deleting}
                title="Delete stock entry"
                message={deleting && <>Delete the purchase of <span className="t-strong t-semibold">{qtyText(deleting.qty)} × {deleting.partLabel}</span> on {fmtDate(deleting.date)}? Its stock is taken off the count.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={remove}
                onCancel={() => setDeleting(null)}
            />
        </>
    );
};

export default Inventory;
