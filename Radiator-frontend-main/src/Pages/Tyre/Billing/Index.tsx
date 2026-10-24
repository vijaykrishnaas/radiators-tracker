import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import RecordPaymentModal from "../../../Components/RecordPaymentModal";
import { printTyreChallan } from "../../../Components/PrintTyreChallan";
import { useAlertMsg } from "../../../Services/AllServices";
import { getData, deleteData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money } from "../../../Utils/format";
import { fmtDate, itemsText, TUBE_LABEL, type TyreBill } from "../types";
import { payableRows, submitTyrePayment } from "../payment";
import { PageHeader, PaymentBadge, BusyOverlay, Badge } from "../../../Components/ui/Basics";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, emptyCopy, sortParams, type Column, type SortState } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

import * as XLSX from "xlsx";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];
const TYPE_OPTIONS = [
    { value: "full", label: "Full payment" },
    { value: "installment", label: "Installments" },
];

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;

// "Next due" cell: the earliest unpaid installment, red when it is already past.
const NextDue = ({ b }: { b: TyreBill }) => {
    if (b.paymentType !== "installment") return <span className="t-muted">Full payment</span>;
    if (!b.nextDue) return <span className="t-muted">All paid</span>;
    return (
        <span className={b.overdueCount > 0 ? "t-error t-semibold" : undefined}>
            {money(b.nextDue.amount)} · {fmtDate(b.nextDue.dueDate)}
            {b.overdueCount > 0 && <span className="d-block t-xs">{b.overdueCount} overdue · {money(b.overdueAmount)}</span>}
        </span>
    );
};

const TyreBilling = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const labels = settings.tyre.labels;

    const [busyLabel, setBusyLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [limit, setLimit] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const [searchText, setSearchText] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [status, setStatus] = useState("");
    const [paymentType, setPaymentType] = useState("");
    // The dashboard's "Overdue" link opens this list already filtered.
    const [overdue, setOverdueState] = useState(params.get("overdue") === "1");
    // The overdue filter lives in the address too (the dashboard links to ?overdue=1), so a reload or a shared link
    // shows the same list, and clearing it can't be undone by a reload.
    const setOverdue = (on: boolean) => {
        setOverdueState(on);
        setParams((p) => { const n = new URLSearchParams(p); if (on) n.set("overdue", "1"); else n.delete("overdue"); return n; }, { replace: true });
    };
    const [filtersKey, setFiltersKey] = useState(0);
    const [sort, setSort] = useState<SortState | null>(null);
    const [mechanics, setMechanics] = useState<string[]>([]);

    const [paymentItem, setPaymentItem] = useState<TyreBill | null>(null);
    const [deleteItem, setDeleteItem] = useState<TyreBill | null>(null);

    const buildParams = () => ({
        // One box searches D.C. no, vehicle, customer, phone, address, mechanic, workers, tyres, tyre numbers and notes.
        search: searchText,
        mechanicName: mechanic,
        fromDate,
        toDate,
        status,
        paymentType,
        overdue: overdue ? "1" : "",
    });

    const list = useRemoteList<TyreBill>(async () => {
        const res = await getData("tyrebills", { params: { page: currentPage, limit, ...buildParams(), ...sortParams(sort) } });
        return { rows: res.tyreBillData || [], total: res.totalRecords || 0, totalPages: res.totalPages || 1 };
    }, [limit, currentPage, searchText, mechanic, fromDate, toDate, status, paymentType, overdue, sort], { page: currentPage, setPage: setCurrentPage });

    useEffect(() => { getData("tyre-mechanic").then((r) => setMechanics(r.mechdata || [])).catch(() => {}); }, []);

    const activeCount = [mechanic, status, paymentType, fromDate, toDate].filter(Boolean).length + (searchText ? 1 : 0) + (overdue ? 1 : 0);
    const clearFilters = () => {
        setSearchText(""); setMechanic(""); setStatus(""); setPaymentType(""); setOverdue(false);
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };
    const setFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    const exportExcel = async () => {
        setBusyLabel("Preparing Excel…");
        try {
            const res = await getData("tyrebills/export", { params: { ...buildParams(), ...sortParams(sort) } });
            const all: TyreBill[] = res.tyreBillData || [];
            const challans = all.map((x) => ({
                "D.C. No": x.billNo,
                "Date": fmtDate(x.billDate),
                [labels.vehicleNo]: x.vehicleNumber,
                [labels.customer]: x.customerName || "",
                "Phone": x.phoneNumber || "",
                "Address": x.address || "",
                [labels.agent]: x.mechanicName || "",
                "Tyres": itemsText(x),
                "Payment": x.paymentType === "installment" ? "Installments" : "Full payment",
                "Tyre amount (₹)": x.tyreAmount,
                "Interest (₹)": x.interestTotal,
                "Discount (₹)": x.discount,
                "To collect (₹)": x.payableTotal,
                "Received (₹)": x.receivedAmount,
                "Pending (₹)": x.pendingAmount,
                "Overdue (₹)": x.overdueAmount,
                "Status": x.status,
            }));
            const tyres = all.flatMap((x) => x.items.map((i) => ({
                "D.C. No": x.billNo,
                "Date": fmtDate(x.billDate),
                "Brand": i.brandLabel,
                "Model / size": i.modelLabel,
                "Tyre number": i.tyreNumber,
                "Tube type": TUBE_LABEL[i.tubeType] || i.tubeType,
                "Flap": i.flap ? "Yes" : "No",
                "Qty": i.qty,
                "Rate (₹)": i.rate,
                "Amount (₹)": i.amount,
            })));
            const plan = all.filter((x) => x.paymentType === "installment").flatMap((x) => x.installments.map((r) => ({
                "D.C. No": x.billNo,
                [labels.customer]: x.customerName || "",
                "Phone": x.phoneNumber || "",
                "Installment": r.label,
                "Due date": fmtDate(r.dueDate),
                "Principal (₹)": r.principal,
                "Interest (₹)": r.interest,
                "Total (₹)": r.total,
                "Paid (₹)": r.paid,
                "Balance (₹)": r.balance,
                "Status": r.rowStatus,
            })));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(challans), "Challans");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tyres), "Tyres");
            if (plan.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plan), "Installments");
            XLSX.writeFile(wb, `challans-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setBusyLabel("");
        }
    };

    const handleRecordPayment = async (v: { amount: string; discount: string; mode: string; installmentId?: string }) => {
        if (!paymentItem) return;
        setSaving(true);
        const ok = await submitTyrePayment(paymentItem, v, callAlertMsg);
        setSaving(false);
        if (ok) { setPaymentItem(null); await list.reload(); }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setSaving(true);
            const res = await deleteData(`tyrebills/${deleteItem._id}`);
            callAlertMsg(res.message || "Challan deleted", "success");
            setDeleteItem(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete challan", "error");
        } finally {
            setSaving(false);
        }
    };

    const rowMenu = (o: TyreBill) => (
        <RowActions ariaLabel={`Actions for D.C. ${o.billNo}`} items={[
            { label: "View", icon: <Icons iconName="view" />, onClick: () => navigate(`/tyre/dashboard/view/${o._id}`) },
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => navigate(`/tyre/dashboard/edit/${o._id}`) },
            { label: "Print", icon: <Icons iconName="print" />, onClick: () => printTyreChallan(o, settings) },
            { label: "Record Payment", icon: <Icons iconName="currencyrupee" />, onClick: () => setPaymentItem(o), disabled: o.pendingAmount <= 0, reason: "Fully paid" },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteItem(o) },
        ]} />
    );

    const columns: Column<TyreBill>[] = [
        { key: "billNo", sortKey: "billNo", header: "D.C. No", className: "nowrap tabular t-semibold", cell: (o) => o.billNo },
        { key: "date", sortKey: "date", header: "Date", className: "nowrap tabular", cell: (o) => fmtDate(o.billDate) },
        { key: "vehicle", sortKey: "vehicle", header: labels.vehicleNo, className: "key nowrap", cell: (o) => o.vehicleNumber },
        { key: "customer", sortKey: "customer", header: labels.customer, className: "text", cell: (o) => o.customerName || "—" },
        { key: "items", header: "Tyres", className: "text-wide", cell: (o) => itemsText(o) },
        { key: "due", sortKey: "due", header: "Next due", className: "nowrap", cell: (o) => <NextDue b={o} /> },
        { key: "total", sortKey: "total", header: "To collect", className: "num", cell: (o) => money(o.payableTotal) },
        { key: "rec", sortKey: "rec", header: "Received", className: "num", cell: (o) => money(o.receivedAmount) },
        { key: "pend", sortKey: "pend", header: "Pending", className: "num", cell: (o) => <span className={o.pendingAmount > 0 ? "t-error t-semibold" : undefined}>{money(o.pendingAmount)}</span> },
        { key: "status", sortKey: "status", header: "Status", className: "nowrap", cell: (o) => <PaymentBadge status={o.status} /> },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: (o) => rowMenu(o) },
    ];

    const mechanicOptions = mechanics.map((m) => ({ value: m, label: m }));

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            search={<SearchInput value={searchText} key={filtersKey} id="ty-search" label="Search" placeholder="Search D.C. no, vehicle, customer, tyre no…" onSearch={setFilter(setSearchText)} />}
            filters={[
                { id: "f-status", label: "Status", primary: true, node: <Selector inputId="f-status" isClearable options={STATUS_OPTIONS} placeholder="-- All Status --" value={opt(STATUS_OPTIONS, status)} onChange={(o: any) => setFilter(setStatus)(o ? o.value : "")} /> },
                { id: "f-type", label: "Payment", primary: true, node: <Selector inputId="f-type" isClearable options={TYPE_OPTIONS} placeholder="-- All --" value={opt(TYPE_OPTIONS, paymentType)} onChange={(o: any) => setFilter(setPaymentType)(o ? o.value : "")} /> },
                {
                    id: "f-overdue", label: "Installments", node: (
                        <label className="form-check d-flex align-items-center gap-2 m-0" htmlFor="f-overdue">
                            <input id="f-overdue" type="checkbox" className="form-check-input m-0" checked={overdue}
                                onChange={(e) => { setOverdue(e.target.checked); setCurrentPage(1); }} />
                            Overdue only
                        </label>
                    ),
                },
                { id: "f-mech", label: labels.agent, node: <Selector inputId="f-mech" isClearable options={mechanicOptions} placeholder="-- All --" value={opt(mechanicOptions, mechanic)} onChange={(o: any) => setFilter(setMechanic)(o ? o.value : "")} /> },
                { id: "from-date", label: "From", node: <input id="from-date" type="date" className="form-control" value={fromDate} max={toDate || undefined} onChange={(e) => setFilter(setFromDate)(e.target.value)} /> },
                { id: "to-date", label: "To", node: <input id="to-date" type="date" className="form-control" min={fromDate || undefined} value={toDate} onChange={(e) => setFilter(setToDate)(e.target.value)} /> },
            ]}
        />
    );

    const filtered = activeCount > 0;
    return (
        <>
            <BusyOverlay show={!!busyLabel} label={busyLabel} />
            <PageHeader
                title="Challans"
                actions={[{ label: "Excel", icon: "exporticon", onClick: exportExcel, disabled: !!busyLabel, collapse: true }]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/tyre/dashboard/create")}>
                        <Icons iconName="add" />New Challan
                    </button>
                }
            />

            <DataList<TyreBill>
                caption="Delivery challans"
                sort={sort}
                onSort={(next) => { setSort(next); setCurrentPage(1); }}
                toolbar={filterBar}
                rows={list.rows}
                rowKey={(o) => o._id}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load challans"
                empty={emptyCopy({
                    filtered,
                    noun: "challans",
                    noDataText: "Create your first delivery challan and it will show up here.",
                    noMatchText: "Try a different search, status or date range.",
                    onClear: clearFilters,
                    action: <button type="button" className="btn btn-primary" onClick={() => navigate("/tyre/dashboard/create")}><Icons iconName="add" />New Challan</button>,
                })}
                mobileCard={(o) => (
                    <MobileCard
                        title={o.vehicleNumber}
                        to={`/tyre/dashboard/view/${o._id}`}
                        badge={o.overdueCount > 0 ? <Badge tone="error" dot>Overdue</Badge> : <PaymentBadge status={o.status} />}
                        menu={rowMenu(o)}
                        meta={[fmtDate(o.billDate), `D.C. ${o.billNo}`, o.paymentType === "installment" ? "Installments" : "Full payment"]}
                        meta2={[o.customerName, itemsText(o)].filter(Boolean).join(" · ") || undefined}
                        amounts={[
                            { label: "To collect", value: money(o.payableTotal) },
                            { label: "Received", value: money(o.receivedAmount) },
                            { label: "Pending", value: money(o.pendingAmount), tone: o.pendingAmount > 0 ? "error" : undefined },
                        ]}
                    />
                )}
                pagination={
                    <Pagination page={currentPage} totalPages={list.totalPages} total={list.total} limit={limit}
                        onPage={setCurrentPage} onLimit={(n) => { setLimit(n); setCurrentPage(1); }} />
                }
            />

            <RecordPaymentModal
                open={!!paymentItem}
                title={`Record Payment — D.C. ${paymentItem?.billNo ?? ""}`}
                totalLabel="To collect"
                total={paymentItem?.payableTotal || 0}
                received={paymentItem?.receivedAmount || 0}
                pending={paymentItem?.pendingAmount || 0}
                withMode
                installments={paymentItem ? payableRows(paymentItem) : undefined}
                initialInstallmentId={paymentItem?.nextDue?.id}
                busy={saving}
                onClose={() => setPaymentItem(null)}
                onSubmit={handleRecordPayment}
            />

            <ConfirmDialog
                open={!!deleteItem}
                title="Delete Challan"
                message={deleteItem && <>Delete D.C. <span className="t-strong t-semibold">{deleteItem.billNo}</span> for {deleteItem.vehicleNumber}{deleteItem.receivedAmount > 0 ? `, with ${money(deleteItem.receivedAmount)} already received` : ""}? This cannot be undone.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={handleDelete}
                onCancel={() => setDeleteItem(null)}
            />
        </>
    );
};

export default TyreBilling;
