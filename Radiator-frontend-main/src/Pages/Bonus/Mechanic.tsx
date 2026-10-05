import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../Components/Icons";
import RowActions from "../../Components/RowActions";
import Selector from "../../Components/Selector";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { money, today, fyStart } from "../../Utils/format";
import { PageHeader, Badge, Callout, Field } from "../../Components/ui/Basics";
import Modal from "../../Components/ui/Modal";
import { FilterBar } from "../../Components/ui/Filters";
import { DataList, MobileCard, type Column } from "../../Components/ui/DataList";
import { AffixInput } from "../../Components/ui/Inputs";
import { useRemoteList } from "../../Components/ui/useRemoteList";
import { usePhone } from "../../Components/ui/hooks";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type BonusRecord = {
    billDate: string;
    billAmount: number;
    receivedAmount: number;
    accruedAmount: number;
    payableAmount: number;
    paidAmount?: number;
    status: "pending" | "paid";
};

export type BonusRow = {
    beneficiary: string;
    operations: number;
    totalBusiness: number;
    totalCollected: number;
    accruedBonus: number;
    payableBonus: number;
    paidBonus: number;
    status: "Pending" | "Paid";
    records: BonusRecord[];
};

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "paid", label: "Paid" },
    { value: "", label: "All" },
];

// Shared by Mechanic & Labour bonus pages. `type` switches the role; `defaultFrom`
// sets the start of the default range (FY for mechanic, month for labour).
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");
const statusBadge = (paid: boolean) => <Badge tone={paid ? "success" : "warning"} dot>{paid ? "Paid" : "Pending"}</Badge>;

const BillsBehind = ({ row }: { row: BonusRow }) => {
    const phone = usePhone();
    return (
    <>
        <p className="t-xs t-muted t-medium mb-2">Bills behind {row.beneficiary}'s bonus</p>
        <div className="mini-table">
            <div className={phone ? "table-wrap" : undefined}>
                <table className="table mb-0">
                    <thead>
                        <tr>
                            <th scope="col">Date</th>
                            <th scope="col" className="num">Work value</th>
                            <th scope="col" className="num">Collected</th>
                            <th scope="col" className="num">Bonus earned</th>
                            <th scope="col" className="num">Ready to pay</th>
                            <th scope="col" className="num">Paid</th>
                            <th scope="col">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {row.records.map((rec, i) => (
                            <tr key={i}>
                                <td className="nowrap tabular">{fmtDate(rec.billDate)}</td>
                                <td className="num">{money(rec.billAmount)}</td>
                                <td className="num">{money(rec.receivedAmount)}</td>
                                <td className="num">{money(rec.accruedAmount)}</td>
                                <td className="num">{money(rec.payableAmount)}</td>
                                <td className="num">{rec.status === "paid" ? money(rec.paidAmount || 0) : "—"}</td>
                                <td>{statusBadge(rec.status === "paid")}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </>
    );
};

export function BonusPage({
    type,
    title,
    nameLabel,
    namesEndpoint,
    reviewPath,
    defaultFrom,
}: {
    type: "mechanic" | "labour";
    title: string;
    nameLabel: string;
    namesEndpoint: string;
    reviewPath: string;
    defaultFrom: string;
}) {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();

    const [saving, setSaving] = useState(false);
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(today());
    const [name, setName] = useState("");
    const [status, setStatus] = useState("pending");
    const [nameList, setNameList] = useState<string[]>([]);

    const [expanded, setExpanded] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [issueRow, setIssueRow] = useState<BonusRow | null>(null);
    const [issueAmount, setIssueAmount] = useState("");
    const [issueNote, setIssueNote] = useState("");
    const [bulkOpen, setBulkOpen] = useState(false);

    // Correct a person's pending ("ready to pay") bonus for the current range.
    const [editRow, setEditRow] = useState<BonusRow | null>(null);
    const [editAmount, setEditAmount] = useState("");
    const [editNote, setEditNote] = useState("");

    // Manual (discretionary) bonus — any beneficiary, any amount, anytime
    const [manualOpen, setManualOpen] = useState(false);
    const [manualName, setManualName] = useState("");
    const [manualAmount, setManualAmount] = useState("");
    const [manualNote, setManualNote] = useState("");

    const list = useRemoteList<BonusRow>(async () => {
        const res = await getData("bonus/pending", { params: { type, from, to, beneficiary: name, status } });
        return { rows: res.rows || [] };
    }, [from, to, name, status]);
    const rows = list.rows;

    // A fresh load clears any ticked rows.
    useEffect(() => { setSelected(new Set()); }, [list.rows]);

    const fetchNames = async () => {
        if (type === "labour") {
            setNameList(settings.labour || []);
            return;
        }
        try {
            const res = await getData(namesEndpoint);
            setNameList(res.mechdata || []);
        } catch {
            setNameList([]);
        }
    };

    useEffect(() => {
        fetchNames();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRecalculate = async () => {
        try {
            setSaving(true);
            const res = await postData("bonus/sync", {});
            callAlertMsg(res.message || "Recalculated", "success");
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Recalculate failed", "error");
        } finally {
            setSaving(false);
        }
    };

    // Single issue (optional override amount + note).
    const openIssue = (r: BonusRow) => {
        setIssueRow(r);
        setIssueAmount(String(r.payableBonus));
        setIssueNote("");
    };
    const confirmIssue = async () => {
        if (!issueRow) return;
        try {
            setSaving(true);
            const amt = Number(issueAmount);
            const res = await postData("bonus/payout", {
                type, beneficiary: issueRow.beneficiary, from, to,
                amount: amt && amt !== issueRow.payableBonus ? amt : undefined,
                notes: issueNote,
            });
            callAlertMsg(res.message || "Bonus issued", "success");
            setIssueRow(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Issue failed", "error");
        } finally {
            setSaving(false);
        }
    };

    // Correct a person's "ready to pay" bonus — adjusts only pending entries.
    const openEdit = (r: BonusRow) => {
        setEditRow(r);
        setEditAmount(String(r.payableBonus));
        setEditNote("");
    };
    const confirmEdit = async () => {
        if (!editRow) return;
        const amt = Number(editAmount);
        if (isNaN(amt) || amt < 0) { callAlertMsg("Enter a valid amount (0 or more)", "error"); return; }
        try {
            setSaving(true);
            const res = await postData("bonus/adjust", {
                type, beneficiary: editRow.beneficiary, from, to, amount: amt, note: editNote,
            });
            callAlertMsg(res.message || "Bonus corrected", "success");
            setEditRow(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Correction failed", "error");
        } finally {
            setSaving(false);
        }
    };

    // Bulk issue: settle each selected beneficiary at their own payable (no override).
    const pendingRows = rows.filter((r) => r.status === "Pending");
    const toggleSel = (b: string) =>
        setSelected((prev) => { const n = new Set(prev); if (n.has(b)) n.delete(b); else n.add(b); return n; });
    const toggleAll = () =>
        setSelected((prev) => prev.size === pendingRows.length ? new Set() : new Set(pendingRows.map((r) => r.beneficiary)));
    const selectedPayable = rows.filter((r) => selected.has(r.beneficiary)).reduce((a, r) => a + r.payableBonus, 0);
    const confirmBulk = async () => {
        try {
            setSaving(true);
            let ok = 0;
            for (const b of selected) {
                const r = await postData("bonus/payout", { type, beneficiary: b, from, to });
                ok += r?.count || 0;
            }
            callAlertMsg(`Issued ${ok} bonus entr${ok === 1 ? "y" : "ies"} for ${selected.size} ${nameLabel.toLowerCase()}(s) ✅`, "success");
            setBulkOpen(false);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Bulk issue failed", "error");
        } finally {
            setSaving(false);
        }
    };

    // Manual bonus — record a discretionary, fully-paid bonus not tied to any bill.
    const openManual = () => { setManualName(name || ""); setManualAmount(""); setManualNote(""); setManualOpen(true); };
    const confirmManual = async () => {
        const amt = Number(manualAmount);
        if (!manualName) { callAlertMsg(`Choose a ${nameLabel.toLowerCase()}`, "error"); return; }
        if (!amt || amt <= 0) { callAlertMsg("Enter a positive amount", "error"); return; }
        try {
            setSaving(true);
            const res = await postData("bonus/manual", { type, beneficiary: manualName, amount: amt, note: manualNote });
            callAlertMsg(res.message || "Manual bonus recorded", "success");
            setManualOpen(false);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Manual bonus failed", "error");
        } finally {
            setSaving(false);
        }
    };

    const totals = rows.reduce(
        (a, r) => ({
            operations: a.operations + r.operations,
            business: a.business + r.totalBusiness,
            collected: a.collected + r.totalCollected,
            accrued: a.accrued + r.accruedBonus,
            payable: a.payable + r.payableBonus,
            paid: a.paid + (r.paidBonus || 0),
        }),
        { operations: 0, business: 0, collected: 0, accrued: 0, payable: 0, paid: 0 }
    );

    const fileTag = `${from}_to_${to}`;
    const exportExcel = () => {
        const data = rows.map((r) => ({
            [nameLabel]: r.beneficiary, Operations: r.operations,
            "Total Business (₹)": r.totalBusiness, "Collected (₹)": r.totalCollected,
            "Accrued Bonus (₹)": r.accruedBonus, "Payable Bonus (₹)": r.payableBonus,
            "Paid Bonus (₹)": r.paidBonus, Status: r.status,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${title}`.slice(0, 28));
        XLSX.writeFile(wb, `${type}-bonus-${fileTag}.xlsx`);
    };
    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(13);
        doc.text(`${settings.company.name || ""} — ${title} (${from} to ${to})`, 14, 14);
        autoTable(doc, {
            startY: 22,
            head: [[nameLabel, "Ops", "Business", "Collected", "Accrued", "Payable", "Paid", "Status"]],
            body: rows.map((r) => [r.beneficiary, r.operations, r.totalBusiness, r.totalCollected, r.accruedBonus, r.payableBonus, r.paidBonus, r.status]),
            foot: [["Total", totals.operations, totals.business, totals.collected, totals.accrued.toFixed(2), totals.payable.toFixed(2), totals.paid.toFixed(2), ""]],
            headStyles: { fillColor: settings.branding.primaryColor },
            styles: { fontSize: 9 },
        });
        doc.save(`${type}-bonus-${fileTag}.pdf`);
    };

    const nameOptions = nameList.map((m) => ({ value: m, label: m }));
    const statusOpt = STATUS_OPTIONS.find((o) => o.value === status) || null;
    const nameOpt = nameOptions.find((o) => o.value === name) || null;

    const activeCount = (name ? 1 : 0) + (status !== "pending" ? 1 : 0) + (from !== defaultFrom ? 1 : 0) + (to !== today() ? 1 : 0);
    const clearFilters = () => { setFrom(defaultFrom); setTo(today()); setName(""); setStatus("pending"); };

    const rowMenu = (r: BonusRow) => (
        <RowActions ariaLabel={`Actions for ${r.beneficiary}`} items={[
            { label: expanded === r.beneficiary ? "Hide" : "Details", icon: <Icons iconName="view" />, onClick: () => setExpanded(expanded === r.beneficiary ? null : r.beneficiary) },
            ...(r.status === "Pending" ? [{ label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(r) }] : []),
        ]} />
    );

    const allPendingSelected = pendingRows.length > 0 && selected.size === pendingRows.length;
    const columns: Column<BonusRow>[] = [
        {
            key: "sel",
            header: <input type="checkbox" className="form-check-input" checked={allPendingSelected} disabled={pendingRows.length === 0}
                onChange={toggleAll} aria-label="Select all pending" />,
            width: 1,
            cell: (r) => (
                <input type="checkbox" className="form-check-input" disabled={r.status === "Paid"}
                    checked={selected.has(r.beneficiary)} onChange={() => toggleSel(r.beneficiary)}
                    aria-label={`Select ${r.beneficiary}`} />
            ),
        },
        {
            key: "name", header: nameLabel, className: "key nowrap",
            cell: (r) => (
                <>
                    <button type="button" className="expand-btn" aria-expanded={expanded === r.beneficiary}
                        aria-label={`${expanded === r.beneficiary ? "Hide" : "Show"} bills for ${r.beneficiary}`}
                        onClick={() => setExpanded(expanded === r.beneficiary ? null : r.beneficiary)}>
                        <Icons iconName="chevron-right" />
                    </button>
                    {r.beneficiary}
                </>
            ),
        },
        { key: "jobs", header: "Jobs", className: "num", cell: (r) => r.operations },
        { key: "work", header: "Work value", className: "num", cell: (r) => money(r.totalBusiness) },
        { key: "coll", header: "Collected", className: "num", cell: (r) => money(r.totalCollected) },
        { key: "earned", header: "Bonus earned", className: "num", cell: (r) => money(r.accruedBonus) },
        { key: "ready", header: "Ready to pay", className: "num t-semibold t-strong", cell: (r) => money(r.payableBonus) },
        { key: "paid", header: "Paid", className: "num", cell: (r) => (r.status === "Paid" ? money(r.paidBonus) : "—") },
        { key: "status", header: "Status", className: "nowrap", cell: (r) => statusBadge(r.status === "Paid") },
        {
            key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num",
            cell: (r) => (
                <>
                    {r.status === "Pending" && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openIssue(r)}>Issue</button>
                    )}
                    {rowMenu(r)}
                </>
            ),
        },
    ];

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            filters={[
                { id: "bonus-from", label: "From", primary: true, node: <input id="bonus-from" type="date" className="form-control" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /> },
                { id: "bonus-to", label: "To", primary: true, node: <input id="bonus-to" type="date" className="form-control" value={to} min={from} onChange={(e) => setTo(e.target.value)} /> },
                { id: "bonus-name", label: nameLabel, node: <Selector inputId="bonus-name" isClearable options={nameOptions} placeholder={`-- All ${nameLabel}s --`} value={nameOpt} onChange={(o: any) => setName(o ? o.value : "")} /> },
                { id: "bonus-status", label: "Status", node: <Selector inputId="bonus-status" options={STATUS_OPTIONS} value={statusOpt as any} onChange={(o: any) => setStatus(o ? o.value : "")} /> },
            ]}
        />
    );

    const bulkBar = selected.size > 0 && (
        <div className="bulk-bar" role="status">
            <span><strong>{selected.size} selected</strong> · {money(selectedPayable)} ready to pay</span>
            <div className="bulk-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setBulkOpen(true)}>Issue selected</button>
                <button type="button" className="btn btn-link btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
        </div>
    );

    const totalsFooter = (
        <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{totals.operations}</td>
            <td className="num">{money(totals.business)}</td>
            <td className="num">{money(totals.collected)}</td>
            <td className="num">{money(totals.accrued)}</td>
            <td className="num">{money(totals.payable)}</td>
            <td className="num">{money(totals.paid)}</td>
            <td colSpan={2}></td>
        </tr>
    );

    const mobileTotals = (
        <dl className="key-values">
            <div><dt>Jobs</dt><dd>{totals.operations}</dd></div>
            <div><dt>Work value</dt><dd>{money(totals.business)}</dd></div>
            <div><dt>Collected</dt><dd>{money(totals.collected)}</dd></div>
            <div><dt>Bonus earned</dt><dd>{money(totals.accrued)}</dd></div>
            <div><dt>Paid</dt><dd>{money(totals.paid)}</dd></div>
            <div className="is-total"><dt>Ready to pay</dt><dd>{money(totals.payable)}</dd></div>
        </dl>
    );

    const issueSubmit = (fn: () => void) => (e: React.FormEvent) => { e.preventDefault(); fn(); };

    return (
        <>
            <PageHeader
                title={title}
                subtitle={
                    <>
                        Every bill earns a bonus based on the rates you set in <strong>Settings → Bonus</strong>.
                        This lists what's pending from bills dated <strong>{from}</strong> to <strong>{to}</strong>.
                        Open a row to see the bills behind it, then <strong>Issue</strong> a person their bonus —
                        or tick several and use <strong>Issue selected</strong>.
                    </>
                }
                actions={[
                    { label: "Analytics", icon: "bar_chart", onClick: () => navigate(reviewPath) },
                    { label: "Excel", icon: "exporticon", onClick: exportExcel, collapse: true },
                    { label: "PDF", icon: "entrolment_download", onClick: exportPDF, collapse: true },
                    { label: "Recalculate", icon: "refresh", onClick: handleRecalculate, disabled: saving },
                    { label: "Manual bonus", icon: "add", onClick: openManual },
                ]}
            />

            {list.status === "ready" && rows.length > 0 && totals.accrued === 0 && (
                <div className="mb-3">
                    <Callout tone="warning">
                        No bonus is accruing for these jobs yet — set a bonus&nbsp;% for these services in{" "}
                        <button type="button" className="btn btn-link p-0 t-sm" style={{ minHeight: 0 }} onClick={() => navigate("/settings")}>Settings → Bonus</button>,
                        then click <strong>Recalculate</strong>.
                    </Callout>
                </div>
            )}

            <DataList<BonusRow>
                caption={title}
                toolbar={filterBar}
                above={bulkBar || undefined}
                rows={rows}
                rowKey={(r) => r.beneficiary}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load bonus data"
                empty={{ icon: "wallet", title: "No bonuses in this range", text: "Try a different date range or status.", action: activeCount > 0 ? <button type="button" className="btn btn-link" onClick={clearFilters}>Clear filters</button> : undefined }}
                expanded={(r) => (expanded === r.beneficiary ? <BillsBehind row={r} /> : null)}
                footer={totalsFooter}
                mobileSummary={mobileTotals}
                mobileCard={(r) => (
                    <MobileCard
                        title={r.beneficiary}
                        leading={r.status === "Pending" ? (
                            <input type="checkbox" className="form-check-input" checked={selected.has(r.beneficiary)}
                                onChange={() => toggleSel(r.beneficiary)} aria-label={`Select ${r.beneficiary}`} />
                        ) : undefined}
                        menu={rowMenu(r)}
                        right={<span className="t-md t-semibold t-strong tabular">{money(r.payableBonus)}</span>}
                        meta={[statusBadge(r.status === "Paid"), `Jobs ${r.operations}`, `Collected ${money(r.totalCollected)}`]}
                    >
                        <div className="d-flex align-items-center gap-2">
                            {r.status === "Pending" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openIssue(r)}>Issue</button>}
                            <button type="button" className="btn btn-link btn-sm" aria-expanded={expanded === r.beneficiary}
                                onClick={() => setExpanded(expanded === r.beneficiary ? null : r.beneficiary)}>
                                {expanded === r.beneficiary ? "Hide bills" : "Show bills"}
                            </button>
                        </div>
                        {expanded === r.beneficiary && <div className="mt-2"><BillsBehind row={r} /></div>}
                    </MobileCard>
                )}
            />

            {/* Single issue modal */}
            <Modal
                open={!!issueRow}
                onClose={() => !saving && setIssueRow(null)}
                title={`Issue Bonus — ${issueRow?.beneficiary ?? ""}`}
                busy={saving}
                as="form"
                onSubmit={issueSubmit(confirmIssue)}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setIssueRow(null)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}{saving ? "Saving..." : "Issue Bonus"}
                        </button>
                    </>
                }
            >
                {issueRow && (
                    <div className="d-grid gap-3">
                        <p className="t-sm t-muted mb-0">
                            Pending payable for {from} to {to} is <strong className="t-strong">{money(issueRow.payableBonus)}</strong>.
                            Issuing locks these entries (future bill edits won't change them).
                        </p>
                        <Field label="Amount to pay (₹)" htmlFor="issue-amount">
                            <AffixInput id="issue-amount" prefix="₹" type="number" inputMode="decimal" min={0} value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} />
                        </Field>
                        <Field label="Note (optional)" htmlFor="issue-note">
                            <input id="issue-note" type="text" className="form-control" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="e.g. paid in cash" />
                        </Field>
                    </div>
                )}
            </Modal>

            {/* Correct ready-to-pay bonus */}
            <Modal
                open={!!editRow}
                onClose={() => !saving && setEditRow(null)}
                title={`Correct bonus — ${editRow?.beneficiary ?? ""}`}
                busy={saving}
                as="form"
                onSubmit={issueSubmit(confirmEdit)}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditRow(null)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}{saving ? "Saving..." : "Save correction"}
                        </button>
                    </>
                }
            >
                {editRow && (
                    <div className="d-grid gap-3">
                        <p className="t-sm t-muted mb-0">
                            Set the corrected <strong className="t-strong">ready-to-pay</strong> bonus for {editRow.beneficiary} over {from} to {to}.
                            This only changes what's still pending — anything already paid stays as it is.
                            The new total is spread across the pending bills behind it.
                        </p>
                        <Field label="Ready-to-pay amount (₹)" htmlFor="edit-amount">
                            <AffixInput id="edit-amount" prefix="₹" type="number" inputMode="decimal" min={0} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                        </Field>
                        <Field label="Reason (optional)" htmlFor="edit-note">
                            <input id="edit-note" type="text" className="form-control" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="e.g. corrected after rate review" />
                        </Field>
                    </div>
                )}
            </Modal>

            {/* Bulk issue confirm */}
            <Modal
                open={bulkOpen}
                onClose={() => !saving && setBulkOpen(false)}
                title="Issue selected bonuses"
                busy={saving}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setBulkOpen(false)} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={confirmBulk} disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}{saving ? "Saving..." : `Issue ${selected.size}`}
                        </button>
                    </>
                }
            >
                <p className="t-sm mb-2">Issue each selected {nameLabel.toLowerCase()} their computed payable bonus for {from} to {to}?</p>
                <ul className="t-sm mb-0">
                    {[...selected].map((b) => {
                        const r = rows.find((x) => x.beneficiary === b);
                        return <li key={b}>{b} — <span className="t-strong t-semibold">{money(r?.payableBonus || 0)}</span></li>;
                    })}
                </ul>
            </Modal>

            {/* Manual (discretionary) bonus */}
            <Modal
                open={manualOpen}
                onClose={() => !saving && setManualOpen(false)}
                title="Manual bonus"
                busy={saving}
                as="form"
                onSubmit={issueSubmit(confirmManual)}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setManualOpen(false)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}{saving ? "Saving..." : "Give bonus"}
                        </button>
                    </>
                }
            >
                <div className="d-grid gap-3">
                    <p className="t-sm t-muted mb-0">
                        Give any {nameLabel.toLowerCase()} a one-off bonus of any amount — separate from the
                        bill-based calculation. It's recorded as paid for today.
                    </p>
                    <Field label={nameLabel} htmlFor="manual-name">
                        <Selector inputId="manual-name" isClearable options={nameOptions}
                            value={nameOptions.find((o) => o.value === manualName) || null}
                            placeholder={`Select ${nameLabel}`}
                            onChange={(o: any) => setManualName(o ? o.value : "")} />
                    </Field>
                    <Field label="Amount (₹)" htmlFor="manual-amount">
                        <AffixInput id="manual-amount" prefix="₹" type="number" inputMode="decimal" min={1} value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)} placeholder="e.g. 500" />
                    </Field>
                    <Field label="Note (optional)" htmlFor="manual-note">
                        <input id="manual-note" type="text" className="form-control" value={manualNote}
                            onChange={(e) => setManualNote(e.target.value)} placeholder="e.g. festival bonus" />
                    </Field>
                </div>
            </Modal>
        </>
    );
}

const MechanicBonus = () => {
    const { settings } = useSettings();
    return (
        <BonusPage
            type="mechanic"
            title="Mechanic Bonus"
            nameLabel="Mechanic"
            namesEndpoint="mechanic"
            reviewPath="/bonus/mechanics/review"
            defaultFrom={fyStart(settings)}
        />
    );
};

export default MechanicBonus;
