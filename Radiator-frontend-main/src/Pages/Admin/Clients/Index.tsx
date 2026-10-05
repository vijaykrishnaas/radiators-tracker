import React, { useEffect, useRef, useState } from "react";
import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import { PageHeader, KpiCard, KpiGrid, Badge, Callout, Field, BusyOverlay } from "../../../Components/ui/Basics";
import Modal from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, type Column, type ListStatus } from "../../../Components/ui/DataList";
import { useAlertMsg } from "../../../Services/AllServices";
import * as XLSX from "xlsx";
import {
    listClients,
    createClient,
    updateClient,
    deleteClient,
    resetClientPassword,
    exportClient,
    importClients,
    type ClientRow,
    type HandoverInfo,
    type ImportResult,
    type BusinessType,
} from "../../../Services/AdminApi";
import ClientSettingsModal from "./ClientSettingsModal";

const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

// Flattens the nested settings object into readable [Setting, Value] rows for Excel.
const flattenSettings = (obj: any, prefix = ""): { Setting: string; Value: any }[] => {
    const rows: { Setting: string; Value: any }[] = [];
    Object.entries(obj || {}).forEach(([k, v]) => {
        if (k === "_id" || k === "clientId") return;
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            rows.push(...flattenSettings(v, key));
        } else if (Array.isArray(v)) {
            rows.push({ Setting: key, Value: v.map((x: any) => (x && typeof x === "object" ? (x.label ?? JSON.stringify(x)) : x)).join(", ") });
        } else {
            rows.push({ Setting: key, Value: v as any });
        }
    });
    return rows;
};

const Clients: React.FC = () => {
    const { callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [listStatus, setListStatus] = useState<ListStatus>("loading");
    const [busyLabel, setBusyLabel] = useState("");
    const [clients, setClients] = useState<ClientRow[]>([]);

    // Add modal
    const [showAdd, setShowAdd] = useState(false);
    const [addName, setAddName] = useState("");
    const [addCode, setAddCode] = useState("");
    const [codeEdited, setCodeEdited] = useState(false);
    const [addUserId, setAddUserId] = useState("");
    const [addPassword, setAddPassword] = useState("");
    const [addBusinessType, setAddBusinessType] = useState<BusinessType>("radiator");

    // Handover (shown after create)
    const [handover, setHandover] = useState<HandoverInfo | null>(null);

    // Excel import
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

    // Edit modal
    const [editTarget, setEditTarget] = useState<ClientRow | null>(null);
    const [editName, setEditName] = useState("");

    // Reset-password modal
    const [resetTarget, setResetTarget] = useState<ClientRow | null>(null);
    const [resetPwd, setResetPwd] = useState("");

    // Delete modal
    const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
    const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
    const [exported, setExported] = useState(false);

    // View-settings modal + table search/filter
    const [viewSettingsTarget, setViewSettingsTarget] = useState<ClientRow | null>(null);
    const [search, setSearch] = useState("");
    const [clearKey, setClearKey] = useState(0);
    const [statusFilter, setStatusFilter] = useState("");

    const load = async () => {
        try {
            const res = await listClients();
            setClients(res.clients || []);
            setListStatus("ready");
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load clients", "error");
            setListStatus((s) => (s === "ready" ? s : "error"));
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetAdd = () => {
        setAddName(""); setAddCode(""); setCodeEdited(false); setAddUserId(""); setAddPassword(""); setAddBusinessType("radiator");
    };

    const onAddNameChange = (v: string) => {
        setAddName(v);
        if (!codeEdited) setAddCode(slugify(v));
    };

    const submitAdd = async () => {
        if (!addName.trim() || !addCode.trim() || !addUserId.trim() || addPassword.length < 6) {
            callAlertMsg("All fields required; password min 6 characters", "error");
            return;
        }
        setLoading(true);
        try {
            const res = await createClient({
                name: addName.trim(),
                code: addCode.trim(),
                adminUserId: addUserId.trim(),
                adminPassword: addPassword,
                businessType: addBusinessType,
            });
            setShowAdd(false);
            resetAdd();
            setHandover(res.handover);
            await load();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to create client", "error");
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (c: ClientRow) => {
        setEditTarget(c);
        setEditName(c.name);
    };

    const submitEdit = async () => {
        if (!editTarget || !editName.trim()) return;
        setLoading(true);
        try {
            await updateClient(editTarget._id, { name: editName.trim() });
            setEditTarget(null);
            await load();
            callAlertMsg("Client updated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to update", "error");
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (c: ClientRow) => {
        setLoading(true);
        try {
            await updateClient(c._id, { status: c.status === "active" ? "suspended" : "active" });
            await load();
            callAlertMsg(c.status === "active" ? "Client suspended" : "Client reactivated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to change status", "error");
        } finally {
            setLoading(false);
        }
    };

    const submitReset = async () => {
        if (!resetTarget || resetPwd.length < 6) {
            callAlertMsg("Password must be at least 6 characters", "error");
            return;
        }
        setLoading(true);
        try {
            const res = await resetClientPassword(resetTarget._id, resetPwd);
            setResetTarget(null);
            setResetPwd("");
            setHandover(res.handover); // reuse the handover card to show new creds
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to reset password", "error");
        } finally {
            setLoading(false);
        }
    };

    // Builds a multi-sheet Excel workbook from the client's full data export.
    const downloadExport = async (c: ClientRow) => {
        setLoading(true);
        setBusyLabel("Preparing Excel…");
        try {
            const data: any = await exportClient(c._id);
            const wb = XLSX.utils.book_new();
            const bills = (data.radiators || []).map((r: any) => ({
                Date: r.billDate ? new Date(r.billDate).toLocaleDateString("en-IN") : "",
                Truck: r.truckNumber, Transport: r.transportName, Mechanic: r.mechanicName,
                Model: r.radiatorType, Status: r.status, Discount: r.discount ?? 0, Received: r.receivedAmount ?? 0,
                Services: (r.serviceInfo || []).map((s: any) => `${s.type}:${s.price}`).join("; "),
            }));
            const expenses = (data.expenses || []).map((e: any) => ({
                Date: e.date ? new Date(e.date).toLocaleDateString("en-IN") : "",
                Type: e.expenseType, Reason: e.reason || "", Amount: e.amount,
            }));
            const bonuses = (data.bonuses || []).map((b: any) => ({
                Type: b.type, Beneficiary: b.beneficiary, Period: b.period,
                Date: b.billDate ? new Date(b.billDate).toLocaleDateString("en-IN") : "",
                Accrued: b.accruedAmount, Payable: b.payableAmount, Status: b.status,
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bills.length ? bills : [{}]), "Bills");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses.length ? expenses : [{}]), "Expenses");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bonuses.length ? bonuses : [{}]), "Bonuses");
            const settingsRows = flattenSettings(data.settings || {});
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows.length ? settingsRows : [{ Setting: "", Value: "" }]), "Settings");
            XLSX.writeFile(wb, `${c.code}-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
            setExported(true);
            callAlertMsg("Data exported", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setLoading(false);
            setBusyLabel("");
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            { "Business Name": "Example Garage", "Business Code": "example-garage", "Admin Username": "admin", "Admin Password": "changeme123", "Business Type": "radiator" },
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clients");
        XLSX.writeFile(wb, "client-import-template.xlsx");
    };

    const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setBusyLabel("Importing clients…");
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(ws);
            const payload = rows
                .map((r) => {
                    const rawType = String(r["Business Type"] ?? r["businessType"] ?? "").trim().toLowerCase();
                    return {
                        name: String(r["Business Name"] ?? r["name"] ?? "").trim(),
                        code: String(r["Business Code"] ?? r["code"] ?? "").trim(),
                        adminUserId: String(r["Admin Username"] ?? r["adminUserId"] ?? "").trim(),
                        adminPassword: String(r["Admin Password"] ?? r["adminPassword"] ?? ""),
                        businessType: (rawType === "automobile" ? "automobile" : rawType === "engineering" ? "engineering" : "radiator") as BusinessType,
                    };
                })
                .filter((c) => c.name || c.code);
            if (!payload.length) {
                callAlertMsg("No client rows found. Use the template columns.", "error");
                return;
            }
            const res = await importClients(payload);
            setImportResults(res.results || []);
            await load();
            callAlertMsg(`Imported ${res.created} of ${res.total} clients`, "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Import failed", "error");
        } finally {
            setLoading(false);
            setBusyLabel("");
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const submitDelete = async () => {
        if (!deleteTarget || deleteConfirmCode !== deleteTarget.code) return;
        setLoading(true);
        try {
            await deleteClient(deleteTarget._id);
            setDeleteTarget(null);
            setDeleteConfirmCode("");
            setExported(false);
            await load();
            callAlertMsg("Client and all data deleted", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete", "error");
        } finally {
            setLoading(false);
        }
    };

    const copyHandover = () => {
        if (!handover) return;
        const origin = window.location.origin;
        const text =
            `Login: ${origin}${handover.loginUrl}\n` +
            `Business code: ${handover.code}\n` +
            `Username: ${handover.adminUserId}\n` +
            `Temporary password: ${handover.tempPassword}`;
        navigator.clipboard?.writeText(text);
        callAlertMsg("Handover details copied", "success");
    };

    const q = search.trim().toLowerCase();
    const filtered = clients.filter((c) => {
        const matchSearch = !q ||
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            c.adminUserId.toLowerCase().includes(q);
        const matchStatus = !statusFilter || c.status === statusFilter;
        return matchSearch && matchStatus;
    });
    const activeCount = clients.filter((c) => c.status === "active").length;
    const suspendedCount = clients.length - activeCount;

    const typeName = (t?: BusinessType) => (t === "automobile" ? "Automobile" : t === "engineering" ? "Engineering" : "Radiator");
    const statusBadge = (c: ClientRow) => <Badge tone={c.status === "active" ? "success" : "neutral"} dot>{c.status === "active" ? "Active" : "Suspended"}</Badge>;
    const rowMenu = (c: ClientRow) => (
        <RowActions ariaLabel={`Actions for ${c.name}`} items={[
            { label: "View Settings", icon: <Icons iconName="settings" />, onClick: () => setViewSettingsTarget(c) },
            { label: "Open Login Page", icon: <Icons iconName="external-link" />, onClick: () => window.open(`/t/${c.code}/login`, "_blank", "noopener") },
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(c) },
            { label: "Reset Password", icon: <Icons iconName="key" />, onClick: () => { setResetTarget(c); setResetPwd(""); } },
            { label: "Export Data", icon: <Icons iconName="entrolment_download" />, onClick: () => downloadExport(c) },
            { label: c.status === "active" ? "Suspend" : "Reactivate", icon: <Icons iconName={c.status === "active" ? "pause" : "play"} />, onClick: () => toggleStatus(c) },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => { setDeleteTarget(c); setDeleteConfirmCode(""); setExported(false); } },
        ]} />
    );

    const columns: Column<ClientRow>[] = [
        { key: "si", header: "SI No", className: "nowrap tabular", cell: (_c, i) => i + 1 },
        { key: "name", header: "Business Name", className: "key text", cell: (c) => c.name },
        { key: "code", header: "Code", className: "nowrap", cell: (c) => <span className="t-mono">{c.code}</span> },
        { key: "type", header: "Type", className: "nowrap", cell: (c) => <Badge>{typeName(c.businessType)}</Badge> },
        { key: "admin", header: "Admin Login", cell: (c) => c.adminUserId },
        { key: "status", header: "Status", className: "nowrap", cell: statusBadge },
        { key: "last", header: "Last Login", className: "nowrap tabular", cell: (c) => fmtDate(c.lastLoginAt) },
        { key: "created", header: "Created", className: "nowrap tabular", cell: (c) => fmtDate(c.createdAt) },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: rowMenu },
    ];
    const statusOptions = [{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }];
    const filterCount = (q ? 1 : 0) + (statusFilter ? 1 : 0);

    return (
        <>
            <BusyOverlay show={!!busyLabel} label={busyLabel} />
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="d-none" onChange={onImportFile} aria-hidden="true" tabIndex={-1} />
            <PageHeader
                title="Clients"
                actions={[
                    { label: "Template", icon: "entrolment_download", onClick: downloadTemplate },
                    { label: "Import Excel", icon: "exporticon", onClick: () => fileInputRef.current?.click(), disabled: loading },
                ]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => { resetAdd(); setShowAdd(true); }}>
                        <Icons iconName="add" />Add Client
                    </button>
                }
            />

            <div className="mb-4">
                <KpiGrid count={3}>
                    <KpiCard label="Total Clients" value={String(clients.length)} icon="users" loading={listStatus === "loading"} />
                    <KpiCard label="Active" value={String(activeCount)} icon="check-circle" tone="success" loading={listStatus === "loading"} />
                    <KpiCard label="Suspended" value={String(suspendedCount)} icon="pause" loading={listStatus === "loading"} />
                </KpiGrid>
            </div>

            <DataList<ClientRow>
                caption="Clients"
                toolbar={
                    <FilterBar
                        activeCount={filterCount}
                        onClear={() => { setSearch(""); setStatusFilter(""); setClearKey((k) => k + 1); }}
                        search={<SearchInput value={search} key={clearKey} id="client-search" placeholder="Search name, code, or username…" onSearch={setSearch} />}
                        filters={[
                            {
                                id: "client-status", label: "Status", primary: true,
                                node: (
                                    <select id="client-status" className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                        {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                ),
                            },
                        ]}
                    />
                }
                rows={filtered}
                rowKey={(c) => c._id}
                columns={columns}
                status={listStatus}
                onRetry={() => { setListStatus("loading"); load(); }}
                errorTitle="Couldn't load clients"
                empty={clients.length
                    ? { icon: "users", title: "No clients match your search", text: "Try a different name, code or username.", action: <button type="button" className="btn btn-link" onClick={() => { setSearch(""); setStatusFilter(""); setClearKey((k) => k + 1); }}>Clear filters</button> }
                    : { icon: "users", title: "No clients yet", text: "Add your first client and their login details will be shown for handover.", action: <button type="button" className="btn btn-primary" onClick={() => { resetAdd(); setShowAdd(true); }}><Icons iconName="add" />Add Client</button> }}
                mobileCard={(c) => (
                    <MobileCard
                        title={c.name}
                        onOpen={() => setViewSettingsTarget(c)}
                        badge={statusBadge(c)}
                        menu={rowMenu(c)}
                        meta={[<span key="c" className="t-mono">{c.code}</span>, typeName(c.businessType), c.adminUserId]}
                        meta2={`Last login ${fmtDate(c.lastLoginAt)} · Created ${fmtDate(c.createdAt)}`}
                    />
                )}
            />

            {/* Add */}
            <Modal
                open={showAdd}
                onClose={() => setShowAdd(false)}
                title="Add Client"
                busy={loading}
                as="form"
                onSubmit={(e) => { e.preventDefault(); submitAdd(); }}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)} disabled={loading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading && <span className="spinner" aria-hidden="true" />}Create</button>
                </>}
            >
                <div className="d-grid gap-3">
                    <Field label="Business name" htmlFor="add-name" required>
                        <input id="add-name" className="form-control" value={addName} onChange={(e) => onAddNameChange(e.target.value)} placeholder="e.g. Acme Radiators" />
                    </Field>
                    <Field label="Business code" htmlFor="add-code" required help="Login code, locked after creation">
                        <input id="add-code" className="form-control t-mono" value={addCode}
                            onChange={(e) => { setCodeEdited(true); setAddCode(slugify(e.target.value)); }} placeholder="e.g. acme-radiators" />
                    </Field>
                    <div className="form-grid">
                        <Field label="Admin username" htmlFor="add-user" required>
                            <input id="add-user" className="form-control" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} placeholder="e.g. admin" />
                        </Field>
                        <Field label="Admin password" htmlFor="add-pwd" required>
                            <input id="add-pwd" className="form-control" type="text" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="min 6 characters" />
                        </Field>
                    </div>
                    <Field label="Business type" htmlFor="add-type" help="Fixed after creation">
                        <select id="add-type" className="form-select" value={addBusinessType} onChange={(e) => setAddBusinessType(e.target.value as BusinessType)}>
                            <option value="radiator">Radiator</option>
                            <option value="automobile">Automobile</option>
                            <option value="engineering">Engineering Works</option>
                        </select>
                    </Field>
                </div>
            </Modal>

            {/* Handover */}
            <Modal
                open={!!handover}
                onClose={() => setHandover(null)}
                title="Client Created — Handover Details"
                description="Share these with the client. The password must be changed on their first login."
                initialFocus="confirm"
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={copyHandover}><Icons iconName="copy" />Copy</button>
                    <button type="button" className="btn btn-primary" onClick={() => setHandover(null)}>Done</button>
                </>}
            >
                {handover && (
                    <dl className="kv-list">
                        <div><dt>Login URL</dt><dd className="t-mono">{window.location.origin}{handover.loginUrl}</dd></div>
                        <div><dt>Business code</dt><dd className="t-mono">{handover.code}</dd></div>
                        <div><dt>Username</dt><dd className="t-mono">{handover.adminUserId}</dd></div>
                        <div><dt>Temp password</dt><dd className="t-mono">{handover.tempPassword}</dd></div>
                    </dl>
                )}
            </Modal>

            {/* Edit */}
            <Modal
                open={!!editTarget}
                onClose={() => setEditTarget(null)}
                title="Edit Client"
                busy={loading}
                as="form"
                onSubmit={(e) => { e.preventDefault(); submitEdit(); }}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditTarget(null)} disabled={loading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading && <span className="spinner" aria-hidden="true" />}Save</button>
                </>}
            >
                <div className="d-grid gap-3">
                    <Field label="Business name" htmlFor="edit-name">
                        <input id="edit-name" className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </Field>
                    <Field label="Business code" htmlFor="edit-code" help="Code is locked to keep handover links valid.">
                        <input id="edit-code" className="form-control t-mono" value={editTarget?.code || ""} readOnly disabled />
                    </Field>
                </div>
            </Modal>

            {/* Reset password */}
            <Modal
                open={!!resetTarget}
                onClose={() => setResetTarget(null)}
                title={`Reset Password — ${resetTarget?.name ?? ""}`}
                description={resetTarget && <>Sets a new password for <span className="t-mono">{resetTarget.adminUserId}</span>. The client will be required to change it on next login.</>}
                busy={loading}
                as="form"
                onSubmit={(e) => { e.preventDefault(); submitReset(); }}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={() => setResetTarget(null)} disabled={loading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading && <span className="spinner" aria-hidden="true" />}Reset</button>
                </>}
            >
                <Field label="New password" htmlFor="reset-pwd" required>
                    <input id="reset-pwd" className="form-control" type="text" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="min 6 characters" />
                </Field>
            </Modal>

            {viewSettingsTarget && (
                <ClientSettingsModal
                    clientId={viewSettingsTarget._id}
                    clientName={viewSettingsTarget.name}
                    onClose={() => setViewSettingsTarget(null)}
                />
            )}

            {/* Delete */}
            <Modal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Client"
                danger
                busy={loading}
                description={deleteTarget && <>This permanently deletes <span className="t-strong t-semibold">{deleteTarget.name}</span> and ALL its data — bills, bonuses, expenses, settings, and the admin login. This cannot be undone.</>}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={loading}>Cancel</button>
                    <button type="button" className="btn btn-danger" onClick={submitDelete}
                        disabled={loading || !deleteTarget || deleteConfirmCode !== deleteTarget.code}>
                        {loading && <span className="spinner" aria-hidden="true" />}Delete Permanently
                    </button>
                </>}
            >
                {deleteTarget && (
                    <div className="d-grid gap-3">
                        <Callout tone="warning">
                            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                                <span>{exported ? "Data exported" : "Download a backup first (recommended)"}</span>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadExport(deleteTarget)}>
                                    <Icons iconName={exported ? "tick" : "entrolment_download"} />Download Data
                                </button>
                            </div>
                        </Callout>
                        <Field label={<>Type the code <span className="t-mono">{deleteTarget.code}</span> to confirm:</>} htmlFor="delete-code">
                            <input id="delete-code" className="form-control t-mono" value={deleteConfirmCode} autoComplete="off" onChange={(e) => setDeleteConfirmCode(e.target.value)} />
                        </Field>
                    </div>
                )}
            </Modal>

            {/* Import results */}
            <Modal
                open={!!importResults}
                onClose={() => setImportResults(null)}
                title="Import Results"
                size="lg"
                initialFocus="confirm"
                footer={<button type="button" className="btn btn-primary" onClick={() => setImportResults(null)}>Done</button>}
            >
                <div className="mini-table">
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr><th>Business</th><th>Code</th><th>Result</th><th>Note</th></tr></thead>
                            <tbody>
                                {(importResults || []).map((r, i) => (
                                    <tr key={i}>
                                        <td className="key">{r.name}</td>
                                        <td><span className="t-mono">{r.code}</span></td>
                                        <td><Badge tone={r.status === "created" ? "success" : r.status === "skipped" ? "neutral" : "error"}>{r.status}</Badge></td>
                                        <td>{r.message || (r.status === "created" ? "Use Reset Password to view/set the login" : "")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="field-help mb-0">Created clients use the password from the sheet (clients must change it on first login).</p>
            </Modal>
        </>
    );
};

export default Clients;
