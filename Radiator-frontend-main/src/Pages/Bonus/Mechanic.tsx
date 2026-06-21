import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../Components/Icons";
import Loader from "../../Components/Loader";
import Selector from "../../Components/Selector";
import AlertComponent from "../../Components/AlertComponent";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { money } from "../../Utils/format";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type BonusRecord = {
    billNo: number | null;
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

// Bonus year for a date given the configured start month (4 = April).
const bonusYear = (date: Date, startMonth: number) =>
    date.getMonth() + 1 >= startMonth ? date.getFullYear() : date.getFullYear() - 1;

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "paid", label: "Paid" },
];

const MechanicBonus = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const startMonth = settings.bonus.mechanic.yearStartMonth || 4;
    const currentYear = bonusYear(new Date(), startMonth);

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<BonusRow[]>([]);
    const [year, setYear] = useState<number>(currentYear);
    const [mechanicName, setMechanicName] = useState("");
    const [status, setStatus] = useState("");
    const [mechanicNameList, setMechanicNameList] = useState<string[]>([]);
    const [breakdownRow, setBreakdownRow] = useState<BonusRow | null>(null);
    const [payoutRow, setPayoutRow] = useState<BonusRow | null>(null);

    const yearOptions = useMemo(
        () =>
            Array.from({ length: 5 }, (_, i) => {
                const y = currentYear - i;
                const label = startMonth === 1 ? `${y}` : `${y} – ${String(y + 1).slice(-2)}`;
                return { label, value: String(y) };
            }),
        [currentYear, startMonth]
    );

    const getTableData = async () => {
        try {
            setLoading(true);
            const res = await getData("bonus/mechanics", { params: { year, mechanicName, status } });
            setRows(res.rows || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load bonus data", "error");
        } finally {
            setLoading(false);
        }
    };

    const getMechanicName = async () => {
        try {
            const res = await getData("mechanic");
            setMechanicNameList(res.mechdata || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, mechanicName, status]);

    useEffect(() => {
        getMechanicName();
    }, []);

    const handleSync = async () => {
        try {
            setLoading(true);
            const res = await postData("bonus/sync", {});
            callAlertMsg(res.message || "Synced", "success");
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Sync failed", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleMarkPaid = async () => {
        if (!payoutRow) return;
        try {
            setLoading(true);
            const res = await postData("bonus/payout", {
                type: "mechanic",
                period: String(year),
                beneficiary: payoutRow.beneficiary,
            });
            callAlertMsg(res.message || "Marked paid", "success");
            setPayoutRow(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Payout failed", "error");
        } finally {
            setLoading(false);
        }
    };

    const totals = rows.reduce(
        (acc, r) => ({
            operations: acc.operations + r.operations,
            business: acc.business + r.totalBusiness,
            collected: acc.collected + r.totalCollected,
            accrued: acc.accrued + r.accruedBonus,
            payable: acc.payable + r.payableBonus,
            paid: acc.paid + (r.paidBonus || 0),
        }),
        { operations: 0, business: 0, collected: 0, accrued: 0, payable: 0, paid: 0 }
    );

    const yearLabel = yearOptions.find((o) => o.value === String(year))?.label || String(year);

    const exportExcel = () => {
        const data = rows.map((r) => ({
            "Mechanic": r.beneficiary,
            "Operations": r.operations,
            "Total Business (₹)": r.totalBusiness,
            "Collected (₹)": r.totalCollected,
            "Accrued Bonus (₹)": r.accruedBonus,
            "Payable Bonus (₹)": r.payableBonus,
            "Paid Bonus (₹)": r.paidBonus,
            "Status": r.status,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Mechanic Bonus");
        XLSX.writeFile(wb, `mechanic-bonus-${yearLabel.replace(/\s/g, "")}.xlsx`);
    };

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(13);
        doc.text(`${settings.company.name} — Mechanic Bonus ${yearLabel}`, 14, 14);
        autoTable(doc, {
            startY: 22,
            head: [["Mechanic", "Operations", "Business", "Collected", "Accrued", "Payable", "Paid", "Status"]],
            body: rows.map((r) => [
                r.beneficiary,
                r.operations,
                r.totalBusiness,
                r.totalCollected,
                r.accruedBonus,
                r.payableBonus,
                r.paidBonus,
                r.status,
            ]),
            foot: [["Total", totals.operations, totals.business, totals.collected, totals.accrued.toFixed(2), totals.payable.toFixed(2), totals.paid.toFixed(2), ""]],
            headStyles: { fillColor: settings.branding.primaryColor },
            styles: { fontSize: 9 },
        });
        doc.save(`mechanic-bonus-${yearLabel.replace(/\s/g, "")}.pdf`);
    };

    const mechanicOptions = mechanicNameList.map((m) => ({ value: m, label: m }));

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Mechanic Bonus</h4>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={handleSync}>
                            <Icons iconName="refresh" className="icon-15 me-2" />
                            Sync
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportExcel}>
                            <Icons iconName="exporticon" className="icon-15 me-2" />
                            Excel
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportPDF}>
                            <Icons iconName="entrolment_download" className="icon-15 me-2" />
                            PDF
                        </button>
                        <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                            onClick={() => navigate("/bonus/mechanics/review")}>
                            <Icons iconName="bar_chart" className="icon-15 me-2" />
                            Review Period
                        </button>
                    </div>
                </div>

                <div className="card card-shadow mt-4">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Bonus Year</label>
                                    <Selector
                                        options={yearOptions}
                                        value={yearOptions.find((o) => o.value === String(year)) as any}
                                        onChange={(option: any) => option && setYear(Number(option.value))}
                                    />
                                </div>
                                <div className="col-12 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Mechanic Name</label>
                                    <Selector
                                        isClearable
                                        options={mechanicOptions}
                                        placeholder="-- All Mechanics --"
                                        onChange={(option: any) => setMechanicName(option ? option.value : "")}
                                    />
                                </div>
                                <div className="col-12 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Status</label>
                                    <Selector
                                        isClearable
                                        options={STATUS_OPTIONS}
                                        placeholder="-- All Status --"
                                        onChange={(option: any) => setStatus(option ? option.value : "")}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>SI No</th>
                                        <th>Mechanic</th>
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
                                    {rows.length ? (
                                        rows.map((r, i) => (
                                            <tr key={r.beneficiary}>
                                                <td>{i + 1}</td>
                                                <td>{r.beneficiary}</td>
                                                <td>{r.operations}</td>
                                                <td>{money(r.totalBusiness)}</td>
                                                <td>{money(r.totalCollected)}</td>
                                                <td>{money(r.accruedBonus)}</td>
                                                <td className="font-w600">{money(r.payableBonus)}</td>
                                                <td>{r.status === "Paid" ? money(r.paidBonus) : "—"}</td>
                                                <td>
                                                    <span className={`status-badge ${r.status === "Paid" ? "status-badge-success" : "status-badge-warning"}`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="action-dropdown">
                                                    <div className="dropdown">
                                                        <button className="btn" type="button" data-bs-toggle="dropdown">
                                                            <Icons iconName="Frame" className="icon-20" />
                                                        </button>
                                                        <ul className="dropdown-menu">
                                                            <li>
                                                                <button className="dropdown-item text-primary" onClick={() => setBreakdownRow(r)}>
                                                                    View Breakdown
                                                                </button>
                                                            </li>
                                                            {r.status === "Pending" && (
                                                                <li>
                                                                    <button className="dropdown-item text-primary" onClick={() => setPayoutRow(r)}>
                                                                        Mark Paid
                                                                    </button>
                                                                </li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={10} className="text-center py-3">
                                                No bonus entries for {yearLabel}
                                            </td>
                                        </tr>
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

            {/* Breakdown Modal */}
            {breakdownRow && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">{breakdownRow.beneficiary} — {yearLabel} Breakdown</span>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setBreakdownRow(null)} />
                            </div>
                            <div className="modal-body">
                                <table className="table table-bordered font-s14">
                                    <thead>
                                        <tr>
                                            <th>Bill No</th>
                                            <th>Date</th>
                                            <th>Bill Amount</th>
                                            <th>Collected</th>
                                            <th>Accrued</th>
                                            <th>Payable</th>
                                            <th>Paid</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {breakdownRow.records.map((rec, i) => (
                                            <tr key={i}>
                                                <td>{rec.billNo ?? "—"}</td>
                                                <td>{new Date(rec.billDate).toLocaleDateString("en-IN")}</td>
                                                <td>{money(rec.billAmount)}</td>
                                                <td>{money(rec.receivedAmount)}</td>
                                                <td>{money(rec.accruedAmount)}</td>
                                                <td>{money(rec.payableAmount)}</td>
                                                <td>{rec.status === "paid" ? money(rec.paidAmount || 0) : "—"}</td>
                                                <td>
                                                    <span className={`status-badge ${rec.status === "paid" ? "status-badge-success" : "status-badge-warning"}`}>
                                                        {rec.status === "paid" ? "Paid" : "Pending"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setBreakdownRow(null)}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mark Paid Confirm Modal */}
            {payoutRow && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Mark Bonus Paid</span>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setPayoutRow(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-0">
                                    Pay <span className="font-w600">{money(payoutRow.payableBonus)}</span> to{" "}
                                    <span className="font-w600">{payoutRow.beneficiary}</span> for {yearLabel}?
                                    Paid entries are locked and won't change with future bill edits.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setPayoutRow(null)}>
                                    Cancel
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={handleMarkPaid} disabled={loading}>
                                    {loading ? "Saving..." : "Mark Paid"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MechanicBonus;
