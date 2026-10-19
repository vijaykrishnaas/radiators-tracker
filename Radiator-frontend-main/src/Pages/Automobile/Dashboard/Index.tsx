import { useEffect, useState } from "react";

import Selector from "../../../Components/Selector";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import type { AutoBillingAnalytics } from "../../../Types/analytics";
import { PageHeader, KpiCard, KpiGrid } from "../../../Components/ui/Basics";
import { FilterBar } from "../../../Components/ui/Filters";
import { ChartCard, DonutWithLegend, SeriesLegend } from "../../../Components/ui/Charts";
import { usePhone } from "../../../Components/ui/hooks";
import { PAIR_COLORS, STATUS_COLORS } from "../../../theme/chartTheme";
import { HBarChart, PairBarChart } from "../../IssueCounter/Dashboard/Index";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;

const AutoAnalytics = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();
    const chartH = phone ? 240 : 300;

    const [loading, setLoading] = useState(true);
    const [billingData, setBillingData] = useState<AutoBillingAnalytics | null>(null);

    const defaultFrom = fyStart(settings);
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(today());
    const [mechanicName, setMechanicName] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [mechanicOptions, setMechanicOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        getData("auto-mechanic").then((res) => {
            setMechanicOptions((res.mechdata || []).map((m: string) => ({ value: m, label: m })));
        }).catch(() => {});
    }, []);

    useEffect(() => {
        let alive = true;
        const fetchAll = async () => {
            setLoading(true);
            try {
                const res = await getData("autobills/analytics", {
                    params: { fromDate: from, toDate: to, mechanicName, status: statusFilter },
                });
                if (alive) setBillingData(res as AutoBillingAnalytics);
            } catch {
                if (alive) callAlertMsg("Failed to load billing analytics", "error");
            } finally {
                if (alive) setLoading(false);
            }
        };
        fetchAll();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, mechanicName, statusFilter]);

    const k = billingData?.kpis;
    const labels = settings.automobile.labels;
    const first = loading && !billingData;

    const activeCount = [mechanicName, statusFilter].filter(Boolean).length + (from !== defaultFrom ? 1 : 0) + (to !== today() ? 1 : 0);
    const clear = () => { setFrom(defaultFrom); setTo(today()); setMechanicName(""); setStatusFilter(""); };

    return (
        <>
            <PageHeader title="Dashboard" />
            <div className="dash-grid">
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
                    <KpiCard loading={first} label="Total Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard loading={first} label="Total Revenue" value={money(k?.totalRevenue || 0)} icon="currencyrupee" tone="brand" />
                    <KpiCard loading={first} label="Collected" value={money(k?.totalCollected || 0)} icon="trendingup" tone="success" />
                    <KpiCard loading={first} label="Pending" value={money(k?.totalPending || 0)} icon="clock" tone="error" valueTone="error" />
                    <KpiCard loading={first} label="Collection Rate" value={`${k?.collectionRate || 0}%`} icon="bar_chart" />
                    <KpiCard loading={first} label="Avg Bill Value" value={money(k?.avgBillValue || 0)} icon="currencyrupee" />
                </KpiGrid>

                <div className="row g-3 g-md-4">
                    <div className="col-12 col-xl-8">
                        <ChartCard title="Monthly Revenue" subtitle="Revenue vs collected" loading={first} isEmpty={!(billingData?.byMonth?.length)}
                            control={<SeriesLegend items={[{ label: "Revenue", color: PAIR_COLORS[0] }, { label: "Collected", color: PAIR_COLORS[1] }]} />}>
                            <PairBarChart data={billingData?.byMonth || []} keys={["revenue", "Revenue", "collected", "Collected"]} height={chartH} />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-4">
                        <ChartCard title="Payment Status" loading={first} isEmpty={!(billingData?.byStatus?.length)}>
                            <DonutWithLegend data={billingData?.byStatus || []} nameKey="status" valueKey="revenue" centerLabel="Billed"
                                colorFor={(r) => STATUS_COLORS[String(r.status)] || "var(--gray-400)"} />
                        </ChartCard>
                    </div>
                    <div className="col-12">
                        <ChartCard title={`Top ${labels.agent}s by Revenue`} loading={first} isEmpty={!(billingData?.topMechanics?.length)}>
                            <HBarChart data={billingData?.topMechanics || []} dataKey="revenue" nameKey="mechanic" name="Revenue" />
                        </ChartCard>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AutoAnalytics;
