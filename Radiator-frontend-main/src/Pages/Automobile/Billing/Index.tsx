import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Loader from "../../../Components/Loader";
import Pagination from "../../../Components/Pagination";
import Search from "../../../Components/Search";
import Selector from "../../../Components/Selector";
import { useAlertMsg } from "../../../Services/AllServices";
import AlertComponent from "../../../Components/AlertComponent";
import { getData, postData, deleteData } from "../../../Services/ApiServices";
import { useSettings } from "../../../Context/SettingsContext";
import { printAutoInvoice } from "../../../Components/PrintInvoice";
import { money } from "../../../Utils/format";
import { AutoBillRecord, itemsText } from "../types";

import * as XLSX from "xlsx";

const STATUS_OPTIONS = [
    { value: "Not Received", label: "Not Received" },
    { value: "Partial", label: "Partial" },
    { value: "Received", label: "Received" },
];

const AutoBilling = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [recordData, setRecordData] = useState<AutoBillRecord[]>([]);

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
    const [filtersKey, setFiltersKey] = useState(0);

    const [paymentItem, setPaymentItem] = useState<AutoBillRecord | null>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentDiscount, setPaymentDiscount] = useState("");
    const [deleteItem, setDeleteItem] = useState<AutoBillRecord | null>(null);

    const labels = settings.automobile.labels;

    const buildParams = () => ({
        vehicleNumber: searchText,
        mechanicName: searchMechanicName,
        fromDate,
        toDate,
        status: searchStatus,
    });

    const clearFilters = () => {
        setSearchText(""); setsearchMechanicName(""); setSearchStatus("");
        setFromDate(""); setToDate(""); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };

    const getTableData = async () => {
        try {
            setLoading(true);
            const res = await getData("autobills", { params: { page: currentPage, limit, ...buildParams() } });
            setRecordData(res.autoBillData || []);
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
            const res = await getData("auto-mechanic");
            setmechanicName(res.mechdata || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [limit, currentPage, searchText, searchMechanicName, fromDate, toDate, searchStatus]);

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

    const fetchAllForExport = async (): Promise<AutoBillRecord[]> => {
        const res = await getData("autobills/export", { params: buildParams() });
        return res.autoBillData || [];
    };

    const openPaymentModal = (item: AutoBillRecord) => {
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
            const res = await postData(`autobills/${paymentItem._id}/payment`, { amount, discount });
            callAlertMsg(res.message || "Payment recorded", "success");
            setPaymentItem(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to record payment", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setLoading(true);
            const res = await deleteData(`autobills/${deleteItem._id}`);
            callAlertMsg(res.message || "Record deleted", "success");
            setDeleteItem(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete record", "error");
        } finally {
            setLoading(false);
        }
    };

    const exportExcel = async () => {
        setExportLoading(true);
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
            setExportLoading(false);
        }
    };

    const badge = (s: AutoBillRecord["status"]) =>
        s === "Received" ? "status-badge-success" : s === "Partial" ? "status-badge-warning" : "status-badge-danger";

    const mechanicOptions = mechanicNameList.map((m) => ({ value: m, label: m }));

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
                        <button type="button" className="btn btn-primary btn-sm d-flex align-items-center"
                            onClick={() => navigate("/automobile/dashboard/create")}
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
                                    <Search getData={handleSearchData} placeholder={`Search ${labels.vehicleNo}...`} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">{labels.agent}</label>
                                    <Selector key={`mech-${filtersKey}`} isClearable options={mechanicOptions}
                                        placeholder="-- All --"
                                        onChange={(option: any) => { setsearchMechanicName(option ? option.value : ""); setCurrentPage(1); }} />
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
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th className="cell-nowrap">SI No</th>
                                        <th className="cell-nowrap">Date</th>
                                        <th className="cell-nowrap">Bill No</th>
                                        <th className="cell-nowrap">{labels.vehicleNo}</th>
                                        <th>{labels.customer}</th>
                                        <th>{labels.agent}</th>
                                        <th>Items</th>
                                        <th className="cell-nowrap">Total</th>
                                        <th className="cell-nowrap">Received</th>
                                        <th className="cell-nowrap">Pending</th>
                                        <th className="cell-nowrap">Status</th>
                                        <th className="cell-nowrap">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordData.length ? (
                                        recordData.map((o, i) => (
                                            <tr key={o._id}>
                                                <td className="cell-nowrap">{(currentPage - 1) * limit + i + 1}</td>
                                                <td className="cell-nowrap">{o.billDate ? new Date(o.billDate).toLocaleDateString("en-IN") : "—"}</td>
                                                <td className="cell-nowrap">{o.billNo}</td>
                                                <td className="cell-nowrap">{o.vehicleNumber}</td>
                                                <td>{o.customerName || "—"}</td>
                                                <td>{o.mechanicName}</td>
                                                <td>{itemsText(o)}</td>
                                                <td className="cell-nowrap">{money(o.totalAmount)}</td>
                                                <td className="cell-nowrap">{money(o.receivedAmount)}</td>
                                                <td className={`cell-nowrap ${o.pendingAmount > 0 ? "text-danger font-w600" : ""}`}>
                                                    {money(o.pendingAmount)}
                                                </td>
                                                <td className="cell-nowrap"><span className={`status-badge ${badge(o.status)}`}>{o.status}</span></td>
                                                <td className="cell-nowrap">
                                                    <RowActions ariaLabel={`Actions for ${o.vehicleNumber}`} items={[
                                                        { label: "View", icon: <Icons iconName="view" />, onClick: () => navigate(`/automobile/dashboard/view/${o._id}`) },
                                                        { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => navigate(`/automobile/dashboard/edit/${o._id}`) },
                                                        { label: "Print", icon: <Icons iconName="print" />, onClick: () => printAutoInvoice(o, settings) },
                                                        { label: "Record Payment", icon: <Icons iconName="currencyrupee" />, onClick: () => openPaymentModal(o) },
                                                        { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteItem(o) },
                                                    ]} />
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={12} className="text-center py-3">No Records Found</td>
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
                                <span className="modal-title">Record Payment — {paymentItem.vehicleNumber}</span>
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
                                    <label className="form-label" htmlFor="payment-amount">Amount received now (₹)</label>
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
                                    <span className="font-w600">{deleteItem.vehicleNumber}</span>
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

export default AutoBilling;
