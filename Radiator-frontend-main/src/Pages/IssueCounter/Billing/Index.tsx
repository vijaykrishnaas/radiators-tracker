import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import RecordPaymentModal from "../../../Components/RecordPaymentModal";
import { useAlertMsg } from "../../../Services/AllServices";
import { getData, postData, deleteData } from "../../../Services/ApiServices";
import { getUser } from "../../../Services/Auth";
import { useSettings } from "../../../Context/SettingsContext";
import { printInvoice, printReport } from "../../../Components/PrintInvoice";
import { money } from "../../../Utils/format";
import { RadiatorRecord, serviceDisplay } from "../Dashboard/Index";
import { PageHeader, PaymentBadge, BusyOverlay } from "../../../Components/ui/Basics";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, emptyCopy, type Column } from "../../../Components/ui/DataList";
import { Popover } from "../../../Components/ui/Menu";
import { useRemoteList } from "../../../Components/ui/useRemoteList";
import { storage } from "../../../Components/ui/hooks";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const servicesText = (record: RadiatorRecord) =>
    record.serviceInfo?.map(serviceDisplay).join(", ") || "—";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const DEFAULT_COLUMNS = {
    date: true,
    truckNumber: true,
    transportName: true,
    radiatorType: true,
    mechanicName: true,
    services: true,
    totalAmount: true,
    receivedAmount: true,
    pendingAmount: true,
    phoneNumber: true,
    status: true,
};
type ColKey = keyof typeof DEFAULT_COLUMNS;

const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");

const Billing = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const L = settings.labels;

    const [busyLabel, setBusyLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [limit, setLimit] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const [searchText, setSearchText] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [status, setStatus] = useState("");
    const [product, setProduct] = useState("");
    const [service, setService] = useState("");
    const [filtersKey, setFiltersKey] = useState(0);
    const [mechanics, setMechanics] = useState<string[]>([]);

    const [paymentItem, setPaymentItem] = useState<RadiatorRecord | null>(null);
    const [deleteItem, setDeleteItem] = useState<RadiatorRecord | null>(null);

    // Column visibility, persisted per tenant (spec §4.7).
    const colsKey = `billCols:${getUser()?.code || "default"}`;
    const [visible, setVisible] = useState<Record<ColKey, boolean>>(() => {
        try { return { ...DEFAULT_COLUMNS, ...JSON.parse(storage.get(colsKey) || "{}") }; } catch { return DEFAULT_COLUMNS; }
    });
    const setCols = (next: Record<ColKey, boolean>) => { setVisible(next); storage.set(colsKey, JSON.stringify(next)); };

    const buildParams = () => ({
        truckNumber: searchText,
        mechanicName: mechanic,
        fromDate,
        toDate,
        status,
        radiatorType: product,
        serviceType: service,
    });

    const list = useRemoteList<RadiatorRecord>(async () => {
        const res = await getData("radiators", { params: { page: currentPage, limit, ...buildParams() } });
        return { rows: res.radiatorData || [], total: res.totalRecords || 0, totalPages: res.totalPages || 1 };
    }, [limit, currentPage, searchText, mechanic, fromDate, toDate, status, product, service]);

    useEffect(() => { getData("mechanic").then((r) => setMechanics(r.mechdata || [])).catch(() => {}); }, []);

    const activeCount = [mechanic, product, service, status, fromDate, toDate].filter(Boolean).length + (searchText ? 1 : 0);
    const clearFilters = () => {
        setSearchText(""); setMechanic(""); setStatus(""); setProduct(""); setService("");
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };
    const setFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    const fetchAllForExport = async (): Promise<RadiatorRecord[]> => {
        const res = await getData("radiators/export", { params: buildParams() });
        return res.radiatorData || [];
    };

    const withBusy = async (label: string, fn: () => Promise<void>, failMsg: string) => {
        setBusyLabel(label);
        try { await fn(); } catch (err: any) { callAlertMsg(err?.message || failMsg, "error"); } finally { setBusyLabel(""); }
    };

    const exportExcel = () => withBusy("Preparing Excel…", async () => {
        const all = await fetchAllForExport();
        const exportData = all.map((x) => ({
            "Date": x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
            [L.vehicleNo]: x.truckNumber,
            [L.party]: x.transportName,
            [L.product]: x.radiatorType,
            "Mechanic": x.mechanicName,
            "Services": servicesText(x),
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
    }, "Export failed");

    const exportPDF = () => withBusy("Preparing PDF…", async () => {
        const all = await fetchAllForExport();
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(14);
        doc.text(`${settings.company.name} — Billing`, 14, 14);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 20);
        autoTable(doc, {
            startY: 26,
            head: [["Date", L.vehicleNo, L.party, "Mechanic", "Services", "Total", "Discount", "Received", "Pending", "Status"]],
            body: all.map((x) => [
                x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
                x.truckNumber, x.transportName, x.mechanicName,
                servicesText(x), x.totalAmount, x.discount ?? 0, x.receivedAmount, x.pendingAmount, x.status,
            ]),
            headStyles: { fillColor: settings.branding.primaryColor },
            styles: { fontSize: 8 },
        });
        doc.save(`billing-${new Date().toISOString().slice(0, 10)}.pdf`);
    }, "Export failed");

    const handleReport = () => withBusy("Preparing report…", async () => {
        const all = await fetchAllForExport();
        printReport(all, { from: fromDate, to: toDate }, settings);
    }, "Report failed");

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
            const res = await postData(`radiators/${paymentItem._id}/payment`, {
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
            const res = await deleteData(`radiators/${deleteItem._id}`);
            callAlertMsg(res.message || "Record deleted", "success");
            setDeleteItem(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete record", "error");
        } finally {
            setSaving(false);
        }
    };

    const rowMenu = (o: RadiatorRecord) => (
        <RowActions ariaLabel={`Actions for ${o.truckNumber}`} items={[
            { label: "View", icon: <Icons iconName="view" />, onClick: () => navigate(`/issueCounter/dashboard/view/${o._id}`) },
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => navigate(`/issueCounter/dashboard/edit/${o._id}`) },
            { label: "Print", icon: <Icons iconName="print" />, onClick: () => printInvoice(o, settings) },
            { label: "Record Payment", icon: <Icons iconName="currencyrupee" />, onClick: () => setPaymentItem(o), disabled: o.pendingAmount <= 0, reason: "Fully paid" },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteItem(o) },
        ]} />
    );

    const columnLabels: Record<ColKey, string> = {
        date: "Date",
        truckNumber: L.vehicleNo,
        transportName: L.party,
        radiatorType: L.product,
        mechanicName: "Mechanic",
        services: "Services",
        totalAmount: "Total",
        receivedAmount: "Received",
        pendingAmount: "Pending",
        phoneNumber: "Phone",
        status: "Status",
    };

    const allColumns: (Column<RadiatorRecord> & { col?: ColKey })[] = [
        { key: "si", header: "SI No", className: "nowrap tabular", cell: (_o, i) => (currentPage - 1) * limit + i + 1 },
        { key: "date", col: "date", header: "Date", className: "nowrap tabular", cell: (o) => fmtDate(o.billDate) },
        { key: "truck", col: "truckNumber", header: L.vehicleNo, className: "key nowrap", cell: (o) => o.truckNumber },
        { key: "party", col: "transportName", header: L.party, className: "text", cell: (o) => o.transportName },
        { key: "product", col: "radiatorType", header: L.product, cell: (o) => o.radiatorType },
        { key: "mech", col: "mechanicName", header: "Mechanic", className: "text", cell: (o) => o.mechanicName },
        { key: "svc", col: "services", header: "Services", className: "text-wide", cell: (o) => servicesText(o) },
        { key: "total", col: "totalAmount", header: "Total", className: "num", cell: (o) => money(o.totalAmount) },
        { key: "rec", col: "receivedAmount", header: "Received", className: "num", cell: (o) => money(o.receivedAmount) },
        { key: "pend", col: "pendingAmount", header: "Pending", className: "num", cell: (o) => <span className={o.pendingAmount > 0 ? "t-error t-semibold" : undefined}>{money(o.pendingAmount)}</span> },
        { key: "phone", col: "phoneNumber", header: "Phone", className: "nowrap tabular", cell: (o) => o.phoneNumber || "—" },
        { key: "status", col: "status", header: "Status", className: "nowrap", cell: (o) => <PaymentBadge status={o.status} /> },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: (o) => rowMenu(o) },
    ];
    const columns = allColumns.filter((c) => !c.col || visible[c.col]);

    const mechanicOptions = mechanics.map((m) => ({ value: m, label: m }));
    const productOptions = (settings.catalog.productTypes || []).map((p) => ({ label: p.label, value: p.label }));
    const serviceOptions = (settings.catalog.serviceTypes || []).map((s) => ({ label: s.label, value: s.label }));

    const colsPicker = (
        <Popover
            role="dialog"
            width={240}
            trigger={(p) => (
                <button type="button" className="btn btn-secondary btn-sm" aria-label="Choose columns" {...p}>
                    <Icons iconName="columns" />Cols
                </button>
            )}
        >
            {() => (
                <div aria-label="Visible columns">
                    {(Object.keys(DEFAULT_COLUMNS) as ColKey[]).map((key) => (
                        <label key={key} className="menu-check" htmlFor={`col-${key}`}>
                            <input className="form-check-input" type="checkbox" id={`col-${key}`} checked={visible[key]}
                                onChange={() => setCols({ ...visible, [key]: !visible[key] })} />
                            {columnLabels[key]}
                        </label>
                    ))}
                    <div className="menu-divider" />
                    <button type="button" className="btn btn-link btn-sm w-100 justify-content-start px-3" onClick={() => setCols(DEFAULT_COLUMNS)}>Reset</button>
                </div>
            )}
        </Popover>
    );

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            tools={colsPicker}
            search={<SearchInput key={filtersKey} id="bill-search" label="Search" placeholder={`Search ${L.vehicleNo}...`} onSearch={setFilter(setSearchText)} />}
            filters={[
                { id: "f-mech", label: "Mechanic", primary: true, node: <Selector inputId="f-mech" isClearable options={mechanicOptions} placeholder="-- All --" value={opt(mechanicOptions, mechanic)} onChange={(o: any) => setFilter(setMechanic)(o ? o.value : "")} /> },
                { id: "f-product", label: L.product, node: <Selector inputId="f-product" isClearable options={productOptions} placeholder="-- All --" value={opt(productOptions, product)} onChange={(o: any) => setFilter(setProduct)(o ? o.value : "")} /> },
                { id: "f-service", label: "Service Type", node: <Selector inputId="f-service" isClearable options={serviceOptions} placeholder="-- All --" value={opt(serviceOptions, service)} onChange={(o: any) => setFilter(setService)(o ? o.value : "")} /> },
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
                    { label: "PDF", icon: "entrolment_download", onClick: exportPDF, disabled: !!busyLabel, collapse: true },
                    { label: "Report", icon: "DTM_reports", onClick: handleReport, disabled: !!busyLabel, collapse: true },
                ]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/issueCounter/dashboard/create")}>
                        <Icons iconName="add" />Add New
                    </button>
                }
            />

            <DataList<RadiatorRecord>
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
                    noMatchText: `Try a different ${L.vehicleNo}, ${L.agent} or date range.`,
                    onClear: clearFilters,
                    action: <button type="button" className="btn btn-primary" onClick={() => navigate("/issueCounter/dashboard/create")}><Icons iconName="add" />Add New</button>,
                })}
                mobileCard={(o) => (
                    <MobileCard
                        title={o.truckNumber}
                        to={`/issueCounter/dashboard/view/${o._id}`}
                        badge={<PaymentBadge status={o.status} />}
                        menu={rowMenu(o)}
                        meta={[fmtDate(o.billDate), o.radiatorType, o.mechanicName]}
                        meta2={servicesText(o)}
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
                title={`Record Payment — ${paymentItem?.truckNumber ?? ""}`}
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
                message={deleteItem && <>Delete bill for <span className="t-strong t-semibold">{deleteItem.truckNumber}</span>{deleteItem.billDate ? ` dated ${fmtDate(deleteItem.billDate)}` : ""}? This cannot be undone.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={handleDelete}
                onCancel={() => setDeleteItem(null)}
            />
        </>
    );
};

export default Billing;
