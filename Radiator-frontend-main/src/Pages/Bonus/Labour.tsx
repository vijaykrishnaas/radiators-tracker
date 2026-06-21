import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../Components/Icons";
import Loader from "../../Components/Loader";
import Selector from "../../Components/Selector";
import AlertComponent from "../../Components/AlertComponent";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { BonusRow } from "./Mechanic";
import { money, today } from "../../Utils/format";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "paid", label: "Paid" },
];

const LabourBonus = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<BonusRow[]>([]);
    const [date, setDate] = useState(today());
    const [name, setName] = useState("");
    const [status, setStatus] = useState("");
    const [breakdownRow, setBreakdownRow] = useState<BonusRow | null>(null);
    const [payoutRow, setPayoutRow] = useState<BonusRow | null>(null);

    const getTableData = async () => {
        try {
            setLoading(true);
            const res = await getData("bonus/labour", { params: { date, name, status } });
            setRows(res.rows || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load bonus data", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, name, status]);

    const handleMarkPaid = async () => {
        if (!payoutRow) return;
        try {
            setLoading(true);
            const res = await postData("bonus/payout", {
                type: "labour",
                period: date,
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
            jobs: acc.jobs + r.operations,
            accrued: acc.accrued + r.accruedBonus,
            payable: acc.payable + r.payableBonus,
            paid: acc.paid + (r.paidBonus || 0),
        }),
        { jobs: 0, accrued: 0, payable: 0, paid: 0 }
    );

    const exportExcel = () => {
        const data = rows.map((r) => ({
            [settings.labels.worker]: r.beneficiary,
            "Jobs": r.operations,
            "Accrued Bonus (₹)": r.accruedBonus,
            "Payable Bonus (₹)": r.payableBonus,
            "Paid Bonus (₹)": r.paidBonus,
            "Status": r.status,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Labour Bonus");
        XLSX.writeFile(wb, `labour-bonus-${date}.xlsx`);
    };

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(13);
        doc.text(`${settings.company.name} — ${settings.labels.worker} Bonus ${date}`, 14, 14);
        autoTable(doc, {
            startY: 22,
            head: [[settings.labels.worker, "Jobs", "Accrued", "Payable", "Paid", "Status"]],
            body: rows.map((r) => [r.beneficiary, r.operations, r.accruedBonus, r.payableBonus, r.paidBonus, r.status]),
            foot: [["Total", totals.jobs, totals.accrued.toFixed(2), totals.payable.toFixed(2), totals.paid.toFixed(2), ""]],
            headStyles: { fillColor: settings.branding.primaryColor },
            styles: { fontSize: 9 },
        });
        doc.save(`labour-bonus-${date}.pdf`);
    };

    const labourOptions = settings.labour.map((l) => ({ value: l, label: l }));

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">{settings.labels.worker} Bonus</h4>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportExcel}>
                            <Icons iconName="exporticon" className="icon-15 me-2" />
                            Excel
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportPDF}>
                            <Icons iconName="entrolment_download" className="icon-15 me-2" />
                            PDF
                        </button>
                        <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                            onClick={() => navigate("/bonus/labour/review")}>
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
                                    <label htmlFor="bonus-date" className="form-label font-w500 mb-1">Date</label>
                                    <input
                                        id="bonus-date"
                                        name="bonus-date"
                                        type="date"
                                        className="form-control"
                                        value={date}
                                        max={today()}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                                <div className="col-12 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">{settings.labels.worker}</label>
                                    <Selector
                                        isClearable
                                        options={labourOptions}
                                        placeholder="-- All --"
                                        onChange={(option: any) => setName(option ? option.value : "")}
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
                                        <th>{settings.labels.worker}</th>
                                        <th>Jobs</th>
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
                                            <td colSpan={8} className="text-center py-3">
                                                No bonus entries for {date}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {rows.length > 0 && (
                                    <tfoot>
                                        <tr className="font-w600">
                                            <td colSpan={2}>Total</td>
                                            <td>{totals.jobs}</td>
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
                                <span className="modal-title">{breakdownRow.beneficiary} — {date}</span>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setBreakdownRow(null)} />
                            </div>
                            <div className="modal-body">
                                <table className="table table-bordered font-s14">
                                    <thead>
                                        <tr>
                                            <th>Bill No</th>
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
                                    <span className="font-w600">{payoutRow.beneficiary}</span> for {date}?
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

export default LabourBonus;
