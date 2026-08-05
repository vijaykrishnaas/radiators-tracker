import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { AnimatePresence, motion } from "framer-motion";

import AlertComponent from "../../../../Components/AlertComponent";
import Loader from "../../../../Components/Loader";
import Icons from "../../../../Components/Icons";
import InputText from "../../../../Components/InputText";
import Selector from "../../../../Components/Selector";
import DateCalendar from "../../../../Components/DateCalendar";
import { getData, postData, putData } from "../../../../Services/ApiServices";
import { useAlertMsg } from "../../../../Services/AllServices";
import { useSettings } from "../../../../Context/SettingsContext";
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
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;
    const [loading, setLoading] = useState(false);
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
        setLoading(true);
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
            setLoading(false);
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

    const pageTitle = isView ? "View Bill" : isEdit ? "Edit Bill" : "Create Bill";

    return (
        <>
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <Loader loading={loading} />

            <div className="mt-2 overflow-hidden">
                <div className="base-title">
                    <div className="d-flex justify-content-start align-items-center">
                        <div className="resp-bar" />
                        <span className="card-sub-title">{pageTitle}</span>
                    </div>
                </div>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="row bg-white py-4">
                        <div className="col-12 pt-4 px-3 px-md-5">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={pageTitle}
                                    initial={{ opacity: 0, x: 100 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">Bill Date</label>
                                            <Controller
                                                name="autoBill.date"
                                                control={control}
                                                rules={{ required: "Date is required" }}
                                                render={({ field }) => <DateCalendar {...field} disabled={isView} />}
                                            />
                                            {errors.autoBill?.date && (
                                                <div className="text-danger">{errors.autoBill.date.message}</div>
                                            )}
                                        </div>
                                        <div className="col-xl-6">
                                            <label className="form-label">Bill No</label>
                                            <InputText value={watch("autoBill.billNo") ?? "auto-assigned"} disabled readOnly />
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">{labels.vehicleNo}</label>
                                            <Controller
                                                name="autoBill.vehicleNumber"
                                                control={control}
                                                rules={{ required: `${labels.vehicleNo} is required` }}
                                                render={({ field }) => (
                                                    <InputText {...field} placeholder={`Enter ${labels.vehicleNo}`} disabled={isView} />
                                                )}
                                            />
                                            {errors.autoBill?.vehicleNumber && (
                                                <span className="text-danger">{errors.autoBill.vehicleNumber.message}</span>
                                            )}
                                        </div>
                                        <div className="col-xl-6">
                                            <label className="form-label">{labels.customer}</label>
                                            <Controller
                                                name="autoBill.customerName"
                                                control={control}
                                                render={({ field }) => (
                                                    <InputText {...field} placeholder={`Enter ${labels.customer}`} disabled={isView} />
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">{labels.agent}</label>
                                            <Controller
                                                name="autoBill.mechanicName"
                                                control={control}
                                                rules={{ required: `${labels.agent} is required` }}
                                                render={({ field }) => (
                                                    <Selector
                                                        options={mechanicList.map((m) => ({ label: m, value: m }))}
                                                        value={field.value ? { label: field.value, value: field.value } : null}
                                                        isDisabled={isView}
                                                        placeholder={`Select ${labels.agent}`}
                                                        onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                                    />
                                                )}
                                            />
                                            {errors.autoBill?.mechanicName && (
                                                <span className="text-danger">{errors.autoBill.mechanicName.message}</span>
                                            )}
                                        </div>
                                        <div className="col-xl-6">
                                            <label className="form-label">{labels.worker}</label>
                                            <Controller
                                                name="autoBill.labourName"
                                                control={control}
                                                render={({ field }) => (
                                                    <Selector {...field} isMulti options={labourOptions} disabled={isView} />
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label">Phone Number</label>
                                            <Controller
                                                name="autoBill.phoneNumber"
                                                control={control}
                                                rules={{ pattern: { value: /^[0-9]{10}$/, message: "Enter valid 10 digit Mobile Number" } }}
                                                render={({ field }) => (
                                                    <InputText {...field} placeholder="Enter Phone Number" disabled={isView} />
                                                )}
                                            />
                                            {errors.autoBill?.phoneNumber && (
                                                <span className="text-danger">{errors.autoBill.phoneNumber.message}</span>
                                            )}
                                        </div>
                                        <div className="col-xl-6">
                                            <label className="form-label">Notes</label>
                                            <Controller
                                                name="autoBill.notes"
                                                control={control}
                                                render={({ field }) => (
                                                    <InputText {...field} placeholder="Optional notes" disabled={isView} />
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="col-md-12 d-flex align-items-center mt-5 mb-4 gap-3">
                                        <label className="font-s16 mb-1 font-w500">Items</label>
                                        <div className="session-custom-border flex-grow-1" />
                                    </div>

                                    {!isView && (
                                        <div className="d-flex justify-content-end mb-3">
                                            <button type="button" className="btn btn-sm btn-gradient"
                                                onClick={() => append({ ...emptyItem })}>
                                                <Icons iconName="addcircle" className="icon-15 icon-white" /> Add Item
                                            </button>
                                        </div>
                                    )}

                                    {fields.map((fieldItem, index) => (
                                        <div key={fieldItem.id} className="mb-4 p-3 border rounded">
                                            <div className="row align-items-start g-3">
                                                <div className="col-xl-4">
                                                    <label className="form-label label-required">Particulars</label>
                                                    <Controller
                                                        name={`autoBill.items.${index}.partRef`}
                                                        control={control}
                                                        render={() => (
                                                            <Selector
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
                                                                className="mt-2"
                                                                placeholder="Or type item name freely"
                                                                disabled={isView}
                                                                onChange={(e) => {
                                                                    field.onChange(e);
                                                                    setValue(`autoBill.items.${index}.partRef`, null);
                                                                }}
                                                            />
                                                        )}
                                                    />
                                                    {errors.autoBill?.items?.[index]?.particulars && (
                                                        <span className="text-danger">{errors.autoBill.items[index].particulars.message}</span>
                                                    )}
                                                </div>
                                                <div className="col-xl-2">
                                                    <label className="form-label label-required">Qty</label>
                                                    <Controller
                                                        name={`autoBill.items.${index}.qty`}
                                                        control={control}
                                                        rules={{ required: "Qty is required", min: { value: 0.01, message: "Must be > 0" } }}
                                                        render={({ field }) => (
                                                            <InputText
                                                                {...field}
                                                                type="number"
                                                                placeholder="Qty"
                                                                disabled={isView}
                                                                onChange={(e) => { field.onChange(e); onQtyChange(index, e.target.value); }}
                                                            />
                                                        )}
                                                    />
                                                    {errors.autoBill?.items?.[index]?.qty && (
                                                        <span className="text-danger">{errors.autoBill.items[index].qty.message}</span>
                                                    )}
                                                </div>
                                                <div className="col-xl-2">
                                                    <label className="form-label">Unit</label>
                                                    <Controller
                                                        name={`autoBill.items.${index}.unit`}
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Selector
                                                                options={units.map((u) => ({ label: u, value: u }))}
                                                                value={field.value ? { label: field.value, value: field.value } : null}
                                                                isDisabled={isView}
                                                                isClearable
                                                                placeholder="Unit"
                                                                onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                                            />
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-xl-2">
                                                    <label className="form-label label-required">Rate (₹)</label>
                                                    <Controller
                                                        name={`autoBill.items.${index}.rate`}
                                                        control={control}
                                                        rules={{ required: "Rate is required", min: { value: 0, message: "Must be ≥ 0" } }}
                                                        render={({ field }) => (
                                                            <InputText
                                                                {...field}
                                                                type="number"
                                                                placeholder="Rate"
                                                                disabled={isView}
                                                                onChange={(e) => { field.onChange(e); onRateChange(index, e.target.value); }}
                                                            />
                                                        )}
                                                    />
                                                    {errors.autoBill?.items?.[index]?.rate && (
                                                        <span className="text-danger">{errors.autoBill.items[index].rate.message}</span>
                                                    )}
                                                </div>
                                                <div className="col-xl-2">
                                                    <label className="form-label label-required">Amount (₹)</label>
                                                    <Controller
                                                        name={`autoBill.items.${index}.amount`}
                                                        control={control}
                                                        rules={{ required: "Amount is required", min: { value: 0, message: "Must be ≥ 0" } }}
                                                        render={({ field }) => (
                                                            <InputText
                                                                {...field}
                                                                type="number"
                                                                placeholder="Amount"
                                                                disabled={isView}
                                                                onChange={(e) => { field.onChange(e); onAmountChange(index, e.target.value); }}
                                                            />
                                                        )}
                                                    />
                                                    {errors.autoBill?.items?.[index]?.amount && (
                                                        <span className="text-danger">{errors.autoBill.items[index].amount.message}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {!isView && fields.length > 1 && (
                                                <div className="d-flex justify-content-end mt-2">
                                                    <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center"
                                                        onClick={() => remove(index)}>
                                                        <Icons iconName="delete" className="icon-15 me-1" /> Remove
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {fields.length > 0 && (
                                        <div className="d-flex justify-content-end align-items-baseline gap-3 mt-2 pe-1">
                                            <span className="font-s14" style={{ color: "var(--ink-500)" }}>Bill total</span>
                                            <span className="font-s20 fw-semibold" style={{ color: "var(--ink-900)" }}>
                                                {money(total)}
                                            </span>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="row mt-3 me-3">
                        <div className="col-xl-12 d-flex justify-content-end gap-2">
                            <button type="button" className="btn btn-cancel" onClick={() => navigate(-1)}>
                                {isView ? "Back" : "Cancel"}
                            </button>
                            {!isView && (
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? "Saving..." : isEdit ? "Update" : "Save"}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </>
    );
};

export default CreateAutoBill;
