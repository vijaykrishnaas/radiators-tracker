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
import { useSettings, CatalogOption } from "../../../../Context/SettingsContext";
import { PageHeader, Field, FormFooter, CardHead, SkeletonRows } from "../../../../Components/ui/Basics";
import { AffixInput } from "../../../../Components/ui/Inputs";
import { money } from "../../../../Utils/format";

type ServiceGroup = {
    subject: CatalogOption | null;
    price: number | string;
    comments: string;
};

type FormValues = {
    radiatorsManagement: {
        date: Date | null;
        truckNumber: string;
        transportName: string;
        mechanicName: string;
        phoneNumber?: string;
        labourName: CatalogOption[];
        radiatorType: CatalogOption | null;
        radiatorGroups: ServiceGroup[];
    };
};

const CreateRadiators = () => {
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

    // Catalogs come from settings — nothing hardcoded per company.
    const productOptions = settings.catalog.productTypes;
    const serviceOptions = settings.catalog.serviceTypes;
    const priceMatrix = settings.catalog.priceMatrix;
    const labourOptions = settings.labour.map((name) => ({
        label: name,
        value: name.toLowerCase(),
    }));

    // DB stores labels; selectors need {label, value} — look up by label, then value.
    const findOption = (options: CatalogOption[], stored: string): CatalogOption =>
        options.find((o) => o.label === stored) ||
        options.find((o) => o.value === stored) || { label: stored, value: stored };

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
            radiatorsManagement: {
                date: null,
                truckNumber: "",
                transportName: "",
                mechanicName: "",
                phoneNumber: "",
                labourName: [],
                radiatorType: null,
                radiatorGroups: [{ subject: null, price: "", comments: "" }],
            },
        },
    });

    const loadRecord = async () => {
        setLoadingRecord(true);
        try {
            const data = await getData(`radiators/${id}`);

            const radiatorGroups: ServiceGroup[] = data.serviceInfo?.map((item: any) => ({
                subject: findOption(serviceOptions, item.type || ""),
                price: item.price ?? "",
                comments: item.comments || "",
            })) || [{ subject: null, price: "", comments: "" }];

            reset({
                radiatorsManagement: {
                    date: data.billDate ? new Date(data.billDate) : null,
                    truckNumber: data.truckNumber || "",
                    transportName: data.transportName || "",
                    mechanicName: data.mechanicName || "",
                    phoneNumber: data.phoneNumber || "",
                    labourName: (data.labourName || []).map((name: string) =>
                        labourOptions.find((o) => o.label === name) || { label: name, value: name }
                    ),
                    radiatorType: findOption(productOptions, data.radiatorType || ""),
                    radiatorGroups,
                },
            });
        } catch (err: any) {
            callAlertMsg(err?.message || "Error loading record", "error");
        } finally {
            setLoadingRecord(false);
        }
    };

    useEffect(() => {
        if (id && serviceOptions.length) {
            loadRecord();
        }
        // Re-run once settings arrive so option lookups resolve correctly
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, serviceOptions.length]);

    const { fields, append, remove } = useFieldArray({
        control,
        name: "radiatorsManagement.radiatorGroups",
    });

    const selectedRadiatorType = watch("radiatorsManagement.radiatorType") as any;
    const groups = watch("radiatorsManagement.radiatorGroups") || [];

    const requiresComment = (subject: any) => {
        const opt = serviceOptions.find((o) => o.value === subject?.value);
        return opt?.requiresComment || subject?.value === "other";
    };

    // When the model changes, re-apply the price matrix to every already-chosen
    // service row. Without this, picking the model *after* the services left all
    // prices blank (auto-pricing only fired on service change).
    const applyMatrixPrices = (model: any) => {
        const modelValue = model?.value ?? model;
        if (!modelValue) return;
        groups.forEach((g: any, idx: number) => {
            const svc = g?.subject;
            if (!svc || requiresComment(svc)) return;
            const price = priceMatrix[modelValue]?.[svc.value];
            if (price != null) {
                setValue(`radiatorsManagement.radiatorGroups.${idx}.price`, price);
            }
        });
    };

    const onSubmit = async (data: any) => {
        if (isView) return;
        setLoading(true);
        try {
            const rm = data.radiatorsManagement;
            const payload = {
                billDate: rm.date,
                truckNumber: rm.truckNumber,
                transportName: rm.transportName,
                mechanicName: rm.mechanicName,
                phoneNumber: rm.phoneNumber,
                labourName: rm.labourName,
                // Store labels — matches existing DB data shape
                radiatorType: rm.radiatorType?.label || rm.radiatorType,
                serviceInfo: rm.radiatorGroups.map((group: any) => ({
                    type: group.subject?.label || group.subject,
                    price: Number(group.price || 0),
                    comments: group.comments || "",
                })),
            };

            const res = isEdit
                ? await putData(`radiators/${id}`, payload)
                : await postData("radiators/add", payload);

            callAlertMsg(res.message || (isEdit ? "Updated successfully" : "Saved successfully"), "success");
            navigate("/issueCounter/billing");
        } catch (err: any) {
            callAlertMsg(err?.message || "Error saving data. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    const pageTitle = isView ? "View bill" : isEdit ? "Edit bill" : "Create bill";
    const E = errors.radiatorsManagement;
    const billTotal = (groups || []).reduce((sum: number, g: any) => sum + Number(g?.price || 0), 0);

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
                                            name="radiatorsManagement.date"
                                            control={control}
                                            rules={{ required: "Date is required" }}
                                            render={({ field }) => <DateCalendar {...field} id="bill-date" disabled={isView} />}
                                        />
                                    </Field>
                                    <Field label={settings.labels.vehicleNo} htmlFor="truck-number" required error={E?.truckNumber?.message}>
                                        <Controller
                                            name="radiatorsManagement.truckNumber"
                                            control={control}
                                            rules={{ required: `${settings.labels.vehicleNo} is required` }}
                                            render={({ field }) => (
                                                <InputText {...field} id="truck-number" placeholder={`Enter ${settings.labels.vehicleNo}`} disabled={isView} />
                                            )}
                                        />
                                    </Field>
                                    <Field label={settings.labels.party} htmlFor="party" required error={E?.transportName?.message}>
                                        <Controller
                                            name="radiatorsManagement.transportName"
                                            control={control}
                                            rules={{ required: `${settings.labels.party} is required` }}
                                            render={({ field }) => (
                                                <InputText {...field} id="party" placeholder={`Enter ${settings.labels.party}`} disabled={isView} />
                                            )}
                                        />
                                    </Field>
                                    <Field label={settings.labels.agent} htmlFor="agent" required error={E?.mechanicName?.message}>
                                        <Controller
                                            name="radiatorsManagement.mechanicName"
                                            control={control}
                                            rules={{ required: `${settings.labels.agent} is required` }}
                                            render={({ field }) => (
                                                <Selector
                                                    inputId="agent"
                                                    options={(settings.mechanics || []).map((m) => ({ label: m, value: m }))}
                                                    value={field.value ? { label: field.value, value: field.value } : null}
                                                    isDisabled={isView}
                                                    placeholder={`Select ${settings.labels.agent}`}
                                                    aria-invalid={!!E?.mechanicName}
                                                    onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                                />
                                            )}
                                        />
                                    </Field>
                                    <Field label={settings.labels.product} htmlFor="product" required error={E?.radiatorType?.message}>
                                        <Controller
                                            name="radiatorsManagement.radiatorType"
                                            control={control}
                                            rules={{ required: `${settings.labels.product} is required` }}
                                            render={({ field }) => (
                                                <Selector
                                                    {...field}
                                                    inputId="product"
                                                    options={productOptions}
                                                    disabled={isView}
                                                    aria-invalid={!!E?.radiatorType}
                                                    onChange={(val: any) => {
                                                        field.onChange(val);
                                                        applyMatrixPrices(val);
                                                    }}
                                                />
                                            )}
                                        />
                                    </Field>
                                    <Field label={settings.labels.worker} htmlFor="worker" required error={E?.labourName?.message}>
                                        <Controller
                                            name="radiatorsManagement.labourName"
                                            control={control}
                                            rules={{
                                                validate: (v) =>
                                                    (Array.isArray(v) && v.length > 0) ||
                                                    `${settings.labels.worker} is required`,
                                            }}
                                            render={({ field }) => (
                                                <Selector {...field} inputId="worker" isMulti options={labourOptions} disabled={isView} aria-invalid={!!E?.labourName} />
                                            )}
                                        />
                                    </Field>
                                    <Field label="Phone number" htmlFor="phone" error={E?.phoneNumber?.message}>
                                        <Controller
                                            name="radiatorsManagement.phoneNumber"
                                            control={control}
                                            rules={{
                                                pattern: {
                                                    value: /^[0-9]{10}$/,
                                                    message: "Enter valid 10 digit Mobile Number",
                                                },
                                            }}
                                            render={({ field }) => (
                                                <InputText {...field} id="phone" type="tel" placeholder="Enter Phone Number" disabled={isView} />
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
                                title="Services"
                                actions={!isView && (
                                    <button type="button" className="btn btn-secondary btn-sm"
                                        onClick={() => append({ subject: null, price: "", comments: "" })}>
                                        <Icons iconName="add" />Add New Service
                                    </button>
                                )}
                            />
                            <div className="d-grid gap-3 mt-4">
                                {fields.map((fieldItem, index) => {
                                    const selectedSubjects = groups
                                        .map((g: any, i: number) => (i !== index ? g?.subject?.value : null))
                                        .filter(Boolean);
                                    const availableOptions = serviceOptions.filter((s) => !selectedSubjects.includes(s.value));
                                    const G = E?.radiatorGroups?.[index];
                                    return (
                                        <div key={fieldItem.id} className="nested-card">
                                            <div className="row g-3 align-items-start">
                                                <div className="col-md">
                                                    <Field label="Service type" htmlFor={`svc-${index}`} required error={G?.subject?.message}>
                                                        <Controller
                                                            name={`radiatorsManagement.radiatorGroups.${index}.subject`}
                                                            control={control}
                                                            rules={{ required: "Service type is required" }}
                                                            render={({ field }) => (
                                                                <Selector
                                                                    {...field}
                                                                    inputId={`svc-${index}`}
                                                                    options={availableOptions}
                                                                    disabled={isView}
                                                                    aria-invalid={!!G?.subject}
                                                                    onChange={(val: any) => {
                                                                        field.onChange(val);
                                                                        if (requiresComment(val)) {
                                                                            setValue(`radiatorsManagement.radiatorGroups.${index}.price`, "");
                                                                        } else if (selectedRadiatorType && val?.value) {
                                                                            const model = selectedRadiatorType.value || selectedRadiatorType;
                                                                            const price = priceMatrix[model]?.[val.value] ?? "";
                                                                            setValue(`radiatorsManagement.radiatorGroups.${index}.price`, price);
                                                                        }
                                                                    }}
                                                                />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                <div className="col-md">
                                                    <Field label="Price (₹)" htmlFor={`price-${index}`} required error={G?.price?.message}>
                                                        <Controller
                                                            name={`radiatorsManagement.radiatorGroups.${index}.price`}
                                                            control={control}
                                                            rules={{
                                                                required: "Price is required",
                                                                min: { value: 1, message: "Price must be greater than 0" },
                                                            }}
                                                            render={({ field }) => (
                                                                <AffixInput {...field} id={`price-${index}`} prefix="₹" type="number" inputMode="decimal"
                                                                    className="tabular text-end" placeholder="Enter price" disabled={isView} invalid={!!G?.price} />
                                                            )}
                                                        />
                                                    </Field>
                                                </div>
                                                {!isView && fields.length > 1 && (
                                                    <div className="col-md-auto pt-md-4 mt-md-2">
                                                        <button type="button" className="btn btn-outline-danger" onClick={() => remove(index)}>
                                                            <Icons iconName="delete" />Remove
                                                        </button>
                                                    </div>
                                                )}
                                                {/* Comment box for service types that require it (e.g. "Other") */}
                                                {requiresComment(groups[index]?.subject) && (
                                                    <div className="col-12">
                                                        <Field label="Comment" htmlFor={`comment-${index}`} required error={G?.comments?.message}>
                                                            <Controller
                                                                name={`radiatorsManagement.radiatorGroups.${index}.comments`}
                                                                control={control}
                                                                rules={{ required: "Please describe the service" }}
                                                                render={({ field }) => (
                                                                    <textarea {...field} id={`comment-${index}`} className="form-control" rows={2}
                                                                        placeholder="Describe the service" disabled={isView} aria-invalid={!!G?.comments || undefined} />
                                                                )}
                                                            />
                                                        </Field>
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

                <FormFooter totalLabel="Bill total" total={money(billTotal)}>
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

export default CreateRadiators;
