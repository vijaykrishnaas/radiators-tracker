import React, { useEffect, useRef, useState } from "react";
import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import AlertComponent from "../../../Components/AlertComponent";
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
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState<ClientRow[]>([]);

    // Add modal
    const [showAdd, setShowAdd] = useState(false);
    const [addName, setAddName] = useState("");
    const [addCode, setAddCode] = useState("");
    const [codeEdited, setCodeEdited] = useState(false);
    const [addUserId, setAddUserId] = useState("");
    const [addPassword, setAddPassword] = useState("");

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
    const [statusFilter, setStatusFilter] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const res = await listClients();
            setClients(res.clients || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load clients", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetAdd = () => {
        setAddName(""); setAddCode(""); setCodeEdited(false); setAddUserId(""); setAddPassword("");
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
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            { "Business Name": "Example Garage", "Business Code": "example-garage", "Admin Username": "admin", "Admin Password": "changeme123" },
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clients");
        XLSX.writeFile(wb, "client-import-template.xlsx");
    };

    const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(ws);
            const payload = rows
                .map((r) => ({
                    name: String(r["Business Name"] ?? r["name"] ?? "").trim(),
                    code: String(r["Business Code"] ?? r["code"] ?? "").trim(),
                    adminUserId: String(r["Admin Username"] ?? r["adminUserId"] ?? "").trim(),
                    adminPassword: String(r["Admin Password"] ?? r["adminPassword"] ?? ""),
                }))
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

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold mb-0">Clients</h4>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center" onClick={downloadTemplate}>
                            <Icons iconName="entrolment_download" className="icon-15 me-2" />Template
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                            onClick={() => fileInputRef.current?.click()}>
                            <Icons iconName="exporticon" className="icon-15 me-2" />Import Excel
                        </button>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="d-none" onChange={onImportFile} />
                        <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                            onClick={() => { resetAdd(); setShowAdd(true); }}>
                            <Icons iconName="add" className="icon-12 icon-white me-2" />Add Client
                        </button>
                    </div>
                </div>

                <div className="admin-summary">
                    <div className="admin-stat">
                        <div className="admin-stat-label">Total Clients</div>
                        <div className="admin-stat-value">{clients.length}</div>
                    </div>
                    <div className="admin-stat admin-stat--accent">
                        <div className="admin-stat-label">Active</div>
                        <div className="admin-stat-value">{activeCount}</div>
                    </div>
                    <div className="admin-stat admin-stat--muted">
                        <div className="admin-stat-label">Suspended</div>
                        <div className="admin-stat-value">{suspendedCount}</div>
                    </div>
                </div>

                <div className="card card-shadow mt-2">
                    <div className="card-body p-0">
                        <div className="table-header p-3 d-flex flex-wrap gap-2 align-items-center">
                            <input
                                type="text"
                                className="form-control"
                                style={{ maxWidth: 320 }}
                                placeholder="Search name, code, or username…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <select
                                className="form-select"
                                style={{ maxWidth: 180 }}
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">All statuses</option>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                            {(search || statusFilter) && (
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => { setSearch(""); setStatusFilter(""); }}>Clear</button>
                            )}
                        </div>
                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>SI No</th>
                                        <th>Business Name</th>
                                        <th>Code</th>
                                        <th>Admin Login</th>
                                        <th>Status</th>
                                        <th>Last Login</th>
                                        <th>Created</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length ? filtered.map((c, i) => (
                                        <tr key={c._id}>
                                            <td>{i + 1}</td>
                                            <td className="font-w600">{c.name}</td>
                                            <td><code>{c.code}</code></td>
                                            <td>{c.adminUserId}</td>
                                            <td>
                                                <span className={`status-badge ${c.status === "active" ? "status-badge-success" : "status-badge-warning"}`}>
                                                    {c.status === "active" ? "Active" : "Suspended"}
                                                </span>
                                            </td>
                                            <td>{fmtDate(c.lastLoginAt)}</td>
                                            <td>{fmtDate(c.createdAt)}</td>
                                            <td className="action-dropdown">
                                                <div className="dropdown">
                                                    <button className="btn" type="button" data-bs-toggle="dropdown">
                                                        <Icons iconName="Frame" className="icon-20" />
                                                    </button>
                                                    <ul className="dropdown-menu">
                                                        <li><button className="dropdown-item text-primary" onClick={() => setViewSettingsTarget(c)}>View Settings</button></li>
                                                        <li><button className="dropdown-item text-primary"
                                                            onClick={() => window.open(`/t/${c.code}/login`, "_blank", "noopener")}>
                                                            Open Login Page
                                                        </button></li>
                                                        <li><button className="dropdown-item text-primary" onClick={() => openEdit(c)}>Edit</button></li>
                                                        <li><button className="dropdown-item" onClick={() => toggleStatus(c)}>
                                                            {c.status === "active" ? "Suspend" : "Reactivate"}
                                                        </button></li>
                                                        <li><button className="dropdown-item" onClick={() => { setResetTarget(c); setResetPwd(""); }}>Reset Password</button></li>
                                                        <li><button className="dropdown-item" onClick={() => downloadExport(c)}>Export Data</button></li>
                                                        <li><button className="dropdown-item text-danger" onClick={() => { setDeleteTarget(c); setDeleteConfirmCode(""); setExported(false); }}>Delete</button></li>
                                                    </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={8} className="text-center py-3 text-muted">{clients.length ? "No clients match your search" : "No clients yet"}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add modal */}
            {showAdd && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Add Client</span>
                                <button type="button" className="btn-close" onClick={() => setShowAdd(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label font-w500">Business Name *</label>
                                    <input className="form-control" value={addName} onChange={(e) => onAddNameChange(e.target.value)} placeholder="e.g. Acme Radiators" />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label font-w500">Business Code * <span className="text-muted font-s12">(login code, locked after creation)</span></label>
                                    <input className="form-control" value={addCode}
                                        onChange={(e) => { setCodeEdited(true); setAddCode(slugify(e.target.value)); }}
                                        placeholder="e.g. acme-radiators" />
                                </div>
                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label font-w500">Admin Username *</label>
                                        <input className="form-control" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} placeholder="e.g. admin" />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label font-w500">Admin Password *</label>
                                        <input className="form-control" type="text" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="min 6 characters" />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={submitAdd} disabled={loading}>Create</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Handover modal */}
            {handover && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Client Created — Handover Details</span>
                                <button type="button" className="btn-close" onClick={() => setHandover(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s13 text-muted">Share these with the client. The password must be changed on their first login.</p>
                                <table className="table table-sm table-bordered font-s14 mb-0">
                                    <tbody>
                                        <tr><td className="font-w600">Login URL</td><td><code>{window.location.origin}{handover.loginUrl}</code></td></tr>
                                        <tr><td className="font-w600">Business Code</td><td><code>{handover.code}</code></td></tr>
                                        <tr><td className="font-w600">Username</td><td>{handover.adminUserId}</td></tr>
                                        <tr><td className="font-w600">Temp Password</td><td>{handover.tempPassword}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={copyHandover}>
                                    <Icons iconName="exporticon" className="icon-15 me-1" />Copy
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => setHandover(null)}>Done</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit modal */}
            {editTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Edit Client</span>
                                <button type="button" className="btn-close" onClick={() => setEditTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label font-w500">Business Name</label>
                                    <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                                </div>
                                <div className="mb-0">
                                    <label className="form-label font-w500">Business Code</label>
                                    <input className="form-control" value={editTarget.code} readOnly disabled />
                                    <small className="text-muted font-s12">Code is locked to keep handover links valid.</small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setEditTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={submitEdit} disabled={loading}>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset password modal */}
            {resetTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Reset Password — {resetTarget.name}</span>
                                <button type="button" className="btn-close" onClick={() => setResetTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s13 text-muted">Sets a new password for <code>{resetTarget.adminUserId}</code>. The client will be required to change it on next login.</p>
                                <label className="form-label font-w500">New Password *</label>
                                <input className="form-control" type="text" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="min 6 characters" />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setResetTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={submitReset} disabled={loading}>Reset</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View settings modal */}
            {viewSettingsTarget && (
                <ClientSettingsModal
                    clientId={viewSettingsTarget._id}
                    clientName={viewSettingsTarget.name}
                    onClose={() => setViewSettingsTarget(null)}
                />
            )}

            {/* Delete modal */}
            {deleteTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title text-danger">Delete Client</span>
                                <button type="button" className="btn-close" onClick={() => setDeleteTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-2">
                                    This permanently deletes <span className="font-w600">{deleteTarget.name}</span> and ALL its data —
                                    bills, bonuses, expenses, settings, and the admin login. This cannot be undone.
                                </p>
                                <div className="alert alert-warning py-2 font-s13 d-flex align-items-center justify-content-between">
                                    <span>{exported ? "✓ Data exported" : "Download a backup first (recommended)"}</span>
                                    <button type="button" className="btn btn-cancel btn-sm" onClick={() => downloadExport(deleteTarget)}>
                                        <Icons iconName="exporticon" className="icon-15 me-1" />Download Data
                                    </button>
                                </div>
                                <label className="form-label font-w500">Type the code <code>{deleteTarget.code}</code> to confirm:</label>
                                <input className="form-control" value={deleteConfirmCode} onChange={(e) => setDeleteConfirmCode(e.target.value)} />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={submitDelete}
                                    disabled={loading || deleteConfirmCode !== deleteTarget.code}>
                                    Delete Permanently
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import results modal */}
            {importResults && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Import Results</span>
                                <button type="button" className="btn-close" onClick={() => setImportResults(null)} />
                            </div>
                            <div className="modal-body">
                                <table className="table table-sm table-bordered font-s13 mb-0">
                                    <thead><tr><th>Business</th><th>Code</th><th>Result</th><th>Note</th></tr></thead>
                                    <tbody>
                                        {importResults.map((r, i) => (
                                            <tr key={i}>
                                                <td>{r.name}</td>
                                                <td><code>{r.code}</code></td>
                                                <td>
                                                    <span className={`status-badge ${r.status === "created" ? "status-badge-success" : r.status === "skipped" ? "status-badge-warning" : "status-badge-danger"}`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="text-muted">{r.message || (r.status === "created" ? "Use Reset Password to view/set the login" : "")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-muted font-s12 mt-2 mb-0">Created clients use the password from the sheet (clients must change it on first login).</p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => setImportResults(null)}>Done</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Clients;
