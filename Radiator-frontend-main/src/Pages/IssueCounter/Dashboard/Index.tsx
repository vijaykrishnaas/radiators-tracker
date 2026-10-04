import { useEffect, useState } from "react";
import {
    ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";

import Selector from "../../../Components/Selector";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, fyStart } from "../../../Utils/format";
import type { BillingAnalytics, ExpenseAnalytics } from "../../../Types/analytics";
import { PageHeader, KpiCard, KpiGrid, SectionDivider } from "../../../Components/ui/Basics";
import { FilterBar } from "../../../Components/ui/Filters";
import { ChartCard, ChartTooltip, DonutWithLegend, SeriesLegend } from "../../../Components/ui/Charts";
import { usePhone } from "../../../Components/ui/hooks";
import { PAIR_COLORS, STATUS_COLORS, GRID_STROKE, axisProps, compactINR } from "../../../theme/chartTheme";

// Shared exports for Billing page
export type ServiceItem = {
    type: string;
    price: number;
    comments?: string;
};

export type RadiatorRecord = {
    _id: string;
    billDate: string;
    truckNumber: string;
    transportName: string;
    mechanicName: string;
    phoneNumber?: string;
    radiatorType: string;
    labourName?: string[];
    serviceInfo: ServiceItem[];
    status: "Not Received" | "Partial" | "Received";
    totalAmount: number;
    discount?: number;
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

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Horizontal bar chart (product mix, top mechanics): height grows with the rows. */
export const HBarChart = ({ data, dataKey, nameKey, name, color = "var(--brand-500)" }: {
    data: object[]; dataKey: string; nameKey: string; name: string; color?: string;
}) => (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40 + 40)}>
        <BarChart data={data} layout="vertical" barCategoryGap="30%" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis type="number" {...axisProps} tickFormatter={compactINR} />
            <YAxis type="category" dataKey={nameKey} width={110} {...axisProps} tick={{ fontSize: 14, fill: "var(--text)" }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gray-50)" }} />
            <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
    </ResponsiveContainer>
);

/** Grouped monthly bars (Revenue vs Collected / Billed vs Received). */
export const PairBarChart = ({ data, keys, height }: { data: object[]; keys: [string, string, string, string]; height: number }) => (
    <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="30%" barGap={4}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={compactINR} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gray-50)" }} />
            <Bar dataKey={keys[0]} name={keys[1]} fill={PAIR_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey={keys[2]} name={keys[3]} fill={PAIR_COLORS[1]} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
    </ResponsiveContainer>
);

const Analytics = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();
    const chartH = phone ? 240 : 300;

    const [loading, setLoading] = useState(true);
    const [billingData, setBillingData] = useState<BillingAnalytics | null>(null);
    const [expenseData, setExpenseData] = useState<ExpenseAnalytics | null>(null);

    const defaultFrom = fyStart(settings);
    const [from, setFrom] = useState(defaultFrom);
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
        let alive = true;
        const fetchAll = async () => {
            setLoading(true);
            const [billingRes, expenseRes] = await Promise.allSettled([
                getData("radiators/analytics", {
                    params: { fromDate: from, toDate: to, mechanicName, radiatorType, status: statusFilter },
                }),
                getData("expenses/analytics", { params: { from, to } }),
            ]);
            if (!alive) return;
            if (billingRes.status === "fulfilled") setBillingData(billingRes.value as BillingAnalytics);
            else callAlertMsg("Failed to load billing analytics", "error");
            if (expenseRes.status === "fulfilled") setExpenseData(expenseRes.value as ExpenseAnalytics);
            else callAlertMsg("Failed to load expense analytics", "error");
            setLoading(false);
        };
        fetchAll();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, mechanicName, radiatorType, statusFilter]);

    const productOptions = settings.catalog.productTypes.map((p) => ({ value: p.label, label: p.label }));
    const first = loading && !billingData;

    const k = billingData?.kpis;
    const expMaterialsTotal = expenseData?.byType?.find((t) => t.type === "materials")?.amount || 0;
    const expOthersTotal = expenseData?.byType?.find((t) => t.type === "others")?.amount || 0;
    const activeCount = [mechanicName, radiatorType, statusFilter].filter(Boolean).length + (from !== defaultFrom ? 1 : 0) + (to !== today() ? 1 : 0);
    const clear = () => { setFrom(defaultFrom); setTo(today()); setMechanicName(""); setRadiatorType(""); setStatusFilter(""); };

    return (
        <>
        <PageHeader title="Dashboard" />
        <div className="dash-grid">
            <div className="card filter-standalone">
                <FilterBar
                    activeCount={activeCount}
                    onClear={clear}
                    helper="Mechanic / Product / Status filters apply to billing only. Expense stats always use the date range above."
                    filters={[
                        { id: "d-from", label: "From", primary: true, node: <input id="d-from" type="date" className="form-control" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /> },
                        { id: "d-to", label: "To", primary: true, node: <input id="d-to" type="date" className="form-control" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /> },
                        { id: "d-mech", label: "Mechanic", node: <Selector inputId="d-mech" isClearable options={mechanicOptions} placeholder="-- All Mechanics --" value={opt(mechanicOptions, mechanicName)} onChange={(o: any) => setMechanicName(o ? o.value : "")} /> },
                        { id: "d-product", label: settings.labels.product, node: <Selector inputId="d-product" isClearable options={productOptions} placeholder="-- All Products --" value={opt(productOptions, radiatorType)} onChange={(o: any) => setRadiatorType(o ? o.value : "")} /> },
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
                <div className="col-12 col-lg-6">
                    <ChartCard title="Service Type Mix" subtitle="Share of jobs, with revenue" loading={first} isEmpty={!(billingData?.byServiceType?.length)}>
                        <DonutWithLegend data={billingData?.byServiceType || []} nameKey="type" valueKey="count" amountKey="revenue" centerLabel="Revenue" />
                    </ChartCard>
                </div>
                <div className="col-12 col-lg-6">
                    <ChartCard title={`${settings.labels.product} Mix`} subtitle="Revenue" loading={first} isEmpty={!(billingData?.byProductType?.length)}>
                        <HBarChart data={billingData?.byProductType || []} dataKey="revenue" nameKey="product" name="Revenue" />
                    </ChartCard>
                </div>
                <div className="col-12">
                    <ChartCard title="Top Mechanics by Revenue" loading={first} isEmpty={!(billingData?.topMechanics?.length)}>
                        <HBarChart data={billingData?.topMechanics || []} dataKey="revenue" nameKey="mechanic" name="Revenue" />
                    </ChartCard>
                </div>
            </div>

            <SectionDivider label="Expenses" />

            <KpiGrid count={4}>
                <KpiCard loading={first} label="Total Expenses" value={money(expenseData?.totalExpenses || 0)} icon="currencyrupee" />
                <KpiCard loading={first} label="Materials" value={money(expMaterialsTotal)} icon="package" />
                <KpiCard loading={first} label="Others" value={money(expOthersTotal)} icon="tag" />
                {/* Read-only figure from Salary Management — expenses itself is untouched. */}
                <KpiCard loading={first} label="Payroll" value={money(expenseData?.payrollTotal || 0)} icon="receipt-text" caption="From Salary" />
            </KpiGrid>

            <div className="row g-3 g-md-4">
                <div className="col-12 col-xl-5">
                    <ChartCard title="Expense Type Breakdown" loading={first} isEmpty={!(expenseData?.byType?.length)}>
                        <DonutWithLegend data={(expenseData?.byType || []).map((t) => ({ ...t, type: titleCase(t.type) }))} nameKey="type" valueKey="amount" centerLabel="Spent" />
                    </ChartCard>
                </div>
                <div className="col-12 col-xl-7">
                    <ChartCard title="Monthly Expenses" loading={first} isEmpty={!(expenseData?.byMonth?.length)}>
                        <ResponsiveContainer width="100%" height={chartH}>
                            <AreaChart data={expenseData?.byMonth || []}>
                                <defs>
                                    <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                                <XAxis dataKey="month" {...axisProps} />
                                <YAxis {...axisProps} width={48} tickFormatter={compactINR} />
                                <Tooltip content={<ChartTooltip />} />
                                <Area dataKey="amount" name="Expenses" stroke="var(--brand-500)" strokeWidth={2} fill="url(#gradExpense)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            </div>
        </div>
        </>
    );
};

export default Analytics;
