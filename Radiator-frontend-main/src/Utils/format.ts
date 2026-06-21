import type { AppSettings } from "../Context/SettingsContext";

export const money = (val: number): string =>
    `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pad = (n: number): string => String(n).padStart(2, "0");

// Use LOCAL date parts (not toISOString, which is UTC). For an IST user the UTC
// version returns "yesterday" between local midnight and 05:30, breaking date
// defaults/maxes and the Expenses month-start range on the 1st of the month.
export const today = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const monthStart = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

export const fyStart = (settings: AppSettings): string => {
    const m = settings.bonus?.mechanic?.yearStartMonth || 4;
    const now = new Date();
    const y = (now.getMonth() + 1) >= m ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
};

export const fyYear = (settings: AppSettings): string => {
    const m = settings.bonus?.mechanic?.yearStartMonth || 4;
    const now = new Date();
    return String((now.getMonth() + 1) >= m ? now.getFullYear() : now.getFullYear() - 1);
};
