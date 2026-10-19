// Light / Dark / System theme. The choice is per device (localStorage), applied as <html data-theme> (our tokens)
// and data-bs-theme (Bootstrap's own variables). index.html sets data-theme before first paint so dark users don't
// see a white flash; this module keeps it in sync and re-derives the tenant brand palette for the active theme.
import { useEffect, useState } from "react";
import { reapplyTenantBrand } from "./applyTenantBrand";

export type ThemePref = "light" | "dark" | "system";
const KEY = "svr_theme";
const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

export function readThemePref(): ThemePref {
    try {
        const v = localStorage.getItem(KEY);
        return v === "light" || v === "dark" ? v : "system";
    } catch {
        return "system";
    }
}

export const resolveTheme = (pref: ThemePref): "light" | "dark" => (pref === "system" ? (media()?.matches ? "dark" : "light") : pref);

export function applyTheme(pref: ThemePref = readThemePref()) {
    const mode = resolveTheme(pref);
    const root = document.documentElement;
    if (root.dataset.theme !== mode) {
        root.dataset.theme = mode;
        root.dataset.bsTheme = mode;
    }
    reapplyTenantBrand();
}

const listeners = new Set<(p: ThemePref) => void>();

export function setThemePref(pref: ThemePref) {
    try {
        if (pref === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
    } catch { /* private mode: still switch for this visit */ }
    applyTheme(pref);
    listeners.forEach((l) => l(pref));
}

/** Follows the device setting while the preference is "system". Call once at startup. */
export function watchSystemTheme() {
    media()?.addEventListener?.("change", () => { if (readThemePref() === "system") applyTheme("system"); });
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
    const [pref, setPref] = useState<ThemePref>(readThemePref);
    useEffect(() => {
        listeners.add(setPref);
        return () => { listeners.delete(setPref); };
    }, []);
    return [pref, setThemePref];
}
