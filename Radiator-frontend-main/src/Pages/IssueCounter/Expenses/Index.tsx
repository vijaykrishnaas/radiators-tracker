import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import { getData, postData, putData, deleteData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today, monthStart } from "../../../Utils/format";
import { PageHeader, Badge, BusyOverlay, Field, SegmentedControl } from "../../../Components/ui/Basics";
import Modal, { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, Pagination, emptyCopy, type Column } from "../../../Components/ui/DataList";
import { AffixInput } from "../../../Components/ui/Inputs";
import { useRemoteList } from "../../../Components/ui/useRemoteList";
import { usePhone } from "../../../Components/ui/hooks";

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

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");
const opt = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v) || null;

const ProductsMini = ({ expense }: { expense: Expense }) => {
    const phone = usePhone();
    return (
    <>
        <p className="t-xs t-muted t-medium mb-2">Products in this expense</p>
        <div className="mini-table">
            <div className={phone ? "table-wrap" : undefined}>
            <table className="table mb-0">
                <thead>
                    <tr>
                        <th scope="col">Product</th>
                        <th scope="col" className="num">Qty</th>
                        <th scope="col" className="num">Unit Price</th>
                        <th scope="col" className="num">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {(expense.products || []).map((p, pi) => (
                        <tr key={pi}>
                            <td className="text">{p.name}</td>
                            <td className="num">{p.quantity}</td>
                            <td className="num">{money(p.unitPrice)}</td>
                            <td className="num">{money(p.amount)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={3} className="t-semibold t-strong">Total</td>
                        <td className="num t-semibold t-strong">{money(expense.amount)}</td>
                    </tr>
                </tfoot>
            </table>
            </div>
        </div>
    </>
    );
};

const Expenses = () => {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();

    const [busyLabel, setBusyLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(10);

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

    const list = useRemoteList<Expense, { periodTotal: number }>(async () => {
        const res = await getData("expenses", { params: { ...buildParams(), page: currentPage, limit } });
        return {
            rows: res.expenses || [],
            total: res.totalRecords || 0,
            totalPages: res.totalPages || 1,
            extra: { periodTotal: res.periodTotal || 0 },
        };
    }, [currentPage, limit, searchText, fromDate, toDate, expenseType, minAmount, maxAmount]);

    const activeCount =
        [expenseType, minAmount, maxAmount].filter(Boolean).length +
        (searchText ? 1 : 0) + (fromDate !== monthStart() ? 1 : 0) + (toDate !== today() ? 1 : 0);

    const clearExpenseFilters = () => {
        setSearchText(""); setExpenseType(""); setMinAmount(""); setMaxAmount("");
        setFromDate(monthStart()); setToDate(today()); setCurrentPage(1);
        setFiltersKey((k) => k + 1);
    };
    const setFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setCurrentPage(1); };

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
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
        setSaving(true);
        try {
            if (editTarget) {
                await putData(`expenses/${editTarget._id}`, form);
                callAlertMsg("Expense updated", "success");
            } else {
                await postData("expenses", form);
                callAlertMsg("Expense saved", "success");
            }
            setShowModal(false);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to save expense", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await deleteData(`expenses/${deleteTarget._id}`);
            callAlertMsg("Expense deleted", "success");
            setDeleteTarget(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to delete", "error");
        } finally {
            setSaving(false);
        }
    };

    const fetchAllForExport = async (): Promise<Expense[]> => {
        const res = await getData("expenses/export", { params: buildParams() });
        return res.expenses || [];
    };

    const exportExcel = async () => {
        setBusyLabel("Preparing Excel…");
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
            setBusyLabel("");
        }
    };

    const exportPDF = async () => {
        setBusyLabel("Preparing PDF…");
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
            setBusyLabel("");
        }
    };

    const rowMenu = (e: Expense) => (
        <RowActions ariaLabel="Expense actions" items={[
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(e) },
            { label: "Delete", icon: <Icons iconName="delete" />, danger: true, onClick: () => setDeleteTarget(e) },
        ]} />
    );

    const describe = (e: Expense) => (e.expenseType === "others" ? (e.reason || "—") : `${e.products?.length || 0} product(s)`);
    const typeBadge = (e: Expense) => <Badge tone="neutral">{e.expenseType === "materials" ? "Materials" : "Others"}</Badge>;
    const expandBtn = (e: Expense) => (
        <button type="button" className="expand-btn" aria-expanded={expandedRows.has(e._id)}
            aria-label={`${expandedRows.has(e._id) ? "Hide" : "Show"} products`} onClick={() => toggleRow(e._id)}>
            <Icons iconName="chevron-right" />
        </button>
    );

    const columns: Column<Expense>[] = [
        {
            key: "si", header: "SI No", className: "nowrap tabular",
            cell: (e, i) => (
                <>
                    {e.expenseType === "materials" ? expandBtn(e) : <span className="expand-spacer" aria-hidden="true" />}
                    {(currentPage - 1) * limit + i + 1}
                </>
            ),
        },
        { key: "date", header: "Date", className: "nowrap tabular", cell: (e) => fmtDate(e.date) },
        { key: "type", header: "Type", className: "nowrap", cell: typeBadge },
        { key: "desc", header: "Description", className: "text", cell: describe },
        { key: "amt", header: "Amount", className: "num t-semibold t-strong", cell: (e) => money(e.amount) },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: rowMenu },
    ];

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearExpenseFilters}
            search={<SearchInput key={filtersKey} id="expense-search" label="Search" placeholder="Search reason or product..." onSearch={setFilter(setSearchText)} />}
            filters={[
                { id: "exp-from", label: "From", primary: true, node: <input id="exp-from" type="date" className="form-control" value={fromDate} max={toDate || undefined} onChange={(e) => setFilter(setFromDate)(e.target.value)} /> },
                { id: "exp-to", label: "To", primary: true, node: <input id="exp-to" type="date" className="form-control" value={toDate} min={fromDate || undefined} onChange={(e) => setFilter(setToDate)(e.target.value)} /> },
                { id: "exp-type", label: "Type", node: <Selector inputId="exp-type" isClearable options={TYPE_OPTIONS} placeholder="-- All Types --" value={opt(TYPE_OPTIONS, expenseType)} onChange={(o: any) => setFilter(setExpenseType)(o ? o.value : "")} /> },
                { id: "exp-min", label: "Min amount", node: <AffixInput id="exp-min" prefix="₹" type="number" inputMode="decimal" min={0} placeholder="0" value={minAmount} onChange={(e) => setFilter(setMinAmount)(e.target.value)} /> },
                { id: "exp-max", label: "Max amount", node: <AffixInput id="exp-max" prefix="₹" type="number" inputMode="decimal" min={0} placeholder="Any" value={maxAmount} onChange={(e) => setFilter(setMaxAmount)(e.target.value)} /> },
            ]}
        />
    );

    const periodTotal = list.extra?.periodTotal ?? 0;
    const closeModal = () => { if (!saving) setShowModal(false); };

    return (
        <>
            <BusyOverlay show={!!busyLabel} label={busyLabel} />
            <PageHeader
                title="Expenses"
                actions={[
                    { label: "Excel", icon: "exporticon", onClick: exportExcel, disabled: !!busyLabel, collapse: true },
                    { label: "PDF", icon: "entrolment_download", onClick: exportPDF, disabled: !!busyLabel, collapse: true },
                ]}
                primary={
                    <button type="button" className="btn btn-primary" onClick={openAdd}>
                        <Icons iconName="add" />Add Expense
                    </button>
                }
            />

            <DataList<Expense>
                caption="Expenses"
                toolbar={filterBar}
                summary={<>{list.total} expense{list.total !== 1 ? "s" : ""} — <strong>Total: {money(periodTotal)}</strong></>}
                rows={list.rows}
                rowKey={(e) => e._id}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load expenses"
                empty={emptyCopy({
                    filtered: activeCount > 0,
                    noun: "expenses",
                    noDataText: "Add your first expense and it will show up here.",
                    noMatchText: "Try a different reason, product or date range.",
                    onClear: clearExpenseFilters,
                    action: <button type="button" className="btn btn-primary" onClick={openAdd}><Icons iconName="add" />Add Expense</button>,
                })}
                expanded={(e) => (e.expenseType === "materials" && expandedRows.has(e._id) ? <ProductsMini expense={e} /> : null)}
                mobileCard={(e) => (
                    <MobileCard
                        title={describe(e)}
                        menu={rowMenu(e)}
                        meta={[fmtDate(e.date), typeBadge(e)]}
                        right={<span className="t-md t-semibold t-strong tabular">{money(e.amount)}</span>}
                    >
                        {e.expenseType === "materials" && (
                            <>
                                <button type="button" className="btn btn-link btn-sm px-0" aria-expanded={expandedRows.has(e._id)} onClick={() => toggleRow(e._id)}>
                                    {expandedRows.has(e._id) ? "Hide products" : "Show products"}
                                </button>
                                {expandedRows.has(e._id) && <ProductsMini expense={e} />}
                            </>
                        )}
                    </MobileCard>
                )}
                pagination={
                    <Pagination page={currentPage} totalPages={list.totalPages} total={list.total} limit={limit}
                        onPage={setCurrentPage} onLimit={(n) => { setLimit(n); setCurrentPage(1); }} />
                }
            />

            <Modal
                open={showModal}
                onClose={closeModal}
                title={editTarget ? "Edit Expense" : "Add Expense"}
                size="lg"
                busy={saving}
                as="form"
                onSubmit={handleSubmit(onSubmit)}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}
                            {saving ? "Saving..." : editTarget ? "Update" : "Save"}
                        </button>
                    </>
                }
            >
                <div className="form-grid">
                    <div className="field">
                        <span className="form-label d-block" id="expense-type-label">Expense type <span className="req" aria-hidden="true">*</span></span>
                        <SegmentedControl radio full label="Expense type" options={TYPE_OPTIONS as { value: "materials" | "others"; label: string }[]}
                            value={watchType} onChange={(v) => setValue("expenseType", v)} />
                    </div>
                    <Field label="Date" htmlFor="expense-date" required>
                        <input id="expense-date" type="date" className="form-control" max={today()}
                            {...register("date", { required: true })} />
                    </Field>

                    {watchType === "others" && (
                        <>
                            <Field label="Reason" htmlFor="expense-reason" required className="span-2" error={errors.reason ? "Reason is required" : undefined}>
                                <textarea id="expense-reason" className="form-control" rows={2} placeholder="Describe the expense"
                                    {...register("reason", { required: watchType === "others" })} />
                            </Field>
                            <Field label="Amount (₹)" htmlFor="expense-amount" required error={errors.amount ? "Valid amount required" : undefined}>
                                <AffixInput id="expense-amount" prefix="₹" type="number" inputMode="decimal" min={0.01} step="0.01" placeholder="Enter amount"
                                    invalid={!!errors.amount}
                                    {...register("amount", { required: watchType === "others", min: 0.01 })} />
                            </Field>
                        </>
                    )}

                    {watchType === "materials" && (
                        <div className="span-2 d-grid gap-3">
                            {phone ? (
                                fields.map((field, idx) => (
                                    <div className="nested-card d-grid gap-3" key={field.id}>
                                        <div className="d-flex align-items-center justify-content-between">
                                            <span className="t-sm t-strong t-semibold">Product {idx + 1}</span>
                                            {fields.length > 1 && (
                                                <button type="button" className="btn btn-icon" aria-label={`Remove product ${idx + 1}`} onClick={() => remove(idx)}>
                                                    <Icons iconName="trash" />
                                                </button>
                                            )}
                                        </div>
                                        <Field label="Product Name" htmlFor={`exp-p-name-${idx}`}>
                                            <input id={`exp-p-name-${idx}`} className={`form-control${errors.products?.[idx]?.name ? " is-invalid" : ""}`} placeholder="Product name"
                                                {...register(`products.${idx}.name`, { required: true })} />
                                        </Field>
                                        <div className="row g-3">
                                            <div className="col-6">
                                                <Field label="Qty" htmlFor={`exp-p-qty-${idx}`}>
                                                    <input id={`exp-p-qty-${idx}`} type="number" inputMode="numeric" className="form-control" min={1}
                                                        {...register(`products.${idx}.quantity`, { min: 1 })}
                                                        onChange={(e) => { register(`products.${idx}.quantity`).onChange(e); recalcAmount(idx, e.target.value, undefined); }} />
                                                </Field>
                                            </div>
                                            <div className="col-6">
                                                <Field label="Unit Price (₹)" htmlFor={`exp-p-price-${idx}`}>
                                                    <AffixInput id={`exp-p-price-${idx}`} prefix="₹" type="number" inputMode="decimal" min={0} step="0.01"
                                                        {...register(`products.${idx}.unitPrice`, { min: 0 })}
                                                        onChange={(e) => { register(`products.${idx}.unitPrice`).onChange(e); recalcAmount(idx, undefined, e.target.value); }} />
                                                </Field>
                                            </div>
                                        </div>
                                        <p className="d-flex justify-content-between mb-0 t-sm t-muted">
                                            <span>Amount</span>
                                            <span className="t-strong t-semibold tabular">{money(watchProducts?.[idx]?.amount || 0)}</span>
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <div className="mini-table">
                                    <div className="table-wrap">
                                        <table className="table mb-0">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Product Name</th>
                                                    <th scope="col" style={{ width: 96 }}>Qty</th>
                                                    <th scope="col" style={{ width: 160 }}>Unit Price (₹)</th>
                                                    <th scope="col" className="num" style={{ width: 120 }}>Amount</th>
                                                    <th scope="col" style={{ width: 56 }}><span className="visually-hidden">Remove</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fields.map((field, idx) => (
                                                    <tr key={field.id}>
                                                        <td>
                                                            <input id={`exp-p-name-${idx}`} aria-label={`Product name ${idx + 1}`} className={`form-control${errors.products?.[idx]?.name ? " is-invalid" : ""}`}
                                                                placeholder="Product name" {...register(`products.${idx}.name`, { required: true })} />
                                                        </td>
                                                        <td>
                                                            <input id={`exp-p-qty-${idx}`} aria-label={`Quantity ${idx + 1}`} type="number" className="form-control" min={1}
                                                                {...register(`products.${idx}.quantity`, { min: 1 })}
                                                                onChange={(e) => { register(`products.${idx}.quantity`).onChange(e); recalcAmount(idx, e.target.value, undefined); }} />
                                                        </td>
                                                        <td>
                                                            <AffixInput id={`exp-p-price-${idx}`} aria-label={`Unit price ${idx + 1}`} prefix="₹" type="number" min={0} step="0.01"
                                                                {...register(`products.${idx}.unitPrice`, { min: 0 })}
                                                                onChange={(e) => { register(`products.${idx}.unitPrice`).onChange(e); recalcAmount(idx, undefined, e.target.value); }} />
                                                        </td>
                                                        <td className="num t-semibold t-strong">{money(watchProducts?.[idx]?.amount || 0)}</td>
                                                        <td className="cell-actions">
                                                            {fields.length > 1 && (
                                                                <button type="button" className="btn btn-icon" aria-label={`Remove product ${idx + 1}`} onClick={() => remove(idx)}>
                                                                    <Icons iconName="trash" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            <div className="d-flex align-items-center justify-content-between gap-3">
                                <button type="button" className="btn btn-secondary btn-sm"
                                    onClick={() => append({ name: "", quantity: 1, unitPrice: 0, amount: 0 })}>
                                    <Icons iconName="add" />Add Product Row
                                </button>
                                <p className="mb-0 d-flex align-items-baseline gap-3 justify-content-end">
                                    <span className="t-sm t-muted">Total</span>
                                    <span className="t-md t-semibold t-strong tabular">{money(productsTotal)}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Expense"
                message={deleteTarget && <>Delete this expense of <span className="t-strong t-semibold">{money(deleteTarget.amount)}</span> on <span className="t-strong t-semibold">{fmtDate(deleteTarget.date)}</span>? This cannot be undone.</>}
                confirmLabel="Delete"
                busyLabel="Deleting..."
                busy={saving}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
};

export default Expenses;
