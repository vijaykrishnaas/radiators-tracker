import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import { PageHeader, KpiCard, KpiGrid, SegmentedControl } from "../../../Components/ui/Basics";
import { ChartCard, DonutWithLegend, SeriesLegend } from "../../../Components/ui/Charts";
import { HBarChart, PairBarChart } from "../../IssueCounter/Dashboard/Index";
import { PAIR_COLORS } from "../../../theme/chartTheme";

type Analytics = {
    kpis: { totalBills: number; totalBilled: number; totalReceived: number; totalOutstanding: number };
    byMonth: { month: string; billed: number; received: number; count: number }[];
    byServiceType: { type: string; label?: string; amount: number; count: number }[];
    byMechanic: { mechanic: string; billed: number; count: number }[];
};

type Preset = "today" | "month" | "fy";
const PRESETS: { value: Preset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "month", label: "This month" },
    { value: "fy", label: "This FY" },
];

const EngDashboard = () => {
    const navigate = useNavigate();
    const { callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Analytics | null>(null);
    const { settings } = useSettings();
    const fyFrom = fyStart(settings);
    // null = "use the financial-year start from Settings" (follows Settings if they finish loading after first paint).
    const [fromPick, setFromPick] = useState<string | null>(null);
    const from = fromPick ?? fyFrom;
    const [to, setTo] = useState(today());

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                const res = await getData("engbills/analytics", { params: { fromDate: from, toDate: to } });
                if (alive) setData(res as Analytics);
            } catch {
                if (alive) callAlertMsg("Failed to load dashboard", "error");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to]);

    const first = loading && !data;
    const k = data?.kpis;
    const byType = (data?.byServiceType || []).map((t) => ({ ...t, name: t.label || t.type }));
    const typeTotal = byType.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const todayStr = today();
    const monthStart = `${todayStr.slice(0, 7)}-01`;
    const preset: Preset | null = to === todayStr && from === todayStr ? "today"
        : to === todayStr && from === monthStart ? "month"
        : to === todayStr && from === fyFrom ? "fy" : null;
    const pick = (p: Preset) => {
        setFromPick(p === "today" ? todayStr : p === "month" ? monthStart : fyFrom);
        setTo(todayStr);
    };

    return (
        <>
            <PageHeader
                title="Dashboard"
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/engineering/dashboard/create")}>
                        <Icons iconName="add" />New service
                    </button>
                }
            />
            <div className="dash-grid">
                <section className="card eng-range" aria-label="Date range">
                    <SegmentedControl label="Quick range" options={PRESETS} value={preset} onChange={pick} />
                    <div className="eng-range-dates">
                        <div className="field">
                            <label className="form-label" htmlFor="eng-from">From</label>
                            <input id="eng-from" type="date" className="form-control" value={from} max={to} onChange={(e) => setFromPick(e.target.value || null)} />
                        </div>
                        <Icons iconName="arrow-right" className="eng-range-sep" />
                        <div className="field">
                            <label className="form-label" htmlFor="eng-to">To</label>
                            <input id="eng-to" type="date" className="form-control" value={to} min={from} onChange={(e) => setTo(e.target.value || today())} />
                        </div>
                    </div>
                </section>

                <KpiGrid count={4}>
                    <KpiCard loading={first} label="Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard loading={first} label="Billed" value={money(k?.totalBilled || 0)} icon="currencyrupee" tone="brand" />
                    <KpiCard loading={first} label="Received" value={money(k?.totalReceived || 0)} icon="trendingup" tone="success" />
                    <KpiCard loading={first} label="Outstanding" value={money(k?.totalOutstanding || 0)} icon="clock" tone="error" valueTone="error" />
                </KpiGrid>

                <div className="row g-3 g-md-4">
                    <div className="col-12 col-xl-8">
                        <ChartCard title="Revenue by month" subtitle="Billed vs received" loading={first} isEmpty={!(data?.byMonth?.length)}
                            control={<SeriesLegend items={[{ label: "Billed", color: PAIR_COLORS[0] }, { label: "Received", color: PAIR_COLORS[1] }]} />}>
                            <PairBarChart data={data?.byMonth || []} keys={["billed", "Billed", "received", "Received"]} height={280} />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-4">
                        <ChartCard title="By service type" subtitle={byType.length ? money(typeTotal) : undefined} loading={first} isEmpty={!byType.length}>
                            <DonutWithLegend data={byType} nameKey="name" valueKey="amount" centerLabel="Billed" />
                        </ChartCard>
                    </div>
                    <div className="col-12">
                        <ChartCard title="Revenue by mechanic" subtitle="Billed" loading={first} isEmpty={!(data?.byMechanic?.length)}>
                            <HBarChart data={data?.byMechanic || []} dataKey="billed" nameKey="mechanic" name="Billed" />
                        </ChartCard>
                    </div>
                </div>
            </div>
        </>
    );
};

export default EngDashboard;
