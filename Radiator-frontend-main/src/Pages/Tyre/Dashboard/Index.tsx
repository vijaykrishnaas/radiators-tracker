import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Selector from "../../../Components/Selector";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import { PageHeader, KpiCard, KpiGrid, CardHead, Badge, SkeletonRows } from "../../../Components/ui/Basics";
import { FilterBar } from "../../../Components/ui/Filters";
import { ChartCard, DonutWithLegend, SeriesLegend } from "../../../Components/ui/Charts";
import { usePhone } from "../../../Components/ui/hooks";
import { PAIR_COLORS, STATUS_COLORS } from "../../../theme/chartTheme";
import { HBarChart, PairBarChart } from "../../IssueCounter/Dashboard/Index";
import { fmtDate, type TyreAnalytics } from "../types";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;

const TyreDashboard = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();
    const chartH = phone ? 240 : 300;
    const labels = settings.tyre.labels;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<TyreAnalytics | null>(null);
    const defaultFrom = fyStart(settings);
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(today());
    const [mechanicName, setMechanicName] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [mechanicOptions, setMechanicOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        getData("tyre-mechanic").then((res) => setMechanicOptions((res.mechdata || []).map((m: string) => ({ value: m, label: m })))).catch(() => {});
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                const res = await getData("tyrebills/analytics", { params: { fromDate: from, toDate: to, mechanicName, status: statusFilter } });
                if (alive) setData(res as TyreAnalytics);
            } catch {
                if (alive) callAlertMsg("Failed to load dashboard", "error");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, mechanicName, statusFilter]);

    const k = data?.kpis;
    const inst = data?.installments;
    const first = loading && !data;
    const activeCount = [mechanicName, statusFilter].filter(Boolean).length + (from !== defaultFrom ? 1 : 0) + (to !== today() ? 1 : 0);
    const clear = () => { setFrom(defaultFrom); setTo(today()); setMechanicName(""); setStatusFilter(""); };

    return (
        <>
            <PageHeader title="Dashboard" />
            <div className="dash-grid">
                {/* Installment follow-up: always over every challan, whatever the date filter below. */}
                <section className="card">
                    <div className="card-body">
                        <CardHead title="Installments to collect" subtitle="Overdue and due this month, across all challans" />
                        <KpiGrid count={3}>
                            <KpiCard loading={first} label="Overdue" value={money(inst?.overdueAmount || 0)} icon="clock" tone="error" valueTone="error"
                                caption={inst ? `${inst.overdueBills} challan${inst.overdueBills === 1 ? "" : "s"}` : undefined} />
                            <KpiCard loading={first} label="Due this month" value={money(inst?.dueThisMonth || 0)} icon="calendar" tone="brand" />
                            <KpiCard loading={first} label="Interest (in range)" value={money(k?.interestTotal || 0)} icon="trendingup" tone="success" />
                        </KpiGrid>
                        {first ? <SkeletonRows rows={3} /> : inst && inst.rows.length > 0 ? (
                            <div className="table-wrap mt-3">
                                <table className="table">
                                    <thead>
                                        <tr><th>Due</th><th>D.C.</th><th>{labels.customer}</th><th>Phone</th><th>Installment</th><th className="num">Balance</th><th /></tr>
                                    </thead>
                                    <tbody>
                                        {inst.rows.map((r) => (
                                            <tr key={`${r.billId}-${r.installmentId}`}>
                                                <td className="nowrap tabular">{fmtDate(r.dueDate)}</td>
                                                <td className="nowrap"><Link to={`/tyre/dashboard/view/${r.billId}`}>{r.billNo}</Link></td>
                                                <td className="text">{r.customerName || r.vehicleNumber}</td>
                                                <td className="nowrap">{r.phoneNumber ? <a href={`tel:${r.phoneNumber}`}>{r.phoneNumber}</a> : "—"}</td>
                                                <td className="nowrap">{r.label}</td>
                                                <td className="num tabular">{money(r.balance)}</td>
                                                <td className="nowrap">{r.overdue ? <Badge tone="error" dot>Overdue</Badge> : <Badge tone="warning" dot>Due</Badge>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="t-sm t-muted mt-3 mb-0">Nothing overdue or due this month.</p>
                        )}
                        {inst && inst.overdueBills > 0 && (
                            <Link className="btn btn-secondary btn-sm mt-3" to="/tyre/billing?overdue=1">Open overdue challans</Link>
                        )}
                    </div>
                </section>

                <div className="card filter-standalone">
                    <FilterBar
                        activeCount={activeCount}
                        onClear={clear}
                        filters={[
                            { id: "d-from", label: "From", primary: true, node: <input id="d-from" type="date" className="form-control" value={from} max={to} onChange={(e) => setFrom(e.target.value || defaultFrom)} /> },
                            { id: "d-to", label: "To", primary: true, node: <input id="d-to" type="date" className="form-control" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value || today())} /> },
                            { id: "d-mech", label: labels.agent, node: <Selector inputId="d-mech" isClearable options={mechanicOptions} placeholder={`-- All ${labels.agent}s --`} value={opt(mechanicOptions, mechanicName)} onChange={(o: any) => setMechanicName(o ? o.value : "")} /> },
                            { id: "d-status", label: "Status", node: <Selector inputId="d-status" isClearable options={STATUS_OPTIONS} placeholder="-- All --" value={opt(STATUS_OPTIONS, statusFilter)} onChange={(o: any) => setStatusFilter(o ? o.value : "")} /> },
                        ]}
                    />
                </div>

                <KpiGrid count={6}>
                    <KpiCard loading={first} label="Challans" value={String(k?.totalBills || 0)} icon="receipt-text"
                        caption={k ? `${k.installmentBills} on installments` : undefined} />
                    <KpiCard loading={first} label="Tyres sold" value={String(k?.tyresSold || 0)} icon="package" />
                    <KpiCard loading={first} label="To collect" value={money(k?.payableTotal || 0)} icon="currencyrupee" tone="brand"
                        caption={k ? `${money(k.tyreRevenue)} tyres + ${money(k.interestTotal)} interest` : undefined} />
                    <KpiCard loading={first} label="Collected" value={money(k?.totalCollected || 0)} icon="trendingup" tone="success" />
                    <KpiCard loading={first} label="Pending" value={money(k?.totalPending || 0)} icon="clock" tone="error" valueTone="error" />
                    <KpiCard loading={first} label="Collection Rate" value={`${k?.collectionRate || 0}%`} icon="bar_chart" />
                </KpiGrid>

                <div className="row g-3 g-md-4">
                    <div className="col-12 col-xl-8">
                        <ChartCard title="Monthly sales" subtitle="To collect vs collected" loading={first} isEmpty={!(data?.byMonth?.length)}
                            control={<SeriesLegend items={[{ label: "To collect", color: PAIR_COLORS[0] }, { label: "Collected", color: PAIR_COLORS[1] }]} />}>
                            <PairBarChart data={data?.byMonth || []} keys={["revenue", "To collect", "collected", "Collected"]} height={chartH} />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-4">
                        <ChartCard title="Payment Status" loading={first} isEmpty={!(data?.byStatus?.length)}>
                            <DonutWithLegend data={data?.byStatus || []} nameKey="status" valueKey="revenue" centerLabel="Billed"
                                colorFor={(r) => STATUS_COLORS[String(r.status)] || "var(--gray-400)"} />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-6">
                        <ChartCard title="Top brands" subtitle="Tyre sales by brand" loading={first} isEmpty={!(data?.byBrand?.length)}>
                            <HBarChart data={data?.byBrand || []} dataKey="revenue" nameKey="brand" name="Sales" />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-6">
                        <ChartCard title={`Top ${labels.agent}s`} loading={first} isEmpty={!(data?.topMechanics?.length)}>
                            <HBarChart data={data?.topMechanics || []} dataKey="revenue" nameKey="mechanic" name="Tyre sales" />
                        </ChartCard>
                    </div>
                </div>
            </div>
        </>
    );
};

export default TyreDashboard;
