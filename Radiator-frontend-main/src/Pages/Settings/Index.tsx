import { useEffect, useState } from "react";
import { Tag } from "react-tag-input";

import Loader from "../../Components/Loader";
import AlertComponent from "../../Components/AlertComponent";
import Icons from "../../Components/Icons";
import InputText from "../../Components/InputText";
import InputTag from "../../Components/InputTag";
import Switch from "../../Components/Switch";
import { putData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import { useSettings, AppSettings, CatalogOption } from "../../Context/SettingsContext";

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";
const resolveLogo = (url?: string) => (url && url.startsWith("/") ? `${BACKEND}${url}` : url || "");

const slugify = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, "").trim() || label.toLowerCase();

const SectionTitle = ({ title }: { title: string }) => (
    <div className="d-flex justify-content-start align-items-center mb-4">
        <div className="resp-bar" />
        <span className="card-sub-title">{title}</span>
    </div>
);

const SettingsPage = () => {
    const { settings, loading: settingsLoading, refreshSettings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [draft, setDraft] = useState<AppSettings>(settings);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingQr, setUploadingQr] = useState(false);
    const [uploadingBg, setUploadingBg] = useState(false);
    const [uploadingSignature, setUploadingSignature] = useState(false);
    const [newProduct, setNewProduct] = useState("");
    const [newService, setNewService] = useState("");
    const [activeTab, setActiveTab] = useState<"company" | "catalog" | "people" | "bonus" | "invoice" | "salary">("company");
    const [newPartLabel, setNewPartLabel] = useState("");
    const [newPartUnit, setNewPartUnit] = useState("");
    const [newPartRate, setNewPartRate] = useState("");
    const [newUnit, setNewUnit] = useState("");

    // Automobile tenants get a parallel set of settings tabs (parts catalog,
    // flat bonus %, automobile-specific labels/invoice) instead of the
    // radiator catalog/price-matrix/bonus-matrix tabs. Radiator behavior below
    // is untouched — every automobile branch is additive.
    const isAutomobile = draft.businessType === "automobile";
    const auto = draft.automobile;

    const uploadLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploadingLogo(true);
        try {
            const fd = new FormData();
            fd.append("logo", file);
            const res = await postData("settings/logo", fd);
            set("company.logoUrl", res.logoUrl);
            await refreshSettings();
            callAlertMsg(res.message || "Logo updated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Logo upload failed", "error");
        } finally {
            setUploadingLogo(false);
        }
    };

    const uploadQr = async (file: File | undefined) => {
        if (!file) return;
        setUploadingQr(true);
        try {
            const fd = new FormData();
            fd.append("logo", file); // the upload field is named "logo" on the backend
            const res = await postData("settings/qr", fd);
            set("company.qrUrl", res.qrUrl);
            await refreshSettings();
            callAlertMsg(res.message || "Payment QR updated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "QR upload failed", "error");
        } finally {
            setUploadingQr(false);
        }
    };

    const uploadSignature = async (file: File | undefined) => {
        if (!file) return;
        setUploadingSignature(true);
        try {
            const fd = new FormData();
            fd.append("logo", file); // the upload field is named "logo" on the backend
            const res = await postData("settings/signature", fd);
            set("company.signatureUrl", res.signatureUrl);
            await refreshSettings();
            callAlertMsg(res.message || "Signature updated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Signature upload failed", "error");
        } finally {
            setUploadingSignature(false);
        }
    };

    const uploadLoginBg = async (file: File | undefined) => {
        if (!file) return;
        setUploadingBg(true);
        try {
            const fd = new FormData();
            fd.append("logo", file); // the upload field is named "logo" on the backend
            const res = await postData("settings/login-bg", fd);
            set("company.loginBgUrl", res.loginBgUrl);
            await refreshSettings();
            callAlertMsg(res.message || "Login background updated", "success");
        } catch (err: any) {
            callAlertMsg(err?.message || "Background upload failed", "error");
        } finally {
            setUploadingBg(false);
        }
    };

    useEffect(() => {
        setDraft(settings);
    }, [settings]);

    const set = (path: string, value: unknown) => {
        setDraft((prev) => {
            const next: any = structuredClone(prev);
            const keys = path.split(".");
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
            obj[keys[keys.length - 1]] = value;
            return next;
        });
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await putData("settings", draft);
            callAlertMsg(res.message || "Settings saved", "success");
            await refreshSettings();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to save settings", "error");
        } finally {
            setSaving(false);
        }
    };

    // ---- Catalog helpers ----
    const priceableServices = draft.catalog.serviceTypes.filter((s) => !s.requiresComment);

    const addProduct = () => {
        if (!newProduct.trim()) return;
        const value = slugify(newProduct);
        if (draft.catalog.productTypes.some((p) => p.value === value)) return;
        set("catalog.productTypes", [...draft.catalog.productTypes, { label: newProduct.trim(), value }]);
        set(`catalog.priceMatrix.${value}`, {});
        set(`bonus.mechanic.matrix.${value}`, {});
        set(`bonus.labour.matrix.${value}`, {});
        setNewProduct("");
    };

    const removeProduct = (value: string) => {
        set("catalog.productTypes", draft.catalog.productTypes.filter((p) => p.value !== value));
        const matrix = { ...draft.catalog.priceMatrix };
        delete matrix[value];
        set("catalog.priceMatrix", matrix);
        const mech = { ...draft.bonus.mechanic.matrix };
        delete mech[value];
        set("bonus.mechanic.matrix", mech);
        const lab = { ...draft.bonus.labour.matrix };
        delete lab[value];
        set("bonus.labour.matrix", lab);
    };

    const addService = () => {
        if (!newService.trim()) return;
        const value = slugify(newService);
        if (draft.catalog.serviceTypes.some((s) => s.value === value)) return;
        set("catalog.serviceTypes", [...draft.catalog.serviceTypes, { label: newService.trim(), value }]);
        setNewService("");
    };

    const removeService = (value: string) => {
        set("catalog.serviceTypes", draft.catalog.serviceTypes.filter((s) => s.value !== value));
    };

    const setPrice = (product: string, service: string, price: string) => {
        set(`catalog.priceMatrix.${product}.${service}`, Number(price || 0));
    };

    const setBonusPercent = (role: "mechanic" | "labour", product: string, service: string, percent: string) => {
        set(`bonus.${role}.matrix.${product}.${service}`, Number(percent || 0));
    };

    // Same grid pattern as the price matrix, but cells are percentages.
    const bonusMatrixGrid = (role: "mechanic" | "labour") => (
        <div className="table-body">
            <table className="table table-bordered align-middle font-s14">
                <thead>
                    <tr>
                        <th>{draft.labels.product}</th>
                        {priceableServices.map((s) => (
                            <th key={s.value}>{s.label} (%)</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {draft.catalog.productTypes.map((p) => (
                        <tr key={p.value}>
                            <td className="font-w500">{p.label}</td>
                            {priceableServices.map((s) => (
                                <td key={s.value}>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        id={`bonus-${role}-${p.value}-${s.value}`}
                                        name={`bonus-${role}-${p.value}-${s.value}`}
                                        aria-label={`${role} bonus percent for ${p.label} ${s.label}`}
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        value={draft.bonus[role].matrix[p.value]?.[s.value] ?? ""}
                                        onChange={(e) => setBonusPercent(role, p.value, s.value, e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    // ---- Automobile: parts catalog ----
    const addPart = () => {
        if (!newPartLabel.trim()) return;
        const value = slugify(newPartLabel);
        if (auto.parts.some((p) => p.value === value)) return;
        set("automobile.parts", [
            ...auto.parts,
            { label: newPartLabel.trim(), value, unit: newPartUnit.trim(), rate: Number(newPartRate || 0) },
        ]);
        setNewPartLabel(""); setNewPartUnit(""); setNewPartRate("");
    };

    const removePart = (value: string) => {
        set("automobile.parts", auto.parts.filter((p) => p.value !== value));
    };

    const updatePartField = (value: string, field: "label" | "unit" | "rate", fieldValue: string) => {
        set(
            "automobile.parts",
            auto.parts.map((p) =>
                p.value === value ? { ...p, [field]: field === "rate" ? Number(fieldValue || 0) : fieldValue } : p
            )
        );
    };

    // ---- Automobile: units ----
    const addUnit = () => {
        const u = newUnit.trim();
        if (!u || auto.units.includes(u)) return;
        set("automobile.units", [...auto.units, u]);
        setNewUnit("");
    };

    const removeUnit = (u: string) => {
        set("automobile.units", auto.units.filter((x) => x !== u));
    };

    // ---- Labour tags ----
    const labourTags: Tag[] = draft.labour.map((name) => ({ id: name, text: name, className: "" }));

    const handleLabourDelete = (i: number) => {
        set("labour", draft.labour.filter((_, index) => index !== i));
    };

    const handleLabourAddition = (tag: Tag) => {
        const name = tag.text.trim();
        if (!name || draft.labour.includes(name)) return;
        set("labour", [...draft.labour, name]);
    };

    const handleLabourDrag = (tag: Tag, currPos: number, newPos: number) => {
        const next = [...draft.labour];
        next.splice(currPos, 1);
        next.splice(newPos, 0, tag.text);
        set("labour", next);
    };

    // ---- Mechanic tags (same pattern as labour) ----
    const mechanics = draft.mechanics ?? [];
    const mechanicTags: Tag[] = mechanics.map((name) => ({ id: name, text: name, className: "" }));

    const handleMechanicDelete = (i: number) => {
        set("mechanics", mechanics.filter((_, index) => index !== i));
    };

    const handleMechanicAddition = (tag: Tag) => {
        const name = tag.text.trim();
        if (!name || mechanics.includes(name)) return;
        set("mechanics", [...mechanics, name]);
    };

    const handleMechanicDrag = (tag: Tag, currPos: number, newPos: number) => {
        const next = [...mechanics];
        next.splice(currPos, 1);
        next.splice(newPos, 0, tag.text);
        set("mechanics", next);
    };

    // ---- Login highlight lines (rotating text on the login page) ----
    const loginHighlights = draft.loginHighlights ?? [];
    const highlightTags: Tag[] = loginHighlights.map((line) => ({ id: line, text: line, className: "" }));

    const handleHighlightDelete = (i: number) => {
        set("loginHighlights", loginHighlights.filter((_, index) => index !== i));
    };

    const handleHighlightAddition = (tag: Tag) => {
        const line = tag.text.trim();
        if (!line || loginHighlights.includes(line)) return;
        set("loginHighlights", [...loginHighlights, line]);
    };

    const handleHighlightDrag = (tag: Tag, currPos: number, newPos: number) => {
        const next = [...loginHighlights];
        next.splice(currPos, 1);
        next.splice(newPos, 0, tag.text);
        set("loginHighlights", next);
    };

    const textField = (label: string, path: string, value: string, placeholder = "") => {
        const fieldId = `setting-${path.replace(/\./g, "-")}`;
        return (
            <div className="col-xl-6">
                <label className="form-label" htmlFor={fieldId}>{label}</label>
                <InputText
                    id={fieldId}
                    name={fieldId}
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => set(path, e.target.value)}
                />
            </div>
        );
    };

    return (
        <div className="row">
            <Loader loading={settingsLoading || saving} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Settings</h4>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm d-flex align-items-center"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Icons iconName="addcircle" className="icon-12 icon-white me-2" />
                        {saving ? "Saving..." : "Save All Settings"}
                    </button>
                </div>

                {/* Tabbed sections — Save All Settings (above) persists every tab at once. */}
                <div className="settings-tabs mb-4" role="tablist">
                    {(isAutomobile ? [
                        ["company", "Company"],
                        ["catalog", "Parts Catalog"],
                        ["people", `${auto.labels.agent} & ${auto.labels.worker}`],
                        ["bonus", "Bonus"],
                        ["invoice", "Labels & Invoice"],
                        ["salary", "Salary"],
                    ] as const : [
                        ["company", "Company"],
                        ["catalog", "Catalog & Pricing"],
                        ["people", `${draft.labels.agent} & ${draft.labels.worker}`],
                        ["bonus", "Bonus"],
                        ["invoice", "Invoice"],
                        ["salary", "Salary"],
                    ] as const).map(([id, label]) => (
                        <button key={id} type="button" role="tab" aria-selected={activeTab === id}
                            className={`settings-tab${activeTab === id ? " is-active" : ""}`}
                            onClick={() => setActiveTab(id)}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ---- Company ---- */}
                {activeTab === "company" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Company Profile" />
                        <div className="row form-group g-3">
                            {textField("Company Name", "company.name", draft.company.name)}
                            {textField("Address", "company.address", draft.company.address)}
                        </div>
                        <div className="row form-group g-3">
                            {textField("Phone 1", "company.phone1", draft.company.phone1)}
                            {textField("Phone 2", "company.phone2", draft.company.phone2)}
                        </div>
                        <div className="row form-group g-3">
                            {textField("UPI ID (for payment QR)", "company.upiId", draft.company.upiId, "e.g. 7708093151@ybl")}
                            {textField("Payment display text", "company.upiDisplay", draft.company.upiDisplay, "e.g. PhonePe 77080 93151")}
                        </div>
                        <div className="row form-group g-3 align-items-center">
                            <div className="col-md-6">
                                <label className="form-label font-w500">Business Logo</label>
                                <input type="file" className="form-control" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                    disabled={uploadingLogo}
                                    onChange={(e) => uploadLogo(e.target.files?.[0])} />
                                <small className="text-muted font-s12">PNG, JPG, SVG or WebP, up to 1 MB.</small>
                            </div>
                            <div className="col-md-6">
                                {draft.company.logoUrl ? (
                                    <img src={resolveLogo(draft.company.logoUrl)} alt="Logo preview"
                                        style={{ maxHeight: 60, maxWidth: 180, objectFit: "contain" }} />
                                ) : (
                                    <span className="text-muted font-s13">{uploadingLogo ? "Uploading..." : "No logo uploaded"}</span>
                                )}
                            </div>
                        </div>
                        <div className="row form-group g-3 align-items-center">
                            <div className="col-md-6">
                                <label className="form-label font-w500">Payment QR (printed on the bill)</label>
                                <input type="file" className="form-control" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                    disabled={uploadingQr}
                                    onChange={(e) => uploadQr(e.target.files?.[0])} />
                                <small className="text-muted font-s12">Upload your UPI/payment QR image. If set, it's printed on the invoice instead of the auto-generated one.</small>
                            </div>
                            <div className="col-md-6">
                                {draft.company.qrUrl ? (
                                    <img src={resolveLogo(draft.company.qrUrl)} alt="Payment QR preview"
                                        style={{ maxHeight: 90, maxWidth: 90, objectFit: "contain" }} />
                                ) : (
                                    <span className="text-muted font-s13">{uploadingQr ? "Uploading..." : "No QR uploaded"}</span>
                                )}
                            </div>
                        </div>
                        <div className="row form-group g-3 align-items-center">
                            <div className="col-md-6">
                                <label className="form-label font-w500">Authorised signature (printed on the bill)</label>
                                <input type="file" className="form-control" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                    disabled={uploadingSignature}
                                    onChange={(e) => uploadSignature(e.target.files?.[0])} />
                                <small className="text-muted font-s12">Upload a signature image (png with transparency works best, ≤1MB). It's printed above "Authorised signatory" when enabled in Invoice Options below.</small>
                            </div>
                            <div className="col-md-6">
                                {draft.company.signatureUrl ? (
                                    <img src={resolveLogo(draft.company.signatureUrl)} alt="Signature preview"
                                        style={{ maxHeight: 60, maxWidth: 160, objectFit: "contain", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 6, background: "#fff" }} />
                                ) : (
                                    <span className="text-muted font-s13">{uploadingSignature ? "Uploading..." : "No signature uploaded"}</span>
                                )}
                            </div>
                        </div>
                        <div className="row form-group g-3 align-items-center">
                            <div className="col-md-6">
                                <label className="form-label font-w500">Login Background (shown on your login page)</label>
                                <input type="file" className="form-control" accept="image/png,image/jpeg,image/webp"
                                    disabled={uploadingBg}
                                    onChange={(e) => uploadLoginBg(e.target.files?.[0])} />
                                <small className="text-muted font-s12">Upload a full-screen background image (png/jpeg/webp, ≤4MB) for your branded login page. Your brand colours are layered over it automatically.</small>
                            </div>
                            <div className="col-md-6">
                                {draft.company.loginBgUrl ? (
                                    <img src={resolveLogo(draft.company.loginBgUrl)} alt="Login background preview"
                                        style={{ maxHeight: 90, maxWidth: 160, objectFit: "cover", borderRadius: 8 }} />
                                ) : (
                                    <span className="text-muted font-s13">{uploadingBg ? "Uploading..." : "Using default background"}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                )}

                {/* ---- Branding ---- */}
                {activeTab === "company" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Branding" />
                        <div className="row form-group g-3">
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="primary-color">Primary Color</label>
                                <input
                                    id="primary-color"
                                    type="color"
                                    className="form-control form-control-color w-100"
                                    value={draft.branding.primaryColor}
                                    onChange={(e) => set("branding.primaryColor", e.target.value)}
                                />
                            </div>
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="accent-color">Accent Color</label>
                                <input
                                    id="accent-color"
                                    type="color"
                                    className="form-control form-control-color w-100"
                                    value={draft.branding.accentColor}
                                    onChange={(e) => set("branding.accentColor", e.target.value)}
                                />
                            </div>
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="login-text-color">Login Text Color</label>
                                <input
                                    id="login-text-color"
                                    type="color"
                                    className="form-control form-control-color w-100"
                                    value={draft.branding.loginTextColor || "#FFFFFF"}
                                    onChange={(e) => set("branding.loginTextColor", e.target.value)}
                                />
                            </div>
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            Primary drives the app theme and printed documents; accent drives the login screen highlights; login text color sets your company name's color on the sign-in screen.
                        </small>
                    </div>
                </div>

                )}

                {/* ---- Automobile: Parts Catalog & Units ---- */}
                {activeTab === "catalog" && isAutomobile && (
                <>
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Parts Catalog" />
                        <div className="row form-group g-3">
                            <div className="col-xl-4">
                                <label className="form-label" htmlFor="new-part-label">Part Name</label>
                                <InputText id="new-part-label" value={newPartLabel} placeholder="e.g. Engine Oil 15W40"
                                    onChange={(e) => setNewPartLabel(e.target.value)} />
                            </div>
                            <div className="col-xl-3">
                                <label className="form-label" htmlFor="new-part-unit">Unit</label>
                                <InputText id="new-part-unit" value={newPartUnit} placeholder="e.g. L"
                                    onChange={(e) => setNewPartUnit(e.target.value)} />
                            </div>
                            <div className="col-xl-3">
                                <label className="form-label" htmlFor="new-part-rate">Default Rate (₹)</label>
                                <InputText id="new-part-rate" type="number" value={newPartRate} placeholder="e.g. 450"
                                    onChange={(e) => setNewPartRate(e.target.value)} />
                            </div>
                            <div className="col-xl-2 d-flex align-items-end">
                                <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center w-100" onClick={addPart}>
                                    <Icons iconName="addcircle" className="icon-15 icon-white me-1" />Add
                                </button>
                            </div>
                        </div>

                        <div className="table-body mt-3">
                            <table className="table table-bordered font-s14 align-middle">
                                <thead>
                                    <tr>
                                        <th>Part Name</th>
                                        <th style={{ width: "140px" }}>Unit</th>
                                        <th style={{ width: "160px" }}>Rate (₹)</th>
                                        <th style={{ width: "60px" }} aria-label="Actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auto.parts.map((p) => (
                                        <tr key={p.value}>
                                            <td>
                                                <input type="text" className="form-control form-control-sm"
                                                    aria-label={`${p.label} name`}
                                                    value={p.label}
                                                    onChange={(e) => updatePartField(p.value, "label", e.target.value)} />
                                            </td>
                                            <td>
                                                <input type="text" className="form-control form-control-sm"
                                                    aria-label={`${p.label} unit`}
                                                    value={p.unit}
                                                    onChange={(e) => updatePartField(p.value, "unit", e.target.value)} />
                                            </td>
                                            <td>
                                                <input type="number" className="form-control form-control-sm"
                                                    aria-label={`${p.label} rate`}
                                                    value={p.rate}
                                                    onChange={(e) => updatePartField(p.value, "rate", e.target.value)} />
                                            </td>
                                            <td className="text-center">
                                                <span role="button" aria-label={`Remove ${p.label}`} title={`Remove ${p.label}`}
                                                    onClick={() => removePart(p.value)}>
                                                    <Icons iconName="delete" className="icon-15" />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {!auto.parts.length && (
                                        <tr><td colSpan={4} className="text-center text-muted py-3">No parts yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            Picking a part on the bill form auto-fills its unit and rate; one-off items can still be typed freely.
                        </small>
                    </div>
                </div>

                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Units" />
                        <div className="d-flex gap-2 mb-3">
                            <InputText value={newUnit} placeholder="e.g. pcs, set, L, kg, hrs"
                                onChange={(e) => setNewUnit(e.target.value)} />
                            <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center" onClick={addUnit}>
                                <Icons iconName="addcircle" className="icon-15 icon-white me-1" />Add
                            </button>
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                            {auto.units.map((u) => (
                                <span key={u} className="status-badge d-flex align-items-center gap-2">
                                    {u}
                                    <span role="button" aria-label={`Remove ${u}`} onClick={() => removeUnit(u)}>
                                        <Icons iconName="modelclose" className="icon-12" />
                                    </span>
                                </span>
                            ))}
                            {!auto.units.length && <span className="text-muted font-s13">No units yet</span>}
                        </div>
                    </div>
                </div>
                </>
                )}

                {/* ---- Catalog & Prices ---- */}
                {activeTab === "catalog" && !isAutomobile && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Catalog & Price Matrix" />
                        <div className="row form-group g-3">
                            <div className="col-xl-6">
                                <label className="form-label" htmlFor="new-product">Add {draft.labels.product}</label>
                                <div className="d-flex gap-2">
                                    <InputText
                                        id="new-product"
                                        value={newProduct}
                                        placeholder="e.g. BS-VII"
                                        onChange={(e) => setNewProduct(e.target.value)}
                                    />
                                    <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center" onClick={addProduct}>
                                        <Icons iconName="addcircle" className="icon-15 icon-white me-1" />
                                        Add
                                    </button>
                                </div>
                            </div>
                            <div className="col-xl-6">
                                <label className="form-label" htmlFor="new-service">Add Service Type</label>
                                <div className="d-flex gap-2">
                                    <InputText
                                        id="new-service"
                                        value={newService}
                                        placeholder="e.g. Pressure Test"
                                        onChange={(e) => setNewService(e.target.value)}
                                    />
                                    <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center" onClick={addService}>
                                        <Icons iconName="addcircle" className="icon-15 icon-white me-1" />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="table-body mt-3">
                            <table className="table table-bordered font-s14 align-middle">
                                <thead>
                                    <tr>
                                        <th>{draft.labels.product}</th>
                                        {priceableServices.map((s: CatalogOption) => (
                                            <th key={s.value}>
                                                <div className="d-flex justify-content-between align-items-center">
                                                    {s.label}
                                                    <span
                                                        role="button"
                                                        aria-label={`Remove ${s.label}`}
                                                        title={`Remove ${s.label}`}
                                                        onClick={() => removeService(s.value)}
                                                    >
                                                        <Icons iconName="modelclose" className="icon-12 ms-2" />
                                                    </span>
                                                </div>
                                            </th>
                                        ))}
                                        <th style={{ width: "60px" }} aria-label="Actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draft.catalog.productTypes.map((p) => (
                                        <tr key={p.value}>
                                            <td className="font-w500">{p.label}</td>
                                            {priceableServices.map((s) => (
                                                <td key={s.value}>
                                                    <input
                                                        type="number"
                                                        className="form-control form-control-sm"
                                                        id={`price-${p.value}-${s.value}`}
                                                        name={`price-${p.value}-${s.value}`}
                                                        aria-label={`${p.label} ${s.label} price`}
                                                        value={draft.catalog.priceMatrix[p.value]?.[s.value] ?? ""}
                                                        onChange={(e) => setPrice(p.value, s.value, e.target.value)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="text-center">
                                                <span
                                                    role="button"
                                                    aria-label={`Remove ${p.label}`}
                                                    title={`Remove ${p.label}`}
                                                    onClick={() => removeProduct(p.value)}
                                                >
                                                    <Icons iconName="delete" className="icon-15" />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            Service types with a comment box (e.g. "Other") are priced manually per bill and don't appear in the matrix.
                        </small>
                    </div>
                </div>

                )}

                {/* ---- Mechanic ---- */}
                {activeTab === "people" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title={`${isAutomobile ? auto.labels.agent : draft.labels.agent} List`} />
                        <InputTag
                            tags={mechanicTags}
                            handleDelete={handleMechanicDelete}
                            handleAddition={handleMechanicAddition}
                            handleDrag={handleMechanicDrag}
                            inputFieldPosition="bottom"
                            placeholder="Type a name and press Enter"
                        />
                        <small className="text-muted font-s12">Used as the source for the {(isAutomobile ? auto.labels.agent : draft.labels.agent).toLowerCase()} dropdown in the bill form and filters.</small>
                    </div>
                </div>

                )}

                {/* ---- Login highlight lines ---- */}
                {activeTab === "company" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Login Highlight Lines" />
                        <InputTag
                            tags={highlightTags}
                            handleDelete={handleHighlightDelete}
                            handleAddition={handleHighlightAddition}
                            handleDrag={handleHighlightDrag}
                            inputFieldPosition="bottom"
                            placeholder="Type a short line and press Enter"
                        />
                        <small className="text-muted font-s12">Short lines that fade in and out over your login background. Leave empty to use the defaults.</small>
                    </div>
                </div>

                )}

                {/* ---- Labour ---- */}
                {activeTab === "people" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title={`${isAutomobile ? auto.labels.worker : draft.labels.worker} List`} />
                        <InputTag
                            tags={labourTags}
                            handleDelete={handleLabourDelete}
                            handleAddition={handleLabourAddition}
                            handleDrag={handleLabourDrag}
                            inputFieldPosition="bottom"
                            placeholder="Type a name and press Enter"
                        />
                    </div>
                </div>

                )}

                {/* ---- Automobile: flat-% Bonus ---- */}
                {activeTab === "bonus" && isAutomobile && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Bonus Configuration" />
                        <div className="row form-group g-3 mb-3">
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="auto-mech-pct">{auto.labels.agent} Bonus % (of net bill total)</label>
                                <input id="auto-mech-pct" type="number" className="form-control" min={0} max={100} step={0.5}
                                    value={auto.bonus.mechanicPercent}
                                    onChange={(e) => set("automobile.bonus.mechanicPercent", Number(e.target.value || 0))} />
                            </div>
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="auto-labour-pct">{auto.labels.worker} Bonus % (of net bill total)</label>
                                <input id="auto-labour-pct" type="number" className="form-control" min={0} max={100} step={0.5}
                                    value={auto.bonus.labourPercent}
                                    onChange={(e) => set("automobile.bonus.labourPercent", Number(e.target.value || 0))} />
                            </div>
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="auto-year-start-month">Bonus year starts in</label>
                                <select id="auto-year-start-month" className="form-select"
                                    value={auto.bonus.yearStartMonth}
                                    onChange={(e) => set("automobile.bonus.yearStartMonth", Number(e.target.value))}>
                                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                                        <option key={m} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            {auto.labels.agent} bonus settles yearly; {auto.labels.worker.toLowerCase()} bonus settles daily and is split equally
                            among the workers listed on each bill. Both are a flat percentage of the bill's net (post-discount) total,
                            paid in proportion to the amount collected.
                        </small>
                    </div>
                </div>
                )}

                {/* ---- Bonus ---- */}
                {activeTab === "bonus" && !isAutomobile && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Bonus Configuration" />

                        <label className="font-s16 mb-2 font-w500 d-block">
                            Mechanic Bonus (settled yearly)
                        </label>
                        {bonusMatrixGrid("mechanic")}
                        <div className="row form-group g-3 mb-4">
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="mech-default-pct">Default % (Other / unmatched)</label>
                                <input
                                    id="mech-default-pct"
                                    name="mech-default-pct"
                                    type="number"
                                    className="form-control"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    value={draft.bonus.mechanic.defaultPercent}
                                    onChange={(e) => set("bonus.mechanic.defaultPercent", Number(e.target.value || 0))}
                                />
                            </div>
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="year-start-month">Bonus year starts in</label>
                                <select
                                    id="year-start-month"
                                    name="year-start-month"
                                    className="form-select"
                                    value={draft.bonus.mechanic.yearStartMonth}
                                    onChange={(e) => set("bonus.mechanic.yearStartMonth", Number(e.target.value))}
                                >
                                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                                        <option key={m} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="session-custom-border mb-4" />

                        <label className="font-s16 mb-2 font-w500 d-block">
                            {draft.labels.worker} Bonus (settled daily, split equally per bill)
                        </label>
                        {bonusMatrixGrid("labour")}
                        <div className="row form-group g-3">
                            <div className="col-xl-3 col-md-6">
                                <label className="form-label" htmlFor="labour-default-pct">Default % (Other / unmatched)</label>
                                <input
                                    id="labour-default-pct"
                                    name="labour-default-pct"
                                    type="number"
                                    className="form-control"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    value={draft.bonus.labour.defaultPercent}
                                    onChange={(e) => set("bonus.labour.defaultPercent", Number(e.target.value || 0))}
                                />
                            </div>
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            Bonus = service price × percent, paid in proportion to the amount collected on the bill.
                            A per-line "Bonus %" on the bill form overrides the mechanic matrix for that line.
                        </small>
                    </div>
                </div>

                )}

                {/* ---- Automobile: Labels & Invoice ---- */}
                {activeTab === "invoice" && isAutomobile && (
                <>
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Field Labels" />
                        <div className="row form-group g-3">
                            {textField("Vehicle number label", "automobile.labels.vehicleNo", auto.labels.vehicleNo, "Vehicle Number")}
                            {textField("Customer label", "automobile.labels.customer", auto.labels.customer, "Customer Name")}
                        </div>
                        <div className="row form-group g-3">
                            {textField("Agent label", "automobile.labels.agent", auto.labels.agent, "Mechanic")}
                            {textField("Worker label", "automobile.labels.worker", auto.labels.worker, "Labour")}
                        </div>
                    </div>
                </div>

                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Invoice Options" />
                        <div className="row form-group g-3">
                            {textField("Bill title", "automobile.invoice.billTitle", auto.invoice.billTitle, "CASH / CREDIT BILL")}
                            {textField("Footer note", "automobile.invoice.footerNote", auto.invoice.footerNote)}
                        </div>
                        <div className="row form-group g-3">
                            <div className="col-xl-6 d-flex align-items-end">
                                <div className="d-flex align-items-center gap-2">
                                    <Switch
                                        key={`auto-qr-${settings.automobile.invoice.showQr}`}
                                        id="auto-show-qr"
                                        className="switch"
                                        switchClassName="blue"
                                        defaultChecked={auto.invoice.showQr}
                                        onChange={(e) => set("automobile.invoice.showQr", e.target.checked)}
                                    />
                                    <label className="form-label mb-0" htmlFor="auto-show-qr">
                                        Show payment QR on invoice (requires UPI ID)
                                    </label>
                                </div>
                            </div>
                            <div className="col-xl-6 d-flex align-items-end">
                                <div className="d-flex align-items-center gap-2">
                                    <Switch
                                        key={`auto-sig-${settings.automobile.invoice.showSignature}`}
                                        id="auto-show-signature"
                                        className="switch"
                                        switchClassName="blue"
                                        defaultChecked={auto.invoice.showSignature}
                                        onChange={(e) => set("automobile.invoice.showSignature", e.target.checked)}
                                    />
                                    <label className="form-label mb-0" htmlFor="auto-show-signature">
                                        Show signature on invoice (requires a signature image)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </>
                )}

                {/* ---- Labels ---- */}
                {activeTab === "invoice" && !isAutomobile && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Field Labels" />
                        <div className="row form-group g-3">
                            {textField("Vehicle number label", "labels.vehicleNo", draft.labels.vehicleNo, "Truck Number")}
                            {textField("Party / customer label", "labels.party", draft.labels.party, "Lorry Address")}
                        </div>
                        <div className="row form-group g-3">
                            {textField("Agent label", "labels.agent", draft.labels.agent, "Mechanic Name")}
                            {textField("Product label", "labels.product", draft.labels.product, "Radiator Model")}
                        </div>
                        <div className="row form-group g-3">
                            {textField("Worker label", "labels.worker", draft.labels.worker, "Labour Name")}
                        </div>
                    </div>
                </div>

                )}

                {/* ---- Invoice ---- */}
                {activeTab === "invoice" && !isAutomobile && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Invoice Options" />
                        <div className="row form-group g-3">
                            {textField("Bill title", "invoice.billTitle", draft.invoice.billTitle, "CASH / CREDIT BILL")}
                            {textField("Footer note", "invoice.footerNote", draft.invoice.footerNote)}
                        </div>
                        <div className="row form-group g-3">
                            <div className="col-xl-6 d-flex align-items-end">
                                <div className="d-flex align-items-center gap-2">
                                    <Switch
                                        key={`qr-${settings.invoice.showQr}`}
                                        id="show-qr"
                                        className="switch"
                                        switchClassName="blue"
                                        defaultChecked={draft.invoice.showQr}
                                        onChange={(e) => set("invoice.showQr", e.target.checked)}
                                    />
                                    <label className="form-label mb-0" htmlFor="show-qr">
                                        Show payment QR on invoice (requires UPI ID)
                                    </label>
                                </div>
                            </div>
                            <div className="col-xl-6 d-flex align-items-end">
                                <div className="d-flex align-items-center gap-2">
                                    <Switch
                                        key={`sig-${settings.invoice.showSignature}`}
                                        id="show-signature"
                                        className="switch"
                                        switchClassName="blue"
                                        defaultChecked={draft.invoice.showSignature}
                                        onChange={(e) => set("invoice.showSignature", e.target.checked)}
                                    />
                                    <label className="form-label mb-0" htmlFor="show-signature">
                                        Show signature on invoice (requires a signature image)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {/* ---- Salary Management (unconditional — applies to every tenant) ---- */}
                {activeTab === "salary" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Salary Defaults" />
                        <div className="row form-group g-3">
                            <div className="col-xl-4 col-md-6">
                                <label className="form-label" htmlFor="salary-pay-cycle">Pay Cycle</label>
                                <select id="salary-pay-cycle" className="form-select" value={draft.salary.payCycle}
                                    onChange={(e) => set("salary.payCycle", e.target.value)}>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            <div className="col-xl-4 col-md-6">
                                <label className="form-label" htmlFor="salary-working-day-rule">Working Day Rule</label>
                                <select id="salary-working-day-rule" className="form-select" value={draft.salary.workingDayRule}
                                    onChange={(e) => set("salary.workingDayRule", e.target.value)}>
                                    <option value="allDays">Every calendar day</option>
                                    <option value="excludeWeeklyOff">Exclude a weekly off day</option>
                                </select>
                            </div>
                            {draft.salary.workingDayRule === "excludeWeeklyOff" && (
                                <div className="col-xl-4 col-md-6">
                                    <label className="form-label" htmlFor="salary-weekly-off-day">Weekly Off Day</label>
                                    <select id="salary-weekly-off-day" className="form-select" value={draft.salary.weeklyOffDay}
                                        onChange={(e) => set("salary.weeklyOffDay", Number(e.target.value))}>
                                        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                                            <option key={d} value={i}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <small className="font-s12" style={{ color: "var(--purple)" }}>
                            Working days control the salary formula: net = base salary × present days / working days
                            in the settlement period. Applies identically to radiator and automobile tenants.
                        </small>
                    </div>
                </div>
                )}

                {activeTab === "salary" && (
                <div className="card card-shadow mb-4">
                    <div className="card-body">
                        <SectionTitle title="Payslip" />
                        <div className="row form-group g-3">
                            {textField("Payslip title", "salary.payslip.title", draft.salary.payslip.title, "SALARY SLIP")}
                            {textField("Payslip footer note", "salary.payslip.footerNote", draft.salary.payslip.footerNote)}
                        </div>
                    </div>
                </div>
                )}

                <div className="d-flex justify-content-end mb-5 gap-2">
                    <button
                        type="button"
                        className="btn btn-primary d-flex align-items-center"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save All Settings"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
