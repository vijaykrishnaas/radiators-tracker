import React, { useEffect, useState, type ChangeEvent } from "react";
import { NavLink } from "react-router-dom";
import Loader from "../../../Components/Loader";
import Selector from "../../../Components/Selector";
import Pagination from "../../../Components/Pagination";
import AlertComponent from "../../../Components/AlertComponent";
import { useAlertMsg } from "../../../Services/AllServices";
import { listAudit, listClients, type AuditEntry, type ClientRow } from "../../../Services/AdminApi";

const ACTION_LABEL: Record<string, string> = {
    "client.create": "Created client",
    "client.rename": "Renamed client",
    "client.suspend": "Suspended client",
    "client.reactivate": "Reactivated client",
    "client.reset_password": "Reset password",
    "client.delete": "Deleted client",
};

const fmt = (d: string) => new Date(d).toLocaleString("en-IN");

const Audit: React.FC = () => {
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [clients, setClients] = useState<ClientRow[]>([]);

    const [clientCode, setClientCode] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [totalPage, setTotalPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [selectedDataList, setSelectedDataList] = useState(20);

    const load = async () => {
        setLoading(true);
        try {
            const res = await listAudit({ page: currentPage, limit, clientCode });
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
    }, [currentPage, limit, clientCode]);

    useEffect(() => {
        listClients().then((r) => setClients(r.clients || [])).catch(() => {});
    }, []);

    const handleLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
        setLimit(Number(e.target.value) || 20);
        setCurrentPage(1);
    };

    const clientOptions = clients.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));

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
                                <div className="col-12 col-md-5 col-xl-4">
                                    <label className="form-label font-w500 mb-1">Filter by client</label>
                                    <Selector isClearable options={clientOptions} placeholder="-- All Clients --"
                                        onChange={(opt: any) => { setClientCode(opt ? opt.value : ""); setCurrentPage(1); }} />
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
                                            <td className="font-s12 text-muted">
                                                {e.details?.name ? `name: ${e.details.name}` : ""}
                                                {e.details?.counts ? ` (${Object.entries(e.details.counts).map(([k, v]) => `${k}:${v}`).join(", ")})` : ""}
                                            </td>
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
