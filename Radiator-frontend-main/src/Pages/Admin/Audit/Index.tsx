import React, { useEffect, useState, type ChangeEvent } from "react";
import { NavLink } from "react-router-dom";
import Loader from "../../../Components/Loader";
import Selector from "../../../Components/Selector";
import Pagination from "../../../Components/Pagination";
import AlertComponent from "../../../Components/AlertComponent";
import { useAlertMsg } from "../../../Services/AllServices";
import { listAudit, listClients, type AuditEntry, type ClientRow } from "../../../Services/AdminApi";

const ACTION_LABEL: Record<string, string> = {
    // Super-admin actions
    "client.create": "Created client",
    "client.rename": "Renamed client",
    "client.suspend": "Suspended client",
    "client.reactivate": "Reactivated client",
    "client.reset_password": "Reset password",
    "client.delete": "Deleted client",
    // Client-side actions (so client logs read clearly here too)
    "radiator.create": "Created bill",
    "radiator.update": "Updated bill",
    "radiator.delete": "Deleted bill",
    "radiator.payment": "Recorded payment",
    "expense.create": "Added expense",
    "expense.update": "Updated expense",
    "expense.delete": "Deleted expense",
    "settings.update": "Updated settings",
    "settings.upload": "Uploaded asset",
    "bonus.payout": "Issued bonus",
    "auth.login": "Logged in",
};

const fmt = (d: string) => new Date(d).toLocaleString("en-IN");

// Condense any audit entry's details (super-admin OR client) into a short string.
const detailText = (e: AuditEntry): string => {
    const d = e.details || {};
    switch (e.action) {
        case "radiator.create":
        case "radiator.update":
        case "radiator.delete":
            return d.truckNumber ? String(d.truckNumber) : "";
        case "radiator.payment":
            return [d.truckNumber, d.amount ? `paid ₹${d.amount}` : "", d.discount ? `discount ₹${d.discount}` : ""].filter(Boolean).join(" · ");
        case "expense.create":
        case "expense.update":
            return [d.expenseType, d.amount ? `₹${d.amount}` : ""].filter(Boolean).join(" · ");
        case "bonus.payout":
            return [d.type, d.beneficiary, d.count != null ? `${d.count} entr${d.count === 1 ? "y" : "ies"}` : "", d.amount ? `₹${d.amount}` : ""].filter(Boolean).join(" · ");
        case "settings.upload":
            return d.asset ? String(d.asset) : "";
        default:
            return [
                d.name ? `name: ${d.name}` : "",
                d.counts ? `(${Object.entries(d.counts).map(([k, v]) => `${k}:${v}`).join(", ")})` : "",
            ].filter(Boolean).join(" ");
    }
};

const Audit: React.FC = () => {
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [clients, setClients] = useState<ClientRow[]>([]);

    const [clientCode, setClientCode] = useState("");
    const [action, setAction] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [filtersKey, setFiltersKey] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [totalPage, setTotalPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [selectedDataList, setSelectedDataList] = useState(20);

    const load = async () => {
        setLoading(true);
        try {
            const res = await listAudit({ page: currentPage, limit, clientCode, action, from: fromDate, to: toDate });
            setEntries(res.entries || []);
            setTotalPage(res.totalPages || 1);
            setTotalRecords(res.total || 0);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load audit log", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, limit, clientCode, action, fromDate, toDate]);

    useEffect(() => {
        listClients().then((r) => setClients(r.clients || [])).catch(() => {});
    }, []);

    const handleLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
        setLimit(Number(e.target.value) || 20);
        setCurrentPage(1);
    };

    const clientOptions = clients.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));
    const actionOptions = Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }));
    const clearAuditFilters = () => {
        setClientCode(""); setAction(""); setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold mb-0">Audit Log</h4>
                    <NavLink to="/admin/clients" className="btn btn-cancel btn-sm">← Clients</NavLink>
                </div>
                <div className="card card-shadow mt-2">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Filter by client</label>
                                    <Selector key={`au-client-${filtersKey}`} isClearable options={clientOptions} placeholder="-- All Clients --"
                                        onChange={(opt: any) => { setClientCode(opt ? opt.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Action</label>
                                    <Selector key={`au-action-${filtersKey}`} isClearable options={actionOptions} placeholder="-- All Actions --"
                                        onChange={(opt: any) => { setAction(opt ? opt.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">From</label>
                                    <input type="date" className="form-control" value={fromDate} max={toDate || undefined}
                                        onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">To</label>
                                    <input type="date" className="form-control" value={toDate} min={fromDate || undefined}
                                        onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2 d-flex align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm w-100" onClick={clearAuditFilters}>Clear</button>
                                </div>
                            </div>
                        </div>
                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Action</th>
                                        <th>Client</th>
                                        <th>By</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.length ? entries.map((e, i) => (
                                        <tr key={i}>
                                            <td className="font-s13">{fmt(e.at)}</td>
                                            <td>{ACTION_LABEL[e.action] || e.action}</td>
                                            <td>{e.clientCode ? <code>{e.clientCode}</code> : "—"}</td>
                                            <td>{e.actorUserId || "—"}</td>
                                            <td className="font-s12 text-muted">{detailText(e) || "—"}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="text-center py-3 text-muted">No audit entries</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPage}
                        selectedDataList={selectedDataList}
                        setSelectedDataList={setSelectedDataList}
                        paginationDataLimit={{ limit }}
                        response={{ totalRecords }}
                        handleInputChange={handleLimitChange}
                        handlePreviousPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        handleNextPage={() => setCurrentPage((p) => Math.min(totalPage, p + 1))}
                    />
                </div>
            </div>
        </div>
    );
};

export default Audit;
