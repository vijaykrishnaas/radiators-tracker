import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { motion, useReducedMotion } from "framer-motion";

import Icons from "../../../../Components/Icons";
import InputText from "../../../../Components/InputText";
import Selector from "../../../../Components/Selector";
import DateCalendar from "../../../../Components/DateCalendar";
import { getData, postData, putData } from "../../../../Services/ApiServices";
import { useAlertMsg } from "../../../../Services/AllServices";
import { useSettings } from "../../../../Context/SettingsContext";
import { PageHeader, Field, FormFooter, SkeletonRows } from "../../../../Components/ui/Basics";
import { money } from "../../../../Utils/format";
import { ConfirmDialog } from "../../../../Components/ui/Modal";

type ItemRow = {
    particulars: string;
    partRef: string | null;
    qty: number | string;
    unit: string;
    rate: number | string;
    amount: number | string;
    amountTouched: boolean; // once the user hand-edits amount, qty/rate changes stop overwriting it
    memo: number; // which memo (group of rows) the item sits in
};

type FormValues = {
    autoBill: {
        date: Date | null;
        billNo: number | null;
        vehicleNumber: string;
        customerName?: string;
        phoneNumber?: string;
        mechanicName: string;
        labourName: { label: string; value: string }[];
        notes?: string;
        items: ItemRow[];
    };
};

const emptyItem: ItemRow = { particulars: "", partRef: null, qty: "", unit: "", rate: "", amount: "", amountTouched: false, memo: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;
// The server keeps memo numbers 1–50.
const MAX_MEMOS = 50;

const CreateAutoBill = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const reduceMotion = useReducedMotion();

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;
    const [loading, setLoading] = useState(false);
    const [loadingRecord, setLoadingRecord] = useState(!!id);
    const [mechanicList, setMechanicList] = useState<string[]>([]);
    const [memoCount, setMemoCount] = useState(1);

    const parts = settings.automobile.parts || [];
    const units = settings.automobile.units || [];
    const labels = settings.automobile.labels;
    const labourOptions = (settings.labour || []).map((name) => ({ label: name, value: name.toLowerCase() }));

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        getValues,
        reset,
        clearErrors,
        trigger,
        formState: { errors, isSubmitted },
    } = useForm<FormValues>({
        mode: "onChange",
        defaultValues: {
            autoBill: {
                date: null,
                billNo: null,
                vehicleNumber: "",
                customerName: "",
                phoneNumber: "",
                mechanicName: "",
                labourName: [],
                notes: "",
                items: [{ ...emptyItem }],
            },
        },
    });

    const { fields, append, remove, replace } = useFieldArray({ control, name: "autoBill.items" });
    const items = watch("autoBill.items") || [];

    useEffect(() => {
        (async () => {
            try {
                const res = await getData("auto-mechanic");
                setMechanicList(res.mechdata || []);
            } catch (err) {
                console.error(err);
            }
        })();
    }, []);

    const loadRecord = async () => {
        setLoadingRecord(true);
        try {
            const data = await getData(`autobills/${id}`);
            const loadedItems: ItemRow[] = (data.items || []).map((i: any) => ({
                particulars: i.particulars || "",
                partRef: i.partRef || null,
                qty: i.qty ?? "",
                unit: i.unit || "",
                rate: i.rate ?? "",
                amount: i.amount ?? "",
                // A stored amount that differs from qty × rate was typed by hand: keep it. Otherwise let qty/rate edits recompute it.
                amountTouched: Number(i.amount) !== round2((Number(i.qty) || 0) * (Number(i.rate) || 0)),
                memo: Number.isInteger(i.memo) && i.memo > 0 ? i.memo : 0, // bills saved before memos are one memo
            }));
            setMemoCount(Math.max(1, ...loadedItems.map((i) => i.memo + 1)));
            reset({
                autoBill: {
                    date: data.billDate ? new Date(data.billDate) : null,
                    billNo: data.billNo ?? null,
                    vehicleNumber: data.vehicleNumber || "",
                    customerName: data.customerName || "",
                    phoneNumber: data.phoneNumber || "",
                    mechanicName: data.mechanicName || "",
                    labourName: (data.labourName || []).map((name: string) => ({ label: name, value: name })),
                    notes: data.notes || "",
                    items: loadedItems.length ? loadedItems : [{ ...emptyItem }],
                },
            });
        } catch (err: any) {
            callAlertMsg(err?.message || "Error loading record", "error");
        } finally {
            setLoadingRecord(false);
        }
    };

    useEffect(() => {
        if (id) loadRecord();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Values filled in by code (amount from qty × rate, a catalog part's unit and rate) re-run their own validation,
    // so an earlier "required" error on that field clears as soon as it has a value.
    const fill = (path: `autoBill.items.${number}.${"qty" | "unit" | "rate" | "amount"}`, value: string | number) =>
        setValue(path, value, { shouldValidate: isSubmitted });

    // Particulars is free text with the parts catalog as suggestions; an exact catalog name fills unit and rate.
    const onParticularsChange = (index: number, text: string) => {
        const part = parts.find((p) => p.label.toLowerCase() === text.trim().toLowerCase());
        setValue(`autoBill.items.${index}.partRef`, part ? part.value : null);
        if (!part) return;
        fill(`autoBill.items.${index}.unit`, part.unit || "");
        fill(`autoBill.items.${index}.rate`, part.rate ?? "");
        setValue(`autoBill.items.${index}.amountTouched`, false);
        const qty = items[index]?.qty || 1;
        fill(`autoBill.items.${index}.qty`, qty);
        fill(`autoBill.items.${index}.amount`, round2((Number(qty) || 0) * (Number(part.rate) || 0)));
    };

    const addRow = (memo: number) => append({ ...emptyItem, qty: 1, memo });
    const addMemo = () => {
        if (memoCount >= MAX_MEMOS) return;
        addRow(memoCount);
        setMemoCount((n) => n + 1);
    };
    // Removing a memo drops its rows and closes the gap so memo numbers stay 1..n. replace() re-indexes the rows, so
    // any validation errors (keyed by row index) are cleared and re-run instead of landing on the wrong rows.
    const removeMemo = (memo: number) => {
        const rest = (getValues("autoBill.items") || [])
            .filter((i) => (i.memo || 0) !== memo)
            .map((i) => ({ ...i, memo: (i.memo || 0) > memo ? i.memo - 1 : i.memo || 0 }));
        replace(rest.length ? rest : [{ ...emptyItem }]);
        setMemoCount((n) => Math.max(1, n - 1));
        clearErrors("autoBill.items");
        if (isSubmitted) setTimeout(() => trigger("autoBill.items"), 0);
    };
    // A memo with anything typed in it asks first: one click would otherwise wipe a whole supplier memo.
    const [confirmMemo, setConfirmMemo] = useState<number | null>(null);
    const askRemoveMemo = (memo: number) => {
        const hasData = items.some((i) => (i.memo || 0) === memo && (String(i.particulars || "").trim() || Number(i.amount) > 0));
        if (hasData) setConfirmMemo(memo);
        else removeMemo(memo);
    };

    const recomputeAmount = (index: number, qty: any, rate: any) => {
        if (items[index]?.amountTouched) return;
        // A ₹0 rate is valid (free item): compute whenever both are entered, blank only while one is missing.
        const filled = (v: any) => v !== "" && v !== null && v !== undefined;
        fill(`autoBill.items.${index}.amount`, filled(qty) && filled(rate) ? round2((Number(qty) || 0) * (Number(rate) || 0)) : "");
    };

    const onQtyChange = (index: number, val: string) => {
        setValue(`autoBill.items.${index}.qty`, val);
        recomputeAmount(index, val, items[index]?.rate);
    };

    const onRateChange = (index: number, val: string) => {
        setValue(`autoBill.items.${index}.rate`, val);
        recomputeAmount(index, items[index]?.qty, val);
    };

    const onAmountChange = (index: number, val: string) => {
        setValue(`autoBill.items.${index}.amount`, val);
        setValue(`autoBill.items.${index}.amountTouched`, true);
    };

    const total = (items || []).reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const memoTotal = (m: number) => round2(items.reduce((sum, i) => sum + ((i.memo || 0) === m ? Number(i.amount || 0) : 0), 0));

    const onSubmit = async (data: any) => {
        if (isView) return;
        setLoading(true);
        try {
            const ab = data.autoBill;
            const usedMemos = [...new Set<number>(ab.items.map((i: ItemRow) => i.memo || 0))].sort((a, b) => a - b);
            // Saved in memo order (rows added to an earlier memo later on are appended at the end of the form array).
            const ordered = [...ab.items].sort((a: ItemRow, b: ItemRow) => (a.memo || 0) - (b.memo || 0));
            const payload = {
                billDate: ab.date,
                vehicleNumber: ab.vehicleNumber,
                customerName: ab.customerName,
                phoneNumber: ab.phoneNumber,
                mechanicName: ab.mechanicName,
                labourName: ab.labourName,
                notes: ab.notes,
                items: ordered.map((i: ItemRow) => ({
                    memo: usedMemos.indexOf(i.memo || 0), // empty memos are dropped, so renumber from 0
                    particulars: i.particulars,
                    partRef: i.partRef,
                    qty: Number(i.qty || 0),
                    unit: i.unit,
                    rate: Number(i.rate || 0),
                    amount: Number(i.amount || 0),
                })),
            };

            const res = isEdit
                ? await putData(`autobills/${id}`, payload)
                : await postData("autobills/add", payload);

            callAlertMsg(res.message || (isEdit ? "Updated successfully" : "Saved successfully"), "success");
            navigate("/automobile/billing");
        } catch (err: any) {
            callAlertMsg(err?.message || "Error saving data. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    const pageTitle = isView ? "View bill" : isEdit ? "Edit bill" : "Create bill";
    const E = errors.autoBill;
    const billNo = watch("autoBill.billNo");
    const memos = Array.from({ length: memoCount }, (_, m) => m);
    const breakdown = memoCount > 1 ? memos.map((m) => `Memo ${m + 1}: ${money(memoTotal(m))}`).join(" + ") : undefined;
    let serial = 0; // S.No runs on across memos, as on the paper bill

    return (
        <>
            <PageHeader title={pageTitle} back={{ onClick: () => navigate(-1), label: "Bills" }} />
            <motion.form
                key={pageTitle}
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
                <datalist id="auto-parts">
                    {parts.map((p) => <option key={p.value} value={p.label} label={`${p.unit ? `${p.unit} · ` : ""}${money(p.rate)}`} />)}
                </datalist>
                <datalist id="auto-units">
                    {units.map((u) => <option key={u} value={u} />)}
                </datalist>

                <section className="card bill-sheet">
                    <div className="card-body">
                        <div className="bill-sheet-head">
                            <div>
                                <h2 className="bill-sheet-title">{isView ? "Bill details" : "Spare parts bill"}</h2>
                                <p className="bill-sheet-sub">Parts and work for one {labels.vehicleNo.toLowerCase()}, grouped by memo</p>
                            </div>
                            <span className="bill-no" title={billNo == null && !id ? "The number is assigned when the bill is saved" : undefined}>
                                Bill No. {billNo != null ? billNo : id ? "…" : "[AUTO]"}
                            </span>
                        </div>

                        {loadingRecord ? <SkeletonRows rows={3} /> : (
                            <div className="bill-fields">
                                <Field label="Bill date" htmlFor="bill-date" required error={E?.date?.message}>
                                    <Controller
                                        name="autoBill.date"
                                        control={control}
                                        rules={{ required: "Date is required" }}
                                        render={({ field }) => <DateCalendar {...field} id="bill-date" disabled={isView} />}
                                    />
                                </Field>
                                <Field label={labels.customer} htmlFor="customer">
                                    <Controller
                                        name="autoBill.customerName"
                                        control={control}
                                        render={({ field }) => (
                                            <InputText {...field} id="customer" placeholder={`Enter ${labels.customer}`} disabled={isView} />
                                        )}
                                    />
                                </Field>
                                <Field label={labels.vehicleNo} htmlFor="vehicle-number" required error={E?.vehicleNumber?.message}>
                                    <Controller
                                        name="autoBill.vehicleNumber"
                                        control={control}
                                        rules={{ required: `${labels.vehicleNo} is required` }}
                                        render={({ field }) => (
                                            <InputText {...field} id="vehicle-number" placeholder={`Enter ${labels.vehicleNo}`} disabled={isView} />
                                        )}
                                    />
                                </Field>
                                <Field label="Phone number" htmlFor="phone" error={E?.phoneNumber?.message}>
                                    <Controller
                                        name="autoBill.phoneNumber"
                                        control={control}
                                        rules={{ pattern: { value: /^[0-9]{10}$/, message: "Enter valid 10 digit Mobile Number" } }}
                                        render={({ field }) => (
                                            <InputText {...field} id="phone" type="tel" inputMode="numeric" placeholder="Enter Phone Number" disabled={isView} />
                                        )}
                                    />
                                </Field>
                                <Field label={labels.agent} htmlFor="agent" required error={E?.mechanicName?.message}>
                                    <Controller
                                        name="autoBill.mechanicName"
                                        control={control}
                                        rules={{ required: `${labels.agent} is required` }}
                                        render={({ field }) => (
                                            <Selector
                                                inputId="agent"
                                                options={mechanicList.map((m) => ({ label: m, value: m }))}
                                                value={field.value ? { label: field.value, value: field.value } : null}
                                                isDisabled={isView}
                                                placeholder={`Select ${labels.agent}`}
                                                aria-invalid={!!E?.mechanicName}
                                                onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                            />
                                        )}
                                    />
                                </Field>
                                <Field label={labels.worker} htmlFor="worker">
                                    <Controller
                                        name="autoBill.labourName"
                                        control={control}
                                        render={({ field }) => (
                                            <Selector {...field} inputId="worker" isMulti options={labourOptions} disabled={isView} placeholder={`Select ${labels.worker}`} />
                                        )}
                                    />
                                </Field>
                                <Field label="Notes" htmlFor="notes" className="bill-fields-wide">
                                    <Controller
                                        name="autoBill.notes"
                                        control={control}
                                        render={({ field }) => (
                                            <InputText {...field} id="notes" placeholder="Optional notes" disabled={isView} />
                                        )}
                                    />
                                </Field>
                            </div>
                        )}

                        {loadingRecord ? <SkeletonRows rows={4} /> : (
                        <div className="memo-stack">
                            {memos.map((m) => {
                                const rows = fields.map((f, index) => ({ f, index })).filter(({ index }) => (items[index]?.memo || 0) === m);
                                return (
                                    <section key={m} className="memo" aria-label={`Memo ${m + 1}`}>
                                        <div className="memo-head">
                                            <span className="memo-tag">Memo {m + 1}</span>
                                            {!isView && memoCount > 1 && (
                                                <button type="button" className="btn btn-icon memo-remove" aria-label={`Remove memo ${m + 1}`} title="Remove memo" onClick={() => askRemoveMemo(m)}>
                                                    <Icons iconName="delete" />
                                                </button>
                                            )}
                                        </div>

                                        {rows.length > 0 && (
                                            <div className="memo-cols" aria-hidden="true">
                                                <span>S.No</span><span>Particulars</span><span className="num">Qty</span><span>Unit</span><span className="num">Rate</span><span className="num">Amount</span><span />
                                            </div>
                                        )}
                                        {rows.length > 0 ? (
                                            <ul className="memo-rows" aria-label={`Items in memo ${m + 1}`}>
                                                {rows.map(({ f, index }) => {
                                                    const G = E?.items?.[index];
                                                    const rowError = G?.particulars?.message || G?.qty?.message || G?.rate?.message || G?.amount?.message;
                                                    const name = items[index]?.particulars || `item ${serial + 1}`;
                                                    serial += 1;
                                                    return (
                                                        <li key={f.id} className="memo-row">
                                                            <span className="memo-sno tabular">{serial}</span>
                                                            <div className="memo-part">
                                                                <Controller
                                                                    name={`autoBill.items.${index}.particulars`}
                                                                    control={control}
                                                                    rules={{ required: "Particulars is required" }}
                                                                    render={({ field }) => (
                                                                        <InputText
                                                                            {...field}
                                                                            id={`particulars-${index}`}
                                                                            list="auto-parts"
                                                                            autoComplete="off"
                                                                            aria-label={`Particulars, row ${serial}`}
                                                                            placeholder="Type part name, pick from list"
                                                                            disabled={isView}
                                                                            className={G?.particulars ? "is-invalid" : undefined}
                                                                            aria-invalid={!!G?.particulars || undefined}
                                                                            onChange={(e) => { field.onChange(e); onParticularsChange(index, e.target.value); }}
                                                                        />
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="memo-qty">
                                                                <span className="memo-mlabel" aria-hidden="true">Qty</span>
                                                                <Controller
                                                                    name={`autoBill.items.${index}.qty`}
                                                                    control={control}
                                                                    rules={{ required: "Qty is required", min: { value: 0.01, message: "Qty must be more than 0" } }}
                                                                    render={({ field }) => (
                                                                        <InputText
                                                                            {...field}
                                                                            id={`qty-${index}`}
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            className={`tabular text-end${G?.qty ? " is-invalid" : ""}`}
                                                                            aria-label={`Quantity for ${name}`}
                                                                            placeholder="Qty"
                                                                            disabled={isView}
                                                                            aria-invalid={!!G?.qty || undefined}
                                                                            onChange={(e) => { field.onChange(e); onQtyChange(index, e.target.value); }}
                                                                        />
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="memo-unit">
                                                                <span className="memo-mlabel" aria-hidden="true">Unit</span>
                                                                <Controller
                                                                    name={`autoBill.items.${index}.unit`}
                                                                    control={control}
                                                                    render={({ field }) => (
                                                                        <InputText {...field} id={`unit-${index}`} list="auto-units" autoComplete="off" aria-label={`Unit for ${name}`}
                                                                            placeholder="Unit" disabled={isView} />
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="memo-rate">
                                                                <span className="memo-mlabel" aria-hidden="true">Rate</span>
                                                                <Controller
                                                                    name={`autoBill.items.${index}.rate`}
                                                                    control={control}
                                                                    rules={{ required: "Rate is required", min: { value: 0, message: "Rate must be 0 or more" } }}
                                                                    render={({ field }) => (
                                                                        <InputText
                                                                            {...field}
                                                                            id={`rate-${index}`}
                                                                            prefix="₹"
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            className={`tabular text-end${G?.rate ? " is-invalid" : ""}`}
                                                                            aria-label={`Rate for ${name}`}
                                                                            placeholder="Rate"
                                                                            disabled={isView}
                                                                            aria-invalid={!!G?.rate || undefined}
                                                                            onChange={(e) => { field.onChange(e); onRateChange(index, e.target.value); }}
                                                                        />
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="memo-amt">
                                                                <span className="memo-mlabel" aria-hidden="true">Amount</span>
                                                                <div className="memo-amt-box">
                                                                <span className="memo-amt-cur" aria-hidden="true">₹</span>
                                                                <Controller
                                                                    name={`autoBill.items.${index}.amount`}
                                                                    control={control}
                                                                    rules={{ required: "Amount is required", min: { value: 0, message: "Amount must be 0 or more" } }}
                                                                    render={({ field }) => (
                                                                        // Reads as the computed amount; still editable for a hand-agreed price.
                                                                        <InputText
                                                                            {...field}
                                                                            id={`amount-${index}`}
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            className={`memo-amt-input tabular${G?.amount ? " is-invalid" : ""}`}
                                                                            // Sized to its digits so the ₹ sits beside the number, like printed text.
                                                                            style={{ width: `calc(${Math.max(String(field.value ?? "").length, 4)}ch + 12px)` }}
                                                                            aria-label={`Amount for ${name} (₹)`}
                                                                            title="Qty × rate. Type to override."
                                                                            placeholder="0.00"
                                                                            disabled={isView}
                                                                            aria-invalid={!!G?.amount || undefined}
                                                                            onChange={(e) => { field.onChange(e); onAmountChange(index, e.target.value); }}
                                                                        />
                                                                    )}
                                                                />
                                                                </div>
                                                            </div>
                                                            {!isView && fields.length > 1 ? (
                                                                <button type="button" className="btn btn-icon memo-x" aria-label={`Remove ${name}`} onClick={() => remove(index)}>
                                                                    <Icons iconName="x" />
                                                                </button>
                                                            ) : <span className="memo-x" />}
                                                            {rowError && <span className="field-error memo-row-error" role="alert">{rowError}</span>}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : (
                                            <p className="memo-empty">No items in this memo yet.</p>
                                        )}

                                        <div className="memo-foot">
                                            {!isView ? (
                                                <button type="button" className="btn memo-add" onClick={() => addRow(m)}>
                                                    <Icons iconName="add" />Add item
                                                </button>
                                            ) : <span />}
                                            <div className="memo-subtotal">
                                                <span>Subtotal ({rows.length} item{rows.length === 1 ? "" : "s"}):</span>
                                                <strong className="tabular">{money(memoTotal(m))}</strong>
                                            </div>
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                        )}

                        {!isView && !loadingRecord && (
                            <button type="button" className="btn btn-secondary memo-new" onClick={addMemo} disabled={memoCount >= MAX_MEMOS}
                                title={memoCount >= MAX_MEMOS ? `A bill can have up to ${MAX_MEMOS} memos` : undefined}>
                                <Icons iconName="add" />Add memo
                            </button>
                        )}
                    </div>
                </section>

                <FormFooter totalLabel="Bill total" total={money(total)} totalNote={breakdown}>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        {isView ? "Back" : "Cancel"}
                    </button>
                    {!isView && (
                        <button type="submit" className="btn btn-primary" disabled={loading || loadingRecord}>
                            {loading && <span className="spinner" aria-hidden="true" />}
                            {loading ? "Saving..." : isEdit ? "Update bill" : "Create bill"}
                        </button>
                    )}
                </FormFooter>
            </motion.form>

            <ConfirmDialog
                open={confirmMemo !== null}
                title={`Remove memo ${(confirmMemo ?? 0) + 1}?`}
                message="Its items will be removed from this bill."
                confirmLabel="Remove memo"
                onConfirm={() => { if (confirmMemo !== null) removeMemo(confirmMemo); setConfirmMemo(null); }}
                onCancel={() => setConfirmMemo(null)}
            />
        </>
    );
};

export default CreateAutoBill;
