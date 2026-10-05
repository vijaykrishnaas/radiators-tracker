import React, { useEffect, useState } from "react";
import Selector from "../../../Components/Selector";
import { useAlertMsg } from "../../../Services/AllServices";
import { listAudit, listClients, type ClientRow } from "../../../Services/AdminApi";
import { actionLabel, adminActionOptions, detailText, type AuditEntry } from "../../../Constants/auditActions";
import { PageHeader, Badge } from "../../../Components/ui/Basics";
import { FilterBar } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, type Column } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN");
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-IN");
const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;

const ActionBadge = ({ action }: { action: string }) => {
    const label = actionLabel(action, true);
    return label ? <Badge>{label}</Badge> : <span className="t-mono">{action}</span>;
};

const Audit: React.FC = () => {
    const { callAlertMsg } = useAlertMsg();
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [clientCode, setClientCode] = useState("");
    const [action, setAction] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const list = useRemoteList<AuditEntry>(async () => {
        try {
            const res = await listAudit({ page: currentPage, limit, clientCode, action, from: fromDate, to: toDate });
            return { rows: res.entries || [], total: res.total || 0, totalPages: res.totalPages || 1 };
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load audit log", "error");
            throw err;
        }
    }, [currentPage, limit, clientCode, action, fromDate, toDate], { page: currentPage, setPage: setCurrentPage });

    useEffect(() => {
        listClients().then((r) => setClients(r.clients || [])).catch(() => {});
    }, []);

    const clientOptions = clients.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));
    const actionOptions = adminActionOptions();
    const activeCount = [clientCode, action, fromDate, toDate].filter(Boolean).length;
    const clear = () => { setClientCode(""); setAction(""); setFromDate(""); setToDate(""); setCurrentPage(1); };
    const set = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    const columns: Column<AuditEntry>[] = [
        { key: "when", header: "When", className: "nowrap tabular", cell: (e) => <>{fmtDate(e.at)}<span className="d-block t-xs t-muted">{fmtTime(e.at)}</span></> },
        { key: "action", header: "Action", className: "nowrap", cell: (e) => <ActionBadge action={e.action} /> },
        { key: "client", header: "Client", className: "nowrap", cell: (e) => (e.clientCode ? <span className="t-mono">{e.clientCode}</span> : "—") },
        { key: "by", header: "By", cell: (e) => e.actorUserId || "—" },
        { key: "details", header: "Details", className: "text-wide", cell: (e) => detailText(e) || "—" },
    ];

    return (
        <>
            <PageHeader title="Audit Log" back={{ to: "/admin/clients", label: "Clients" }} />
            <DataList<AuditEntry>
                caption="Audit log"
                toolbar={
                    <FilterBar
                        activeCount={activeCount}
                        onClear={clear}
                        filters={[
                            { id: "au-client", label: "Filter by client", primary: true, node: <Selector inputId="au-client" isClearable options={clientOptions} placeholder="-- All Clients --" value={opt(clientOptions, clientCode)} onChange={(o: any) => set(setClientCode)(o ? o.value : "")} /> },
                            { id: "au-action", label: "Action", primary: true, node: <Selector inputId="au-action" isClearable options={actionOptions} placeholder="-- All Actions --" value={opt(actionOptions, action)} onChange={(o: any) => set(setAction)(o ? o.value : "")} /> },
                            { id: "au-from", label: "From", node: <input id="au-from" type="date" className="form-control" value={fromDate} max={toDate || undefined} onChange={(e) => set(setFromDate)(e.target.value)} /> },
                            { id: "au-to", label: "To", node: <input id="au-to" type="date" className="form-control" value={toDate} min={fromDate || undefined} onChange={(e) => set(setToDate)(e.target.value)} /> },
                        ]}
                    />
                }
                rows={list.rows}
                rowKey={(e, i) => `${e.at}-${i}`}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load the audit log"
                empty={activeCount
                    ? { icon: "history", title: "No records match these filters", text: "Try a different client, action or date range.", action: <button type="button" className="btn btn-link" onClick={clear}>Clear filters</button> }
                    : { icon: "history", title: "No audit entries yet" }}
                mobileCard={(e) => (
                    <MobileCard
                        title={actionLabel(e.action, true) || <span className="t-mono">{e.action}</span>}
                        meta={[`${fmtDate(e.at)} ${fmtTime(e.at)}`, e.clientCode, e.actorUserId]}
                        meta2={detailText(e) || undefined}
                    />
                )}
                pagination={
                    <Pagination page={currentPage} totalPages={list.totalPages} total={list.total} limit={limit}
                        onPage={setCurrentPage} onLimit={(n) => { setLimit(n); setCurrentPage(1); }} />
                }
            />
        </>
    );
};

export default Audit;
