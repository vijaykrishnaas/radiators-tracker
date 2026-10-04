import { useCallback, useEffect, useRef, useState } from "react";
import type { ListStatus } from "./DataList";

export type RemoteResult<T, X> = { rows: T[]; total?: number; totalPages?: number; extra?: X };

/**
 * Fetch state for a list screen (spec §4.17): first load → "loading" (skeleton); later loads keep
 * the rows visible with `refetching`; failure → "error" (Retry). Out-of-order responses are dropped.
 */
export function useRemoteList<T, X = undefined>(load: () => Promise<RemoteResult<T, X>>, deps: unknown[]) {
    const [state, setState] = useState<{
        rows: T[]; total: number; totalPages: number; extra?: X; status: ListStatus; refetching: boolean; error?: string;
    }>({ rows: [], total: 0, totalPages: 1, status: "loading", refetching: false });
    const loadRef = useRef(load);
    loadRef.current = load;
    const seq = useRef(0);

    const reload = useCallback(async () => {
        const id = ++seq.current;
        setState((s) => (s.status === "ready" ? { ...s, refetching: true } : { ...s, status: "loading", refetching: false }));
        try {
            const r = await loadRef.current();
            if (id !== seq.current) return;
            setState({
                rows: r.rows || [],
                total: r.total ?? (r.rows || []).length,
                totalPages: Math.max(1, r.totalPages ?? 1),
                extra: r.extra,
                status: "ready",
                refetching: false,
            });
        } catch (e) {
            if (id !== seq.current) return;
            const message = (e as { message?: string })?.message;
            setState((s) => ({ ...s, rows: [], status: "error", refetching: false, error: message }));
        }
    }, []);

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { ...state, reload };
}
