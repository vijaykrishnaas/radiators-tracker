import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import RecordPaymentModal from "../../../Components/RecordPaymentModal";
import { useAlertMsg } from "../../../Services/AllServices";
import { getData, postData, deleteData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { printEngInvoice } from "../../../Components/PrintEngInvoice";
import { money } from "../../../Utils/format";
import { STATUS_OPTIONS as ENG_STATUS, bsLabel, type EngBill } from "../types";
import { PageHeader, PaymentBadge, Badge, BusyOverlay } from "../../../Components/ui/Basics";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, type Column } from "../../../Components/ui/DataList";
import { useRemoteList } from "../../../Components/ui/useRemoteList";

import * as XLSX from "xlsx";

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");
const typeNames = (x: EngBill) => Array.from(new Set((x.services || []).map((s) => s.typeLabel || s.type)));

const EngBilling = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();

    const [busyLabel, setBusyLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [limit, setLimit] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const [searchText, setSearchText] = useState("");
    const [mechanicNameList, setmechanicName] = useState<string[]>([]);
    const [searchMechanicName, setsearchMechanicName] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [searchStatus, setSearchStatus] = useState("");
    const [searchType, setSearchType] = useState("");
    const [searchBs, setSearchBs] = useState("");
    const [filtersKey, setFiltersKey] = useState(0);

    const [paymentItem, setPaymentItem] = useState<EngBill | null>(null);
    const [deleteItem, setDeleteItem] = useState<EngBill | null>(null);

    const labels = { vehicleNo: "Truck Number", agent: "Mechanic" };
    const typesText = (x: EngBill) => typeNames(x).join(", ");
    const itemsText = (x: EngBill) => (x.services || []).map((s) => `${s.typeLabel || s.type}${s.bsModel ? " " + bsLabel(settings, s.bsModel) : ""}: ${s.items.map((i) => (i.requiresComment && i.comment ? i.comment : i.label)).join(", ")}`).join(" | ");

    const buildParams = () => ({
        vehicleNo: searchText,
        mechanic: searchMechanicName,
        serviceType: searchType,
        bsModel: searchBs,
        fromDate,
        toDate,
        status: searchStatus,
    });

    const list = useRemoteList<EngBill>(async () => {
        const res = await getData("engbills", { params: { page: currentPage, limit, ...buildParams() } });
        return { rows: res.bills || [], total: res.totalRecords || 0, totalPages: res.totalPages || 1 };
    }, [limit, currentPage, searchText, searchMechanicName, fromDate, toDate, searchStatus, searchType, searchBs]);

    const activeCount = [searchMechanicName, searchStatus, searchType, searchBs, fromDate, toDate].filter(Boolean).length + (searchText ? 1 : 0);
    const hasFilters = activeCount > 0;
    const clearFilters = () => {
        setSearchText(""); setsearchMechanicName(""); setSearchStatus(""); setSearchType(""); setSearchBs("");
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };
    const setFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    useEffect(() => {
        getData("engbills/mechanics").then((res) => setmechanicName(res.mechanics || [])).catch((err) => console.error(err));
    }, []);

    const fetchAllForExport = async (): Promise<EngBill[]> => {
        const res = await getData("engbills/export", { params: buildParams() });
        return res.bills || [];
    };

    const handleRecordPayment = async ({ amount: a, discount: d, mode }: { amount: string; discount: string; mode: string }) => {
        if (!paymentItem) return;
        const amount = Number(a) || 0;
        const discount = Number(d) || 0;
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
            const res = await postData(`engbills/${paymentItem._id}/payment`, {
                amount,
                // The API sets the bill's total discount; the modal's field is an extra discount on top of any existing one.
                discount: discount > 0 ? (Number(paymentItem.discount) || 0) + discount : undefined,
                mode,
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
            const res = await deleteData(`engbills/${deleteItem._id}`);
            callAlertMsg(res.message || "Record deleted", "success");
            setDeleteItem(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete record", "error");
        } finally {
            setSaving(false);
        }
    };

    const exportExcel = async () => {
        setBusyLabel("Preparing Excel…");
        try {
            const all = await fetchAllForExport();
            const exportData = all.map((x) => ({
                "Date": x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
                "Bill No": x.billNo,
                "Truck Number": x.vehicleNo,
                "Lorry Address": x.lorryAddress || "",
                "Mechanic": x.mechanic,
                "Service Types": typesText(x),
                "Items": itemsText(x),
                "Total (₹)": x.total,
                "Discount (₹)": x.discount ?? 0,
                "Net (₹)": x.netTotal,
                "Received (₹)": x.amountReceived,
                "Balance (₹)": x.balance,
                "Phone": x.phone || "",
                "Status": x.paymentStatus,
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Records");
            XLSX.writeFile(wb, `engineering-billing-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setBusyLabel("");
        }
    };

    const rowMenu = (o: EngBill) => (
        <RowActions ariaLabel={`Actions for ${o.vehicleNo}`} items={[
            { label: "View", icon: <Icons iconName="view" />, onClick: () => navigate(`/engineering/dashboard/view/${o._id}`) },
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => navigate(`/engineering/dashboard/edit/${o._id}`) },
            { label: "Print", icon: <Icons iconName="print" />, onClick: () => printEngInvoice(o, settings) },
            { label: "Record Payment", icon: <Icons iconName="currencyrupee" />, onClick: () => setPaymentItem(o), disabled: o.balance <= 0, reason: "Fully paid" },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteItem(o) },
        ]} />
    );

    const columns: Column<EngBill>[] = [
        { key: "si", header: "SI No", className: "nowrap tabular", cell: (_o, i) => (currentPage - 1) * limit + i + 1 },
        { key: "date", header: "Date", className: "nowrap tabular", cell: (o) => fmtDate(o.billDate) },
        { key: "bill", header: "Bill No", className: "nowrap tabular", cell: (o) => o.billNo },
        { key: "truck", header: labels.vehicleNo, className: "key nowrap", cell: (o) => o.vehicleNo },
        { key: "mech", header: labels.agent, className: "text", cell: (o) => o.mechanic },
        { key: "types", header: "Types", cell: (o) => (
            <span className="d-inline-flex flex-wrap gap-1">{typeNames(o).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
        ) },
        { key: "total", header: "Total", className: "num", cell: (o) => money(o.netTotal) },
        { key: "rec", header: "Received", className: "num", cell: (o) => money(o.amountReceived) },
        { key: "bal", header: "Balance", className: "num", cell: (o) => <span className={o.balance > 0 ? "t-error t-semibold" : undefined}>{money(o.balance)}</span> },
        { key: "status", header: "Status", className: "nowrap", cell: (o) => <PaymentBadge status={o.paymentStatus} /> },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: (o) => rowMenu(o) },
    ];

    const mechanicOptions = mechanicNameList.map((m) => ({ value: m, label: m }));
    const typeOptions = (settings.engineering?.serviceTypes || []).map((t) => ({ value: t.value, label: t.label }));
    const bsOptions = (settings.engineering?.bsModels || []).map((b) => ({ value: b.value, label: b.label }));

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            search={<SearchInput key={filtersKey} id="bill-search" label="Search" placeholder={`Search ${labels.vehicleNo}...`} onSearch={setFilter(setSearchText)} />}
            filters={[
                { id: "f-mech", label: labels.agent, primary: true, node: <Selector inputId="f-mech" isClearable options={mechanicOptions} placeholder="-- All --" value={opt(mechanicOptions, searchMechanicName)} onChange={(o: any) => setFilter(setsearchMechanicName)(o ? o.value : "")} /> },
                { id: "f-status", label: "Status", primary: true, node: <Selector inputId="f-status" isClearable options={ENG_STATUS} placeholder="-- All Status --" value={opt(ENG_STATUS, searchStatus)} onChange={(o: any) => setFilter(setSearchStatus)(o ? o.value : "")} /> },
                { id: "f-type", label: "Service type", node: <Selector inputId="f-type" isClearable options={typeOptions} placeholder="-- All --" value={opt(typeOptions, searchType)} onChange={(o: any) => setFilter(setSearchType)(o ? o.value : "")} /> },
                { id: "f-bs", label: "BS model", node: <Selector inputId="f-bs" isClearable options={bsOptions} placeholder="-- All --" value={opt(bsOptions, searchBs)} onChange={(o: any) => setFilter(setSearchBs)(o ? o.value : "")} /> },
                { id: "from-date", label: "From", node: <input id="from-date" type="date" className="form-control" value={fromDate} max={toDate || undefined} onChange={(e) => setFilter(setFromDate)(e.target.value)} /> },
                { id: "to-date", label: "To", node: <input id="to-date" type="date" className="form-control" min={fromDate || undefined} value={toDate} onChange={(e) => setFilter(setToDate)(e.target.value)} /> },
            ]}
        />
    );

    const newService = () => navigate("/engineering/dashboard/create");

    return (
        <>
            <BusyOverlay show={!!busyLabel} label={busyLabel} />
            <PageHeader
                title="Bills"
                actions={[{ label: "Excel", icon: "exporticon", onClick: exportExcel, disabled: !!busyLabel, collapse: true }]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={newService}>
                        <Icons iconName="add" />Add New
                    </button>
                }
            />

            <DataList<EngBill>
                caption="Bills"
                toolbar={filterBar}
                rows={list.rows}
                rowKey={(o) => o._id}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load bills"
                empty={hasFilters ? {
                    title: "No bills match these filters",
                    text: "Try a different truck number, mechanic or date range.",
                    action: <button type="button" className="btn btn-link" onClick={clearFilters}>Clear filters</button>,
                } : {
                    title: "No bills yet",
                    text: "Create your first service bill and it will show up here.",
                    action: <button type="button" className="btn btn-primary" onClick={newService}><Icons iconName="add" />New service</button>,
                }}
                mobileCard={(o) => (
                    <MobileCard
                        title={o.vehicleNo}
                        to={`/engineering/dashboard/view/${o._id}`}
                        badge={<PaymentBadge status={o.paymentStatus} />}
                        menu={rowMenu(o)}
                        meta={[fmtDate(o.billDate), `Bill ${o.billNo}`, o.mechanic]}
                        meta2={typeNames(o).join(", ")}
                        amounts={[
                            { label: "Total", value: money(o.netTotal) },
                            { label: "Received", value: money(o.amountReceived) },
                            { label: "Balance", value: money(o.balance), tone: o.balance > 0 ? "error" : undefined },
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
                title={`Record Payment — ${paymentItem?.vehicleNo ?? ""} (Bill ${paymentItem?.billNo ?? ""})`}
                totalLabel="Net total"
                total={paymentItem?.netTotal || 0}
                received={paymentItem?.amountReceived || 0}
                pending={paymentItem?.balance || 0}
                withMode
                discountHelpInline={false}
                busy={saving}
                onClose={() => setPaymentItem(null)}
                onSubmit={handleRecordPayment}
            />

            <ConfirmDialog
                open={!!deleteItem}
                title="Delete Record"
                message={deleteItem && <>Delete bill for <span className="t-strong t-semibold">{deleteItem.vehicleNo} (Bill {deleteItem.billNo})</span>{deleteItem.billDate ? ` dated ${fmtDate(deleteItem.billDate)}` : ""}? This cannot be undone.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={handleDelete}
                onCancel={() => setDeleteItem(null)}
            />
        </>
    );
};

export default EngBilling;
