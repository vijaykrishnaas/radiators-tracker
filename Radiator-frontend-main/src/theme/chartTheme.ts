// Shared Recharts styling (spec §4.14). Every colour is a CSS variable so tenant branding
// (applyTenantBrand) flows into the charts with no hard-coded hex values.

/** Paired comparison series (Revenue vs Collected, Billed vs Received). */
export const PAIR_COLORS = ["var(--brand-chart)", "var(--brand-chart-2)"] as const;

/** Categorical series, in order. Beyond 8 slices the rest are grouped as "Other". */
export const CATEGORY_COLORS = [
    "var(--brand-chart)",
    "var(--accent)",
    "var(--blue-light-500)",
    "var(--warning-500)",
    "var(--theme-purple-500)",
    "var(--success-500)",
    "var(--theme-pink-500)",
    "var(--orange-500)",
] as const;
export const OTHER_COLOR = "var(--gray-400)";

/** Payment status donut. */
export const STATUS_COLORS: Record<string, string> = {
    Received: "var(--success-500)",
    Partial: "var(--warning-500)",
    "Not Received": "var(--error-500)",
};

export const GRID_STROKE = "var(--gray-100)";

/** Axis props: no axis line, no tick lines, 12px muted ticks. */
export const axisProps = {
    tick: { fontSize: 12, fill: "var(--text-muted)" },
    axisLine: false,
    tickLine: false,
} as const;

export const categoryColor = (i: number) => CATEGORY_COLORS[i % CATEGORY_COLORS.length];

/**
 * Compact Indian axis numbers: 1500 -> 1.5k, 100000 -> 1L, 12000000 -> 1.2Cr.
 * Rounds first, then promotes the unit, so 99999 -> 1L and 999999 -> 10L (never "100k").
 */
export const compactINR = (n: number): string => {
    const unit = (v: number, suffix: string) => `${+v.toFixed(1)}${suffix}`;
    const a = Math.abs(n);
    if (a >= 1000) {
        if (a >= 10000000 || Math.abs(+(n / 100000).toFixed(1)) >= 100) return unit(n / 10000000, "Cr");
        if (a >= 100000 || Math.abs(+(n / 1000).toFixed(1)) >= 100) return unit(n / 100000, "L");
        return unit(n / 1000, "k");
    }
    return String(n);
};

/**
 * Keep at most 8 categorical slices; fold the remainder into one "Other" slice.
 * `valueKey` is summed; `nameKey` is set to "Other" on the folded slice.
 */
export function capSlices<T extends Record<string, unknown>>(rows: T[], valueKey: keyof T, nameKey: keyof T, max = 8): T[] {
    if (rows.length <= max) return rows;
    const sorted = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
    const head = sorted.slice(0, max - 1);
    const rest = sorted.slice(max - 1).reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    return [...head, { ...sorted[max - 1], [nameKey]: "Other", [valueKey]: rest, __other: true } as T];
}

export const sliceColor = (row: Record<string, unknown>, i: number) => (row.__other ? OTHER_COLOR : categoryColor(i));
