import React, { useEffect, useState, type ChangeEvent } from "react";
import { useForm, useFieldArray } from "react-hook-form";

import Icons from "../../../Components/Icons";
import Loader from "../../../Components/Loader";
import Pagination from "../../../Components/Pagination";
import Search from "../../../Components/Search";
import Selector from "../../../Components/Selector";
import AlertComponent from "../../../Components/AlertComponent";
import { getData, postData, putData, deleteData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, monthStart } from "../../../Utils/format";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Product = { name: string; quantity: number; unitPrice: number; amount: number };
type Expense = {
    _id: string;
    expenseType: "materials" | "others";
    date: string;
    reason?: string;
    products?: Product[];
    amount: number;
};
type ExpenseForm = {
    expenseType: "materials" | "others";
    date: string;
    reason: string;
    products: Product[];
    amount: number;
};

const TYPE_OPTIONS = [
    { value: "materials", label: "Materials" },
    { value: "others", label: "Others" },
];

const defaultExpense: ExpenseForm = {
    expenseType: "materials",
    date: today(),
    reason: "",
    products: [{ name: "", quantity: 1, unitPrice: 0, amount: 0 }],
    amount: 0,
};

const Expenses = () => {
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [periodTotal, setPeriodTotal] = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPage, setTotalPage] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [selectedDataList, setSelectedDataList] = useState(10);

    const [searchText, setSearchText] = useState("");
    const [fromDate, setFromDate] = useState(monthStart());
    const [toDate, setToDate] = useState(today());
    const [expenseType, setExpenseType] = useState("");
    const [minAmount, setMinAmount] = useState("");
    const [maxAmount, setMaxAmount] = useState("");
    const [filtersKey, setFiltersKey] = useState(0);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [showModal, setShowModal] = useState(false);
    const [editTarget, setEditTarget] = useState<Expense | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

    const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ExpenseForm>({
        defaultValues: defaultExpense,
    });
    const { fields, append, remove } = useFieldArray({ control, name: "products" });
    const watchType = watch("expenseType");
    const watchProducts = watch("products");
    const productsTotal = (watchProducts || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    const buildParams = () => ({
        from: fromDate, to: toDate, expenseType, search: searchText, minAmount, maxAmount,
    });

    const clearExpenseFilters = () => {
        setSearchText(""); setExpenseType(""); setMinAmount(""); setMaxAmount("");
        setFromDate(monthStart()); setToDate(today()); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };

    const getTableData = async () => {
        setLoading(true);
        try {
            const res = await getData("expenses", { params: { ...buildParams(), page: currentPage, limit } });
            setExpenses(res.expenses || []);
            setTotalRecords(res.totalRecords || 0);
            setTotalPage(res.totalPages || 1);
            setPeriodTotal(res.periodTotal || 0);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load expenses", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, limit, searchText, fromDate, toDate, expenseType, minAmount, maxAmount]);

    useEffect(() => {
        sessionStorage.removeItem("expense_search");
    }, []);

    const handleSearchData = () => {
        setSearchText(sessionStorage.getItem("expense_search") || "");
        setCurrentPage(1);
    };

    const handleLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
        setLimit(Number(e.target.value) || 10);
        setCurrentPage(1);
    };

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const recalcAmount = (idx: number, qty?: string, price?: string) => {
        const q = Number(qty ?? watch(`products.${idx}.quantity`)) || 0;
        const p = Number(price ?? watch(`products.${idx}.unitPrice`)) || 0;
        setValue(`products.${idx}.amount`, q * p);
    };

    const openAdd = () => {
        setEditTarget(null);
        reset(defaultExpense);
        setShowModal(true);
    };

    const openEdit = (e: Expense) => {
        setEditTarget(e);
        reset({
            expenseType: e.expenseType,
            date: e.date ? new Date(e.date).toISOString().slice(0, 10) : today(),
            reason: e.reason || "",
            products: e.products?.length
                ? e.products.map((p) => ({ ...p }))
                : [{ name: "", quantity: 1, unitPrice: 0, amount: 0 }],
            amount: e.amount,
        });
        setShowModal(true);
    };

    const onSubmit = async (form: ExpenseForm) => {
        setLoading(true);
        try {
            if (editTarget) {
                await putData(`expenses/${editTarget._id}`, form);
                callAlertMsg("Expense updated", "success");
            } else {
                await postData("expenses", form);
                callAlertMsg("Expense saved", "success");
            }
            setShowModal(false);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to save expense", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setLoading(true);
        try {
            await deleteData(`expenses/${deleteTarget._id}`);
            callAlertMsg("Expense deleted", "success");
            setDeleteTarget(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchAllForExport = async (): Promise<Expense[]> => {
        const res = await getData("expenses/export", { params: buildParams() });
        return res.expenses || [];
    };

    const exportExcel = async () => {
        setExportLoading(true);
        try {
            const all = await fetchAllForExport();
            const rows: any[] = [];
            all.forEach((e) => {
                if (e.expenseType === "materials" && e.products?.length) {
                    e.products.forEach((p, pi) => {
                        rows.push({
                            "Date": pi === 0 ? new Date(e.date).toLocaleDateString("en-IN") : "",
                            "Type": pi === 0 ? "Materials" : "",
                            "Product": p.name,
                            "Qty": p.quantity,
                            "Unit Price (₹)": p.unitPrice,
                            "Amount (₹)": p.amount,
                            "Total (₹)": pi === 0 ? e.amount : "",
                        });
                    });
                } else {
                    rows.push({
                        "Date": new Date(e.date).toLocaleDateString("en-IN"),
                        "Type": "Others",
                        "Product": e.reason || "—",
                        "Qty": "", "Unit Price (₹)": "",
                        "Amount (₹)": e.amount, "Total (₹)": e.amount,
                    });
                }
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Expenses");
            XLSX.writeFile(wb, `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            const doc = new jsPDF();
            doc.setFontSize(13);
            doc.text(`${settings.company.name} — Expenses`, 14, 14);
            autoTable(doc, {
                startY: 22,
                head: [["Date", "Type", "Description", "Amount (₹)"]],
                body: all.map((e) => [
                    new Date(e.date).toLocaleDateString("en-IN"),
                    e.expenseType === "materials" ? "Materials" : "Others",
                    e.expenseType === "materials"
                        ? `${e.products?.length || 0} product(s)`
                        : (e.reason || "—"),
                    e.amount,
                ]),
                headStyles: { fillColor: settings.branding.primaryColor },
                styles: { fontSize: 9 },
            });
            doc.save(`expenses-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err: any) {
            callAlertMsg(err?.message || "Export failed", "error");
        } finally {
            setExportLoading(false);
        }
    };

    return (
        <div className="row">
            <Loader loading={loading || exportLoading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Expenses</h4>
                    <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                        onClick={openAdd}>
                        <Icons iconName="add" className="icon-12 icon-white me-2" />
                        Add Expense
                    </button>
                </div>

                <div className="card card-shadow mt-4">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-4 col-xl-3" key={`exp-search-${filtersKey}`}>
                                    <Search getData={handleSearchData} placeholder="Search reason or product..."
                                        storageKey="expense_search" />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">From</label>
                                    <input type="date" className="form-control" value={fromDate} max={toDate}
                                        onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">To</label>
                                    <input type="date" className="form-control" value={toDate} min={fromDate}
                                        onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-12 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Type</label>
                                    <Selector key={`exp-type-${filtersKey}`} isClearable options={TYPE_OPTIONS} placeholder="-- All Types --"
                                        onChange={(opt: any) => { setExpenseType(opt ? opt.value : ""); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Min Amount</label>
                                    <input type="number" min="0" className="form-control" placeholder="0" value={minAmount}
                                        onChange={(e) => { setMinAmount(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2">
                                    <label className="form-label font-w500 mb-1">Max Amount</label>
                                    <input type="number" min="0" className="form-control" placeholder="Any" value={maxAmount}
                                        onChange={(e) => { setMaxAmount(e.target.value); setCurrentPage(1); }} />
                                </div>
                                <div className="col-6 col-md-4 col-xl-2 d-flex align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm w-100" onClick={clearExpenseFilters}>Clear</button>
                                </div>
                                <div className="col-12 col-md-4 col-xl-3 d-flex gap-2 justify-content-end align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                                        onClick={exportExcel} disabled={exportLoading}>
                                        <Icons iconName="exporticon" className="icon-15 me-2" />
                                        {exportLoading ? "..." : "Excel"}
                                    </button>
                                    <button type="button" className="btn btn-cancel btn-sm d-flex align-items-center"
                                        onClick={exportPDF} disabled={exportLoading}>
                                        <Icons iconName="entrolment_download" className="icon-15 me-2" />PDF
                                    </button>
                                </div>
                            </div>
                            {/* Summary strip */}
                            <div className="px-3 pb-2 pt-1">
                                <span className="font-s13 text-muted">
                                    {totalRecords} expense{totalRecords !== 1 ? "s" : ""} —{" "}
                                    <span className="font-w600 text-dark">Total: {money(periodTotal)}</span>
                                </span>
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>SI No</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Description</th>
                                        <th>Amount</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.length ? expenses.map((e, i) => (
                                        <React.Fragment key={e._id}>
                                            <tr>
                                                <td>
                                                    {e.expenseType === "materials" && (
                                                        <span className="me-1" style={{ cursor: "pointer" }}
                                                            onClick={() => toggleRow(e._id)}>
                                                            <Icons
                                                                iconName={expandedRows.has(e._id) ? "arrow-down" : "arrow_right"}
                                                                className="icon-12" />
                                                        </span>
                                                    )}
                                                    {(currentPage - 1) * limit + i + 1}
                                                </td>
                                                <td>{new Date(e.date).toLocaleDateString("en-IN")}</td>
                                                <td>
                                                    <span className={`status-badge ${e.expenseType === "materials" ? "status-badge-warning" : "status-badge-success"}`}>
                                                        {e.expenseType === "materials" ? "Materials" : "Others"}
                                                    </span>
                                                </td>
                                                <td>
                                                    {e.expenseType === "others"
                                                        ? (e.reason || "—")
                                                        : `${e.products?.length || 0} product(s)`}
                                                </td>
                                                <td className="font-w600">{money(e.amount)}</td>
                                                <td className="action-dropdown">
                                                    <div className="dropdown">
                                                        <button className="btn" type="button" data-bs-toggle="dropdown">
                                                            <Icons iconName="Frame" className="icon-20" />
                                                        </button>
                                                        <ul className="dropdown-menu">
                                                            <li>
                                                                <button className="dropdown-item text-primary"
                                                                    onClick={() => openEdit(e)}>Edit</button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-danger"
                                                                    onClick={() => setDeleteTarget(e)}>Delete</button>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                            {e.expenseType === "materials" && expandedRows.has(e._id) && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: 0, background: "var(--surface-sunken)", borderBottom: "1px solid var(--line)" }}>
                                                        <div style={{ padding: "14px 18px 16px" }}>
                                                            <div className="font-s12 fw-semibold mb-2" style={{ color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                                                Products in this expense
                                                            </div>
                                                            <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                                                                <table className="table table-sm mb-0 font-s13">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Product</th><th>Qty</th>
                                                                            <th>Unit Price</th><th>Amount</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {(e.products || []).map((p, pi) => (
                                                                            <tr key={pi}>
                                                                                <td>{p.name}</td>
                                                                                <td>{p.quantity}</td>
                                                                                <td>{money(p.unitPrice)}</td>
                                                                                <td>{money(p.amount)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                    <tfoot>
                                                                        <tr className="font-w600">
                                                                            <td colSpan={3}>Total</td>
                                                                            <td>{money(e.amount)}</td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="text-center py-3 text-muted">No expenses found</td>
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

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">{editTarget ? "Edit Expense" : "Add Expense"}</span>
                                <button type="button" className="btn-close" aria-label="Close"
                                    onClick={() => setShowModal(false)} />
                            </div>
                            <form onSubmit={handleSubmit(onSubmit)}>
                                <div className="modal-body">
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Expense Type *</label>
                                            <Selector
                                                options={TYPE_OPTIONS}
                                                value={TYPE_OPTIONS.find((o) => o.value === watchType) || null}
                                                onChange={(opt: any) => {
                                                    if (opt) setValue("expenseType", opt.value);
                                                }}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Date *</label>
                                            <input type="date" className="form-control" max={today()}
                                                {...register("date", { required: true })} />
                                        </div>
                                    </div>

                                    {watchType === "others" && (
                                        <div className="row g-3 mb-3">
                                            <div className="col-12">
                                                <label className="form-label font-w500">Reason *</label>
                                                <textarea className="form-control" rows={2}
                                                    {...register("reason", { required: watchType === "others" })}
                                                    placeholder="Describe the expense" />
                                                {errors.reason && <span className="text-danger font-s12">Reason is required</span>}
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label font-w500">Amount (₹) *</label>
                                                <input type="number" className="form-control" min={0.01} step="0.01"
                                                    {...register("amount", { required: watchType === "others", min: 0.01 })}
                                                    placeholder="Enter amount" />
                                                {errors.amount && <span className="text-danger font-s12">Valid amount required</span>}
                                            </div>
                                        </div>
                                    )}

                                    {watchType === "materials" && (
                                        <>
                                            <div className="table-responsive mb-2">
                                                <table className="table table-bordered font-s14">
                                                    <thead>
                                                        <tr>
                                                            <th>Product Name</th>
                                                            <th style={{ width: 80 }}>Qty</th>
                                                            <th style={{ width: 110 }}>Unit Price (₹)</th>
                                                            <th style={{ width: 100 }}>Amount</th>
                                                            <th style={{ width: 40 }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {fields.map((field, idx) => (
                                                            <tr key={field.id}>
                                                                <td>
                                                                    <input className="form-control form-control-sm"
                                                                        {...register(`products.${idx}.name`, { required: true })}
                                                                        placeholder="Product name" />
                                                                </td>
                                                                <td>
                                                                    <input type="number" className="form-control form-control-sm"
                                                                        min={1} {...register(`products.${idx}.quantity`, { min: 1 })}
                                                                        onChange={(e) => recalcAmount(idx, e.target.value, undefined)} />
                                                                </td>
                                                                <td>
                                                                    <input type="number" className="form-control form-control-sm"
                                                                        min={0} step="0.01" {...register(`products.${idx}.unitPrice`, { min: 0 })}
                                                                        onChange={(e) => recalcAmount(idx, undefined, e.target.value)} />
                                                                </td>
                                                                <td className="font-w600 align-middle">
                                                                    {money(watchProducts?.[idx]?.amount || 0)}
                                                                </td>
                                                                <td className="align-middle">
                                                                    {fields.length > 1 && (
                                                                        <button type="button" className="btn btn-link p-0 text-danger"
                                                                            onClick={() => remove(idx)}>
                                                                            <Icons iconName="action_delete" className="icon-16" />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="font-w600">
                                                            <td colSpan={3}>Total</td>
                                                            <td>{money(productsTotal)}</td>
                                                            <td></td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                            <button type="button" className="btn btn-cancel btn-sm"
                                                onClick={() => append({ name: "", quantity: 1, unitPrice: 0, amount: 0 })}>
                                                + Add Product Row
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-cancel btn-sm"
                                        onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                                        {loading ? "Saving..." : editTarget ? "Update" : "Save"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Delete Expense</span>
                                <button type="button" className="btn-close" aria-label="Close"
                                    onClick={() => setDeleteTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-0">
                                    Delete this expense of <span className="font-w600">{money(deleteTarget.amount)}</span> on{" "}
                                    <span className="font-w600">{new Date(deleteTarget.date).toLocaleDateString("en-IN")}</span>?
                                    This cannot be undone.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm"
                                    onClick={() => setDeleteTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-danger btn-sm"
                                    onClick={handleDelete} disabled={loading}>
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

export default Expenses;
