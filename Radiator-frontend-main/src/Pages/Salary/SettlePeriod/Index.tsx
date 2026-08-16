import { useEffect, useState } from "react";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import Pagination from "../../../Components/Pagination";
import Selector from "../../../Components/Selector";
import AlertComponent from "../../../Components/AlertComponent";
import { printPayslip } from "../../../Components/PrintPayslip";
import { getData, postData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, monthStart } from "../../../Utils/format";

type EmployeeOption = { value: string; label: string };
type AttendanceDay = { _id: string; date: string; status: "present" | "absent" | "half" | "leave" };
type Advance = { _id: string; date: string; amount: number; reason?: string; status: string };
type Preview = {
    employeeName: string;
    workingDays: number;
    presentDaysComputed: number;
    presentDaysMode: "daily" | "manual";
    presentDaysUsed: number;
    baseSalary: number;
    grossAmount: number;
    advancesApplied: { advanceId: string; amount: number; date: string; reason?: string }[];
    advancesDeducted: number;
    netAmount: number;
};
type DeductionRow = { amount: string; reason: string };
type HistoryRow = {
    _id: string;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    periodKey: string;
    netAmount: number;
    status: string;
    paidAt?: string;
    adjustments?: { at: string; type: string; amount: number; reason?: string }[];
};

const STATUS_OPTIONS = [
    { value: "present", label: "Present" },
    { value: "absent", label: "Absent" },
    { value: "half", label: "Half Day" },
    { value: "leave", label: "Leave" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

const SettlePeriod = () => {
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [settling, setSettling] = useState(false);

    const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);

    const [periodStart, setPeriodStart] = useState(monthStart());
    const [periodEnd, setPeriodEnd] = useState(today());

    const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
    const [markDate, setMarkDate] = useState(today());
    const [markStatus, setMarkStatus] = useState<EmployeeOption>(STATUS_OPTIONS[0]);

    const [presentDaysMode, setPresentDaysMode] = useState<"daily" | "manual">("daily");
    const [presentDaysManual, setPresentDaysManual] = useState("");

    const [advances, setAdvances] = useState<Advance[]>([]);
    const [advDate, setAdvDate] = useState(today());
    const [advAmount, setAdvAmount] = useState("");
    const [advReason, setAdvReason] = useState("");

    const [deductions, setDeductions] = useState<DeductionRow[]>([]);
    const [settleNote, setSettleNote] = useState("");

    const [preview, setPreview] = useState<Preview | null>(null);

    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyLimit, setHistoryLimit] = useState(10);
    const [selectedDataList, setSelectedDataList] = useState(10);

    const [adjustTarget, setAdjustTarget] = useState<HistoryRow | null>(null);
    const [adjustType, setAdjustType] = useState("correction");
    const [adjustAmount, setAdjustAmount] = useState("");
    const [adjustReason, setAdjustReason] = useState("");

    useEffect(() => {
        getData("employees", { params: { active: "true" } }).then((res) => {
            setEmployeeOptions((res.employees || []).map((e: any) => ({ value: e._id, label: e.name })));
        }).catch(() => {});
    }, []);

    const loadAttendance = async () => {
        if (!selectedEmployee) return;
        try {
            const res = await getData("salary/attendance", {
                params: { employeeId: selectedEmployee.value, from: periodStart, to: periodEnd },
            });
            setAttendanceDays(res.days || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load attendance", "error");
        }
    };

    const loadAdvances = async () => {
        if (!selectedEmployee) return;
        try {
            const res = await getData("salary/advances", {
                params: { employeeId: selectedEmployee.value, status: "unapplied" },
            });
            setAdvances(res.advances || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load advances", "error");
        }
    };

    const loadPreview = async () => {
        if (!selectedEmployee) { setPreview(null); return; }
        try {
            const res = await getData("salary/preview", {
                params: {
                    employeeId: selectedEmployee.value,
                    periodStart,
                    periodEnd,
                    presentDaysManual: presentDaysMode === "manual" && presentDaysManual !== "" ? presentDaysManual : undefined,
                },
            });
            setPreview(res as Preview);
        } catch (err: any) {
            setPreview(null);
            callAlertMsg(err?.message || "Failed to load settlement preview", "error");
        }
    };

    const loadHistory = async (page = historyPage) => {
        if (!selectedEmployee) { setHistory([]); setHistoryTotal(0); return; }
        try {
            const res = await getData("salary/history", {
                params: { employeeId: selectedEmployee.value, page, limit: historyLimit },
            });
            setHistory(res.rows || []);
            setHistoryTotal(res.total || 0);
            setHistoryTotalPages(res.totalPages || 1);
            setHistoryPage(res.page || 1);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load settlement history", "error");
        }
    };

    useEffect(() => {
        if (!selectedEmployee) {
            setAttendanceDays([]); setAdvances([]); setPreview(null); setHistory([]);
            return;
        }
        setLoading(true);
        Promise.all([loadAttendance(), loadAdvances(), loadPreview(), loadHistory(1)]).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployee, periodStart, periodEnd]);

    useEffect(() => {
        loadPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presentDaysMode, presentDaysManual]);

    const handleMarkAttendance = async () => {
        if (!selectedEmployee) return;
        setLoading(true);
        try {
            await postData("salary/attendance", { employeeId: selectedEmployee.value, date: markDate, status: markStatus.value });
            callAlertMsg("Attendance recorded", "success");
            await Promise.all([loadAttendance(), loadPreview()]);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record attendance", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleRecordAdvance = async () => {
        if (!selectedEmployee || !advAmount) return;
        setLoading(true);
        try {
            await postData("salary/advances", { employeeId: selectedEmployee.value, date: advDate, amount: Number(advAmount), reason: advReason });
            callAlertMsg("Advance recorded", "success");
            setAdvAmount(""); setAdvReason("");
            await Promise.all([loadAdvances(), loadPreview()]);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record advance", "error");
        } finally {
            setLoading(false);
        }
    };

    const addDeductionRow = () => setDeductions((prev) => [...prev, { amount: "", reason: "" }]);
    const removeDeductionRow = (idx: number) => setDeductions((prev) => prev.filter((_, i) => i !== idx));
    const updateDeductionRow = (idx: number, field: "amount" | "reason", value: string) =>
        setDeductions((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));

    const deductionsTotal = round2(deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0));
    const finalNet = preview ? Math.max(round2(preview.grossAmount - preview.advancesDeducted - deductionsTotal), 0) : 0;

    const handleSettle = async () => {
        if (!selectedEmployee) return;
        setSettling(true);
        try {
            const payload = {
                employeeId: selectedEmployee.value,
                periodStart,
                periodEnd,
                presentDaysManual: presentDaysMode === "manual" && presentDaysManual !== "" ? Number(presentDaysManual) : undefined,
                deductions: deductions.filter((d) => Number(d.amount) > 0).map((d) => ({ amount: Number(d.amount), reason: d.reason })),
                note: settleNote,
            };
            const res = await postData("salary/settle", payload);
            callAlertMsg(res.message || "Salary settled", "success");
            setDeductions([]);
            setSettleNote("");
            await Promise.all([loadAdvances(), loadPreview(), loadHistory(1)]);
        } catch (err: any) {
            callAlertMsg(err?.message || "Settlement failed", "error");
        } finally {
            setSettling(false);
        }
    };

    const handleViewPayslip = async (row: HistoryRow) => {
        setLoading(true);
        try {
            const res = await getData(`salary/${row._id}/payslip`);
            printPayslip(res.period, settings);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load payslip", "error");
        } finally {
            setLoading(false);
        }
    };

    const openAdjust = (row: HistoryRow) => {
        setAdjustTarget(row);
        setAdjustType("correction");
        setAdjustAmount("");
        setAdjustReason("");
    };

    const handleAddAdjustment = async () => {
        if (!adjustTarget || !adjustAmount) return;
        setLoading(true);
        try {
            const res = await postData(`salary/${adjustTarget._id}/adjust`, {
                type: adjustType, amount: Number(adjustAmount), reason: adjustReason,
            });
            callAlertMsg(res.message || "Adjustment recorded", "success");
            setAdjustTarget(null);
            await loadHistory(historyPage);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record adjustment", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleHistoryLimitChange = () => {
        setHistoryLimit(selectedDataList);
        loadHistory(1);
    };

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Settle Salary</h4>
                </div>

                {/* Employee + period selector */}
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <div className="row g-3 align-items-end">
                            <div className="col-12 col-md-4">
                                <label className="form-label font-w500 mb-1">Employee</label>
                                <Selector options={employeeOptions} value={selectedEmployee}
                                    placeholder="-- Select Employee --"
                                    onChange={(opt: any) => setSelectedEmployee(opt)} />
                            </div>
                            <div className="col-6 col-md-3">
                                <label className="form-label font-w500 mb-1">Period Start</label>
                                <input type="date" className="form-control" value={periodStart} max={periodEnd}
                                    onChange={(e) => setPeriodStart(e.target.value)} />
                            </div>
                            <div className="col-6 col-md-3">
                                <label className="form-label font-w500 mb-1">Period End</label>
                                <input type="date" className="form-control" value={periodEnd} min={periodStart} max={today()}
                                    onChange={(e) => setPeriodEnd(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>

                {!selectedEmployee && (
                    <div className="card card-shadow">
                        <div className="card-body text-center py-5 text-muted font-s14">
                            Select an employee and period to settle salary
                        </div>
                    </div>
                )}

                {selectedEmployee && (
                    <>
                        <div className="row g-4 mb-4">
                            {/* Attendance */}
                            <div className="col-12 col-lg-6">
                                <div className="card card-shadow h-100">
                                    <div className="card-body">
                                        <p className="font-w600 font-s15 mb-3">Attendance</p>
                                        <div className="d-flex gap-2 mb-3">
                                            <input type="date" className="form-control" value={markDate}
                                                min={periodStart} max={periodEnd}
                                                onChange={(e) => setMarkDate(e.target.value)} />
                                            <div style={{ minWidth: 140 }}>
                                                <Selector options={STATUS_OPTIONS} value={markStatus}
                                                    onChange={(opt: any) => opt && setMarkStatus(opt)} />
                                            </div>
                                            <button type="button" className="btn btn-cancel btn-sm" onClick={handleMarkAttendance}>
                                                Mark
                                            </button>
                                        </div>
                                        <div className="d-flex flex-wrap gap-2 mb-2" style={{ maxHeight: 140, overflowY: "auto" }}>
                                            {attendanceDays.length ? attendanceDays.map((d) => (
                                                <span key={d._id} className={`status-badge ${d.status === "present" ? "status-badge-success" : d.status === "absent" ? "status-badge-danger" : "status-badge-warning"}`}>
                                                    {new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — {d.status}
                                                </span>
                                            )) : <span className="text-muted font-s13">No marks yet for this period</span>}
                                        </div>
                                        <div className="session-custom-border my-3" />
                                        <div className="d-flex gap-3 mb-2">
                                            <div className="form-check">
                                                <input type="radio" className="form-check-input" id="mode-daily"
                                                    checked={presentDaysMode === "daily"}
                                                    onChange={() => setPresentDaysMode("daily")} />
                                                <label className="form-check-label" htmlFor="mode-daily">Use daily marks</label>
                                            </div>
                                            <div className="form-check">
                                                <input type="radio" className="form-check-input" id="mode-manual"
                                                    checked={presentDaysMode === "manual"}
                                                    onChange={() => setPresentDaysMode("manual")} />
                                                <label className="form-check-label" htmlFor="mode-manual">Manual override</label>
                                            </div>
                                        </div>
                                        {presentDaysMode === "manual" && (
                                            <input type="number" min={0} className="form-control" placeholder="Present days"
                                                value={presentDaysManual} onChange={(e) => setPresentDaysManual(e.target.value)} />
                                        )}
                                        {preview && (
                                            <p className="text-muted font-s12 mt-2 mb-0">
                                                Computed from daily marks: {preview.presentDaysComputed} days.
                                                Working days in period: {preview.workingDays}.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Advances */}
                            <div className="col-12 col-lg-6">
                                <div className="card card-shadow h-100">
                                    <div className="card-body">
                                        <p className="font-w600 font-s15 mb-3">Advances (unapplied)</p>
                                        <div className="row g-2 mb-3">
                                            <div className="col-4">
                                                <input type="date" className="form-control" value={advDate} max={today()}
                                                    onChange={(e) => setAdvDate(e.target.value)} />
                                            </div>
                                            <div className="col-3">
                                                <input type="number" min={0} className="form-control" placeholder="Amount"
                                                    value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} />
                                            </div>
                                            <div className="col-3">
                                                <input type="text" className="form-control" placeholder="Reason"
                                                    value={advReason} onChange={(e) => setAdvReason(e.target.value)} />
                                            </div>
                                            <div className="col-2">
                                                <button type="button" className="btn btn-cancel btn-sm w-100" onClick={handleRecordAdvance}>
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                        <table className="table table-sm font-s13 mb-0">
                                            <thead>
                                                <tr><th>Date</th><th>Amount</th><th>Reason</th></tr>
                                            </thead>
                                            <tbody>
                                                {advances.length ? advances.map((a) => (
                                                    <tr key={a._id}>
                                                        <td>{new Date(a.date).toLocaleDateString("en-IN")}</td>
                                                        <td>{money(a.amount)}</td>
                                                        <td>{a.reason || "—"}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan={3} className="text-center text-muted py-2">No unapplied advances</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        {advances.length > 0 && (
                                            <p className="text-muted font-s12 mt-2 mb-0">
                                                All {advances.length} unapplied advance(s) will be swept into this settlement.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Deductions + preview + settle */}
                        <div className="card card-shadow mb-4">
                            <div className="card-body">
                                <p className="font-w600 font-s15 mb-3">Deductions</p>
                                {deductions.map((d, idx) => (
                                    <div className="row g-2 mb-2" key={idx}>
                                        <div className="col-4">
                                            <input type="number" min={0} className="form-control form-control-sm" placeholder="Amount"
                                                value={d.amount} onChange={(e) => updateDeductionRow(idx, "amount", e.target.value)} />
                                        </div>
                                        <div className="col-6">
                                            <input type="text" className="form-control form-control-sm" placeholder="Reason"
                                                value={d.reason} onChange={(e) => updateDeductionRow(idx, "reason", e.target.value)} />
                                        </div>
                                        <div className="col-2">
                                            <button type="button" className="btn btn-link p-0 text-danger" onClick={() => removeDeductionRow(idx)}>
                                                <Icons iconName="action_delete" className="icon-16" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" className="btn btn-cancel btn-sm mb-3" onClick={addDeductionRow}>
                                    + Add Deduction
                                </button>

                                {preview && (
                                    <div className="row g-3 mb-3">
                                        <div className="col-12 col-md-8">
                                            <table className="table table-sm font-s13 mb-0">
                                                <tbody>
                                                    <tr><td>Gross ({preview.presentDaysUsed}/{preview.workingDays} days)</td><td className="text-end">{money(preview.grossAmount)}</td></tr>
                                                    <tr><td>Advances deducted</td><td className="text-end">- {money(preview.advancesDeducted)}</td></tr>
                                                    <tr><td>Deductions</td><td className="text-end">- {money(deductionsTotal)}</td></tr>
                                                    <tr className="font-w600"><td>Net Payable</td><td className="text-end">{money(finalNet)}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="col-12 col-md-4">
                                            <label className="form-label font-w500 mb-1">Note (optional)</label>
                                            <input type="text" className="form-control" value={settleNote}
                                                onChange={(e) => setSettleNote(e.target.value)} placeholder="Payment note" />
                                        </div>
                                    </div>
                                )}

                                <button type="button" className="btn btn-gradient" onClick={handleSettle}
                                    disabled={settling || !preview}>
                                    {settling ? "Settling..." : "Settle & Pay"}
                                </button>
                                <p className="text-muted font-s12 mt-2 mb-0">
                                    This locks the period as paid. Corrections afterward go through an adjustment, not a re-settle.
                                </p>
                            </div>
                        </div>

                        {/* Settlement history */}
                        <div className="card card-shadow">
                            <div className="card-body p-0">
                                <div className="table-header">
                                    <p className="font-w500 font-s14 mb-0 px-3 py-2">Settlement History</p>
                                </div>
                                <div className="table-body">
                                    <table className="table table-bordered font-s14">
                                        <thead>
                                            <tr>
                                                <th>Period</th>
                                                <th>Net Paid</th>
                                                <th>Adjustments</th>
                                                <th>Paid On</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.length ? history.map((h) => {
                                                const adjTotal = (h.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0);
                                                return (
                                                    <tr key={h._id}>
                                                        <td>{h.periodKey}</td>
                                                        <td className="font-w600">{money(h.netAmount)}</td>
                                                        <td>{adjTotal ? `+ ${money(adjTotal)}` : "—"}</td>
                                                        <td>{h.paidAt ? new Date(h.paidAt).toLocaleDateString("en-IN") : "—"}</td>
                                                        <td className="d-flex gap-2">
                                                            <button type="button" className="btn btn-cancel btn-sm" onClick={() => handleViewPayslip(h)}>
                                                                View Payslip
                                                            </button>
                                                            <button type="button" className="btn btn-cancel btn-sm" onClick={() => openAdjust(h)}>
                                                                Add Adjustment
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            }) : (
                                                <tr><td colSpan={5} className="text-center py-3 text-muted">No settlements yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {historyTotal > 0 && (
                                <Pagination
                                    currentPage={historyPage}
                                    totalPages={historyTotalPages}
                                    selectedDataList={selectedDataList}
                                    setSelectedDataList={setSelectedDataList}
                                    paginationDataLimit={{ limit: historyLimit }}
                                    response={{ totalRecords: historyTotal }}
                                    handleInputChange={handleHistoryLimitChange}
                                    handlePreviousPage={() => loadHistory(Math.max(1, historyPage - 1))}
                                    handleNextPage={() => loadHistory(Math.min(historyTotalPages, historyPage + 1))}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Add Adjustment Modal */}
            {adjustTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Add Adjustment — {adjustTarget.periodKey}</span>
                                <button type="button" className="btn-close" aria-label="Close"
                                    onClick={() => setAdjustTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s13 text-muted">
                                    Adjustments never change the original settled amount ({money(adjustTarget.netAmount)}) — they
                                    append an additional entry to the audit trail as a top-up payment.
                                </p>
                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label font-w500">Type</label>
                                        <input type="text" className="form-control" value={adjustType}
                                            onChange={(e) => setAdjustType(e.target.value)} placeholder="correction" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label font-w500">Amount (₹) *</label>
                                        <input type="number" min={0} className="form-control" value={adjustAmount}
                                            onChange={(e) => setAdjustAmount(e.target.value)} />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label font-w500">Reason</label>
                                        <textarea className="form-control" rows={2} value={adjustReason}
                                            onChange={(e) => setAdjustReason(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setAdjustTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddAdjustment}
                                    disabled={loading || !adjustAmount}>
                                    Save Adjustment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettlePeriod;
