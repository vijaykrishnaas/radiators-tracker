import React from "react";
import { money } from "../Utils/format";

type Props = {
    title: string;
    subtitle?: string;
    isEmpty: boolean;
    height?: number;
    children: React.ReactNode;
};

const ChartCard: React.FC<Props> = ({ title, subtitle, isEmpty, height = 260, children }) => (
    <div className="card card-shadow h-100">
        <div className="card-body">
            <p className="font-w500 font-s14 mb-0">{title}</p>
            {subtitle && <p className="text-muted font-s12 mb-3">{subtitle}</p>}
            {!subtitle && <div className="mb-3" />}
            {isEmpty ? (
                <div className="d-flex align-items-center justify-content-center" style={{ height }}>
                    <span className="text-muted font-s14">No data for this period</span>
                </div>
            ) : children}
        </div>
    </div>
);

export default ChartCard;

// Brand-anchored chart palette: client primary + accent first (white-label),
// then a restrained, harmonious set of muted tones (Batch 7).
export const CHART_COLORS = [
    "var(--primary)", "var(--accentColor)", "#3EA77B", "#E2A53C", "#6E63C4", "#3CA9C2",
];

export const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="card card-shadow p-2 font-s14" style={{ minWidth: 140 }}>
            <p className="font-w600 mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} className="mb-0" style={{ color: p.color }}>
                    {p.name}: {p.value > 100 ? money(p.value) : p.value}
                </p>
            ))}
        </div>
    );
};
