// Settings › Fix names: correct a name that was typed wrongly (a part, unit, mechanic or service item) on every past
// bill at once. The server also renames it in Settings, so new bills use the corrected name.
import { useEffect, useState } from "react";
import InputText from "../../Components/InputText";
import { getData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { CardHead, Field } from "../../Components/ui/Basics";
import { ConfirmDialog } from "../../Components/ui/Modal";

type Kind = { kind: string; label: string };
type NameRow = { name: string; bills: number };

const FixNamesTab = ({ blocked, onRenamed }: { blocked: boolean; onRenamed: () => Promise<void> | void }) => {
    const { callAlertMsg } = useAlertMsg();
    const [kinds, setKinds] = useState<Kind[] | null>(null);
    const [kind, setKind] = useState("");
    const [names, setNames] = useState<NameRow[] | null>(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [error, setError] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getData("settings/names")
            .then((r) => { setKinds(r.kinds || []); if (r.kinds?.[0]) setKind(r.kinds[0].kind); })
            .catch((e) => { setKinds([]); callAlertMsg(e?.message || "Could not load the names", "error"); });
    }, [callAlertMsg]);

    const loadNames = async (k: string) => {
        setNames(null);
        try { setNames((await getData(`settings/names/${k}`)).names || []); }
        catch (e: any) { setNames([]); callAlertMsg(e?.message || "Could not load the names", "error"); }
    };
    useEffect(() => { if (kind) { setFrom(""); setTo(""); setError(""); void loadNames(kind); } }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

    const picked = names?.find((n) => n.name === from);
    const label = kinds?.find((k) => k.kind === kind)?.label.toLowerCase() || "name";

    const review = () => {
        const t = to.trim();
        if (!from) { setError(`Choose the ${label} to fix`); return; }
        if (!t) { setError("Enter the correct name"); return; }
        if (t === from) { setError("The correct name is the same as the current one"); return; }
        setError("");
        setConfirmOpen(true);
    };

    const apply = async () => {
        setBusy(true);
        try {
            const r = await postData("settings/names/rename", { kind, from, to: to.trim() });
            callAlertMsg(r.message || "Renamed", "success");
            setConfirmOpen(false);
            setFrom(""); setTo("");
            await onRenamed();
            await loadNames(kind);
        } catch (e: any) {
            callAlertMsg(e?.message || "Could not rename", "error");
        } finally {
            setBusy(false);
        }
    };

    if (kinds && !kinds.length) {
        return (
            <section className="card" aria-label="Fix a name on past bills">
                <div className="card-body"><CardHead title="Fix a name on past bills" subtitle="There are no names to fix for this company type." /></div>
            </section>
        );
    }

    return (
        <section className="card" aria-label="Fix a name on past bills">
            <div className="card-body">
                <CardHead title="Fix a name on past bills"
                    subtitle="Correct a name typed wrongly. Every past bill using it is updated, and so is the list here in Settings." />
                <div className="form-grid mt-4">
                    <Field label="What to fix" htmlFor="fix-kind">
                        <select id="fix-kind" className="form-select" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!kinds}>
                            {(kinds || []).map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Name on bills" htmlFor="fix-from" help={names && !names.length ? "No bills use one yet." : undefined}>
                        <select id="fix-from" className="form-select" value={from} disabled={!names || !names.length}
                            onChange={(e) => { setFrom(e.target.value); setTo(e.target.value); setError(""); }}>
                            <option value="">{names ? "Choose…" : "Loading…"}</option>
                            {(names || []).map((n) => <option key={n.name} value={n.name}>{n.name} ({n.bills} bill{n.bills === 1 ? "" : "s"})</option>)}
                        </select>
                    </Field>
                    <Field label="Correct name" htmlFor="fix-to" error={error}>
                        <InputText id="fix-to" value={to} disabled={!from} placeholder="Type the correct name"
                            onChange={(e) => { setTo(e.target.value); setError(""); }} />
                    </Field>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <button type="button" className="btn btn-primary" disabled={!from || blocked} onClick={review}>
                        Rename{picked ? ` on ${picked.bills} bill${picked.bills === 1 ? "" : "s"}` : ""}
                    </button>
                    {blocked && <span className="field-help">Save or undo your other Settings changes first.</span>}
                </div>
            </div>
            <ConfirmDialog
                open={confirmOpen}
                title="Rename on past bills?"
                message={<>“{from}” becomes “{to.trim()}” on {picked?.bills ?? 0} bill{picked?.bills === 1 ? "" : "s"}{kind === "mechanic" ? " and in their bonus entries" : ""}. This can be undone only by renaming it back.</>}
                confirmLabel="Rename"
                busyLabel="Renaming…"
                busy={busy}
                danger={false}
                onConfirm={apply}
                onCancel={() => setConfirmOpen(false)}
            />
        </section>
    );
};

export default FixNamesTab;
