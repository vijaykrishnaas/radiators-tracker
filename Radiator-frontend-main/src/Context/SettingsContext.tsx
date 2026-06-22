import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getData } from "../Services/ApiServices";
import { isLoggedIn, isSuperAdmin } from "../Services/Auth";

export type CatalogOption = {
    label: string;
    value: string;
    requiresComment?: boolean;
};

export type AppSettings = {
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
    };
    branding: {
        primaryColor: string;
        accentColor: string;
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
        billNoPrefix: string;
        showQr: boolean;
    };
    bonus: {
        mechanic: {
            matrix: Record<string, Record<string, number>>;
            defaultPercent: number;
            yearStartMonth: number;
        };
        labour: {
            matrix: Record<string, Record<string, number>>;
            defaultPercent: number;
        };
    };
};

// Safe fallbacks so components render before the fetch resolves.
export const FALLBACK_SETTINGS: AppSettings = {
    company: { name: "", address: "", phone1: "", phone2: "", upiId: "", upiDisplay: "", logoUrl: "" },
    branding: { primaryColor: "#12467A", accentColor: "#f47f6b" },
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
    invoice: { billTitle: "BILL", footerNote: "", billNoPrefix: "", showQr: false },
    bonus: {
        mechanic: { matrix: {}, defaultPercent: 0, yearStartMonth: 4 },
        labour: { matrix: {}, defaultPercent: 0 },
    },
};

// Pushes branding colors into the CSS custom properties the theme is built on,
// so the whole UI follows the Settings page without code changes.
const applyBranding = (settings: AppSettings) => {
    const root = document.documentElement;
    if (settings.branding.primaryColor) {
        root.style.setProperty("--primary", settings.branding.primaryColor);
    }
    if (settings.branding.accentColor) {
        root.style.setProperty("--accentColor", settings.branding.accentColor);
    }
};

type SettingsContextValue = {
    settings: AppSettings;
    loading: boolean;
    refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
    settings: FALLBACK_SETTINGS,
    loading: true,
    refreshSettings: async () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS);
    const [loading, setLoading] = useState(true);

    const refreshSettings = useCallback(async () => {
        // Super-admins have no client tenant, so /settings 403s for them.
        // The admin portal doesn't use these settings — skip the fetch.
        if (!isLoggedIn() || isSuperAdmin()) {
            setLoading(false);
            return;
        }
        try {
            const res = await getData("settings");
            if (res?.settings) {
                const merged = { ...FALLBACK_SETTINGS, ...res.settings };
                setSettings(merged);
                applyBranding(merged);
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
        <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => useContext(SettingsContext);
