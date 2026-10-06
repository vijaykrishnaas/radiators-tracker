import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import { PageHeader, KpiCard, KpiGrid, SegmentedControl, Callout, CardHead } from "../../../Components/ui/Basics";
import { ChartCard, DonutWithLegend, SeriesLegend } from "../../../Components/ui/Charts";
import { HBarChart, PairBarChart } from "../../IssueCounter/Dashboard/Index";
import { PAIR_COLORS } from "../../../theme/chartTheme";

type Analytics = {
    kpis: { totalBills: number; totalBilled: number; totalReceived: number; totalOutstanding: number };
    byMonth: { month: string; billed: number; received: number; count: number }[];
    byServiceType: { type: string; label?: string; amount: number; count: number }[];
    byMechanic: { mechanic: string; billed: number; count: number }[];
    profit?: Profit;
};

type ProfitBucket = { bills: number; sales: number; cost: number; gross: number; discount: number; afterDiscount: number; bonus: number; afterBonus: number };
type ProfitRow = { sales: number; cost: number; gross: number; margin: number };
type Profit = {
    earned: ProfitBucket;
    expected: ProfitBucket;
    byServiceType: (ProfitRow & { type: string; label: string })[];
    byItem: (ProfitRow & { type: string; typeLabel: string; item: string; label: string; qty: number })[];
    missingCostLines: number;
};

const pct = (n: number) => `${n.toFixed(1)}%`;

// One profit bucket: gross profit as the headline, then what is left after discounts and the mechanic bonus.
function ProfitCard({ title, hint, b, tone, loading }: { title: string; hint: string; b?: ProfitBucket; tone: "success" | "brand"; loading: boolean }) {
    return (
        <section className={`card profit-card is-${tone}`} aria-label={title}>
            <div className="card-body">
                <p className="profit-title">{title}</p>
                <p className="profit-hint">{hint}</p>
                {loading || !b ? <span className="skel mt-2" style={{ height: 32, width: "60%" }} aria-hidden="true" /> : (
                    <>
                        <p className="profit-value tabular">{money(b.gross)}</p>
                        <p className="profit-caption tabular">
                            Gross profit · sales {money(b.sales)} − cost {money(b.cost)} · {b.bills} bill{b.bills === 1 ? "" : "s"}
                        </p>
                        <dl className="profit-lines">
                            <div><dt>After discounts</dt><dd className="tabular">{money(b.afterDiscount)}<span> (−{money(b.discount)})</span></dd></div>
                            <div><dt>After mechanic bonus</dt><dd className="tabular">{money(b.afterBonus)}<span> (−{money(b.bonus)})</span></dd></div>
                        </dl>
                    </>
                )}
            </div>
        </section>
    );
}

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

                <div className="profit-grid">
                    <ProfitCard title="Earned profit" hint="Fully paid bills" b={data?.profit?.earned} tone="success" loading={first} />
                    <ProfitCard title="Expected profit" hint="Unpaid and part-paid bills" b={data?.profit?.expected} tone="brand" loading={first} />
                </div>
                {!!data?.profit?.missingCostLines && (
                    <Callout tone="warning">
                        {data.profit.missingCostLines} bill line{data.profit.missingCostLines === 1 ? " has" : "s have"} no cost price, so the whole amount counts as profit.
                        Set costs in Settings<Icons iconName="chevron-right" className="icon-14 mx-1" />Service Catalog (new bills pick them up), or type a cost on "Other" rows.
                    </Callout>
                )}

                <div className="row g-3 g-md-4">
                    <div className="col-12 col-xl-5">
                        <ChartCard title="Profit by service type" subtitle="Gross, before discount and bonus" loading={first} isEmpty={!(data?.profit?.byServiceType?.length)}>
                            <HBarChart data={(data?.profit?.byServiceType || []).map((t) => ({ ...t, name: t.label }))} dataKey="gross" nameKey="name" name="Gross profit" color="var(--success-500)" />
                        </ChartCard>
                    </div>
                    <div className="col-12 col-xl-7">
                        <section className="card" aria-label="Profit by item">
                            <div className="card-body pb-2">
                                <CardHead title="Profit by item" subtitle="Gross profit per item, best first" />
                            </div>
                            {first ? <div className="card-body pt-0"><span className="skel" style={{ height: 120, width: "100%" }} aria-hidden="true" /></div>
                                : !(data?.profit?.byItem?.length) ? <div className="card-body pt-0"><p className="t-sm t-muted mb-0">No bills in this range.</p></div> : (
                                <div className="table-wrap">
                                    <table className="table profit-table mb-0">
                                        <thead>
                                            <tr><th>Item</th><th className="num">Qty</th><th className="num">Sales</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Margin</th></tr>
                                        </thead>
                                        <tbody>
                                            {data.profit.byItem.map((r) => (
                                                <tr key={`${r.type}-${r.item}`}>
                                                    <td><span className="t-strong t-medium">{r.label}</span><span className="d-block t-xs t-muted">{r.typeLabel}</span></td>
                                                    <td className="num tabular">{r.qty}</td>
                                                    <td className="num tabular">{money(r.sales)}</td>
                                                    <td className="num tabular">{r.cost ? money(r.cost) : <span className="t-muted">not set</span>}</td>
                                                    <td className={`num tabular t-semibold${r.gross < 0 ? " t-error" : ""}`}>{money(r.gross)}</td>
                                                    <td className="num tabular">{pct(r.margin)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                </div>

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
