import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../Components/Icons";
import Loader from "../../Components/Loader";
import Selector from "../../Components/Selector";
import AlertComponent from "../../Components/AlertComponent";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { money, today, fyStart } from "../../Utils/format";

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
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<BonusRow[]>([]);
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

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await getData("bonus/pending", { params: { type, from, to, beneficiary: name, status } });
            setRows(res.rows || []);
            setSelected(new Set());
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load bonus data", "error");
        } finally {
            setLoading(false);
        }
    };

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
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, name, status]);

    useEffect(() => {
        fetchNames();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRecalculate = async () => {
        try {
            setLoading(true);
            const res = await postData("bonus/sync", {});
            callAlertMsg(res.message || "Recalculated", "success");
            await fetchData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Recalculate failed", "error");
        } finally {
            setLoading(false);
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
            setLoading(true);
            const amt = Number(issueAmount);
            const res = await postData("bonus/payout", {
                type, beneficiary: issueRow.beneficiary, from, to,
                amount: amt && amt !== issueRow.payableBonus ? amt : undefined,
                notes: issueNote,
            });
            callAlertMsg(res.message || "Bonus issued", "success");
            setIssueRow(null);
            await fetchData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Issue failed", "error");
        } finally {
            setLoading(false);
        }
    };

    // Bulk issue: settle each selected beneficiary at their own payable (no override).
    const pendingRows = rows.filter((r) => r.status === "Pending");
    const toggleSel = (b: string) =>
        setSelected((prev) => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n; });
    const toggleAll = () =>
        setSelected((prev) => prev.size === pendingRows.length ? new Set() : new Set(pendingRows.map((r) => r.beneficiary)));
    const confirmBulk = async () => {
        try {
            setLoading(true);
            let ok = 0;
            for (const b of selected) {
                const r = await postData("bonus/payout", { type, beneficiary: b, from, to });
                ok += r?.count || 0;
            }
            callAlertMsg(`Issued ${ok} bonus entr${ok === 1 ? "y" : "ies"} for ${selected.size} ${nameLabel.toLowerCase()}(s) ✅`, "success");
            setBulkOpen(false);
            await fetchData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Bulk issue failed", "error");
        } finally {
            setLoading(false);
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

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4 flex-wrap gap-2">
                    <h4 className="fw-semibold mb-0">{title}</h4>
                    <div className="d-flex gap-2 flex-wrap">
                        {selected.size > 0 && (
                            <button type="button" className="btn btn-primary btn-sm d-flex align-items-center" onClick={() => setBulkOpen(true)}>
                                <Icons iconName="add" className="icon-12 icon-white me-2" />Issue selected ({selected.size})
                            </button>
                        )}
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={handleRecalculate} title="Recompute bonuses (e.g. after changing bonus % in Settings)">
                            <Icons iconName="refresh" className="icon-15 me-2" />Recalculate
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportExcel}>
                            <Icons iconName="exporticon" className="icon-15 me-2" />Excel
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportPDF}>
                            <Icons iconName="entrolment_download" className="icon-15 me-2" />PDF
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={() => navigate(reviewPath)}>
                            <Icons iconName="bar_chart" className="icon-15 me-2" />Analytics
                        </button>
                    </div>
                </div>

                <div className="card card-shadow mt-2">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-6 col-md-3 col-xl-2">
                                    <label className="form-label font-w500 mb-1">From</label>
                                    <input type="date" className="form-control" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                                </div>
                                <div className="col-6 col-md-3 col-xl-2">
                                    <label className="form-label font-w500 mb-1">To</label>
                                    <input type="date" className="form-control" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                                </div>
                                <div className="col-12 col-md-3 col-xl-3">
                                    <label className="form-label font-w500 mb-1">{nameLabel}</label>
                                    <Selector isClearable options={nameOptions} placeholder={`-- All ${nameLabel}s --`}
                                        onChange={(o: any) => setName(o ? o.value : "")} />
                                </div>
                                <div className="col-12 col-md-3 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Status</label>
                                    <Selector options={STATUS_OPTIONS} value={STATUS_OPTIONS.find((o) => o.value === status) as any}
                                        onChange={(o: any) => setStatus(o ? o.value : "")} />
                                </div>
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th style={{ width: 36 }}>
                                            <input type="checkbox" checked={pendingRows.length > 0 && selected.size === pendingRows.length}
                                                onChange={toggleAll} aria-label="Select all pending" />
                                        </th>
                                        <th>{nameLabel}</th>
                                        <th>Operations</th>
                                        <th>Total Business</th>
                                        <th>Collected</th>
                                        <th>Accrued Bonus</th>
                                        <th>Payable Bonus</th>
                                        <th>Paid</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length ? rows.map((r) => (
                                        <Fragment key={r.beneficiary}>
                                            <tr>
                                                <td>
                                                    <input type="checkbox" disabled={r.status === "Paid"}
                                                        checked={selected.has(r.beneficiary)} onChange={() => toggleSel(r.beneficiary)}
                                                        aria-label={`Select ${r.beneficiary}`} />
                                                </td>
                                                <td className="font-w600">{r.beneficiary}</td>
                                                <td>{r.operations}</td>
                                                <td>{money(r.totalBusiness)}</td>
                                                <td>{money(r.totalCollected)}</td>
                                                <td>{money(r.accruedBonus)}</td>
                                                <td className="font-w600">{money(r.payableBonus)}</td>
                                                <td>{r.status === "Paid" ? money(r.paidBonus) : "—"}</td>
                                                <td>
                                                    <span className={`status-badge ${r.status === "Paid" ? "status-badge-success" : "status-badge-warning"}`}>{r.status}</span>
                                                </td>
                                                <td className="action-dropdown">
                                                    <div className="dropdown">
                                                        <button className="btn" type="button" data-bs-toggle="dropdown"><Icons iconName="Frame" className="icon-20" /></button>
                                                        <ul className="dropdown-menu">
                                                            <li><button className="dropdown-item text-primary" onClick={() => setExpanded(expanded === r.beneficiary ? null : r.beneficiary)}>
                                                                {expanded === r.beneficiary ? "Hide breakdown" : "View breakdown"}
                                                            </button></li>
                                                            {r.status === "Pending" && (
                                                                <li><button className="dropdown-item text-primary" onClick={() => openIssue(r)}>Issue Bonus</button></li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded === r.beneficiary && (
                                                <tr>
                                                    <td colSpan={10} className="p-0" style={{ background: "var(--canvas, #f7f7f8)" }}>
                                                        <table className="table table-bordered font-s13 mb-0">
                                                            <thead>
                                                                <tr><th>Date</th><th>Bill Amount</th><th>Collected</th><th>Accrued</th><th>Payable</th><th>Paid</th><th>Status</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {r.records.map((rec, i) => (
                                                                    <tr key={i}>
                                                                        <td>{new Date(rec.billDate).toLocaleDateString("en-IN")}</td>
                                                                        <td>{money(rec.billAmount)}</td>
                                                                        <td>{money(rec.receivedAmount)}</td>
                                                                        <td>{money(rec.accruedAmount)}</td>
                                                                        <td>{money(rec.payableAmount)}</td>
                                                                        <td>{rec.status === "paid" ? money(rec.paidAmount || 0) : "—"}</td>
                                                                        <td><span className={`status-badge ${rec.status === "paid" ? "status-badge-success" : "status-badge-warning"}`}>{rec.status === "paid" ? "Paid" : "Pending"}</span></td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    )) : (
                                        <tr><td colSpan={10} className="text-center py-3 text-muted">No bonuses in this range</td></tr>
                                    )}
                                </tbody>
                                {rows.length > 0 && (
                                    <tfoot>
                                        <tr className="font-w600">
                                            <td colSpan={2}>Total</td>
                                            <td>{totals.operations}</td>
                                            <td>{money(totals.business)}</td>
                                            <td>{money(totals.collected)}</td>
                                            <td>{money(totals.accrued)}</td>
                                            <td>{money(totals.payable)}</td>
                                            <td>{money(totals.paid)}</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Single issue modal */}
            {issueRow && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Issue Bonus — {issueRow.beneficiary}</span>
                                <button type="button" className="btn-close" onClick={() => setIssueRow(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s13 text-muted mb-3">
                                    Pending payable for {from} to {to} is <span className="font-w600">{money(issueRow.payableBonus)}</span>.
                                    Issuing locks these entries (future bill edits won't change them).
                                </p>
                                <label className="form-label font-w500">Amount to pay (₹)</label>
                                <input type="number" min="0" className="form-control mb-3" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} />
                                <label className="form-label font-w500">Note (optional)</label>
                                <input type="text" className="form-control" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="e.g. paid in cash" />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setIssueRow(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={confirmIssue} disabled={loading}>{loading ? "Saving..." : "Issue Bonus"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk issue confirm */}
            {bulkOpen && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Issue selected bonuses</span>
                                <button type="button" className="btn-close" onClick={() => setBulkOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-2">Issue each selected {nameLabel.toLowerCase()} their computed payable bonus for {from} to {to}?</p>
                                <ul className="font-s13 mb-0">
                                    {[...selected].map((b) => {
                                        const r = rows.find((x) => x.beneficiary === b);
                                        return <li key={b}>{b} — <span className="font-w600">{money(r?.payableBonus || 0)}</span></li>;
                                    })}
                                </ul>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setBulkOpen(false)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={confirmBulk} disabled={loading}>{loading ? "Saving..." : `Issue ${selected.size}`}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
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
