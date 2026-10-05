import React, { useState } from "react";

import Selector from "../../../Components/Selector";
import { getData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { actionLabel, clientActionOptions, detailText, type AuditEntry } from "../../../Constants/auditActions";
import { PageHeader, Badge } from "../../../Components/ui/Basics";
import { FilterBar } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, emptyCopy, type Column } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN");
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-IN");

const ActionBadge = ({ action }: { action: string }) => {
    const label = actionLabel(action);
    return <Badge tone="neutral">{label ?? <span className="t-mono">{action}</span>}</Badge>;
};

const ClientAudit: React.FC = () => {
    const { settings } = useSettings();
    const actionOptions = clientActionOptions(settings.businessType);

    const [action, setAction] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const list = useRemoteList<AuditEntry>(async () => {
        const res = await getData("audit", {
            params: { page: currentPage, limit, action, from: fromDate, to: toDate },
        });
        return { rows: res.entries || [], total: res.total || 0, totalPages: res.totalPages || 1 };
    }, [currentPage, limit, action, fromDate, toDate]);

    const activeCount = [action, fromDate, toDate].filter(Boolean).length;
    const clearFilters = () => { setAction(""); setFromDate(""); setToDate(""); setCurrentPage(1); };

    const columns: Column<AuditEntry>[] = [
        {
            key: "when", header: "When", className: "nowrap",
            cell: (e) => (
                <>
                    <div className="tabular">{fmtDate(e.at)}</div>
                    <div className="t-xs t-muted tabular">{fmtTime(e.at)}</div>
                </>
            ),
        },
        { key: "action", header: "Action", className: "nowrap", cell: (e) => <ActionBadge action={e.action} /> },
        { key: "by", header: "By", className: "text", cell: (e) => e.actorUserId || "—" },
        { key: "details", header: "Details", className: "text-wide t-muted", cell: (e) => detailText(e) || "—" },
    ];

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            filters={[
                {
                    id: "au-action", label: "Action", primary: true,
                    node: <Selector inputId="au-action" isClearable options={actionOptions} placeholder="-- All Actions --"
                        value={actionOptions.find((o) => o.value === action) || null}
                        onChange={(o: any) => { setAction(o ? o.value : ""); setCurrentPage(1); }} />,
                },
                {
                    id: "au-from", label: "From", primary: true,
                    node: <input id="au-from" type="date" className="form-control" value={fromDate} max={toDate || undefined}
                        onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} />,
                },
                {
                    id: "au-to", label: "To", primary: true,
                    node: <input id="au-to" type="date" className="form-control" value={toDate} min={fromDate || undefined}
                        onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} />,
                },
            ]}
        />
    );

    return (
        <>
            <PageHeader title="Activity log" />
            <DataList<AuditEntry>
                caption="Activity log"
                toolbar={filterBar}
                rows={list.rows}
                rowKey={(e, i) => `${e.at}-${e.action}-${i}`}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load the activity log"
                empty={emptyCopy({
                    filtered: activeCount > 0,
                    noun: "activity",
                    noDataText: "Actions taken in your account will show up here.",
                    noMatchText: "Try a different action or date range.",
                    onClear: clearFilters,
                })}
                mobileCard={(e) => (
                    <MobileCard
                        title={<ActionBadge action={e.action} />}
                        meta={[`${fmtDate(e.at)} ${fmtTime(e.at)}`, e.actorUserId]}
                    >
                        {detailText(e) && <p className="t-sm mb-0">{detailText(e)}</p>}
                    </MobileCard>
                )}
                pagination={
                    <Pagination page={currentPage} totalPages={list.totalPages} total={list.total} limit={limit}
                        onPage={setCurrentPage} onLimit={(n) => { setLimit(n); setCurrentPage(1); }} />
                }
            />
        </>
    );
};

export default ClientAudit;
