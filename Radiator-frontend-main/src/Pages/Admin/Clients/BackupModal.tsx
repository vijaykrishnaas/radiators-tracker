import React, { useEffect, useRef, useState } from "react";
import Modal from "../../../Components/ui/Modal";
import { Callout, SegmentedControl, SkeletonRows } from "../../../Components/ui/Basics";
import { useAlertMsg } from "../../../Services/AllServices";
import {
    getBackup, getBackupSummary, importBackupFile,
    type BackupCounts, type BackupResult, type BackupSection, type ClientRow,
} from "../../../Services/AdminApi";

const ORDER: BackupSection[] = ["bills", "inventory", "bonuses", "expenses", "salary", "settings"];
const BACKUP_FORMAT = "svr-company-backup";
// Records that only make sense in the company type they were made in (the server refuses them across types).
const TYPE_BOUND: BackupSection[] = ["bills", "inventory", "bonuses", "settings"];

type FileInfo = { name: string; backup: any; from: { name?: string; code?: string; businessType?: string }; exportedAt?: string; counts: Partial<BackupCounts> };

// What a chosen file holds, read in the browser so a large file is sent only once, on Import.
const readBackupFile = async (file: File): Promise<FileInfo> => {
    let backup: any;
    try { backup = JSON.parse(await file.text()); } catch { throw new Error("This file is not a company backup (it isn't valid JSON)."); }
    if (backup?.format !== BACKUP_FORMAT) throw new Error("This file is not a company backup.");
    const counts: Partial<BackupCounts> = {};
    for (const key of (backup.sections || []) as BackupSection[]) {
        if (!ORDER.includes(key)) continue;
        counts[key] = { label: LABELS[key], count: countFor(backup, key) };
    }
    return { name: file.name, backup, from: backup.company || {}, exportedAt: backup.exportedAt, counts };
};

const COLLECTIONS: Record<BackupSection, string[]> = {
    bills: ["radiators", "autobills", "engbills", "tyrebills"],
    inventory: ["stockentries"],
    bonuses: ["bonuses"],
    expenses: ["expenses"],
    salary: ["employees", "attendance", "advances", "salaryPeriods"],
    settings: ["settings", "counters"],
};
const LABELS: Record<BackupSection, string> = {
    bills: "Bills and challans",
    inventory: "Stock purchases",
    bonuses: "Bonuses",
    expenses: "Expenses",
    salary: "Salary (employees, attendance, advances, settled periods)",
    settings: "Settings and bill numbering",
};
const countFor = (backup: any, key: BackupSection) =>
    COLLECTIONS[key].reduce((n, c) => n + (Array.isArray(backup.data?.[c]) ? backup.data[c].length : 0), 0);

const SectionList: React.FC<{
    counts: Partial<BackupCounts>;
    picked: Set<BackupSection>;
    toggle: (k: BackupSection) => void;
    idPrefix: string;
    locked?: BackupSection[];
}> = ({ counts, picked, toggle, idPrefix, locked = [] }) => (
    <fieldset className="d-grid gap-2 m-0 p-0 border-0">
        <legend className="form-label">Sections</legend>
        {ORDER.filter((k) => counts[k]).map((k) => (
            <label key={k} className="form-check d-flex align-items-center gap-2 m-0" htmlFor={`${idPrefix}-${k}`}>
                <input id={`${idPrefix}-${k}`} type="checkbox" className="form-check-input m-0" checked={picked.has(k) && !locked.includes(k)}
                    disabled={locked.includes(k)} onChange={() => toggle(k)} />
                <span className="flex-grow-1">{counts[k]!.label}</span>
                <span className="t-sm t-muted tabular backup-count">{counts[k]!.count.toLocaleString("en-IN")} record{counts[k]!.count === 1 ? "" : "s"}</span>
            </label>
        ))}
    </fieldset>
);

/** Super admin › Clients › Backup & restore: download chosen sections as one file; import adds only what's missing. */
export default function BackupModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
    const { callAlertMsg } = useAlertMsg();
    const [mode, setMode] = useState<"export" | "import">("export");
    const [counts, setCounts] = useState<BackupCounts | null>(null);
    const [picked, setPicked] = useState<Set<BackupSection>>(new Set(ORDER));
    const [busy, setBusy] = useState(false);
    const [file, setFile] = useState<FileInfo | null>(null);
    const [fileError, setFileError] = useState("");
    const [results, setResults] = useState<BackupResult | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getBackupSummary(client._id)
            .then((r: any) => setCounts(r.sections))
            .catch((e: any) => callAlertMsg(e?.message || "Could not read this company's data", "error"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client._id]);

    const toggle = (k: BackupSection) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const switchMode = (m: "export" | "import") => {
        setMode(m); setResults(null);
        setPicked(new Set(m === "export" ? ORDER : (Object.keys(file?.counts || {}) as BackupSection[])));
    };

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setResults(null);
        try {
            const info = await readBackupFile(f);
            setFile(info); setFileError("");
            setPicked(new Set(Object.keys(info.counts) as BackupSection[]));
        } catch (err: any) {
            setFile(null); setFileError(err.message);
        }
    };

    const doExport = async () => {
        const sections = ORDER.filter((k) => picked.has(k));
        if (!sections.length) { callAlertMsg("Choose at least one section", "error"); return; }
        setBusy(true);
        try {
            const res: any = await getBackup(client._id, sections);
            const blob = new Blob([JSON.stringify(res.backup)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${client.code}-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            callAlertMsg("Backup downloaded", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Backup failed", "error");
        } finally {
            setBusy(false);
        }
    };

    const otherType = !!file?.from.businessType && !!client.businessType && file.from.businessType !== client.businessType;

    const doImport = async () => {
        if (!file) return;
        const sections = ORDER.filter((k) => picked.has(k) && file.counts[k] && !(otherType && TYPE_BOUND.includes(k)));
        if (!sections.length) { callAlertMsg("Choose at least one section", "error"); return; }
        setBusy(true);
        try {
            const res: any = await importBackupFile(client._id, file.backup, sections);
            setResults(res.results);
            callAlertMsg(res.message || "Imported", "success");
            getBackupSummary(client._id).then((r: any) => setCounts(r.sections)).catch(() => {});
        } catch (err: any) {
            callAlertMsg(err?.message || "Import failed", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title={`Backup & restore — ${client.name}`}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Close</button>
                    {mode === "export" ? (
                        <button type="button" className="btn btn-primary" onClick={doExport} disabled={busy || !counts}>
                            {busy && <span className="spinner" aria-hidden="true" />}{busy ? "Preparing…" : "Download backup"}
                        </button>
                    ) : (
                        <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy || !file}>
                            {busy && <span className="spinner" aria-hidden="true" />}{busy ? "Importing…" : "Import"}
                        </button>
                    )}
                </>
            }
        >
            <div className="d-grid gap-3">
                <SegmentedControl radio full label="Backup or restore" value={mode} onChange={switchMode}
                    options={[{ value: "export", label: "Export" }, { value: "import", label: "Import" }]} />

                {mode === "export" && (
                    counts ? (
                        <>
                            <p className="t-sm t-muted m-0">Downloads one file with the ticked sections. Keep it safe: it holds this company's records.</p>
                            <SectionList counts={counts} picked={picked} toggle={toggle} idPrefix="bk-out" />
                        </>
                    ) : <SkeletonRows rows={4} />
                )}

                {mode === "import" && (
                    <>
                        <p className="t-sm t-muted m-0">
                            Adds the records from a backup file to <strong className="t-strong">{client.name}</strong>. Records already here are
                            left as they are; nothing is overwritten or deleted. From another company (e.g. staging), bills are numbered after this
                            company's last bill, employees with the same name are treated as the same person, and this company's settings are kept.
                        </p>
                        <input ref={fileRef} type="file" accept="application/json,.json" className="d-none" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => fileRef.current?.click()} disabled={busy}>
                            {file ? "Choose another file" : "Choose backup file"}
                        </button>
                        {fileError && <Callout tone="error">{fileError}</Callout>}
                        {file && (
                            <>
                                <p className="t-sm m-0">
                                    <strong className="t-strong">{file.name}</strong> — from {file.from.name || "a company"}
                                    {file.from.code ? ` (${file.from.code})` : ""}{file.exportedAt ? `, saved ${new Date(file.exportedAt).toLocaleString("en-IN")}` : ""}
                                </p>
                                {otherType && (
                                    <Callout tone="warning">
                                        This backup is from {/^[aeiou]/.test(file.from.businessType || "") ? "an" : "a"} {file.from.businessType} company and {client.name} is {client.businessType}. Only Expenses and
                                        Salary can be imported into it.
                                    </Callout>
                                )}
                                <SectionList counts={file.counts} picked={picked} toggle={toggle} idPrefix="bk-in" locked={otherType ? TYPE_BOUND : []} />
                            </>
                        )}
                        {results && (
                            <div className="d-grid gap-1" role="status">
                                {Object.entries(results).map(([k, r]) => (
                                    <p key={k} className="t-sm m-0">
                                        <strong className="t-strong">{r.label}:</strong> {r.added} added
                                        {r.alreadyThere ? `, ${r.alreadyThere} already here` : ""}
                                        {r.renumbered ? ` (given new numbers after this company's last bill; the old number still finds them)` : ""}
                                        {r.matched ? `, ${r.matched} employee${r.matched === 1 ? "" : "s"} matched by name (their records added to the existing employee)` : ""}
                                        {r.otherCompany ? `, ${r.otherCompany} skipped (still in another company)` : ""}
                                    </p>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
