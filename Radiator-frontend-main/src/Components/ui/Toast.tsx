import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Icons from "../../Components/Icons";

export type ToastTone = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; message: string };

const TITLES: Record<ToastTone, string> = { success: "Success", error: "Error", warning: "Warning", info: "Info" };
const ICONS: Record<ToastTone, string> = { success: "check-circle", error: "alert-circle", warning: "alert-triangle", info: "info" };

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
    show(tone: ToastTone, message: string, title = TITLES[tone]) {
        if (!message) return;
        // Same message already showing: replace it (re-arms its timer) instead of stacking duplicates.
        let next = items.filter((t) => !(t.tone === tone && t.message === message));
        next = [...next, { id: ++seq, tone, title, message }];
        // Cap at 4: evict the oldest auto-dismissing toast first; errors/warnings stay until closed.
        while (next.length > 4) {
            const i = next.findIndex((t) => t.tone === "success" || t.tone === "info");
            next.splice(i >= 0 ? i : 0, 1);
        }
        items = next;
        emit();
    },
    dismiss(id: number) {
        items = items.filter((t) => t.id !== id);
        emit();
    },
    clear() { items = []; emit(); },
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => items;

/** Normalises the legacy `callAlertMsg(msg, "success" | "error" | "warning" | "info")` categories. */
export const toneFrom = (category: string): ToastTone =>
    category === "success" || category === "warning" || category === "info" ? category : "error";

function ToastView({ t }: { t: ToastItem }) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const paused = hovered || focused;
    const remaining = useRef(5000);
    const started = useRef(Date.now());
    const autoDismiss = t.tone === "success" || t.tone === "info";

    useEffect(() => {
        if (!autoDismiss || paused) return;
        started.current = Date.now();
        const id = setTimeout(() => toast.dismiss(t.id), remaining.current);
        return () => {
            clearTimeout(id);
            remaining.current -= Date.now() - started.current;
        };
    }, [autoDismiss, paused, t.id]);

    return (
        <div
            className={`ui-toast tone-${t.tone}`}
            role={t.tone === "error" ? "alert" : "status"}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            <Icons iconName={ICONS[t.tone]} />
            <div className="callout-body">
                <span className="callout-title">{t.title}</span>
                <p>{t.message}</p>
            </div>
            <button type="button" className="btn btn-icon is-round" aria-label="Dismiss notification" onClick={() => toast.dismiss(t.id)}>
                <Icons iconName="x" />
            </button>
        </div>
    );
}

/** Mount once at the app root. */
export function ToastRegion() {
    const list = useSyncExternalStore(subscribe, snapshot, snapshot);
    return (
        <div className="toast-region" aria-live="polite">
            {list.map((t) => <ToastView key={t.id} t={t} />)}
        </div>
    );
}
