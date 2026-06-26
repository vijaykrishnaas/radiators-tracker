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
import { useSettings, CatalogOption } from "../../../../Context/SettingsContext";

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
        phoneNumber: string;
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
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;
    const [loading, setLoading] = useState(false);

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
        setLoading(true);
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
            setLoading(false);
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
                                            <label className="form-label label-required">Create Date</label>
                                            <Controller
                                                name="radiatorsManagement.date"
                                                control={control}
                                                rules={{ required: "Date is required" }}
                                                render={({ field }) => (
                                                    <DateCalendar {...field} disabled={isView} />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.date && (
                                                <div className="text-danger">
                                                    {errors.radiatorsManagement.date.message}
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-xl-6">
                                            <label className="form-label label-required">
                                                {settings.labels.vehicleNo}
                                            </label>
                                            <Controller
                                                name="radiatorsManagement.truckNumber"
                                                control={control}
                                                rules={{ required: `${settings.labels.vehicleNo} is required` }}
                                                render={({ field }) => (
                                                    <InputText
                                                        {...field}
                                                        placeholder={`Enter ${settings.labels.vehicleNo}`}
                                                        disabled={isView}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.truckNumber && (
                                                <span className="text-danger">
                                                    {errors.radiatorsManagement.truckNumber.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">
                                                {settings.labels.party}
                                            </label>
                                            <Controller
                                                name="radiatorsManagement.transportName"
                                                control={control}
                                                rules={{ required: `${settings.labels.party} is required` }}
                                                render={({ field }) => (
                                                    <InputText
                                                        {...field}
                                                        placeholder={`Enter ${settings.labels.party}`}
                                                        disabled={isView}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.transportName && (
                                                <div className="text-danger">
                                                    {errors.radiatorsManagement.transportName.message}
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-xl-6">
                                            <label className="form-label label-required">
                                                {settings.labels.agent}
                                            </label>
                                            <Controller
                                                name="radiatorsManagement.mechanicName"
                                                control={control}
                                                rules={{ required: `${settings.labels.agent} is required` }}
                                                render={({ field }) => (
                                                    <Selector
                                                        options={(settings.mechanics || []).map((m) => ({ label: m, value: m }))}
                                                        value={field.value ? { label: field.value, value: field.value } : null}
                                                        isDisabled={isView}
                                                        placeholder={`Select ${settings.labels.agent}`}
                                                        onChange={(opt: any) => field.onChange(opt ? opt.value : "")}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.mechanicName && (
                                                <span className="text-danger">
                                                    {errors.radiatorsManagement.mechanicName.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">
                                                {settings.labels.product}
                                            </label>
                                            <Controller
                                                name="radiatorsManagement.radiatorType"
                                                control={control}
                                                rules={{ required: `${settings.labels.product} is required` }}
                                                render={({ field }) => (
                                                    <Selector
                                                        {...field}
                                                        options={productOptions}
                                                        disabled={isView}
                                                        onChange={(val: any) => {
                                                            field.onChange(val);
                                                            applyMatrixPrices(val);
                                                        }}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.radiatorType && (
                                                <div className="text-danger">
                                                    {errors.radiatorsManagement.radiatorType.message}
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-xl-6">
                                            <label className="form-label label-required">
                                                {settings.labels.worker}
                                            </label>
                                            <Controller
                                                name="radiatorsManagement.labourName"
                                                control={control}
                                                rules={{
                                                    validate: (v) =>
                                                        (Array.isArray(v) && v.length > 0) ||
                                                        `${settings.labels.worker} is required`,
                                                }}
                                                render={({ field }) => (
                                                    <Selector
                                                        {...field}
                                                        isMulti
                                                        options={labourOptions}
                                                        disabled={isView}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.labourName && (
                                                <div className="text-danger">
                                                    {errors.radiatorsManagement.labourName.message}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="row form-group g-3">
                                        <div className="col-xl-6">
                                            <label className="form-label label-required">Phone Number</label>
                                            <Controller
                                                name="radiatorsManagement.phoneNumber"
                                                control={control}
                                                rules={{
                                                    required: "Phone Number is required",
                                                    pattern: {
                                                        value: /^[0-9]{10}$/,
                                                        message: "Enter valid 10 digit Mobile Number",
                                                    },
                                                }}
                                                render={({ field }) => (
                                                    <InputText
                                                        {...field}
                                                        placeholder="Enter Phone Number"
                                                        disabled={isView}
                                                    />
                                                )}
                                            />
                                            {errors.radiatorsManagement?.phoneNumber && (
                                                <span className="text-danger">
                                                    {errors.radiatorsManagement.phoneNumber.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="col-md-12 d-flex align-items-center mt-5 mb-4 gap-3">
                                        <label className="font-s16 mb-1 font-w500">Services</label>
                                        <div className="session-custom-border flex-grow-1" />
                                    </div>

                                    {!isView && (
                                        <div className="d-flex justify-content-end mb-3">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-gradient"
                                                onClick={() => append({ subject: null, price: "", comments: "" })}
                                            >
                                                <Icons iconName="addcircle" className="icon-15 icon-white" />{" "}
                                                Add New Service
                                            </button>
                                        </div>
                                    )}

                                    {fields.map((fieldItem, index) => {
                                        const selectedSubjects = groups
                                            .map((g: any, i: number) => (i !== index ? g?.subject?.value : null))
                                            .filter(Boolean);

                                        const availableOptions = serviceOptions.filter(
                                            (s) => !selectedSubjects.includes(s.value)
                                        );

                                        return (
                                            <div key={fieldItem.id} className="mb-4 p-3 border rounded">
                                                <div className="row align-items-start">
                                                    <div className="col-xl-5">
                                                        <label className="form-label label-required">
                                                            Service Type
                                                        </label>
                                                        <Controller
                                                            name={`radiatorsManagement.radiatorGroups.${index}.subject`}
                                                            control={control}
                                                            rules={{ required: "Service type is required" }}
                                                            render={({ field }) => (
                                                                <Selector
                                                                    {...field}
                                                                    options={availableOptions}
                                                                    disabled={isView}
                                                                    onChange={(val: any) => {
                                                                        field.onChange(val);

                                                                        if (requiresComment(val)) {
                                                                            setValue(
                                                                                `radiatorsManagement.radiatorGroups.${index}.price`,
                                                                                ""
                                                                            );
                                                                        } else if (selectedRadiatorType && val?.value) {
                                                                            const model =
                                                                                selectedRadiatorType.value || selectedRadiatorType;
                                                                            const price =
                                                                                priceMatrix[model]?.[val.value] ?? "";
                                                                            setValue(
                                                                                `radiatorsManagement.radiatorGroups.${index}.price`,
                                                                                price
                                                                            );
                                                                        }
                                                                    }}
                                                                />
                                                            )}
                                                        />
                                                        {errors.radiatorsManagement?.radiatorGroups?.[index]?.subject && (
                                                            <span className="text-danger">
                                                                {errors.radiatorsManagement.radiatorGroups[index].subject.message}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="col-xl-5">
                                                        <label className="form-label label-required">Price (₹)</label>
                                                        <Controller
                                                            name={`radiatorsManagement.radiatorGroups.${index}.price`}
                                                            control={control}
                                                            rules={{
                                                                required: "Price is required",
                                                                min: {
                                                                    value: 1,
                                                                    message: "Price must be greater than 0",
                                                                },
                                                            }}
                                                            render={({ field }) => (
                                                                <InputText
                                                                    {...field}
                                                                    type="number"
                                                                    placeholder="Enter price"
                                                                    disabled={isView}
                                                                />
                                                            )}
                                                        />
                                                        {errors.radiatorsManagement?.radiatorGroups?.[index]?.price && (
                                                            <span className="text-danger">
                                                                {errors.radiatorsManagement.radiatorGroups[index].price.message}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="col-xl-2">
                                                        {!isView && fields.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-danger btn-sm d-inline-flex align-items-center mt-4"
                                                                onClick={() => remove(index)}
                                                            >
                                                                <Icons iconName="delete" className="icon-15 me-1" />
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Comment box for service types that require it (e.g. "Other") */}
                                                {requiresComment(groups[index]?.subject) && (
                                                    <div className="row mt-3">
                                                        <div className="col-12">
                                                            <label className="form-label label-required">Comment</label>
                                                            <Controller
                                                                name={`radiatorsManagement.radiatorGroups.${index}.comments`}
                                                                control={control}
                                                                rules={{
                                                                    required: "Please describe the service",
                                                                }}
                                                                render={({ field }) => (
                                                                    <textarea
                                                                        {...field}
                                                                        className="form-control"
                                                                        rows={2}
                                                                        placeholder="Describe the service"
                                                                        disabled={isView}
                                                                    />
                                                                )}
                                                            />
                                                            {errors.radiatorsManagement?.radiatorGroups?.[index]?.comments && (
                                                                <span className="text-danger">
                                                                    {errors.radiatorsManagement.radiatorGroups[index].comments.message}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {fields.length > 0 && (
                                        <div className="d-flex justify-content-end align-items-baseline gap-3 mt-2 pe-1">
                                            <span className="font-s14" style={{ color: "var(--ink-500)" }}>Bill total</span>
                                            <span className="font-s20 fw-semibold" style={{ color: "var(--ink-900)" }}>
                                                ₹{(groups || []).reduce((sum: number, g: any) => sum + Number(g?.price || 0), 0).toLocaleString("en-IN")}
                                            </span>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="row mt-3 me-3">
                        <div className="col-xl-12 d-flex justify-content-end gap-2">
                            <button
                                type="button"
                                className="btn btn-cancel"
                                onClick={() => navigate(-1)}
                            >
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

export default CreateRadiators;
