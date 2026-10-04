import { useEffect, useRef, useState } from "react";

/** Live `matchMedia` result. SSR-safe default false. */
export function useMediaQuery(query: string): boolean {
    const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
    const [matches, setMatches] = useState(get);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const on = () => setMatches(mql.matches);
        on();
        mql.addEventListener("change", on);
        return () => mql.removeEventListener("change", on);
    }, [query]);
    return matches;
}

export const usePhone = () => useMediaQuery("(max-width: 767.98px)");
export const useDesktopShell = () => useMediaQuery("(min-width: 1280px)");

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusables = (root: HTMLElement | null): HTMLElement[] =>
    root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [];

/** Keeps Tab / Shift+Tab inside `root` while `active`. */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, root: HTMLElement | null) {
    if (e.key !== "Tab" || !root) return;
    const els = focusables(root);
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0];
    const last = els[els.length - 1];
    const activeEl = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (activeEl === first || !root.contains(activeEl))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (activeEl === last || !root.contains(activeEl))) { e.preventDefault(); first.focus(); }
}

let lockCount = 0;
/** Locks body scroll while mounted/active (ref-counted so stacked dialogs work). */
export function useScrollLock(active: boolean) {
    useEffect(() => {
        if (!active) return;
        lockCount += 1;
        document.body.classList.add("is-scroll-locked");
        return () => {
            lockCount -= 1;
            if (lockCount <= 0) { lockCount = 0; document.body.classList.remove("is-scroll-locked"); }
        };
    }, [active]);
}

/** Remembers the element focused when `active` turns true and restores focus to it afterwards. */
export function useReturnFocus(active: boolean) {
    const prev = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!active) return;
        prev.current = document.activeElement as HTMLElement | null;
        return () => {
            const el = prev.current;
            if (el && document.contains(el)) setTimeout(() => el.focus(), 0);
        };
    }, [active]);
}

/** Safe localStorage access (private windows, blocked storage). */
export const storage = {
    get(key: string): string | null {
        try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key: string, value: string) {
        try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
    },
};
