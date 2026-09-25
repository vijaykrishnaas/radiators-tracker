import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import AlertComponent from "../../../Components/AlertComponent";
import ChartCard, { CHART_COLORS, ChartTooltip } from "../../../Components/ChartCard";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { money, today } from "../../../Utils/format";

type Analytics = {
    kpis: { totalBills: number; totalBilled: number; totalReceived: number; totalOutstanding: number };
    byMonth: { month: string; billed: number; received: number; count: number }[];
    byServiceType: { type: string; label?: string; amount: number; count: number }[];
    byMechanic: { mechanic: string; billed: number; count: number }[];
};

// Indian financial year (April–March) containing today.
const fyStartApril = () => {
    const now = new Date();
    const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-04-01`;
};

const KpiCard = ({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: boolean }) => (
    <div className="col-6 col-md-3 mb-3">
        <div className="card card-shadow text-center py-3 px-2 h-100">
            <Icons iconName={icon} className="icon-24 mx-auto mb-2" />
            <p className={`h6 font-w600 mb-1${accent ? " text-danger" : ""}`}>{value}</p>
            <p className="text-muted font-s12 mb-0">{label}</p>
        </div>
    </div>
);

const EngDashboard = () => {
    const navigate = useNavigate();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Analytics | null>(null);
    const [from, setFrom] = useState(fyStartApril());
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

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold">Dashboard</h4>
                    <button type="button" className="btn btn-primary btn-sm d-flex align-items-center"
                        onClick={() => navigate("/engineering/dashboard/create")}>
                        <Icons iconName="add" className="icon-12 icon-white me-2" /> New service
                    </button>
                </div>

                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <div className="row align-items-end g-3">
                            <div className="col-6 col-md-3 col-xl-2">
                                <label className="form-label font-w500 mb-1">From</label>
                                <input type="date" className="form-control" value={from} max={to}
                                    onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="col-6 col-md-3 col-xl-2">
                                <label className="form-label font-w500 mb-1">To</label>
                                <input type="date" className="form-control" value={to} min={from}
                                    onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <div className="col-12 col-md-6 col-xl-4 d-flex gap-2">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => { setFrom(today()); setTo(today()); }}>Today</button>
                                <button type="button" className="btn btn-cancel btn-sm"
                                    onClick={() => { const t = today(); setFrom(`${t.slice(0, 7)}-01`); setTo(t); }}>This month</button>
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => { setFrom(fyStartApril()); setTo(today()); }}>This FY</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row mb-2">
                    <KpiCard label="Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard label="Billed" value={money(k?.totalBilled || 0)} icon="currencyrupee" />
                    <KpiCard label="Received" value={money(k?.totalReceived || 0)} icon="trendingup" />
                    <KpiCard label="Outstanding" value={money(k?.totalOutstanding || 0)} icon="clock" accent />
                </div>

                <div className="row g-4 mb-4">
                    <div className="col-12 col-md-8">
                        <ChartCard title="Revenue by month" isEmpty={!(data?.byMonth?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={data?.byMonth || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                    <Bar dataKey="billed" name="Billed" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="received" name="Received" fill="#36b37e" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                    <div className="col-12 col-md-4">
                        <ChartCard title="By service type" isEmpty={!byType.length}>
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={byType} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90}>
                                        {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>

                <div className="row g-4 mb-4">
                    <div className="col-12">
                        <ChartCard title="Revenue by mechanic" isEmpty={!(data?.byMechanic?.length)}>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={data?.byMechanic || []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="mechanic" width={110} tick={{ fontSize: 11 }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="billed" name="Billed" fill="#6554c0" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EngDashboard;
