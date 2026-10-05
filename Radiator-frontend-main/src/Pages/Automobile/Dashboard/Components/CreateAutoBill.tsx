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
import { PageHeader, Field, FormFooter, CardHead, SkeletonRows } from "../../../../Components/ui/Basics";
import { AffixInput } from "../../../../Components/ui/Inputs";
import { money } from "../../../../Utils/format";

type ItemRow = {
    particulars: string;
    partRef: string | null;
    qty: number | string;
    unit: string;
    rate: number | string;
    amount: number | string;
    amountTouched: boolean; // once the user hand-edits amount, qty/rate changes stop overwriting it
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

const emptyItem: ItemRow = { particulars: "", partRef: null, qty: "", unit: "", rate: "", amount: "", amountTouched: false };

const round2 = (n: number) => Math.round(n * 100) / 100;

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

    const parts = settings.automobile.parts || [];
    const units = settings.automobile.units || [];
    const labels = settings.automobile.labels;
    const labourOptions = (settings.labour || []).map((name) => ({ label: name, value: name.toLowerCase() }));
    const partOptions = parts.map((p) => ({ label: p.label, value: p.value }));

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
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

    const { fields, append, remove } = useFieldArray({ control, name: "autoBill.items" });
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
                amountTouched: true, // preserve exactly what was stored, don't auto-recompute on load
            }));
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

    const onPartChange = (index: number, opt: any) => {
        setValue(`autoBill.items.${index}.partRef`, opt ? opt.value : null);
        setValue(`autoBill.items.${index}.particulars`, opt ? opt.label : "");
        if (opt) {
            const part = parts.find((p) => p.value === opt.value);
            if (part) {
                setValue(`autoBill.items.${index}.unit`, part.unit || "");
                setValue(`autoBill.items.${index}.rate`, part.rate ?? "");
                setValue(`autoBill.items.${index}.amountTouched`, false);
                recomputeAmount(index, items[index]?.qty, part.rate);
            }
        }
    };

    const recomputeAmount = (index: number, qty: any, rate: any) => {
        if (items[index]?.amountTouched) return;
        const q = Number(qty) || 0;
        const r = Number(rate) || 0;
        setValue(`autoBill.items.${index}.amount`, q && r ? round2(q * r) : "");
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

    const onSubmit = async (data: any) => {
        if (isView) return;
        setLoading(true);
        try {
            const ab = data.autoBill;
            const payload = {
                billDate: ab.date,
                vehicleNumber: ab.vehicleNumber,
                customerName: ab.customerName,
                phoneNumber: ab.phoneNumber,
                mechanicName: ab.mechanicName,
                labourName: ab.labourName,
                notes: ab.notes,
                items: ab.items.map((i: ItemRow) => ({
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
                <div className="card-stack">
                    <section className="card">
                        <div className="card-body">
                            <CardHead title="Bill details" />
                            {loadingRecord ? <SkeletonRows rows={3} /> : (
                                <div className="form-grid mt-4">
                                    <Field label="Bill date" htmlFor="bill-date" required error={E?.date?.message}>
                                        <Controller
                                            name="autoBill.date"
                                            control={control}
                                            rules={{ required: "Date is required" }}
                                            render={({ field }) => <DateCalendar {...field} id="bill-date" disabled={isView} />}
                                        />
                                    </Field>
                                    <Field label="Bill No" htmlFor="bill-no">
                                        <InputText id="bill-no" value={watch("autoBill.billNo") ?? "auto-assigned"} disabled readOnly />
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
                                    <Field label={labels.customer} htmlFor="customer">
                                        <Controller
                                            name="autoBill.customerName"
                                            control={control}
                                            render={({ field }) => (
                                                <InputText {...field} id="customer" placeholder={`Enter ${labels.customer}`} disabled={isView} />
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
                                                <Selector {...field} inputId="worker" isMulti options={labourOptions} disabled={isView} />
                                            )}
                                        />
                                    </Field>
                                    <Field label="Phone number" htmlFor="phone" error={E?.phoneNumber?.message}>
                                        <Controller
                                            name="autoBill.phoneNumber"
                                            control={control}
                                            rules={{ pattern: { value: /^[0-9]{10}$/, message: "Enter valid 10 digit Mobile Number" } }}
                                            render={({ field }) => (
                                                <InputText {...field} id="phone" type="tel" placeholder="Enter Phone Number" disabled={isView} />
                                            )}
                                        />
                                    </Field>
                                    <Field label="Notes" htmlFor="notes" className="span-2">
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
                        </div>
                    </section>

                    <section className="card">
                        <div className="card-body">
                            <CardHead
                                title="Items"
                                actions={!isView && (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => append({ ...emptyItem })}>
                                        <Icons iconName="add" />Add Item
                                    </button>
                                )}
                            />
                            <div className="d-grid gap-3 mt-4">
                                {fields.map((fieldItem, index) => {
                                    const G = E?.items?.[index];
                                    return (
                                        <div key={fieldItem.id} className="nested-card">
                                            <div className="row g-3 align-items-start">
                                                <div className="col-12">
                                                    <Field label="Particulars" htmlFor={`part-${index}`} required error={G?.particulars?.message} help="Or type item name freely">
                                                        <Controller
                                                            name={`autoBill.items.${index}.partRef`}
                                                            control={control}
                                                            render={() => (
                                                                <Selector
                                                                    inputId={`part-${index}`}
                                                                    options={partOptions}
                                                                    isClearable
                                                                    isDisabled={isView}
                                                                    value={
                                                                        items[index]?.partRef
                                                                            ? { label: items[index]?.particulars, value: items[index]?.partRef }
                                                                            : null
                                                                    }
                                                                    placeholder="Pick a part, or type free text below"
                                                                    onChange={(opt: any) => onPartChange(index, opt)}
                                                                />
                                                            )}
                                                        />
                                                        <Controller
                                                            name={`autoBill.items.${index}.particulars`}
                                                            control={control}
                                                            rules={{ required: "Particulars is required" }}
                                                            render={({ field }) => (
                                                                <InputText
                                                                    {...field}
                                                                    id={`particulars-${index}`}
                                                                    aria-label="Item name"
                                                                    className="mt-2"
                                                                    placeholder="Item name"
                                                                    disabled={isView}
                                                                    aria-invalid={!!G?.particulars || undefined}
                                                                    onChange={(e) => {
                                                                        field.onChange(e);
                                                                        setValue(`autoBill.items.${index}.partRef`, null);
                                                                    }}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                <div className="col-6 col-md">
                                                    <Field label="Qty" htmlFor={`qty-${index}`} required error={G?.qty?.message}>
                                                        <Controller
                                                            name={`autoBill.items.${index}.qty`}
                                                            control={control}
                                                            rules={{ required: "Qty is required", min: { value: 0.01, message: "Must be > 0" } }}
                                                            render={({ field }) => (
                                                                <InputText
                                                                    {...field}
                                                                    id={`qty-${index}`}
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    className="tabular text-end"
                                                                    placeholder="Qty"
                                                                    disabled={isView}
                                                                    aria-invalid={!!G?.qty || undefined}
                                                                    onChange={(e) => { field.onChange(e); onQtyChange(index, e.target.value); }}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                <div className="col-6 col-md">
                                                    <Field label="Unit" htmlFor={`unit-${index}`}>
                                                        <Controller
                                                            name={`autoBill.items.${index}.unit`}
                                                            control={control}
                                                            render={({ field }) => (
                                                                <Selector
                                                                    inputId={`unit-${index}`}
                                                                    options={units.map((u) => ({ label: u, value: u }))}
                                                                    value={field.value ? { label: field.value, value: field.value } : null}
                                                                    isDisabled={isView}
                                                                    isClearable
                                                                    placeholder="Unit"
                                                                    onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                <div className="col-6 col-md">
                                                    <Field label="Rate (₹)" htmlFor={`rate-${index}`} required error={G?.rate?.message}>
                                                        <Controller
                                                            name={`autoBill.items.${index}.rate`}
                                                            control={control}
                                                            rules={{ required: "Rate is required", min: { value: 0, message: "Must be ≥ 0" } }}
                                                            render={({ field }) => (
                                                                <AffixInput
                                                                    {...field}
                                                                    id={`rate-${index}`}
                                                                    prefix="₹"
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    className="tabular text-end"
                                                                    placeholder="Rate"
                                                                    disabled={isView}
                                                                    invalid={!!G?.rate}
                                                                    onChange={(e) => { field.onChange(e); onRateChange(index, e.target.value); }}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                <div className="col-6 col-md">
                                                    <Field label="Amount (₹)" htmlFor={`amount-${index}`} required error={G?.amount?.message}>
                                                        <Controller
                                                            name={`autoBill.items.${index}.amount`}
                                                            control={control}
                                                            rules={{ required: "Amount is required", min: { value: 0, message: "Must be ≥ 0" } }}
                                                            render={({ field }) => (
                                                                <AffixInput
                                                                    {...field}
                                                                    id={`amount-${index}`}
                                                                    prefix="₹"
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    className="tabular text-end"
                                                                    placeholder="Amount"
                                                                    disabled={isView}
                                                                    invalid={!!G?.amount}
                                                                    onChange={(e) => { field.onChange(e); onAmountChange(index, e.target.value); }}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                {!isView && fields.length > 1 && (
                                                    <div className="col-12 col-md-auto pt-md-4 mt-md-2 d-flex justify-content-end">
                                                        <button type="button" className="btn btn-outline-danger btn-icon" aria-label={`Remove item ${index + 1}`} onClick={() => remove(index)}>
                                                            <Icons iconName="delete" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                </div>

                <FormFooter totalLabel="Bill total" total={money(total)}>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        {isView ? "Back" : "Cancel"}
                    </button>
                    {!isView && (
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading && <span className="spinner" aria-hidden="true" />}
                            {loading ? "Saving..." : isEdit ? "Update" : "Save"}
                        </button>
                    )}
                </FormFooter>
            </motion.form>
        </>
    );
};

export default CreateAutoBill;
