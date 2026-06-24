import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area,
} from "recharts";

import Icons from "../../Components/Icons";
import Loader from "../../Components/Loader";
import Selector from "../../Components/Selector";
import AlertComponent from "../../Components/AlertComponent";
import ChartCard, { CHART_COLORS, ChartTooltip } from "../../Components/ChartCard";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { money, today, monthStart } from "../../Utils/format";
import type { ReviewData } from "../../Types/bonus";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const LabourReview = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [payoutLoading, setPayoutLoading] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<{ value: string; label: string } | null>(null);
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState<ReviewData | null>(null);
    const [bonusAmount, setBonusAmount] = useState("");
    const [notes, setNotes] = useState("");

    const workerOptions = settings.labour.map((l) => ({ value: l, label: l }));
    const workerLabel = settings.labels.worker;

    useEffect(() => {
        if (!selectedWorker) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await getData("bonus/review", {
                    params: { type: "labour", name: selectedWorker.value, from, to },
                });
                setData(res as ReviewData);
                setBonusAmount(String((res.summary?.suggestedBonus || 0).toFixed(2)));
                setNotes(""); // fresh context — don't carry a note from a prior review/payout
            } catch (err: any) {
                callAlertMsg(err?.message || "Failed to load review data", "error");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWorker, from, to]);

    const handlePayout = async () => {
        if (!selectedWorker || !data) return;
        setPayoutLoading(true);
        try {
            const res = await postData("bonus/payout", {
                type: "labour",
                beneficiary: selectedWorker.value,
                from,
                to,
                amount: Number(bonusAmount),
                notes,
            });
            callAlertMsg(res.message || "Bonus marked paid", "success");
            setData(null);
            setBonusAmount("");
        } catch (err: any) {
            callAlertMsg(err?.message || "Payout failed", "error");
        } finally {
            setPayoutLoading(false);
        }
    };

    const exportExcel = () => {
        if (!data || !selectedWorker) return;
        const rows = data.bills.map((b) => ({
            "Date": new Date(b.billDate).toLocaleDateString("en-IN"),
            "Vehicle": b.truckNumber,
            "Total (₹)": b.totalAmount,
            "Collected (₹)": b.receivedAmount,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bills");
        XLSX.writeFile(wb, `labour-review-${selectedWorker.value}.xlsx`);
    };

    const exportPDF = () => {
        if (!data || !selectedWorker) return;
        const doc = new jsPDF();
        doc.setFontSize(13);
        doc.text(`${settings.company.name} — ${selectedWorker.value} Review (${from} to ${to})`, 14, 14);
        autoTable(doc, {
            startY: 22,
            head: [["Date", "Vehicle", "Total", "Collected"]],
            body: data.bills.map((b) => [
                new Date(b.billDate).toLocaleDateString("en-IN"),
                b.truckNumber,
                b.totalAmount,
                b.receivedAmount,
            ]),
            headStyles: { fillColor: settings.branding.primaryColor },
            styles: { fontSize: 9 },
        });
        doc.save(`labour-review-${selectedWorker.value}.pdf`);
    };

    const s = data?.summary;
    const collectionPct = s?.collectionRate || 0;

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                {/* Title bar */}
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <div className="d-flex align-items-center gap-3">
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                            onClick={() => navigate("/bonus/labour")}>
                            <span style={{ transform: "rotate(90deg)", display: "inline-flex" }}>
                                <Icons iconName="arrow-down" className="icon-15 me-1" />
                            </span>
                            Back
                        </button>
                        <h4 className="fw-semibold mb-0">{workerLabel} Performance Review</h4>
                    </div>
                    {data && (
                        <div className="d-flex gap-2">
                            <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportExcel}>
                                <Icons iconName="exporticon" className="icon-15 me-2" />Excel
                            </button>
                            <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={exportPDF}>
                                <Icons iconName="entrolment_download" className="icon-15 me-2" />PDF
                            </button>
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <div className="row table-accordion-header align-items-end g-3">
                            <div className="col-12 col-md-4">
                                <label className="form-label font-w500 mb-1">{workerLabel}</label>
                                <Selector
                                    options={workerOptions}
                                    value={selectedWorker}
                                    placeholder={`-- Select ${workerLabel} --`}
                                    onChange={(opt: any) => setSelectedWorker(opt)}
                                />
                            </div>
                            <div className="col-12 col-md-3">
                                <label className="form-label font-w500 mb-1">From</label>
                                <input type="date" className="form-control" value={from} max={to}
                                    onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="col-12 col-md-3">
                                <label className="form-label font-w500 mb-1">To</label>
                                <input type="date" className="form-control" value={to} min={from} max={today()}
                                    onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>

                {!selectedWorker && (
                    <div className="card card-shadow">
                        <div className="card-body text-center py-5 text-muted font-s14">
                            Select a {workerLabel.toLowerCase()} to view their performance review
                        </div>
                    </div>
                )}

                {selectedWorker && data && (
                    <>
                        {/* KPI cards */}
                        <div className="row g-3 mb-4">
                            {[
                                { label: "Total Bills", value: String(s?.totalBills || 0), icon: "receipt-text" },
                                { label: "Operations", value: String(s?.totalOperations || 0), icon: "bar_chart" },
                                { label: "Total Revenue", value: money(s?.totalRevenue || 0), icon: "currencyrupee" },
                                { label: "Collected", value: money(s?.totalCollected || 0), icon: "trendingup" },
                            ].map((kpi) => (
                                <div key={kpi.label} className="col-6 col-md-3">
                                    <div className="card card-shadow text-center py-3 px-2 h-100">
                                        <Icons iconName={kpi.icon} className="icon-24 mx-auto mb-2" />
                                        <p className="h6 font-w600 mb-1">{kpi.value}</p>
                                        <p className="text-muted font-s12 mb-0">{kpi.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Charts row */}
                        <div className="row g-4 mb-4">
                            <div className="col-12 col-md-6">
                                <ChartCard title="Service Type Mix" isEmpty={!data.byServiceType.length}>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie data={data.byServiceType} dataKey="count" nameKey="type"
                                                cx="50%" cy="50%" outerRadius={80}
                                                animationBegin={200} animationDuration={1200} animationEasing="ease-out">
                                                {data.byServiceType.map((_, i) => (
                                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            </div>
                            <div className="col-12 col-md-6">
                                <ChartCard title="Revenue by Product Model" isEmpty={!data.byProductType.length}>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={data.byProductType} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} />
                                            <YAxis type="category" dataKey="product" width={90} tick={{ fontSize: 11 }} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Bar dataKey="revenue" name="Revenue" fill="var(--primary)"
                                                radius={[0, 6, 6, 0]}
                                                animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            </div>
                            <div className="col-12 col-md-8">
                                <ChartCard title="Revenue Timeline" subtitle={`Granularity: ${data.granularity}`}
                                    isEmpty={!data.timeline.length}>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <AreaChart data={data.timeline}>
                                            <defs>
                                                <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Area dataKey="revenue" name="Revenue" stroke="var(--primary)" strokeWidth={2}
                                                fill="url(#gradPrimary)"
                                                animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            </div>
                            <div className="col-12 col-md-4">
                                <ChartCard title="Collection Rate" isEmpty={false}>
                                    <div className="d-flex flex-column justify-content-center" style={{ height: 220 }}>
                                        <p className="text-center font-s13 mb-2">
                                            {money(s?.totalCollected || 0)} of {money(s?.totalRevenue || 0)}
                                        </p>
                                        <div className="progress" style={{ height: 20 }}>
                                            <div className="progress-bar" role="progressbar"
                                                style={{ width: `${collectionPct}%`, backgroundColor: "var(--primary)" }}
                                                aria-valuenow={collectionPct} aria-valuemin={0} aria-valuemax={100}>
                                                {collectionPct}%
                                            </div>
                                        </div>
                                        <p className="text-center text-muted font-s12 mt-2">{collectionPct}% collected</p>
                                    </div>
                                </ChartCard>
                            </div>
                        </div>

                        {/* Bonus decision card */}
                        {(data.bills.length > 0) && (
                            <div className="card card-shadow mb-4">
                                <div className="card-body">
                                    <p className="font-w600 font-s15 mb-3">Bonus Decision</p>
                                    <div className="row g-3 align-items-end">
                                        <div className="col-12 col-md-4">
                                            <label className="form-label font-w500 mb-1">
                                                Suggested Bonus: {money(s?.suggestedBonus || 0)}
                                            </label>
                                            <input type="number" className="form-control" min={0}
                                                value={bonusAmount}
                                                onChange={(e) => setBonusAmount(e.target.value)}
                                                placeholder="Enter final bonus amount" />
                                        </div>
                                        <div className="col-12 col-md-5">
                                            <label className="form-label font-w500 mb-1">Notes (optional)</label>
                                            <input type="text" className="form-control" value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Any remarks" />
                                        </div>
                                        <div className="col-12 col-md-3">
                                            <button type="button" className="btn btn-gradient w-100"
                                                onClick={handlePayout} disabled={payoutLoading || !bonusAmount}>
                                                {payoutLoading ? "Saving..." : "Confirm & Mark Paid"}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-muted font-s12 mt-2 mb-0">
                                        This will lock all pending bonus entries for {selectedWorker.label} from {from} to {to}.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Bills table */}
                        <div className="card card-shadow">
                            <div className="card-body p-0">
                                <div className="table-header">
                                    <p className="font-w500 font-s14 mb-0 px-3 py-2">
                                        Bills ({data.bills.length})
                                    </p>
                                </div>
                                <div className="table-body">
                                    <table className="table table-bordered font-s14">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Vehicle</th>
                                                <th>Services</th>
                                                <th>Total</th>
                                                <th>Collected</th>
                                                <th>Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.bills.length ? data.bills.map((b, i) => (
                                                <tr key={i}>
                                                    <td>{new Date(b.billDate).toLocaleDateString("en-IN")}</td>
                                                    <td>{b.truckNumber}</td>
                                                    <td className="font-s12">
                                                        {b.services.map((svc) =>
                                                            svc.comments ? svc.comments : svc.type
                                                        ).join(", ")}
                                                    </td>
                                                    <td>{money(b.totalAmount)}</td>
                                                    <td>{money(b.receivedAmount)}</td>
                                                    <td>{money(Math.max(b.totalAmount - b.receivedAmount, 0))}</td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan={6} className="text-center py-3 text-muted">
                                                        No bills found for this period
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default LabourReview;
