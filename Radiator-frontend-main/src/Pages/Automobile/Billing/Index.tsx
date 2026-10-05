import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import RecordPaymentModal from "../../../Components/RecordPaymentModal";
import { useAlertMsg } from "../../../Services/AllServices";
import { getData, postData, deleteData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { printAutoInvoice } from "../../../Components/PrintInvoice";
import { money } from "../../../Utils/format";
import { AutoBillRecord, itemsText } from "../types";
import { PageHeader, PaymentBadge, BusyOverlay } from "../../../Components/ui/Basics";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, emptyCopy, type Column } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

import * as XLSX from "xlsx";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");

const AutoBilling = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const labels = settings.automobile.labels;

    const [busyLabel, setBusyLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [limit, setLimit] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const [searchText, setSearchText] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [status, setStatus] = useState("");
    const [filtersKey, setFiltersKey] = useState(0);
    const [mechanics, setMechanics] = useState<string[]>([]);

    const [paymentItem, setPaymentItem] = useState<AutoBillRecord | null>(null);
    const [deleteItem, setDeleteItem] = useState<AutoBillRecord | null>(null);

    const buildParams = () => ({
        vehicleNumber: searchText,
        mechanicName: mechanic,
        fromDate,
        toDate,
        status,
    });

    const list = useRemoteList<AutoBillRecord>(async () => {
        const res = await getData("autobills", { params: { page: currentPage, limit, ...buildParams() } });
        return { rows: res.autoBillData || [], total: res.totalRecords || 0, totalPages: res.totalPages || 1 };
    }, [limit, currentPage, searchText, mechanic, fromDate, toDate, status]);

    useEffect(() => { getData("auto-mechanic").then((r) => setMechanics(r.mechdata || [])).catch(() => {}); }, []);

    const activeCount = [mechanic, status, fromDate, toDate].filter(Boolean).length + (searchText ? 1 : 0);
    const clearFilters = () => {
        setSearchText(""); setMechanic(""); setStatus("");
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };
    const setFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    const fetchAllForExport = async (): Promise<AutoBillRecord[]> => {
        const res = await getData("autobills/export", { params: buildParams() });
        return res.autoBillData || [];
    };

    const exportExcel = async () => {
        setBusyLabel("Preparing Excel…");
        try {
            const all = await fetchAllForExport();
            const exportData = all.map((x) => ({
                "Date": x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
                "Bill No": x.billNo,
                [labels.vehicleNo]: x.vehicleNumber,
                [labels.customer]: x.customerName || "",
                "Mechanic": x.mechanicName,
                "Items": itemsText(x),
                "Total (₹)": x.totalAmount,
                "Discount (₹)": x.discount ?? 0,
                "Received (₹)": x.receivedAmount,
                "Pending (₹)": x.pendingAmount,
                "Phone": x.phoneNumber,
                "Status": x.status,
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Records");
            XLSX.writeFile(wb, `billing-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setBusyLabel("");
        }
    };

    const handleRecordPayment = async ({ amount: a, discount: dsc }: { amount: string; discount: string }) => {
        if (!paymentItem) return;
        const amount = Number(a) || 0;
        const discount = Number(dsc) || 0;
        if (amount <= 0 && discount <= 0) {
            callAlertMsg("Enter a payment amount and/or a discount", "error");
            return;
        }
        if (amount < 0 || discount < 0) {
            callAlertMsg("Amount and discount must not be negative", "error");
            return;
        }
        try {
            setSaving(true);
            const res = await postData(`autobills/${paymentItem._id}/payment`, {
                amount,
                // The API sets the bill's total discount (a missing value becomes 0), so always send
                // the existing discount plus the extra one entered in this modal.
                discount: (Number(paymentItem.discount) || 0) + discount,
            });
            callAlertMsg(res.message || "Payment recorded", "success");
            setPaymentItem(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record payment", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setSaving(true);
            const res = await deleteData(`autobills/${deleteItem._id}`);
            callAlertMsg(res.message || "Record deleted", "success");
            setDeleteItem(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete record", "error");
        } finally {
            setSaving(false);
        }
    };

    const rowMenu = (o: AutoBillRecord) => (
        <RowActions ariaLabel={`Actions for ${o.vehicleNumber}`} items={[
            { label: "View", icon: <Icons iconName="view" />, onClick: () => navigate(`/automobile/dashboard/view/${o._id}`) },
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => navigate(`/automobile/dashboard/edit/${o._id}`) },
            { label: "Print", icon: <Icons iconName="print" />, onClick: () => printAutoInvoice(o, settings) },
            { label: "Record Payment", icon: <Icons iconName="currencyrupee" />, onClick: () => setPaymentItem(o), disabled: o.pendingAmount <= 0, reason: "Fully paid" },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteItem(o) },
        ]} />
    );

    const columns: Column<AutoBillRecord>[] = [
        { key: "si", header: "SI No", className: "nowrap tabular", cell: (_o, i) => (currentPage - 1) * limit + i + 1 },
        { key: "date", header: "Date", className: "nowrap tabular", cell: (o) => fmtDate(o.billDate) },
        { key: "billNo", header: "Bill No", className: "num", cell: (o) => o.billNo },
        { key: "vehicle", header: labels.vehicleNo, className: "key nowrap", cell: (o) => o.vehicleNumber },
        { key: "customer", header: labels.customer, className: "text", cell: (o) => o.customerName || "—" },
        { key: "agent", header: labels.agent, className: "text", cell: (o) => o.mechanicName },
        { key: "items", header: "Items", className: "text-wide", cell: (o) => itemsText(o) },
        { key: "total", header: "Total", className: "num", cell: (o) => money(o.totalAmount) },
        { key: "rec", header: "Received", className: "num", cell: (o) => money(o.receivedAmount) },
        { key: "pend", header: "Pending", className: "num", cell: (o) => <span className={o.pendingAmount > 0 ? "t-error t-semibold" : undefined}>{money(o.pendingAmount)}</span> },
        { key: "status", header: "Status", className: "nowrap", cell: (o) => <PaymentBadge status={o.status} /> },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: (o) => rowMenu(o) },
    ];

    const mechanicOptions = mechanics.map((m) => ({ value: m, label: m }));

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            search={<SearchInput key={filtersKey} id="bill-search" label="Search" placeholder={`Search ${labels.vehicleNo}...`} onSearch={setFilter(setSearchText)} />}
            filters={[
                { id: "f-mech", label: labels.agent, primary: true, node: <Selector inputId="f-mech" isClearable options={mechanicOptions} placeholder="-- All --" value={opt(mechanicOptions, mechanic)} onChange={(o: any) => setFilter(setMechanic)(o ? o.value : "")} /> },
                { id: "f-status", label: "Status", primary: true, node: <Selector inputId="f-status" isClearable options={STATUS_OPTIONS} placeholder="-- All Status --" value={opt(STATUS_OPTIONS, status)} onChange={(o: any) => setFilter(setStatus)(o ? o.value : "")} /> },
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
                title="Bills"
                actions={[
                    { label: "Excel", icon: "exporticon", onClick: exportExcel, disabled: !!busyLabel, collapse: true },
                ]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/automobile/dashboard/create")}>
                        <Icons iconName="add" />Add New
                    </button>
                }
            />

            <DataList<AutoBillRecord>
                caption="Bills"
                toolbar={filterBar}
                rows={list.rows}
                rowKey={(o) => o._id}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load bills"
                empty={emptyCopy({
                    filtered,
                    noun: "bills",
                    noDataText: "Create your first bill and it will show up here.",
                    noMatchText: `Try a different ${labels.vehicleNo}, ${labels.agent} or date range.`,
                    onClear: clearFilters,
                    action: <button type="button" className="btn btn-primary" onClick={() => navigate("/automobile/dashboard/create")}><Icons iconName="add" />Add New</button>,
                })}
                mobileCard={(o) => (
                    <MobileCard
                        title={o.vehicleNumber}
                        to={`/automobile/dashboard/view/${o._id}`}
                        badge={<PaymentBadge status={o.status} />}
                        menu={rowMenu(o)}
                        meta={[fmtDate(o.billDate), `Bill ${o.billNo}`, o.mechanicName]}
                        meta2={o.customerName || undefined}
                        amounts={[
                            { label: "Total", value: money(o.totalAmount) },
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
                title={`Record Payment — ${paymentItem?.vehicleNumber ?? ""}`}
                total={paymentItem?.totalAmount || 0}
                received={paymentItem?.receivedAmount || 0}
                pending={paymentItem?.pendingAmount || 0}
                busy={saving}
                onClose={() => setPaymentItem(null)}
                onSubmit={handleRecordPayment}
            />

            <ConfirmDialog
                open={!!deleteItem}
                title="Delete Record"
                message={deleteItem && <>Delete bill for <span className="t-strong t-semibold">{deleteItem.vehicleNumber}</span>{deleteItem.billDate ? ` dated ${fmtDate(deleteItem.billDate)}` : ""}? This cannot be undone.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={handleDelete}
                onCancel={() => setDeleteItem(null)}
            />
        </>
    );
};

export default AutoBilling;
