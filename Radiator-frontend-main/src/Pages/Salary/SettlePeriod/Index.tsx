import { useEffect, useRef, useState } from "react";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import { PageHeader, CardHead, Field, Badge, EmptyState, SegmentedControl, BusyOverlay, type Tone } from "../../../Components/ui/Basics";
import Modal from "../../../Components/ui/Modal";
import { DataList, MobileCard, Pagination, type Column } from "../../../Components/ui/DataList";
import { AffixInput } from "../../../Components/ui/Inputs";
import { useRemoteList } from "../../../Components/ui/useRemoteList";
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
    advancesCarriedForward?: number;
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

const MODE_OPTIONS = [
    { value: "daily" as const, label: "Use daily marks" },
    { value: "manual" as const, label: "Manual override" },
];

const ATTENDANCE_TONE: Record<AttendanceDay["status"], Tone> = {
    present: "success", half: "warning", absent: "error", leave: "info",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

const SettlePeriod = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [settling, setSettling] = useState(false);
    const [busyLabel, setBusyLabel] = useState("");

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

    const [historyPage, setHistoryPage] = useState(1);
    const [historyLimit, setHistoryLimit] = useState(10);

    const [adjustTarget, setAdjustTarget] = useState<HistoryRow | null>(null);
    const [adjustType, setAdjustType] = useState("correction");
    const [adjustAmount, setAdjustAmount] = useState("");
    const [adjustReason, setAdjustReason] = useState("");

    const history = useRemoteList<HistoryRow>(async () => {
        if (!selectedEmployee) return { rows: [], total: 0, totalPages: 1 };
        const res = await getData("salary/history", {
            params: { employeeId: selectedEmployee.value, page: historyPage, limit: historyLimit },
        });
        return { rows: res.rows || [], total: res.total || 0, totalPages: res.totalPages || 1 };
    }, [selectedEmployee, historyPage, historyLimit], { page: historyPage, setPage: setHistoryPage });

    // Jump to page 1 and make sure the list reloads even when already there.
    const refreshHistoryFirstPage = () => { if (historyPage === 1) history.reload(); else setHistoryPage(1); };

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

    // Out-of-order guard: typing in the manual present-days field fires one request per change.
    const previewSeq = useRef(0);
    const loadPreview = async () => {
        const reqId = ++previewSeq.current;
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
            if (reqId !== previewSeq.current) return;
            setPreview(res as Preview);
        } catch (err: any) {
            if (reqId !== previewSeq.current) return;
            setPreview(null);
            callAlertMsg(err?.message || "Failed to load settlement preview", "error");
        }
    };

    useEffect(() => {
        if (!selectedEmployee) {
            setAttendanceDays([]); setAdvances([]); setPreview(null);
            return;
        }
        setLoading(true);
        Promise.all([loadAttendance(), loadAdvances(), loadPreview()]).finally(() => setLoading(false));
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
            await Promise.all([loadAdvances(), loadPreview()]);
            refreshHistoryFirstPage();
        } catch (err: any) {
            callAlertMsg(err?.message || "Settlement failed", "error");
        } finally {
            setSettling(false);
        }
    };

    const handleViewPayslip = async (row: HistoryRow) => {
        setBusyLabel("Preparing payslip…");
        try {
            const res = await getData(`salary/${row._id}/payslip`);
            printPayslip(res.period, settings);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load payslip", "error");
        } finally {
            setBusyLabel("");
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
            await history.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record adjustment", "error");
        } finally {
            setLoading(false);
        }
    };

    const adjTotalOf = (h: HistoryRow) => (h.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    const historyMenu = (h: HistoryRow) => (
        <RowActions ariaLabel={`Actions for ${h.periodKey}`} items={[
            { label: "View Payslip", icon: <Icons iconName="print" />, onClick: () => handleViewPayslip(h) },
            { label: "Add Adjustment", icon: <Icons iconName="add" />, onClick: () => openAdjust(h) },
        ]} />
    );

    const historyColumns: Column<HistoryRow>[] = [
        { key: "period", header: "Period", className: "key nowrap", cell: (h) => h.periodKey },
        { key: "net", header: "Net Paid", className: "num t-semibold", cell: (h) => money(h.netAmount) },
        { key: "adj", header: "Adjustments", className: "num", cell: (h) => (adjTotalOf(h) ? `+ ${money(adjTotalOf(h))}` : "—") },
        { key: "paid", header: "Paid On", className: "nowrap tabular", cell: (h) => fmtDate(h.paidAt) },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: historyMenu },
    ];

    return (
        <>
            <BusyOverlay show={!!busyLabel} label={busyLabel} />
            <PageHeader title="Settle salary" />

            <section className="card mb-4">
                <div className="card-body">
                    <div className="row g-3 align-items-end">
                        <div className="col-12 col-md-4">
                            <Field label="Employee" htmlFor="settle-employee">
                                <Selector inputId="settle-employee" options={employeeOptions} value={selectedEmployee}
                                    placeholder="-- Select Employee --"
                                    onChange={(opt: any) => { setSelectedEmployee(opt); setHistoryPage(1); }} />
                            </Field>
                        </div>
                        <div className="col-12 col-md-4">
                            <Field label="Period start" htmlFor="settle-start">
                                <input id="settle-start" type="date" className="form-control" value={periodStart} max={periodEnd}
                                    onChange={(e) => setPeriodStart(e.target.value)} />
                            </Field>
                        </div>
                        <div className="col-12 col-md-4">
                            <Field label="Period end" htmlFor="settle-end">
                                <input id="settle-end" type="date" className="form-control" value={periodEnd} min={periodStart} max={today()}
                                    onChange={(e) => setPeriodEnd(e.target.value)} />
                            </Field>
                        </div>
                    </div>
                </div>
            </section>

            {!selectedEmployee && (
                <section className="card">
                    <EmptyState icon="user" title="Select an employee and period to settle salary" />
                </section>
            )}

            {selectedEmployee && (
                <>
                    <div className="row g-3 g-md-4 mb-4">
                        <div className="col-12 col-xl-6">
                            <section className="card h-100 salary-card">
                                <div className="card-body">
                                    <CardHead title="Attendance" />
                                    <div className="att-mark-row mb-3">
                                        <Field label="Date" htmlFor="mark-date">
                                            <input id="mark-date" type="date" className="form-control" value={markDate}
                                                min={periodStart} max={periodEnd}
                                                onChange={(e) => setMarkDate(e.target.value)} />
                                        </Field>
                                        <Field label="Status" htmlFor="mark-status">
                                            <Selector inputId="mark-status" options={STATUS_OPTIONS} value={markStatus}
                                                onChange={(opt: any) => opt && setMarkStatus(opt)} />
                                        </Field>
                                        <button type="button" className="btn btn-secondary" onClick={handleMarkAttendance} disabled={loading}>
                                            Mark
                                        </button>
                                    </div>
                                    <div className="att-badges mb-3">
                                        {attendanceDays.length ? attendanceDays.map((d) => (
                                            <Badge key={d._id} tone={ATTENDANCE_TONE[d.status] || "neutral"}>
                                                {new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — {d.status}
                                            </Badge>
                                        )) : <span className="t-sm t-muted">No marks yet for this period</span>}
                                    </div>
                                    <SegmentedControl radio label="Present days source" options={MODE_OPTIONS}
                                        value={presentDaysMode} onChange={setPresentDaysMode} />
                                    {presentDaysMode === "manual" && (
                                        <input type="number" min={0} className="form-control mt-3" placeholder="Present days"
                                            aria-label="Present days" value={presentDaysManual}
                                            onChange={(e) => setPresentDaysManual(e.target.value)} />
                                    )}
                                    {preview && (
                                        <p className="t-xs t-muted mt-3 mb-0">
                                            Computed from daily marks: {preview.presentDaysComputed} days.
                                            Working days in period: {preview.workingDays}.
                                        </p>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="col-12 col-xl-6">
                            <section className="card h-100 salary-card">
                                <div className="card-body">
                                    <CardHead title="Advances (unapplied)" />
                                    <div className="adv-add-row mb-3">
                                        <Field label="Date" htmlFor="adv-date">
                                            <input id="adv-date" type="date" className="form-control" value={advDate} max={today()}
                                                onChange={(e) => setAdvDate(e.target.value)} />
                                        </Field>
                                        <Field label="Amount" htmlFor="adv-amount">
                                            <AffixInput id="adv-amount" prefix="₹" type="number" min={0} placeholder="Amount"
                                                value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} />
                                        </Field>
                                        <Field label="Reason" htmlFor="adv-reason">
                                            <input id="adv-reason" type="text" className="form-control" placeholder="Reason"
                                                value={advReason} onChange={(e) => setAdvReason(e.target.value)} />
                                        </Field>
                                        <button type="button" className="btn btn-secondary" onClick={handleRecordAdvance} disabled={loading}>
                                            Add
                                        </button>
                                    </div>
                                    <div className="table-wrap">
                                        <table className="table">
                                            <thead>
                                                <tr><th scope="col">Date</th><th scope="col" className="num">Amount</th><th scope="col">Reason</th></tr>
                                            </thead>
                                            <tbody>
                                                {advances.length ? advances.map((a) => (
                                                    <tr key={a._id}>
                                                        <td className="nowrap tabular">{fmtDate(a.date)}</td>
                                                        <td className="num">{money(a.amount)}</td>
                                                        <td>{a.reason || "—"}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan={3} className="t-muted">No unapplied advances</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {advances.length > 0 && (
                                        <p className="t-xs t-muted mt-3 mb-0">
                                            All {advances.length} unapplied advance(s) will be swept into this settlement.
                                        </p>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>

                    <section className="card mb-4 salary-card">
                        <div className="card-body">
                            <CardHead title="Deductions" />
                            {deductions.map((d, idx) => (
                                <div className="ded-row mb-3" key={idx}>
                                    <Field label={idx === 0 ? "Amount" : undefined} htmlFor={`ded-amount-${idx}`}>
                                        <AffixInput id={`ded-amount-${idx}`} prefix="₹" type="number" min={0} placeholder="Amount"
                                            aria-label="Deduction amount"
                                            value={d.amount} onChange={(e) => updateDeductionRow(idx, "amount", e.target.value)} />
                                    </Field>
                                    <Field label={idx === 0 ? "Reason" : undefined} htmlFor={`ded-reason-${idx}`}>
                                        <input id={`ded-reason-${idx}`} type="text" className="form-control" placeholder="Reason"
                                            aria-label="Deduction reason"
                                            value={d.reason} onChange={(e) => updateDeductionRow(idx, "reason", e.target.value)} />
                                    </Field>
                                    <button type="button" className="btn btn-icon" aria-label="Remove deduction" onClick={() => removeDeductionRow(idx)}>
                                        <Icons iconName="trash" />
                                    </button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-secondary btn-sm mb-4" onClick={addDeductionRow}>
                                + Add Deduction
                            </button>

                            {preview && (
                                <div className="row g-3 g-md-4 mb-4">
                                    <div className="col-12 col-md-7">
                                        <dl className="key-values">
                                            <div><dt>Gross ({preview.presentDaysUsed}/{preview.workingDays} days)</dt><dd>{money(preview.grossAmount)}</dd></div>
                                            <div><dt>Advances deducted</dt><dd>- {money(preview.advancesDeducted)}</dd></div>
                                            {Number(preview.advancesCarriedForward) > 0 && (
                                                <div><dt>Advance carried forward to next settlement</dt><dd>{money(Number(preview.advancesCarriedForward))}</dd></div>
                                            )}
                                            <div><dt>Deductions</dt><dd>- {money(deductionsTotal)}</dd></div>
                                            <div className="is-total"><dt>Net Payable</dt><dd>{money(finalNet)}</dd></div>
                                        </dl>
                                    </div>
                                    <div className="col-12 col-md-5">
                                        <Field label="Note (optional)" htmlFor="settle-note">
                                            <input id="settle-note" type="text" className="form-control" value={settleNote}
                                                onChange={(e) => setSettleNote(e.target.value)} placeholder="Payment note" />
                                        </Field>
                                    </div>
                                </div>
                            )}

                            <div className="settle-actions">
                                <p className="t-xs t-muted mb-0">
                                    This locks the period as paid. Corrections afterward go through an adjustment, not a re-settle.
                                </p>
                                <button type="button" className="btn btn-primary" onClick={handleSettle}
                                    disabled={settling || !preview}>
                                    {settling && <span className="spinner" aria-hidden="true" />}
                                    {settling ? "Settling..." : "Settle & Pay"}
                                </button>
                            </div>
                        </div>
                    </section>

                    <DataList<HistoryRow>
                        caption="Settlement history"
                        toolbar={<div className="list-toolbar-title"><CardHead title="Settlement history" /></div>}
                        rows={history.rows}
                        rowKey={(h) => h._id}
                        columns={historyColumns}
                        status={history.status}
                        refetching={history.refetching}
                        onRetry={history.reload}
                        errorTitle="Couldn't load settlement history"
                        empty={{ title: "No settlements yet", text: "Settled periods for this employee will show up here." }}
                        mobileCard={(h) => (
                            <MobileCard
                                title={h.periodKey}
                                menu={historyMenu(h)}
                                right={money(h.netAmount)}
                                meta={[h.paidAt ? `Paid ${fmtDate(h.paidAt)}` : null, adjTotalOf(h) ? `Adjustments + ${money(adjTotalOf(h))}` : null]}
                            />
                        )}
                        pagination={
                            <Pagination page={historyPage} totalPages={history.totalPages} total={history.total} limit={historyLimit}
                                onPage={setHistoryPage} onLimit={(n) => { setHistoryLimit(n); setHistoryPage(1); }} />
                        }
                    />
                </>
            )}

            <Modal
                open={!!adjustTarget}
                onClose={() => setAdjustTarget(null)}
                title={`Add Adjustment — ${adjustTarget?.periodKey ?? ""}`}
                description={adjustTarget && <>Adjustments never change the original settled amount ({money(adjustTarget.netAmount)}) — they
                    append an additional entry to the audit trail as a top-up payment.</>}
                busy={loading}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setAdjustTarget(null)} disabled={loading}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleAddAdjustment} disabled={loading || !adjustAmount}>
                            {loading && <span className="spinner" aria-hidden="true" />}
                            Save Adjustment
                        </button>
                    </>
                }
            >
                <div className="form-grid">
                    <Field label="Type" htmlFor="adj-type">
                        <input id="adj-type" type="text" className="form-control" value={adjustType}
                            onChange={(e) => setAdjustType(e.target.value)} placeholder="correction" />
                    </Field>
                    <Field label="Amount (₹)" htmlFor="adj-amount" required>
                        <input id="adj-amount" type="number" min={0} className="form-control" value={adjustAmount}
                            onChange={(e) => setAdjustAmount(e.target.value)} />
                    </Field>
                    <Field label="Reason" htmlFor="adj-reason" className="span-2">
                        <textarea id="adj-reason" className="form-control" rows={2} value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)} />
                    </Field>
                </div>
            </Modal>
        </>
    );
};

export default SettlePeriod;
