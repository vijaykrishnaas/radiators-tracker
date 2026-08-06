import { useEffect, useState } from "react";
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import Selector from "../../../Components/Selector";
import AlertComponent from "../../../Components/AlertComponent";
import ChartCard, { CHART_COLORS, ChartTooltip } from "../../../Components/ChartCard";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import type { AutoBillingAnalytics } from "../../../Types/analytics";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const KpiCard = ({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: boolean }) => (
    <div className="col-6 col-md-4 col-xl-2 mb-3">
        <div className="card card-shadow text-center py-3 px-2 h-100">
            <Icons iconName={icon} className="icon-24 mx-auto mb-2" />
            <p className={`h6 font-w600 mb-1${accent ? " text-danger" : ""}`}>{value}</p>
            <p className="text-muted font-s12 mb-0">{label}</p>
        </div>
    </div>
);

const AutoAnalytics = () => {
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [billingData, setBillingData] = useState<AutoBillingAnalytics | null>(null);

    const [from, setFrom] = useState(fyStart(settings));
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
        const fetchAll = async () => {
            setLoading(true);
            try {
                const res = await getData("autobills/analytics", {
                    params: { fromDate: from, toDate: to, mechanicName, status: statusFilter },
                });
                setBillingData(res as AutoBillingAnalytics);
            } catch {
                callAlertMsg("Failed to load billing analytics", "error");
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, mechanicName, statusFilter]);

    const k = billingData?.kpis;
    const labels = settings.automobile.labels;

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold">Dashboard</h4>
                </div>

                {/* Filters */}
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <div className="row table-accordion-header align-items-end g-3">
                            <div className="col-6 col-md-4 col-xl-2">
                                <label className="form-label font-w500 mb-1">From</label>
                                <input type="date" className="form-control" value={from} max={to}
                                    onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="col-6 col-md-4 col-xl-2">
                                <label className="form-label font-w500 mb-1">To</label>
                                <input type="date" className="form-control" value={to} min={from} max={today()}
                                    onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <div className="col-12 col-md-4 col-xl-3">
                                <label className="form-label font-w500 mb-1">{labels.agent}</label>
                                <Selector isClearable options={mechanicOptions} placeholder={`-- All ${labels.agent}s --`}
                                    onChange={(opt: any) => setMechanicName(opt ? opt.value : "")} />
                            </div>
                            <div className="col-12 col-md-4 col-xl-2">
                                <label className="form-label font-w500 mb-1">Status</label>
                                <Selector isClearable options={STATUS_OPTIONS} placeholder="-- All --"
                                    onChange={(opt: any) => setStatusFilter(opt ? opt.value : "")} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Billing KPI row */}
                <div className="row mb-2">
                    <KpiCard label="Total Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard label="Total Revenue" value={money(k?.totalRevenue || 0)} icon="currencyrupee" />
                    <KpiCard label="Collected" value={money(k?.totalCollected || 0)} icon="trendingup" />
                    <KpiCard label="Pending" value={money(k?.totalPending || 0)} icon="clock" accent />
                    <KpiCard label="Collection Rate" value={`${k?.collectionRate || 0}%`} icon="bar_chart" />
                    <KpiCard label="Avg Bill Value" value={money(k?.avgBillValue || 0)} icon="currencyrupee" />
                </div>

                {/* Chart row */}
                <div className="row g-4 mb-4">
                    <div className="col-12 col-md-8">
                        <ChartCard title="Monthly Revenue" isEmpty={!(billingData?.byMonth?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={billingData?.byMonth || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                    <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[6, 6, 0, 0]}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                    <Bar dataKey="collected" name="Collected" fill="#36b37e" radius={[6, 6, 0, 0]}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                    <div className="col-12 col-md-4">
                        <ChartCard title="Payment Status" isEmpty={!(billingData?.byStatus?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={billingData?.byStatus || []} dataKey="revenue" nameKey="status"
                                        cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out">
                                        {(billingData?.byStatus || []).map((_, i) => (
                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>

                {/* Top Mechanics */}
                <div className="row g-4 mb-4">
                    <div className="col-12">
                        <ChartCard title={`Top ${labels.agent}s by Revenue`} isEmpty={!(billingData?.topMechanics?.length)}>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={billingData?.topMechanics || []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="mechanic" width={110} tick={{ fontSize: 11 }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="revenue" name="Revenue" fill="#6554c0"
                                        radius={[0, 6, 6, 0]}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutoAnalytics;
