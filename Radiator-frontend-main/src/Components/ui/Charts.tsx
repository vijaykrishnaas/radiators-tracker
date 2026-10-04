import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { money } from "../../Utils/format";
import { EmptyState } from "./Basics";
import { usePhone } from "./hooks";
import { capSlices, sliceColor } from "../../theme/chartTheme";

/** Chart card (§4.14): header with title / caption / control, empty state, size container. */
export function ChartCard({ title, subtitle, control, isEmpty, loading, height, children }: {
    title: string;
    subtitle?: React.ReactNode;
    control?: React.ReactNode;
    isEmpty: boolean;
    loading?: boolean;
    height?: number;
    children: React.ReactNode;
}) {
    const phone = usePhone();
    const h = height ?? (phone ? 240 : 300);
    return (
        <section className="card chart-card">
            <div className="card-body">
                <div className="card-head">
                    <div className="min-w-0">
                        <h2 className="card-title">{title}</h2>
                        {subtitle && <p className="card-subtitle">{subtitle}</p>}
                    </div>
                    {control}
                </div>
                {loading ? (
                    <span className="skel-block" style={{ height: h }} aria-hidden="true" />
                ) : isEmpty ? (
                    <div className="d-grid" style={{ minHeight: h, placeItems: "center" }}>
                        <EmptyState icon="chart" title="No data for this period" text="Try a wider date range." />
                    </div>
                ) : children}
            </div>
        </section>
    );
}

type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: { fill?: string; __money?: boolean } };

/** Recharts tooltip (§4.14). `asMoney` formats every value as ₹; otherwise counts stay plain. */
export const ChartTooltip = ({ active, payload, label, asMoney = true }: {
    active?: boolean; payload?: TooltipEntry[]; label?: string | number; asMoney?: boolean;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            {label !== undefined && label !== "" && <p className="chart-tooltip-title">{label}</p>}
            {payload.map((p, i) => (
                <p key={i} className="chart-tooltip-row">
                    <span className="legend-dot" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
                    {p.name}
                    <strong>{asMoney ? money(Number(p.value) || 0) : p.value}</strong>
                </p>
            ))}
        </div>
    );
};

export const SeriesLegend = ({ items }: { items: { label: string; color: string }[] }) => (
    <ul className="chart-legend" aria-hidden="true">
        {items.map((i) => (
            <li key={i.label}><span className="legend-dot" style={{ background: i.color }} />{i.label}</li>
        ))}
    </ul>
);

/**
 * Donut + legend list (dot · name · % · amount). `valueKey` drives slice size; `amountKey` is shown
 * in the legend (defaults to valueKey). `colorFor` overrides categorical colours (payment status).
 */
export function DonutWithLegend<T extends Record<string, unknown>>({
    data, nameKey, valueKey, amountKey, centerLabel, colorFor, asMoney = true, size = 240,
}: {
    data: T[];
    nameKey: keyof T & string;
    valueKey: keyof T & string;
    amountKey?: keyof T & string;
    centerLabel: string;
    colorFor?: (row: T, i: number) => string;
    asMoney?: boolean;
    size?: number;
}) {
    const rows = capSlices(data, valueKey, nameKey);
    const total = rows.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    const amtKey = amountKey || valueKey;
    const amountTotal = rows.reduce((s, r) => s + (Number(r[amtKey]) || 0), 0);
    const color = (r: T, i: number) => (colorFor && !r.__other ? colorFor(r, i) : sliceColor(r, i));
    const fmt = (v: number) => (asMoney ? money(v) : String(v));
    return (
        <div className="chart-donut">
            <div className="chart-donut-figure" style={{ width: size, height: size }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={rows} dataKey={valueKey} nameKey={nameKey} innerRadius="70%" outerRadius="100%"
                            paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                            {rows.map((r, i) => <Cell key={i} fill={color(r, i)} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip asMoney={asMoney && amtKey === valueKey} />} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="chart-donut-center">
                    <strong className={fmt(amountTotal).length > 11 ? "is-long" : undefined}>{fmt(amountTotal)}</strong>
                    <span>{centerLabel}</span>
                </div>
            </div>
            <ul className="legend-list">
                {rows.map((r, i) => (
                    <li key={String(r[nameKey]) + i}>
                        <span className="legend-dot" style={{ background: color(r, i) }} aria-hidden="true" />
                        <span className="legend-name">{String(r[nameKey])}</span>
                        <span className="legend-pct">{total ? Math.round(((Number(r[valueKey]) || 0) / total) * 100) : 0}%</span>
                        <span className="legend-amt">{fmt(Number(r[amtKey]) || 0)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
