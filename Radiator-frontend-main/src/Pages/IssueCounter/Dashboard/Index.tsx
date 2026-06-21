import { useEffect, useState } from "react";
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area,
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
import type { BillingAnalytics, ExpenseAnalytics } from "../../../Types/analytics";

// Shared exports for Billing page
export type ServiceItem = {
    type: string;
    price: number;
    comments?: string;
};

export type RadiatorRecord = {
    _id: string;
    billNo?: number;
    billDate: string;
    truckNumber: string;
    transportName: string;
    mechanicName: string;
    phoneNumber: string;
    radiatorType: string;
    labourName?: string[];
    serviceInfo: ServiceItem[];
    status: "Not Received" | "Partial" | "Received";
    totalAmount: number;
    receivedAmount: number;
    pendingAmount: number;
};

export const serviceDisplay = (s: ServiceItem) =>
    s.type?.toLowerCase() === "other" ? (s.comments || "Comment") : s.type;

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

const Analytics = () => {
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [billingData, setBillingData] = useState<BillingAnalytics | null>(null);
    const [expenseData, setExpenseData] = useState<ExpenseAnalytics | null>(null);

    const [from, setFrom] = useState(fyStart(settings));
    const [to, setTo] = useState(today());
    const [mechanicName, setMechanicName] = useState("");
    const [radiatorType, setRadiatorType] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [mechanicOptions, setMechanicOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        getData("mechanic").then((res) => {
            setMechanicOptions((res.mechdata || []).map((m: string) => ({ value: m, label: m })));
        }).catch(() => {});
    }, []);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            const [billingRes, expenseRes] = await Promise.allSettled([
                getData("radiators/analytics", {
                    params: { fromDate: from, toDate: to, mechanicName, radiatorType, status: statusFilter },
                }),
                getData("expenses/analytics", { params: { from, to } }),
            ]);
            if (billingRes.status === "fulfilled") {
                setBillingData(billingRes.value as BillingAnalytics);
            } else {
                callAlertMsg("Failed to load billing analytics", "error");
            }
            if (expenseRes.status === "fulfilled") {
                setExpenseData(expenseRes.value as ExpenseAnalytics);
            } else {
                callAlertMsg("Failed to load expense analytics", "error");
            }
            setLoading(false);
        };
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, mechanicName, radiatorType, statusFilter]);

    const productOptions = settings.catalog.productTypes.map((p) => ({ value: p.label, label: p.label }));

    const k = billingData?.kpis;
    const expMaterialsTotal = expenseData?.byType?.find((t) => t.type === "materials")?.amount || 0;
    const expOthersTotal = expenseData?.byType?.find((t) => t.type === "others")?.amount || 0;

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
                                <label className="form-label font-w500 mb-1">Mechanic</label>
                                <Selector isClearable options={mechanicOptions} placeholder="-- All Mechanics --"
                                    onChange={(opt: any) => setMechanicName(opt ? opt.value : "")} />
                            </div>
                            <div className="col-12 col-md-4 col-xl-3">
                                <label className="form-label font-w500 mb-1">{settings.labels.product}</label>
                                <Selector isClearable options={productOptions} placeholder="-- All Products --"
                                    onChange={(opt: any) => setRadiatorType(opt ? opt.value : "")} />
                            </div>
                            <div className="col-12 col-md-4 col-xl-2">
                                <label className="form-label font-w500 mb-1">Status</label>
                                <Selector isClearable options={STATUS_OPTIONS} placeholder="-- All --"
                                    onChange={(opt: any) => setStatusFilter(opt ? opt.value : "")} />
                            </div>
                        </div>
                        <p className="text-muted font-s12 mb-0 mt-2">
                            Mechanic / Product / Status filters apply to billing only. Expense stats always use the date range above.
                        </p>
                    </div>
                </div>

                {/* Billing KPI row */}
                <div className="row mb-2">
                    <KpiCard label="Total Bills" value={String(k?.totalBills || 0)} icon="receipt-text" />
                    <KpiCard label="Total Revenue" value={money(k?.totalRevenue || 0)} icon="currencyrupee" />
                    <KpiCard label="Collected" value={money(k?.totalCollected || 0)} icon="trendingup" />
                    <KpiCard label="Pending" value={money(k?.totalPending || 0)} icon="currencyrupee" accent />
                    <KpiCard label="Collection Rate" value={`${k?.collectionRate || 0}%`} icon="bar_chart" />
                    <KpiCard label="Avg Bill Value" value={money(k?.avgBillValue || 0)} icon="currencyrupee" />
                </div>

                {/* Chart row 1 */}
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

                {/* Chart row 2 */}
                <div className="row g-4 mb-4">
                    <div className="col-12 col-md-6">
                        <ChartCard title="Service Type Mix" isEmpty={!(billingData?.byServiceType?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={billingData?.byServiceType || []} dataKey="count" nameKey="type"
                                        cx="50%" cy="50%" outerRadius={90}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out">
                                        {(billingData?.byServiceType || []).map((_, i) => (
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
                        <ChartCard title={`${settings.labels.product} Mix`} isEmpty={!(billingData?.byProductType?.length)}>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={billingData?.byProductType || []} layout="vertical">
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
                </div>

                {/* Top Mechanics */}
                <div className="row g-4 mb-4">
                    <div className="col-12">
                        <ChartCard title="Top Mechanics by Revenue" isEmpty={!(billingData?.topMechanics?.length)}>
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

                {/* Expense section divider */}
                <div className="d-flex align-items-center my-4 gap-3">
                    <label className="font-s16 font-w500 mb-0">Expenses</label>
                    <div className="session-custom-border flex-grow-1" />
                </div>

                {/* Expense KPI row */}
                <div className="row mb-2">
                    {[
                        { label: "Total Expenses", value: money(expenseData?.totalExpenses || 0), icon: "currencyrupee" },
                        { label: "Materials", value: money(expMaterialsTotal), icon: "currencyrupee" },
                        { label: "Others", value: money(expOthersTotal), icon: "currencyrupee" },
                    ].map((kpi) => (
                        <div key={kpi.label} className="col-12 col-md-4 mb-3">
                            <div className="card card-shadow text-center py-3 px-2 h-100">
                                <Icons iconName={kpi.icon} className="icon-24 mx-auto mb-2" />
                                <p className="h6 font-w600 mb-1">{kpi.value}</p>
                                <p className="text-muted font-s12 mb-0">{kpi.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Expense charts */}
                <div className="row g-4 mb-4">
                    <div className="col-12 col-md-5">
                        <ChartCard title="Expense Type Breakdown" isEmpty={!(expenseData?.byType?.length)}>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={expenseData?.byType || []} dataKey="amount" nameKey="type"
                                        cx="50%" cy="50%" outerRadius={80}
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out">
                                        {(expenseData?.byType || []).map((_, i) => (
                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                    <div className="col-12 col-md-7">
                        <ChartCard title="Monthly Expenses" isEmpty={!(expenseData?.byMonth?.length)}>
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={expenseData?.byMonth || []}>
                                    <defs>
                                        <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f47f6b" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f47f6b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area dataKey="amount" name="Expenses" stroke="#f47f6b" strokeWidth={2}
                                        fill="url(#gradExpense)"
                                        animationBegin={200} animationDuration={1200} animationEasing="ease-out" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
