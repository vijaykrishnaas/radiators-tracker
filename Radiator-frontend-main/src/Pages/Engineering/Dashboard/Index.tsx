import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import AlertComponent from "../../../Components/AlertComponent";
import { CHART_COLORS, ChartTooltip } from "../../../Components/ChartCard";
import "../engineering.css";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today } from "../../../Utils/format";

type Analytics = {
    kpis: { totalBills: number; totalBilled: number; totalReceived: number; totalOutstanding: number };
    byMonth: { month: string; billed: number; received: number; count: number }[];
    byServiceType: { type: string; label?: string; amount: number; count: number }[];
    byMechanic: { mechanic: string; billed: number; count: number }[];
};

// Start of the financial year containing today. The start month comes from Settings (default 4 = April, the Indian FY).
const fyStart = (month: number) => {
    const m = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 4;
    const now = new Date();
    const y = now.getMonth() + 1 >= m ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
};

// Compact axis numbers (Indian): 1500 -> 1.5k, 100000 -> 1L, 12000000 -> 1.2Cr.
// Rounds first, then promotes the unit, so 99999 -> 1L and 999999 -> 10L (never "100k"/"1000k").
const compact = (n: number) => {
    const unit = (v: number, suffix: string) => `${+v.toFixed(1)}${suffix}`;
    const a = Math.abs(n);
    if (a >= 1000) {
        if (a >= 10000000 || Math.abs(+(n / 100000).toFixed(1)) >= 100) return unit(n / 10000000, "Cr");
        if (a >= 100000 || Math.abs(+(n / 1000).toFixed(1)) >= 100) return unit(n / 100000, "L");
        return unit(n / 1000, "k");
    }
    return String(n);
};

// Segmented-control button. Declared at module level (not inside the page) so React keeps the
// same element between renders and keyboard focus survives a click.
const Seg = ({ active, label, onPick }: { active: boolean; label: string; onPick: () => void }) => (
    <button type="button" role="radio" aria-checked={active} className={`eng-seg-btn${active ? " is-active" : ""}`} onClick={onPick}>{label}</button>
);

const KpiCard = ({ label, value, icon, tone }: { label: string; value: string; icon: string; tone?: "danger" | "success" | "primary" }) => (
    <div className="eng-kpi">
        <span className={`eng-kpi-icon${tone ? ` is-${tone}` : ""}`}><Icons iconName={icon} className="icon-18" /></span>
        <div className="eng-kpi-text">
            <p className="eng-kpi-label">{label}</p>
            <p className={`eng-kpi-value${tone === "danger" ? " is-danger" : ""}`}>{value}</p>
        </div>
    </div>
);

// Local chart shell: title + optional caption, and a real empty state.
const Panel = ({ title, caption, isEmpty, height = 240, children }: { title: string; caption?: string; isEmpty: boolean; height?: number; children: React.ReactNode }) => (
    <section className="eng-card eng-panel">
        <header className="eng-panel-top">
            <h3 className="eng-panel-title">{title}</h3>
            {caption && <span className="eng-panel-caption">{caption}</span>}
        </header>
        {isEmpty ? (
            <div className="eng-chart-empty" style={{ height }}>
                <span>No data for this period</span>
                <small>Try a wider date range.</small>
            </div>
        ) : children}
    </section>
);

const EngDashboard = () => {
    const navigate = useNavigate();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Analytics | null>(null);
    const { settings } = useSettings();
    const fyFrom = fyStart(Number(settings.engineering?.fyStartMonth));
    // null = "use the financial-year start from Settings" (follows Settings if they finish loading after first paint).
    const [fromPick, setFromPick] = useState<string | null>(null);
    const from = fromPick ?? fyFrom;
    const setFrom = (v: string) => setFromPick(v);
    const [to, setTo] = useState(today());

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await getData("engbills/analytics", { params: { fromDate: from, toDate: to } });
                setData(res as Analytics);
            } catch {
                callAlertMsg("Failed to load dashboard", "error");
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to]);

    const k = data?.kpis;
    const byType = (data?.byServiceType || []).map((t) => ({ ...t, name: t.label || t.type }));
    const typeTotal = byType.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const todayStr = today();
    const monthStart = `${todayStr.slice(0, 7)}-01`;
    const preset = to === todayStr && from === todayStr ? "today"
        : to === todayStr && from === monthStart ? "month"
        : to === todayStr && from === fyFrom ? "fy" : "custom";
    const axis = { tick: { fontSize: 11, fill: "var(--secondary)" }, axisLine: false, tickLine: false } as const;

    return (
        <div className="row eng-theme">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold">Dashboard</h4>
                    <button type="button" className="btn btn-primary btn-sm d-flex align-items-center eng-head-btn"
                        onClick={() => navigate("/engineering/dashboard/create")}>
                        <Icons iconName="add" className="icon-12 icon-white me-2" /> New service
                    </button>
                </div>

                <section className="eng-card eng-range" aria-label="Date range">
                    <div className="eng-seg" role="radiogroup" aria-label="Quick range">
                        <Seg active={preset === "today"} label="Today" onPick={() => { setFrom(todayStr); setTo(todayStr); }} />
                        <Seg active={preset === "month"} label="This month" onPick={() => { setFrom(monthStart); setTo(todayStr); }} />
                        <Seg active={preset === "fy"} label="This FY" onPick={() => { setFrom(fyFrom); setTo(todayStr); }} />
                    </div>
                    <div className="eng-range-dates">
                        <label><span>From</span>
                            <input type="date" className="eng-date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                        </label>
                        <span className="eng-range-sep" aria-hidden="true">→</span>
                        <label><span>To</span>
                            <input type="date" className="eng-date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                        </label>
                    </div>
                </section>

                <div className="eng-kpis">
                    <KpiCard label="Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard label="Billed" value={money(k?.totalBilled || 0)} icon="currencyrupee" tone="primary" />
                    <KpiCard label="Received" value={money(k?.totalReceived || 0)} icon="trendingup" tone="success" />
                    <KpiCard label="Outstanding" value={money(k?.totalOutstanding || 0)} icon="clock" tone="danger" />
                </div>

                <div className="eng-dash-grid">
                    <div className="eng-span-8">
                        <Panel title="Revenue by month" caption="Billed vs received" isEmpty={!(data?.byMonth?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={data?.byMonth || []} barCategoryGap="28%" barGap={4}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                                    <XAxis dataKey="month" {...axis} />
                                    <YAxis {...axis} width={44} tickFormatter={compact} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-sunken)" }} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="billed" name="Billed" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    <Bar dataKey="received" name="Received" fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Panel>
                    </div>
                    <div className="eng-span-4">
                        <Panel title="By service type" caption={byType.length ? money(typeTotal) : undefined} isEmpty={!byType.length}>
                            <div className="eng-donut">
                                <ResponsiveContainer width="100%" height={168}>
                                    <PieChart>
                                        <Pie data={byType} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                                            paddingAngle={byType.length > 1 ? 3 : 0} cornerRadius={4} stroke="none">
                                            {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <ul className="eng-legend-list">
                                    {byType.map((t, i) => (
                                        <li key={t.type}>
                                            <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            <span className="eng-legend-name">{t.name}</span>
                                            <span className="eng-legend-pct">{typeTotal ? Math.round(((Number(t.amount) || 0) / typeTotal) * 100) : 0}%</span>
                                            <span className="eng-legend-amt">{money(t.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Panel>
                    </div>
                    <div className="eng-span-12">
                        <Panel title="Revenue by mechanic" caption="Billed" isEmpty={!(data?.byMechanic?.length)} height={200}>
                            <ResponsiveContainer width="100%" height={Math.max(160, (data?.byMechanic?.length || 1) * 44 + 40)}>
                                <BarChart data={data?.byMechanic || []} layout="vertical" barCategoryGap="30%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                                    <XAxis type="number" {...axis} tickFormatter={compact} />
                                    <YAxis type="category" dataKey="mechanic" width={96} {...axis} tick={{ fontSize: 12, fill: "var(--titleColor)" }} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-sunken)" }} />
                                    <Bar dataKey="billed" name="Billed" fill={CHART_COLORS[4]} radius={[0, 6, 6, 0]} maxBarSize={22} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Panel>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EngDashboard;
