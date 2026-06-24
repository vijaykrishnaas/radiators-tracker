import React, { useEffect, useState, type ChangeEvent } from "react";
import Loader from "../../../Components/Loader";
import Selector from "../../../Components/Selector";
import Pagination from "../../../Components/Pagination";
import AlertComponent from "../../../Components/AlertComponent";
import { getData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";

type AuditEntry = {
    action: string;
    clientCode?: string;
    actorUserId?: string;
    actorRole?: string;
    details?: Record<string, any>;
    at: string;
};

// Plain-language labels for the actions a client can perform.
const ACTION_LABEL: Record<string, string> = {
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

// Condense the per-action details object into a short human string.
const detailText = (e: AuditEntry): string => {
    const d = e.details || {};
    switch (e.action) {
        case "radiator.create":
        case "radiator.update":
        case "radiator.delete":
            return d.truckNumber ? `${d.truckNumber}` : "";
        case "radiator.payment":
            return [
                d.truckNumber ? `${d.truckNumber}` : "",
                d.amount ? `paid ₹${d.amount}` : "",
                d.discount ? `discount ₹${d.discount}` : "",
            ].filter(Boolean).join(" · ");
        case "expense.create":
        case "expense.update":
            return [d.expenseType, d.amount ? `₹${d.amount}` : ""].filter(Boolean).join(" · ");
        case "bonus.payout":
            return [
                d.type ? `${d.type}` : "",
                d.beneficiary ? `${d.beneficiary}` : "",
                d.count != null ? `${d.count} entr${d.count === 1 ? "y" : "ies"}` : "",
                d.amount ? `₹${d.amount}` : "",
            ].filter(Boolean).join(" · ");
        case "settings.upload":
            return d.asset ? `${d.asset}` : "";
        default:
            return "";
    }
};

const ACTION_OPTIONS = Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }));

const ClientAudit: React.FC = () => {
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<AuditEntry[]>([]);

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
            const res = await getData("audit", {
                params: { page: currentPage, limit, action, from: fromDate, to: toDate },
            });
            setEntries(res.entries || []);
            setTotalPage(res.totalPages || 1);
            setTotalRecords(res.total || 0);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load activity log", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, limit, action, fromDate, toDate]);

    const handleLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
        setLimit(Number(e.target.value) || 20);
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setAction(""); setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <div className="col">
                <div className="w-100 d-flex justify-content-between align-items-center my-4">
                    <h4 className="fw-semibold mb-0">Activity Log</h4>
                </div>
                <div className="card card-shadow mt-2">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-6 col-xl-4">
                                    <label className="form-label font-w500 mb-1">Action</label>
                                    <Selector key={`au-action-${filtersKey}`} isClearable options={ACTION_OPTIONS} placeholder="-- All Actions --"
                                        onChange={(opt: any) => { setAction(opt ? opt.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-3 col-xl-2">
                                    <label className="form-label font-w500 mb-1">From</label>
                                    <input type="date" className="form-control" value={fromDate} max={toDate || undefined}
                                        onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-3 col-xl-2">
                                    <label className="form-label font-w500 mb-1">To</label>
                                    <input type="date" className="form-control" value={toDate} min={fromDate || undefined}
                                        onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2 d-flex align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm w-100" onClick={clearFilters}>Clear</button>
                                </div>
                            </div>
                        </div>
                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Action</th>
                                        <th>By</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.length ? entries.map((e, i) => (
                                        <tr key={i}>
                                            <td className="font-s13">{fmt(e.at)}</td>
                                            <td>{ACTION_LABEL[e.action] || e.action}</td>
                                            <td>{e.actorUserId || "—"}</td>
                                            <td className="font-s12 text-muted">{detailText(e) || "—"}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={4} className="text-center py-3 text-muted">No activity yet</td></tr>
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

export default ClientAudit;
