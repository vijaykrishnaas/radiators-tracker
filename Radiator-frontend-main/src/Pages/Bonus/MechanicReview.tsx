import { useEffect, useState } from "react";
import {
    ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";

import Selector from "../../Components/Selector";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings } from "../../Context/SettingsContext";
import { money, today, fyStart, fyYear } from "../../Utils/format";
import type { ReviewData } from "../../Types/bonus";
import { PageHeader, KpiCard, KpiGrid, EmptyState, Field, ProgressBar, BtnSpinner, CardHead } from "../../Components/ui/Basics";
import { FilterBar } from "../../Components/ui/Filters";
import { AffixInput } from "../../Components/ui/Inputs";
import { ChartCard, ChartTooltip, DonutWithLegend } from "../../Components/ui/Charts";
import { DataList, MobileCard, type Column } from "../../Components/ui/DataList";
import { HBarChart } from "../IssueCounter/Dashboard/Index";
import { usePhone } from "../../Components/ui/hooks";
import { axisProps, compactINR, GRID_STROKE } from "../../theme/chartTheme";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Bill = ReviewData["bills"][number];
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");
const servicesOf = (b: Bill) => b.services.map((svc) => (svc.comments ? svc.comments : svc.type)).join(", ");
const balanceOf = (b: Bill) => Math.max(b.totalAmount - b.receivedAmount, 0);

const MechanicReview = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();

    const defaultFrom = fyStart(settings);
    const [mechanicOptions, setMechanicOptions] = useState<{ value: string; label: string }[]>([]);
    const [selectedMechanic, setSelectedMechanic] = useState<{ value: string; label: string } | null>(null);
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(today());
    const [loading, setLoading] = useState(false);
    const [payoutLoading, setPayoutLoading] = useState(false);
    const [data, setData] = useState<ReviewData | null>(null);
    const [bonusAmount, setBonusAmount] = useState("");
    const [notes, setNotes] = useState("");

    useEffect(() => {
        getData("mechanic").then((res) => {
            const opts = (res.mechdata || []).map((m: string) => ({ value: m, label: m }));
            setMechanicOptions(opts);
        }).catch(() => {});
    }, []);
    const personOptions = mechanicOptions;

    useEffect(() => {
        if (!selectedMechanic) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await getData("bonus/review", {
                    params: { type: "mechanic", name: selectedMechanic.value, from, to },
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
    }, [selectedMechanic, from, to]);

    const handlePayout = async () => {
        if (!selectedMechanic || !data) return;
        setPayoutLoading(true);
        try {
            const year = fyYear(settings);
            const res = await postData("bonus/payout", {
                type: "mechanic",
                period: year,
                beneficiary: selectedMechanic.value,
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
        if (!data || !selectedMechanic) return;
        const rows = data.bills.map((b) => ({
            "Date": new Date(b.billDate).toLocaleDateString("en-IN"),
            "Vehicle": b.truckNumber,
            "Total (₹)": b.totalAmount,
            "Collected (₹)": b.receivedAmount,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bills");
        XLSX.writeFile(wb, `mechanic-review-${selectedMechanic.value}.xlsx`);
    };

    const exportPDF = () => {
        if (!data || !selectedMechanic) return;
        const doc = new jsPDF();
        doc.setFontSize(13);
        doc.text(`${settings.company.name} — ${selectedMechanic.value} Review (${from} to ${to})`, 14, 14);
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
        doc.save(`mechanic-review-${selectedMechanic.value}.pdf`);
    };

    const s = data?.summary;
    const collectionPct = s?.collectionRate || 0;
    const first = loading && !data;
    const chartH = phone ? 240 : 300;

    const activeCount = (selectedMechanic ? 1 : 0) + (from !== defaultFrom ? 1 : 0) + (to !== today() ? 1 : 0);
    const clearFilters = () => { setSelectedMechanic(null); setFrom(defaultFrom); setTo(today()); };

    const billColumns: Column<Bill>[] = [
        { key: "date", header: "Date", className: "nowrap tabular", cell: (b) => fmtDate(b.billDate) },
        { key: "veh", header: "Vehicle", className: "key nowrap", cell: (b) => b.truckNumber },
        { key: "svc", header: "Services", className: "text-wide", cell: (b) => servicesOf(b) },
        { key: "total", header: "Total", className: "num", cell: (b) => money(b.totalAmount) },
        { key: "coll", header: "Collected", className: "num", cell: (b) => money(b.receivedAmount) },
        { key: "bal", header: "Balance", className: "num", cell: (b) => money(balanceOf(b)) },
    ];

    return (
        <>
            <PageHeader
                title="Mechanic performance review"
                back={{ to: "/bonus/mechanics", label: "Mechanic Bonus" }}
                actions={data ? [
                    { label: "Excel", icon: "exporticon", onClick: exportExcel, collapse: true },
                    { label: "PDF", icon: "entrolment_download", onClick: exportPDF, collapse: true },
                ] : []}
            />

            <div className="dash-grid">
                <div className="card filter-standalone">
                    <FilterBar
                        activeCount={activeCount}
                        onClear={clearFilters}
                        filters={[
                            { id: "review-person", label: "Mechanic", primary: true, node: <Selector inputId="review-person" options={personOptions} value={selectedMechanic} placeholder="-- Select Mechanic --" onChange={(opt: any) => setSelectedMechanic(opt)} /> },
                            { id: "review-from", label: "From", primary: true, node: <input id="review-from" type="date" className="form-control" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /> },
                            { id: "review-to", label: "To", node: <input id="review-to" type="date" className="form-control" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /> },
                        ]}
                    />
                </div>

                {!selectedMechanic && (
                    <div className="card">
                        <EmptyState icon="users" title="Select a mechanic to view their performance review" />
                    </div>
                )}

                {selectedMechanic && (data || loading) && (
                    <>
                        <KpiGrid count={4}>
                            <KpiCard loading={first} label="Total bills" value={String(s?.totalBills || 0)} icon="receipt-text" />
                            <KpiCard loading={first} label="Operations" value={String(s?.totalOperations || 0)} icon="bar_chart" />
                            <KpiCard loading={first} label="Total revenue" value={money(s?.totalRevenue || 0)} icon="currencyrupee" tone="brand" />
                            <KpiCard loading={first} label="Collected" value={money(s?.totalCollected || 0)} icon="trendingup" tone="success" />
                        </KpiGrid>

                        <div className="row g-3 g-md-4">
                            <div className="col-12 col-lg-6">
                                <ChartCard title="Service type mix" subtitle="Share of jobs, with revenue" loading={first} isEmpty={!data?.byServiceType.length}>
                                    <DonutWithLegend data={data?.byServiceType || []} nameKey="type" valueKey="count" amountKey="revenue" centerLabel="Revenue" />
                                </ChartCard>
                            </div>
                            <div className="col-12 col-lg-6">
                                <ChartCard title="Revenue by product model" loading={first} isEmpty={!data?.byProductType.length}>
                                    <HBarChart data={data?.byProductType || []} dataKey="revenue" nameKey="product" name="Revenue" />
                                </ChartCard>
                            </div>
                            <div className="col-12 col-xl-8">
                                <ChartCard title="Revenue timeline" subtitle={`Granularity: ${data?.granularity ?? ""}`} loading={first} isEmpty={!data?.timeline.length}>
                                    <ResponsiveContainer width="100%" height={chartH}>
                                        <AreaChart data={data?.timeline || []}>
                                            <defs>
                                                <linearGradient id="gradReview" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                                            <XAxis dataKey="date" {...axisProps} />
                                            <YAxis {...axisProps} width={48} tickFormatter={compactINR} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Area dataKey="revenue" name="Revenue" stroke="var(--brand-500)" strokeWidth={2} fill="url(#gradReview)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            </div>
                            <div className="col-12 col-xl-4">
                                <ChartCard title="Collection rate" loading={first} isEmpty={false} height={chartH}>
                                    <div className="collection-rate">
                                        <span className="collection-pct">{collectionPct}%</span>
                                        <ProgressBar value={collectionPct} label="Collection rate" />
                                        <p className="t-sm t-muted mb-0">
                                            {money(s?.totalCollected || 0)} of {money(s?.totalRevenue || 0)}
                                        </p>
                                    </div>
                                </ChartCard>
                            </div>
                        </div>

                        {data && data.bills.length > 0 && (
                            <section className="card">
                                <div className="review-bonus-head">
                                    <div>
                                        <h2 className="card-title">Bonus decision</h2>
                                        <p className="card-subtitle">Suggested bonus</p>
                                    </div>
                                    <span className="review-bonus-amount">{money(s?.suggestedBonus || 0)}</span>
                                </div>
                                <div className="card-body">
                                    <div className="form-grid">
                                        <Field label="Final bonus amount (₹)" htmlFor="review-bonus">
                                            <AffixInput id="review-bonus" prefix="₹" type="number" inputMode="decimal" min={0}
                                                value={bonusAmount}
                                                onChange={(e) => setBonusAmount(e.target.value)}
                                                placeholder="Enter final bonus amount" />
                                        </Field>
                                        <Field label="Notes (optional)" htmlFor="review-notes">
                                            <input id="review-notes" type="text" className="form-control" value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Any remarks" />
                                        </Field>
                                    </div>
                                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-4">
                                        <p className="t-xs t-muted mb-0">
                                            This will lock all pending bonus entries for {selectedMechanic.label} in the current year.
                                        </p>
                                        <button type="button" className="btn btn-primary"
                                            onClick={handlePayout} disabled={payoutLoading || !bonusAmount}>
                                            <BtnSpinner show={payoutLoading} />
                                            {payoutLoading ? "Saving..." : "Confirm & Mark Paid"}
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}

                        {data && (
                            <DataList<Bill>
                                caption="Bills"
                                toolbar={<div className="card-body pb-0"><CardHead title={`Bills (${data.bills.length})`} /></div>}
                                rows={data.bills}
                                rowKey={(_b, i) => String(i)}
                                columns={billColumns}
                                status="ready"
                                errorTitle="Couldn't load bills"
                                empty={{ icon: "receipt-text", title: "No bills found for this period" }}
                                mobileCard={(b) => (
                                    <MobileCard
                                        title={b.truckNumber}
                                        meta={[fmtDate(b.billDate)]}
                                        meta2={servicesOf(b)}
                                        amounts={[
                                            { label: "Total", value: money(b.totalAmount) },
                                            { label: "Collected", value: money(b.receivedAmount) },
                                            { label: "Balance", value: money(balanceOf(b)) },
                                        ]}
                                    />
                                )}
                            />
                        )}
                    </>
                )}
            </div>
        </>
    );
};

export default MechanicReview;
