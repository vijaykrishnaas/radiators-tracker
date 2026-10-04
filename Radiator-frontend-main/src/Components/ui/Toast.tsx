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
        // Same message already showing: don't stack duplicates.
        if (items.some((t) => t.tone === tone && t.message === message)) return;
        items = [...items, { id: ++seq, tone, title, message }].slice(-4);
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
    const [paused, setPaused] = useState(false);
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
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
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
