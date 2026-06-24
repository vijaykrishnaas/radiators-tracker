import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import Pagination from "../../../Components/Pagination";
import Search from "../../../Components/Search";
import Selector from "../../../Components/Selector";
import { useAlertMsg } from "../../../Services/AllServices";
import AlertComponent from "../../../Components/AlertComponent";
import { getData, postData, deleteData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { printInvoice, printReport } from "../../../Components/PrintInvoice";
import { money } from "../../../Utils/format";
import { RadiatorRecord, serviceDisplay } from "../Dashboard/Index";

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

const Billing = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [recordData, setRecordData] = useState<RadiatorRecord[]>([]);

    const [limit, setLimit] = useState(10);
    const [selectedDataList, setSelectedDataList] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPage, settotalPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    const [searchText, setSearchText] = useState("");
    const [mechanicNameList, setmechanicName] = useState<string[]>([]);
    const [searchMechanicName, setsearchMechanicName] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [searchStatus, setSearchStatus] = useState("");
    const [searchRadiatorType, setSearchRadiatorType] = useState("");
    const [searchServiceType, setSearchServiceType] = useState("");
    const [filtersKey, setFiltersKey] = useState(0); // bump to remount/clear the filter inputs

    const [paymentItem, setPaymentItem] = useState<RadiatorRecord | null>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentDiscount, setPaymentDiscount] = useState("");
    const [deleteItem, setDeleteItem] = useState<RadiatorRecord | null>(null);

    const [visibleColumns, setVisibleColumns] = useState({
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
    });

    const toggleColumn = (key: keyof typeof visibleColumns) => {
        setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const buildParams = () => ({
        truckNumber: searchText,
        mechanicName: searchMechanicName,
        fromDate,
        toDate,
        status: searchStatus,
        radiatorType: searchRadiatorType,
        serviceType: searchServiceType,
    });

    const radiatorOptions = (settings.catalog.productTypes || []).map((p) => ({ label: p.label, value: p.label }));
    const serviceOptions = (settings.catalog.serviceTypes || []).map((s) => ({ label: s.label, value: s.label }));

    const clearFilters = () => {
        setSearchText(""); setsearchMechanicName(""); setSearchStatus("");
        setSearchRadiatorType(""); setSearchServiceType("");
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };

    const getTableData = async () => {
        try {
            setLoading(true);
            const res = await getData("radiators", {
                params: { page: currentPage, limit, ...buildParams() },
            });
            setRecordData(res.radiatorData || []);
            settotalPage(res.totalPages || 1);
            setTotalRecords(res.totalRecords || 0);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load records", "error");
        } finally {
            setLoading(false);
        }
    };

    const getMechanicName = async () => {
        try {
            const res = await getData("mechanic");
            setmechanicName(res.mechdata || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [limit, currentPage, searchText, searchMechanicName, fromDate, toDate, searchStatus, searchRadiatorType, searchServiceType]);

    useEffect(() => {
        sessionStorage.removeItem("search");
        getMechanicName();
    }, []);

    const handleSearchData = () => {
        setSearchText(sessionStorage.getItem("search") || "");
        setCurrentPage(1);
    };

    const handleLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value) || 10;
        setLimit(value);
        setCurrentPage(1);
    };

    const fetchAllForExport = async (): Promise<RadiatorRecord[]> => {
        const res = await getData("radiators/export", { params: buildParams() });
        return res.radiatorData || [];
    };

    // ---- Payment ----
    const openPaymentModal = (item: RadiatorRecord) => {
        setPaymentAmount("");
        setPaymentDiscount("");
        setPaymentItem(item);
    };

    const handleRecordPayment = async () => {
        if (!paymentItem) return;
        const amount = Number(paymentAmount) || 0;
        const discount = Number(paymentDiscount) || 0;
        if (amount <= 0 && discount <= 0) {
            callAlertMsg("Enter a payment amount and/or a discount", "error");
            return;
        }
        if (amount < 0 || discount < 0) {
            callAlertMsg("Amount and discount must not be negative", "error");
            return;
        }
        try {
            setLoading(true);
            const res = await postData(`radiators/${paymentItem._id}/payment`, { amount, discount });
            callAlertMsg(res.message || "Payment recorded", "success");
            setPaymentItem(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record payment", "error");
        } finally {
            setLoading(false);
        }
    };

    // ---- Delete ----
    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setLoading(true);
            const res = await deleteData(`radiators/${deleteItem._id}`);
            callAlertMsg(res.message || "Record deleted", "success");
            setDeleteItem(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete record", "error");
        } finally {
            setLoading(false);
        }
    };

    // ---- Exports (fetch ALL filtered records) ----
    const exportExcel = async () => {
        setExportLoading(true);
        try {
            const all = await fetchAllForExport();
            const exportData = all.map((x) => ({
                "Date": x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
                [settings.labels.vehicleNo]: x.truckNumber,
                [settings.labels.party]: x.transportName,
                [settings.labels.product]: x.radiatorType,
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
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setExportLoading(false);
        }
    };

    const exportPDF = async () => {
        setExportLoading(true);
        try {
            const all = await fetchAllForExport();
            const doc = new jsPDF({ orientation: "landscape" });
            doc.setFontSize(14);
            doc.text(`${settings.company.name} — Billing`, 14, 14);
            doc.setFontSize(9);
            doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 20);
            autoTable(doc, {
                startY: 26,
                head: [[
                    "Date", settings.labels.vehicleNo, settings.labels.party,
                    "Mechanic", "Services", "Total", "Discount", "Received", "Pending", "Status",
                ]],
                body: all.map((x) => [
                    x.billDate ? new Date(x.billDate).toLocaleDateString("en-IN") : "—",
                    x.truckNumber, x.transportName, x.mechanicName,
                    servicesText(x), x.totalAmount, x.discount ?? 0, x.receivedAmount, x.pendingAmount, x.status,
                ]),
                headStyles: { fillColor: settings.branding.primaryColor },
                styles: { fontSize: 8 },
            });
            doc.save(`billing-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setExportLoading(false);
        }
    };

    const handleReport = async () => {
        setExportLoading(true);
        try {
            const all = await fetchAllForExport();
            printReport(all, { from: fromDate, to: toDate }, settings);
        } catch (err: any) {
            callAlertMsg(err?.message || "Report failed", "error");
        } finally {
            setExportLoading(false);
        }
    };

    const badge = (s: RadiatorRecord["status"]) =>
        s === "Received" ? "status-badge-success" : s === "Partial" ? "status-badge-warning" : "status-badge-danger";

    const mechanicOptions = mechanicNameList.map((m) => ({ value: m, label: m }));

    const columnLabels: Record<keyof typeof visibleColumns, string> = {
        date: "Date",
        truckNumber: settings.labels.vehicleNo,
        transportName: settings.labels.party,
        radiatorType: settings.labels.product,
        mechanicName: "Mechanic",
        services: "Services",
        totalAmount: "Total",
        receivedAmount: "Received",
        pendingAmount: "Pending",
        phoneNumber: "Phone",
        status: "Status",
    };

    return (
        <div className="row">
            <Loader loading={loading || exportLoading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Billing</h4>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                            onClick={exportExcel} disabled={exportLoading}>
                            <Icons iconName="exporticon" className="icon-15 me-2" />
                            {exportLoading ? "Exporting..." : "Excel"}
                        </button>
                        <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                            onClick={exportPDF} disabled={exportLoading}>
                            <Icons iconName="entrolment_download" className="icon-15 me-2" />
                            PDF
                        </button>
                        <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                            onClick={handleReport} disabled={exportLoading}>
                            <Icons iconName="DTM_reports" className="icon-15 icon-white me-2" />
                            Report
                        </button>
                        <button type="button" className="btn btn-primary btn-sm d-flex align-items-center"
                            onClick={() => navigate("/issueCounter/dashboard/create")}
                            style={{ whiteSpace: "nowrap" }}>
                            <Icons iconName="add" className="icon-12 icon-white me-2" />
                            Add New
                        </button>
                    </div>
                </div>

                <div className="card card-shadow mt-4">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-4 col-xl-3" key={`search-${filtersKey}`}>
                                    <Search getData={handleSearchData}
                                        placeholder={`Search ${settings.labels.vehicleNo}...`} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Mechanic</label>
                                    <Selector key={`mech-${filtersKey}`} isClearable options={mechanicOptions}
                                        placeholder="-- All --"
                                        onChange={(option: any) => { setsearchMechanicName(option ? option.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">{settings.labels.product}</label>
                                    <Selector key={`model-${filtersKey}`} isClearable options={radiatorOptions}
                                        placeholder="-- All --"
                                        onChange={(option: any) => { setSearchRadiatorType(option ? option.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Service Type</label>
                                    <Selector key={`svc-${filtersKey}`} isClearable options={serviceOptions}
                                        placeholder="-- All --"
                                        onChange={(option: any) => { setSearchServiceType(option ? option.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Status</label>
                                    <Selector key={`status-${filtersKey}`} isClearable options={STATUS_OPTIONS}
                                        placeholder="-- All Status --"
                                        onChange={(option: any) => { setSearchStatus(option ? option.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label htmlFor="from-date" className="form-label font-w500 mb-1">From</label>
                                    <input id="from-date" type="date" className="form-control"
                                        value={fromDate} max={toDate || undefined}
                                        onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label htmlFor="to-date" className="form-label font-w500 mb-1">To</label>
                                    <input id="to-date" type="date" className="form-control"
                                        min={fromDate || undefined} value={toDate}
                                        onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-1 d-flex align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm w-100" onClick={clearFilters}>Clear</button>
                                </div>
                                <div className="col-6 col-md-4 col-xl-1 d-flex justify-content-end align-items-end">
                                    <div className="dropdown">
                                        <button className="btn btn-cancel btn-sm dropdown-toggle d-flex align-items-center"
                                            type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                                            <Icons iconName="table_view" className="icon-15 me-2" />
                                            Cols
                                        </button>
                                        <ul className="dropdown-menu dropdown-menu-end p-2" style={{ minWidth: "200px" }}>
                                            {(Object.keys(visibleColumns) as Array<keyof typeof visibleColumns>).map((key) => (
                                                <li key={key} className="form-check ms-2">
                                                    <input className="form-check-input" type="checkbox" id={`col-${key}`}
                                                        checked={visibleColumns[key]} onChange={() => toggleColumn(key)} />
                                                    <label className="form-check-label" htmlFor={`col-${key}`}>
                                                        {columnLabels[key]}
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>SI No</th>
                                        {visibleColumns.date && <th>Date</th>}
                                        {visibleColumns.truckNumber && <th>{settings.labels.vehicleNo}</th>}
                                        {visibleColumns.transportName && <th>{settings.labels.party}</th>}
                                        {visibleColumns.radiatorType && <th>{settings.labels.product}</th>}
                                        {visibleColumns.mechanicName && <th>Mechanic</th>}
                                        {visibleColumns.services && <th>Services</th>}
                                        {visibleColumns.totalAmount && <th>Total</th>}
                                        {visibleColumns.receivedAmount && <th>Received</th>}
                                        {visibleColumns.pendingAmount && <th>Pending</th>}
                                        {visibleColumns.phoneNumber && <th>Phone</th>}
                                        {visibleColumns.status && <th>Status</th>}
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordData.length ? (
                                        recordData.map((o, i) => (
                                            <tr key={o._id}>
                                                <td>{(currentPage - 1) * limit + i + 1}</td>
                                                {visibleColumns.date && (
                                                    <td>{o.billDate ? new Date(o.billDate).toLocaleDateString("en-IN") : "—"}</td>
                                                )}
                                                {visibleColumns.truckNumber && <td>{o.truckNumber}</td>}
                                                {visibleColumns.transportName && <td>{o.transportName}</td>}
                                                {visibleColumns.radiatorType && <td>{o.radiatorType}</td>}
                                                {visibleColumns.mechanicName && <td>{o.mechanicName}</td>}
                                                {visibleColumns.services && <td>{servicesText(o)}</td>}
                                                {visibleColumns.totalAmount && <td>{money(o.totalAmount)}</td>}
                                                {visibleColumns.receivedAmount && <td>{money(o.receivedAmount)}</td>}
                                                {visibleColumns.pendingAmount && (
                                                    <td className={o.pendingAmount > 0 ? "text-danger font-w600" : ""}>
                                                        {money(o.pendingAmount)}
                                                    </td>
                                                )}
                                                {visibleColumns.phoneNumber && <td>{o.phoneNumber}</td>}
                                                {visibleColumns.status && (
                                                    <td><span className={`status-badge ${badge(o.status)}`}>{o.status}</span></td>
                                                )}
                                                <td className="action-dropdown">
                                                    <div className="dropdown">
                                                        <button className="btn" type="button" data-bs-toggle="dropdown">
                                                            <Icons iconName="Frame" className="icon-20" />
                                                        </button>
                                                        <ul className="dropdown-menu">
                                                            <li>
                                                                <button className="dropdown-item text-primary"
                                                                    onClick={() => navigate(`/issueCounter/dashboard/view/${o._id}`)}>
                                                                    View
                                                                </button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-primary"
                                                                    onClick={() => navigate(`/issueCounter/dashboard/edit/${o._id}`)}>
                                                                    Edit
                                                                </button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-primary"
                                                                    onClick={() => printInvoice(o, settings)}>
                                                                    Print
                                                                </button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-primary"
                                                                    onClick={() => openPaymentModal(o)}>
                                                                    Record Payment
                                                                </button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-danger"
                                                                    onClick={() => setDeleteItem(o)}>
                                                                    Delete
                                                                </button>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={13} className="text-center py-3">No Records Found</td>
                                        </tr>
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

            {/* Record Payment Modal */}
            {paymentItem && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Record Payment — {paymentItem.truckNumber}</span>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setPaymentItem(null)} />
                            </div>
                            <div className="modal-body">
                                <div className="d-flex justify-content-between font-s14 mb-1">
                                    <span>Total</span><span className="font-w600">{money(paymentItem.totalAmount)}</span>
                                </div>
                                <div className="d-flex justify-content-between font-s14 mb-1">
                                    <span>Received so far</span>
                                    <span className="font-w600 text-success">{money(paymentItem.receivedAmount)}</span>
                                </div>
                                <div className="d-flex justify-content-between font-s14 mb-3">
                                    <span>Pending</span>
                                    <span className="font-w600 text-danger">{money(paymentItem.pendingAmount)}</span>
                                </div>
                                <div className="form-group mb-3">
                                    <label className="form-label" htmlFor="payment-discount">
                                        Discount (₹) <span className="text-muted font-s12">— optional, reduces the amount owed</span>
                                    </label>
                                    <input id="payment-discount" type="number" className="form-control"
                                        min={0} max={paymentItem.pendingAmount} value={paymentDiscount}
                                        onChange={(e) => setPaymentDiscount(e.target.value)}
                                        placeholder="0" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="payment-amount">
                                        Amount received now (₹)
                                    </label>
                                    <input id="payment-amount" type="number" className="form-control"
                                        min={0} max={Math.max(paymentItem.pendingAmount - (Number(paymentDiscount) || 0), 0)} value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        placeholder={`Up to ${Math.max(paymentItem.pendingAmount - (Number(paymentDiscount) || 0), 0)}`} autoFocus />
                                </div>
                                {(Number(paymentDiscount) || 0) > 0 && (
                                    <div className="d-flex justify-content-between font-s14 mt-3 pt-2 border-top">
                                        <span>Pending after discount</span>
                                        <span className="font-w600">
                                            {money(Math.max(paymentItem.pendingAmount - (Number(paymentDiscount) || 0) - (Number(paymentAmount) || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setPaymentItem(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary btn-sm"
                                    onClick={handleRecordPayment}
                                    disabled={loading || paymentItem.pendingAmount <= 0}>
                                    {loading ? "Saving..." : "Record Payment"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteItem && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Delete Record</span>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setDeleteItem(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-0">
                                    Delete bill for{" "}
                                    <span className="font-w600">{deleteItem.truckNumber}</span>
                                    {deleteItem.billDate ? ` dated ${new Date(deleteItem.billDate).toLocaleDateString("en-IN")}` : ""}? This cannot be undone.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm" onClick={() => setDeleteItem(null)}>Cancel</button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete} disabled={loading}>
                                    {loading ? "Deleting..." : "Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Billing;
