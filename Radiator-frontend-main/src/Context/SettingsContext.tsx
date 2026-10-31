import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getData } from "../Services/ApiServices";
import { getUser, isLoggedIn, isSuperAdmin } from "../Services/Auth";
import { applyTenantBrand, DEFAULT_ACCENT, DEFAULT_PRIMARY } from "../theme/applyTenantBrand";

// Generic, white-label default for the browser tab title.
const APP_TITLE = "Radiator Management";

export type CatalogOption = {
    label: string;
    value: string;
    requiresComment?: boolean;
};

export type BusinessType = "radiator" | "automobile" | "engineering" | "tyre";

// Tyre vertical: brand → model/size, each model with a default rate for the challan form.
export type TyreModel = { label: string; value: string; rate: number };
export type TyreBrand = { label: string; value: string; models: TyreModel[] };

export type TyreSettings = {
    brands: TyreBrand[];
    defaultTubeType: "tube" | "tubeless";
    billStartNumber: number;
    bonus: {
        mechanicMode: "percent" | "amount";
        mechanicPercent: number;
        mechanicAmount: number;
        labourMode: "percent" | "amount";
        labourPercent: number;
        labourAmount: number;
        yearStartMonth: number;
    };
    labels: { vehicleNo: string; customer: string; agent: string; worker: string };
    invoice: { billTitle: string; subtitle: string; footerNote: string; showQr: boolean; showSignature: boolean };
};

// Engineering vertical: a null/undefined price means the item is not offered
// for that BS model; 0 is offered.
export type EngItem = {
    label: string;
    value: string;
    prices: Record<string, number | null>;
    /** What one unit costs you to buy, per BS model (for profit). Missing = no cost set. */
    costs?: Record<string, number | null>;
    requiresComment?: boolean;
};

export type EngServiceType = {
    label: string;
    value: string;
    items: EngItem[];
};

export type AutoPart = {
    label: string;
    value: string;
    /** No longer shown or edited; older settings may still carry one. */
    unit?: string;
    rate: number;
};

export type AppSettings = {
    businessType: BusinessType;
    automobile: {
        units: string[];
        parts: AutoPart[];
        /** Rupees only: a fixed ₹ per bill for each role. */
        bonus: {
            mechanicAmount: number;
            labourAmount: number;
            yearStartMonth: number;
        };
        labels: {
            vehicleNo: string;
            customer: string;
            agent: string;
            worker: string;
        };
        invoice: {
            billTitle: string;
            footerNote: string;
            showQr: boolean;
            showSignature: boolean;
        };
    };
    company: {
        name: string;
        address: string;
        phone1: string;
        phone2: string;
        upiId: string;
        upiDisplay: string;
        logoUrl: string;
        qrUrl?: string;
        loginBgUrl?: string;
        signatureUrl?: string;
    };
    branding: {
        primaryColor: string;
        accentColor: string;
        loginTextColor: string;
    };
    catalog: {
        productTypes: CatalogOption[];
        serviceTypes: CatalogOption[];
        priceMatrix: Record<string, Record<string, number>>;
    };
    labour: string[];
    mechanics: string[];
    loginHighlights: string[];
    labels: {
        vehicleNo: string;
        party: string;
        agent: string;
        product: string;
        worker: string;
    };
    invoice: {
        billTitle: string;
        footerNote: string;
        showQr: boolean;
        showSignature: boolean;
    };
    bonus: {
        mechanic: {
            /** Rupees only. "line" (default): a fixed ₹ per service line from amountMatrix. "amount": a fixed ₹ per bill. */
            mode?: "line" | "amount" | "percent";
            amount?: number;
            amountMatrix?: Record<string, Record<string, number>>;
            defaultAmount?: number;
            yearStartMonth: number;
        };
        labour: {
            /** "amount": a fixed ₹ per bill, split equally among the bill's workers. Otherwise ₹ per service line. */
            mode?: "line" | "amount" | "percent";
            amount?: number;
            amountMatrix?: Record<string, Record<string, number>>;
            defaultAmount?: number;
        };
    };
    engineering: {
        bsModels: { label: string; value: string }[];
        serviceTypes: EngServiceType[];
        quickAdd: { type: string; item: string }[];
        billStartNumber: number;
        fyStartMonth?: number;
        /** Rupees only: a fixed ₹ per bill. */
        bonus?: { mechanicAmount?: number };
        invoice: {
            billTitle: string;
            footerNote: string;
            showQr: boolean;
            showSignature: boolean;
        };
    };
    tyre: TyreSettings;
    // Salary Management — applies to every tenant regardless of businessType.
    salary: {
        payCycle: string;
        workingDayRule: "allDays" | "excludeWeeklyOff";
        weeklyOffDay: number;
        payslip: {
            title: string;
            footerNote: string;
        };
    };
};

// Safe fallbacks so components render before the fetch resolves.
export const FALLBACK_SETTINGS: AppSettings = {
    businessType: "radiator",
    automobile: {
        units: ["pcs", "set", "L", "kg", "hrs"],
        parts: [],
        bonus: { mechanicAmount: 0, labourAmount: 0, yearStartMonth: 4 },
        labels: {
            vehicleNo: "Vehicle Number",
            customer: "Customer Name",
            agent: "Mechanic",
            worker: "Labour",
        },
        invoice: { billTitle: "CASH / CREDIT BILL", footerNote: "Thank you for your business", showQr: false, showSignature: false },
    },
    company: { name: "", address: "", phone1: "", phone2: "", upiId: "", upiDisplay: "", logoUrl: "" },
    branding: { primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT, loginTextColor: "#FFFFFF" },
    catalog: { productTypes: [], serviceTypes: [], priceMatrix: {} },
    labour: [],
    mechanics: [],
    loginHighlights: [],
    labels: {
        vehicleNo: "Vehicle Number",
        party: "Party Name",
        agent: "Agent Name",
        product: "Product Model",
        worker: "Worker Name",
    },
    invoice: { billTitle: "BILL", footerNote: "", showQr: false, showSignature: false },
    bonus: {
        mechanic: { mode: "line", amount: 0, amountMatrix: {}, defaultAmount: 0, yearStartMonth: 4 },
        labour: { mode: "line", amount: 0, amountMatrix: {}, defaultAmount: 0 },
    },
    engineering: {
        bsModels: [],
        serviceTypes: [],
        quickAdd: [],
        billStartNumber: 1,
        fyStartMonth: 4,
        bonus: { mechanicAmount: 0 },
        invoice: { billTitle: "CASH / CREDIT BILL", footerNote: "Thank you for your business", showQr: false, showSignature: false },
    },
    tyre: {
        brands: [],
        defaultTubeType: "tube",
        billStartNumber: 1,
        bonus: { mechanicMode: "percent", mechanicPercent: 0, mechanicAmount: 0, labourMode: "percent", labourPercent: 0, labourAmount: 0, yearStartMonth: 4 },
        labels: { vehicleNo: "Vehicle Number", customer: "Customer Name", agent: "Mechanic", worker: "Labour" },
        invoice: { billTitle: "DELIVERY CHALLAN", subtitle: "Goods delivered. Not a tax invoice (no GST).", footerNote: "Goods received in good condition", showQr: false, showSignature: false },
    },
    salary: {
        payCycle: "monthly",
        workingDayRule: "allDays",
        weeklyOffDay: 0,
        payslip: { title: "SALARY SLIP", footerNote: "" },
    },
};

// Derives the full brand scale + contrast-safe companions from the tenant colours (spec D3) and
// writes them as CSS custom properties, so the whole UI follows the Settings page.
const applyBranding = (settings: AppSettings) => {
    applyTenantBrand(settings.branding?.primaryColor, settings.branding?.accentColor);
};

type SettingsContextValue = {
    settings: AppSettings;
    loading: boolean;
    /** True once the tenant's settings have actually been fetched. Until then `settings` is the built-in fallback,
     *  which must never be saved over the real ones (e.g. after a failed load). */
    loaded: boolean;
    refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
    settings: FALLBACK_SETTINGS,
    loading: true,
    loaded: false,
    refreshSettings: async () => {},
});

// A label cleared in Settings falls back to its default: a blank one left fields unnamed and errors reading " is required".
const labelsOr = <T extends Record<string, string>>(fallback: T, saved: Partial<T> | undefined): T => {
    const out: T = { ...fallback, ...(saved || {}) };
    (Object.keys(fallback) as (keyof T)[]).forEach((k) => {
        const v = saved?.[k];
        if (typeof v !== "string" || !v.trim()) out[k] = fallback[k];
    });
    return out;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);

    // Whose settings are in memory. When a different account signs in (logout → login without a page reload), the
    // previous company's settings are dropped first, so a failed load can never show or save them for the new one.
    const loadedFor = useRef<string | null>(null);

    const refreshSettings = useCallback(async () => {
        const who = isLoggedIn() ? `${getUser()?.clientId || ""}:${getUser()?.userId || ""}` : null;
        if (loadedFor.current !== who) {
            loadedFor.current = who;
            setSettings(FALLBACK_SETTINGS);
            setLoaded(false);
        }
        // Super-admins have no client tenant, so /settings 403s for them.
        // The admin portal doesn't use these settings — skip the fetch.
        if (!isLoggedIn() || isSuperAdmin()) {
            // Keep the browser tab title sensible without a client context.
            document.title = isSuperAdmin() ? "Super Admin Console" : APP_TITLE;
            applyTenantBrand(DEFAULT_PRIMARY, DEFAULT_ACCENT);
            setLoading(false);
            return;
        }
        try {
            const res = await getData("settings");
            if (res?.settings) {
                const merged = { ...FALLBACK_SETTINGS, ...res.settings };
                // Nested tyre blocks fall back key by key, so a partly-saved tyre block never leaves labels undefined.
                const t = res.settings.tyre || {};
                const ft = FALLBACK_SETTINGS.tyre;
                merged.tyre = {
                    ...ft, ...t,
                    bonus: { ...ft.bonus, ...(t.bonus || {}) },
                    labels: labelsOr(ft.labels, t.labels),
                    invoice: { ...ft.invoice, ...(t.invoice || {}) },
                    brands: Array.isArray(t.brands) ? t.brands : [],
                };
                merged.labels = labelsOr(FALLBACK_SETTINGS.labels, res.settings.labels);
                const fa = FALLBACK_SETTINGS.automobile;
                merged.automobile = { ...fa, ...(res.settings.automobile || {}), labels: labelsOr(fa.labels, res.settings.automobile?.labels) };
                setSettings(merged);
                setLoaded(true);
                applyBranding(merged);
                // Browser tab title follows the client's company name (white-label).
                document.title = merged.company?.name?.trim() || APP_TITLE;
            }
        } catch (err) {
            console.error("Failed to load settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    return (
        <SettingsContext.Provider value={{ settings, loading, loaded, refreshSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => useContext(SettingsContext);
