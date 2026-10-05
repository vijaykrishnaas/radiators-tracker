import { useEffect, useState } from "react";

import Icons from "../../Components/Icons";
import InputText from "../../Components/InputText";
import { putData, postData } from "../../Services/ApiServices";
import { useAlertMsg } from "../../Services/AllServices";
import EngCatalogTab from "../Engineering/Settings/EngCatalogTab";
import { useSettings, AppSettings, CatalogOption } from "../../Context/SettingsContext";
import { Badge, BtnSpinner, CardHead, Field, FormFooter, PageHeader, SegmentedControl, TabsScroll } from "../../Components/ui/Basics";
import { AffixInput, ChipInput, Switch, Upload } from "../../Components/ui/Inputs";
import { usePhone } from "../../Components/ui/hooks";
import { buildBrand, parseHex, toHex } from "../../theme/applyTenantBrand";

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";
const resolveLogo = (url?: string) => (url && url.startsWith("/") ? `${BACKEND}${url}` : url || "");

const slugify = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, "").trim() || label.toLowerCase();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IMAGE_ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp";
const DEFAULT_LOGIN_TEXT = toHex([255, 255, 255]);

type TabId = "company" | "catalog" | "people" | "bonus" | "invoice" | "salary" | "engCatalog" | "engPeople" | "engBonus" | "engInvoice";

/** One card per sub-section: title + one-line description, then the body. */
const SectionCard = ({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) => (
    <section className="card" aria-label={title}>
        <div className="card-body">
            <CardHead title={title} subtitle={subtitle} />
            {children}
        </div>
    </section>
);

/** Colour picker + hex text input bound to the same value. */
const ColorField = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const norm = (t: string) => (parseHex(t) ? toHex(parseHex(t)!) : null);
    return (
        <Field label={label} htmlFor={id}>
            <div className="color-field">
                <input id={id} type="color" className="form-control form-control-color" value={value} onChange={(e) => onChange(e.target.value)} />
                <input
                    type="text"
                    className="form-control t-mono"
                    aria-label={`${label} hex value`}
                    maxLength={7}
                    spellCheck={false}
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        const hex = /^#[0-9a-f]{6}$/i.test(e.target.value.trim()) ? norm(e.target.value.trim()) : null;
                        if (hex) onChange(hex);
                    }}
                    onBlur={() => setText(value)}
                />
            </div>
        </Field>
    );
};

const SettingsPage = () => {
    const { settings, refreshSettings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const phone = usePhone();

    const [draft, setDraft] = useState<AppSettings>(settings);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [newProduct, setNewProduct] = useState("");
    const [newService, setNewService] = useState("");
    const [activeTab, setActiveTab] = useState<TabId>("company");
    const [newPartLabel, setNewPartLabel] = useState("");
    const [newPartUnit, setNewPartUnit] = useState("");
    const [newPartRate, setNewPartRate] = useState("");

    // Automobile tenants get a parallel set of settings tabs (parts catalog,
    // flat bonus %, automobile-specific labels/invoice) instead of the
    // radiator catalog/price-matrix/bonus-matrix tabs. Engineering tenants use their own tab ids.
    const isAutomobile = draft.businessType === "automobile";
    const auto = draft.automobile;
    const isEngineering = draft.businessType === "engineering";

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

    // ---- Uploads (each posts immediately, then the draft gets the returned url) ----
    const runUpload = async (key: string, endpoint: string, urlField: string, path: string, okMsg: string, failMsg: string, file: File | undefined) => {
        if (!file) return;
        setUploading((u) => ({ ...u, [key]: true }));
        try {
            const fd = new FormData();
            fd.append("logo", file); // the upload field is named "logo" on the backend for every kind
            const res = await postData(endpoint, fd);
            set(path, res[urlField]);
            await refreshSettings();
            callAlertMsg(res.message || okMsg, "success");
        } catch (err: any) {
            callAlertMsg(err?.message || failMsg, "error");
        } finally {
            setUploading((u) => ({ ...u, [key]: false }));
        }
    };
    const uploadLogo = (f: File | undefined) => runUpload("logo", "settings/logo", "logoUrl", "company.logoUrl", "Logo updated", "Logo upload failed", f);
    const uploadQr = (f: File | undefined) => runUpload("qr", "settings/qr", "qrUrl", "company.qrUrl", "Payment QR updated", "QR upload failed", f);
    const uploadSignature = (f: File | undefined) => runUpload("signature", "settings/signature", "signatureUrl", "company.signatureUrl", "Signature updated", "Signature upload failed", f);
    const uploadLoginBg = (f: File | undefined) => runUpload("bg", "settings/login-bg", "loginBgUrl", "company.loginBgUrl", "Login background updated", "Background upload failed", f);

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
        <div className="matrix-wrap">
            <table className="matrix">
                <thead>
                    <tr>
                        <th scope="col">{draft.labels.product}</th>
                        {priceableServices.map((s) => (
                            <th scope="col" key={s.value}>{s.label} (%)</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {draft.catalog.productTypes.map((p) => (
                        <tr key={p.value}>
                            <th scope="row">{p.label}</th>
                            {priceableServices.map((s) => (
                                <td key={s.value}>
                                    <AffixInput
                                        type="number"
                                        className="num"
                                        suffix="%"
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

    const mechanics = draft.mechanics ?? [];
    const loginHighlights = draft.loginHighlights ?? [];

    const textField = (label: string, path: string, value: string, placeholder = "") => {
        const fieldId = `setting-${path.replace(/\./g, "-")}`;
        return (
            <Field label={label} htmlFor={fieldId}>
                <InputText id={fieldId} name={fieldId} value={value} placeholder={placeholder} onChange={(e) => set(path, e.target.value)} />
            </Field>
        );
    };

    const monthSelect = (id: string, value: number, onChange: (n: number) => void) => (
        <Field label="Bonus year starts in" htmlFor={id}>
            <select id={id} name={id} className="form-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                ))}
            </select>
        </Field>
    );

    const pctField = (id: string, label: string, value: number, onChange: (n: number) => void) => (
        <Field label={label} htmlFor={id}>
            <AffixInput id={id} name={id} type="number" className="num" suffix="%" min={0} max={100} step={0.5} value={value}
                onChange={(e) => onChange(Number(e.target.value || 0))} />
        </Field>
    );

    const invoiceSwitches = (prefix: string, base: string, inv: { showQr: boolean; showSignature: boolean }) => (
        <div className="form-grid">
            <Switch id={`${prefix}show-qr`} label="Show payment QR on invoice (requires UPI ID)" checked={!!inv.showQr}
                onChange={(v) => set(`${base}.showQr`, v)} />
            <Switch id={`${prefix}show-signature`} label="Show signature on invoice (requires a signature image)" checked={!!inv.showSignature}
                onChange={(v) => set(`${base}.showSignature`, v)} />
        </div>
    );

    // ---- Tabs ----
    const tabs: ReadonlyArray<readonly [TabId, string]> = isEngineering ? [
        ["company", "Company"],
        ["engCatalog", "Service Catalog"],
        ["engPeople", "Mechanics"],
        ["engBonus", "Bonus"],
        ["engInvoice", "Invoice"],
    ] : isAutomobile ? [
        ["company", "Company"],
        ["catalog", "Parts Catalog"],
        ["people", `${auto.labels.agent} & ${auto.labels.worker}`],
        ["bonus", "Bonus"],
        ["invoice", "Labels & Invoice"],
        ["salary", "Salary"],
    ] : [
        ["company", "Company"],
        ["catalog", "Catalog & Pricing"],
        ["people", `${draft.labels.agent} & ${draft.labels.worker}`],
        ["bonus", "Bonus"],
        ["invoice", "Invoice"],
        ["salary", "Salary"],
    ];

    // ---- Branding preview (rendered from the same buildBrand() the app uses) ----
    const primary = draft.branding.primaryColor;
    const brand = buildBrand(primary);
    const adjusted = brand.solid.toUpperCase() !== (primary || "").toUpperCase();
    const previewVars = {
        "--brand-solid": brand.solid,
        "--on-brand": brand.onBrand,
        "--brand-hover": brand.hover,
        "--brand-50": brand.scale[50],
        "--brand-text": brand.brandText,
        "--brand-solid-border": brand.solidBorder,
    } as React.CSSProperties;

    const agentLabel = isAutomobile ? auto.labels.agent : draft.labels.agent;
    const workerLabel = isAutomobile ? auto.labels.worker : draft.labels.worker;

    const saveButton = (
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <BtnSpinner show={saving} />
            {saving ? "Saving..." : "Save All Settings"}
        </button>
    );

    return (
        <>
            <PageHeader title="Settings" primary={saveButton} />

            {/* Tabbed sections: Save All Settings persists every tab at once. */}
            <div className="settings-nav">
                {phone ? (
                    <Field label="Section" htmlFor="settings-section">
                        <select id="settings-section" className="form-select" value={activeTab} onChange={(e) => setActiveTab(e.target.value as TabId)}>
                            {tabs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                    </Field>
                ) : (
                    <TabsScroll>
                        <SegmentedControl<TabId>
                            label="Settings sections"
                            value={activeTab}
                            onChange={setActiveTab}
                            options={tabs.map(([value, label]) => ({ value, label }))}
                        />
                    </TabsScroll>
                )}
            </div>

            <div className="card-stack" role="tabpanel">
                {/* ---- Company ---- */}
                {activeTab === "company" && (
                    <>
                        <SectionCard title="Company profile" subtitle="Shown on printed bills, the sign-in page and reports.">
                            <div className="form-grid">
                                {textField("Company name", "company.name", draft.company.name)}
                                {textField("Address", "company.address", draft.company.address)}
                                {textField("Phone 1", "company.phone1", draft.company.phone1)}
                                {textField("Phone 2", "company.phone2", draft.company.phone2)}
                                {textField("UPI ID (for payment QR)", "company.upiId", draft.company.upiId, "e.g. 7708093151@ybl")}
                                {textField("Payment display text", "company.upiDisplay", draft.company.upiDisplay, "e.g. PhonePe 77080 93151")}
                            </div>
                            <div className="settings-uploads">
                                <div>
                                    <Upload id="upload-logo" label="Business logo" hint="PNG, JPG, SVG or WebP, up to 1 MB."
                                        accept={IMAGE_ACCEPT} previewUrl={resolveLogo(draft.company.logoUrl)} uploading={!!uploading.logo}
                                        emptyText="No logo uploaded" onFile={uploadLogo} onRemove={() => set("company.logoUrl", "")} />
                                </div>
                                <div>
                                    <Upload id="upload-qr" label="Payment QR (printed on the bill)" hint="PNG, JPG, SVG or WebP."
                                        accept={IMAGE_ACCEPT} previewUrl={resolveLogo(draft.company.qrUrl)} uploading={!!uploading.qr}
                                        emptyText="No QR uploaded" onFile={uploadQr} onRemove={() => set("company.qrUrl", "")} />
                                    <span className="field-help">Upload your UPI/payment QR image. If set, it's printed on the invoice instead of the auto-generated one.</span>
                                </div>
                                <div>
                                    <Upload id="upload-signature" label="Authorised signature (printed on the bill)" hint="PNG, JPG, SVG or WebP, up to 1 MB."
                                        accept={IMAGE_ACCEPT} previewUrl={resolveLogo(draft.company.signatureUrl)} uploading={!!uploading.signature}
                                        emptyText="No signature uploaded" onFile={uploadSignature} onRemove={() => set("company.signatureUrl", "")} />
                                    <span className="field-help">Upload a signature image (png with transparency works best, ≤1MB). It's printed above "Authorised signatory" when enabled in Invoice Options below.</span>
                                </div>
                                <div>
                                    <Upload id="upload-login-bg" label="Login background (shown on your login page)" hint="PNG, JPG or WebP, up to 4 MB."
                                        accept="image/png,image/jpeg,image/webp" previewUrl={resolveLogo(draft.company.loginBgUrl)} uploading={!!uploading.bg}
                                        cover emptyText="Using default background" onFile={uploadLoginBg} onRemove={() => set("company.loginBgUrl", "")} />
                                    <span className="field-help">Upload a full-screen background image (png/jpeg/webp, ≤4MB) for your branded login page. Your brand colours are layered over it automatically.</span>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard title="Branding" subtitle="Pick the colours used across the app, printed documents and your sign-in screen.">
                            <div className="form-grid settings-colors">
                                <ColorField id="primary-color" label="Primary color" value={draft.branding.primaryColor}
                                    onChange={(v) => set("branding.primaryColor", v)} />
                                <ColorField id="accent-color" label="Accent color" value={draft.branding.accentColor}
                                    onChange={(v) => set("branding.accentColor", v)} />
                                <ColorField id="login-text-color" label="Login text color" value={draft.branding.loginTextColor || DEFAULT_LOGIN_TEXT}
                                    onChange={(v) => set("branding.loginTextColor", v)} />
                            </div>
                            <div className="brand-preview" style={previewVars} aria-label="Brand preview">
                                <button type="button" className="btn btn-primary" tabIndex={-1}>Primary button</button>
                                <span className="sidebar-item is-active brand-preview-nav"><Icons iconName="grid" className="sidebar-icon" />Active menu item</span>
                                <Badge tone="brand">Badge</Badge>
                            </div>
                            {adjusted && <p className="t-xs t-muted mt-2 mb-0">Adjusted slightly for readability.</p>}
                            <span className="field-help">
                                Primary drives the app theme and printed documents; accent drives the login screen highlights; login text color sets your company name's color on the sign-in screen.
                            </span>
                        </SectionCard>

                        <SectionCard title="Login highlight lines" subtitle="Short lines that fade in and out over your login background.">
                            <ChipInput id="login-highlights" label="Login highlight lines" values={loginHighlights}
                                onChange={(v) => set("loginHighlights", v)} placeholder="Type a short line and press Enter" />
                            <span className="field-help">Short lines that fade in and out over your login background. Leave empty to use the defaults.</span>
                        </SectionCard>
                    </>
                )}

                {/* ---- Automobile: Parts Catalog & Units ---- */}
                {activeTab === "catalog" && isAutomobile && (
                    <>
                        <SectionCard title="Parts catalog" subtitle="Parts you sell, with a default unit and rate.">
                            <div className="settings-add-row">
                                <Field label="Part name" htmlFor="new-part-label">
                                    <InputText id="new-part-label" value={newPartLabel} placeholder="e.g. Engine Oil 15W40"
                                        onChange={(e) => setNewPartLabel(e.target.value)} />
                                </Field>
                                <Field label="Unit" htmlFor="new-part-unit">
                                    <InputText id="new-part-unit" value={newPartUnit} placeholder="e.g. L"
                                        onChange={(e) => setNewPartUnit(e.target.value)} />
                                </Field>
                                <Field label="Default rate (₹)" htmlFor="new-part-rate">
                                    <InputText id="new-part-rate" type="number" className="num" value={newPartRate} placeholder="e.g. 450"
                                        onChange={(e) => setNewPartRate(e.target.value)} />
                                </Field>
                                <button type="button" className="btn btn-primary" onClick={addPart}>
                                    <Icons iconName="plus-circle" />Add
                                </button>
                            </div>

                            <div className="matrix-wrap mt-3">
                                <table className="matrix matrix-parts">
                                    <thead>
                                        <tr>
                                            <th scope="col">Part name</th>
                                            <th scope="col">Unit</th>
                                            <th scope="col">Rate (₹)</th>
                                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auto.parts.map((p) => (
                                            <tr key={p.value}>
                                                <th scope="row">
                                                    <input type="text" className="form-control" aria-label={`${p.label} name`} value={p.label}
                                                        onChange={(e) => updatePartField(p.value, "label", e.target.value)} />
                                                </th>
                                                <td>
                                                    <input type="text" className="form-control" aria-label={`${p.label} unit`} value={p.unit}
                                                        onChange={(e) => updatePartField(p.value, "unit", e.target.value)} />
                                                </td>
                                                <td>
                                                    <AffixInput prefix="₹" type="number" className="num" aria-label={`${p.label} rate`} value={p.rate}
                                                        onChange={(e) => updatePartField(p.value, "rate", e.target.value)} />
                                                </td>
                                                <td className="matrix-actions">
                                                    <button type="button" className="btn btn-icon is-danger" aria-label={`Remove ${p.label}`} onClick={() => removePart(p.value)}>
                                                        <Icons iconName="delete" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!auto.parts.length && (
                                            <tr><td colSpan={4} className="t-muted text-center py-3">No parts yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <span className="field-help">
                                Picking a part on the bill form auto-fills its unit and rate; one-off items can still be typed freely.
                            </span>
                        </SectionCard>

                        <SectionCard title="Units" subtitle="Units offered on the bill form.">
                            <ChipInput id="auto-units" label="Units" values={auto.units} onChange={(v) => set("automobile.units", v)}
                                placeholder="e.g. pcs, set, L, kg, hrs" />
                        </SectionCard>
                    </>
                )}

                {/* ---- Catalog & Prices ---- */}
                {activeTab === "catalog" && !isAutomobile && (
                    <SectionCard title="Catalog and price matrix" subtitle="Products, service types and the price of each combination.">
                        <div className="form-grid">
                            <Field label={`Add ${draft.labels.product}`} htmlFor="new-product">
                                <div className="d-flex gap-2">
                                    <InputText id="new-product" value={newProduct} placeholder="e.g. BS-VII"
                                        onChange={(e) => setNewProduct(e.target.value)} />
                                    <button type="button" className="btn btn-primary" onClick={addProduct}>
                                        <Icons iconName="plus-circle" />Add
                                    </button>
                                </div>
                            </Field>
                            <Field label="Add service type" htmlFor="new-service">
                                <div className="d-flex gap-2">
                                    <InputText id="new-service" value={newService} placeholder="e.g. Pressure Test"
                                        onChange={(e) => setNewService(e.target.value)} />
                                    <button type="button" className="btn btn-primary" onClick={addService}>
                                        <Icons iconName="plus-circle" />Add
                                    </button>
                                </div>
                            </Field>
                        </div>

                        <div className="matrix-wrap mt-3">
                            <table className="matrix">
                                <thead>
                                    <tr>
                                        <th scope="col">{draft.labels.product}</th>
                                        {priceableServices.map((s: CatalogOption) => (
                                            <th scope="col" key={s.value}>
                                                <div className="matrix-th">
                                                    <span>{s.label}</span>
                                                    <button type="button" className="btn btn-icon" aria-label={`Remove ${s.label}`} onClick={() => removeService(s.value)}>
                                                        <Icons iconName="x" />
                                                    </button>
                                                </div>
                                            </th>
                                        ))}
                                        <th scope="col"><span className="visually-hidden">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draft.catalog.productTypes.map((p) => (
                                        <tr key={p.value}>
                                            <th scope="row">{p.label}</th>
                                            {priceableServices.map((s) => (
                                                <td key={s.value}>
                                                    <AffixInput
                                                        prefix="₹"
                                                        type="number"
                                                        className="num"
                                                        id={`price-${p.value}-${s.value}`}
                                                        name={`price-${p.value}-${s.value}`}
                                                        aria-label={`${p.label} ${s.label} price`}
                                                        value={draft.catalog.priceMatrix[p.value]?.[s.value] ?? ""}
                                                        onChange={(e) => setPrice(p.value, s.value, e.target.value)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="matrix-actions">
                                                <button type="button" className="btn btn-icon is-danger" aria-label={`Remove ${p.label}`} onClick={() => removeProduct(p.value)}>
                                                    <Icons iconName="delete" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <span className="field-help">
                            Service types with a comment box (e.g. "Other") are priced manually per bill and don't appear in the matrix.
                        </span>
                    </SectionCard>
                )}

                {/* ---- People ---- */}
                {activeTab === "people" && (
                    <>
                        <SectionCard title={`${agentLabel} list`} subtitle={`Drag to reorder, or use the chip menu.`}>
                            <ChipInput id="mechanic-list" label={`${agentLabel} list`} values={mechanics} onChange={(v) => set("mechanics", v)}
                                placeholder="Type a name and press Enter" />
                            <span className="field-help">Used as the source for the {agentLabel.toLowerCase()} dropdown in the bill form and filters.</span>
                        </SectionCard>
                        <SectionCard title={`${workerLabel} list`} subtitle="Drag to reorder, or use the chip menu.">
                            <ChipInput id="labour-list" label={`${workerLabel} list`} values={draft.labour} onChange={(v) => set("labour", v)}
                                placeholder="Type a name and press Enter" />
                        </SectionCard>
                    </>
                )}

                {/* ---- Automobile: flat-% Bonus ---- */}
                {activeTab === "bonus" && isAutomobile && (
                    <SectionCard title="Bonus configuration" subtitle="Flat percentages of each bill's net total.">
                        <div className="form-grid settings-three">
                            {pctField("auto-mech-pct", `${auto.labels.agent} Bonus % (of net bill total)`, auto.bonus.mechanicPercent,
                                (n) => set("automobile.bonus.mechanicPercent", n))}
                            {pctField("auto-labour-pct", `${auto.labels.worker} Bonus % (of net bill total)`, auto.bonus.labourPercent,
                                (n) => set("automobile.bonus.labourPercent", n))}
                            {monthSelect("auto-year-start-month", auto.bonus.yearStartMonth, (n) => set("automobile.bonus.yearStartMonth", n))}
                        </div>
                        <span className="field-help">
                            {auto.labels.agent} bonus settles yearly; {auto.labels.worker.toLowerCase()} bonus settles daily and is split equally
                            among the workers listed on each bill. Both are a flat percentage of the bill's net (post-discount) total,
                            paid in proportion to the amount collected.
                        </span>
                    </SectionCard>
                )}

                {/* ---- Bonus (radiator) ---- */}
                {activeTab === "bonus" && !isAutomobile && (
                    <>
                        <SectionCard title="Mechanic bonus" subtitle="Settled yearly. Bonus = service price × percent, paid in proportion to the amount collected on the bill.">
                            {bonusMatrixGrid("mechanic")}
                            <div className="form-grid settings-three mt-3">
                                {pctField("mech-default-pct", "Default % (Other / unmatched)", draft.bonus.mechanic.defaultPercent,
                                    (n) => set("bonus.mechanic.defaultPercent", n))}
                                {monthSelect("year-start-month", draft.bonus.mechanic.yearStartMonth, (n) => set("bonus.mechanic.yearStartMonth", n))}
                            </div>
                        </SectionCard>
                        <SectionCard title={`${draft.labels.worker} bonus`} subtitle="Settled daily, split equally per bill.">
                            {bonusMatrixGrid("labour")}
                            <div className="form-grid settings-three mt-3">
                                {pctField("labour-default-pct", "Default % (Other / unmatched)", draft.bonus.labour.defaultPercent,
                                    (n) => set("bonus.labour.defaultPercent", n))}
                            </div>
                        </SectionCard>
                    </>
                )}

                {/* ---- Automobile: Labels & Invoice ---- */}
                {activeTab === "invoice" && isAutomobile && (
                    <>
                        <SectionCard title="Field labels" subtitle="Rename the fields shown on bill forms and lists.">
                            <div className="form-grid">
                                {textField("Vehicle number label", "automobile.labels.vehicleNo", auto.labels.vehicleNo, "Vehicle Number")}
                                {textField("Customer label", "automobile.labels.customer", auto.labels.customer, "Customer Name")}
                                {textField("Agent label", "automobile.labels.agent", auto.labels.agent, "Mechanic")}
                                {textField("Worker label", "automobile.labels.worker", auto.labels.worker, "Labour")}
                            </div>
                        </SectionCard>
                        <SectionCard title="Invoice options" subtitle="Title, footer and extras printed on every invoice.">
                            <div className="form-grid">
                                {textField("Bill title", "automobile.invoice.billTitle", auto.invoice.billTitle, "CASH / CREDIT BILL")}
                                {textField("Footer note", "automobile.invoice.footerNote", auto.invoice.footerNote)}
                            </div>
                            <div className="mt-3">{invoiceSwitches("auto-", "automobile.invoice", auto.invoice)}</div>
                        </SectionCard>
                    </>
                )}

                {/* ---- Labels & Invoice (radiator) ---- */}
                {activeTab === "invoice" && !isAutomobile && (
                    <>
                        <SectionCard title="Field labels" subtitle="Rename the fields shown on bill forms and lists.">
                            <div className="form-grid">
                                {textField("Vehicle number label", "labels.vehicleNo", draft.labels.vehicleNo, "Truck Number")}
                                {textField("Party / customer label", "labels.party", draft.labels.party, "Lorry Address")}
                                {textField("Agent label", "labels.agent", draft.labels.agent, "Mechanic Name")}
                                {textField("Product label", "labels.product", draft.labels.product, "Radiator Model")}
                                {textField("Worker label", "labels.worker", draft.labels.worker, "Labour Name")}
                            </div>
                        </SectionCard>
                        <SectionCard title="Invoice options" subtitle="Title, footer and extras printed on every invoice.">
                            <div className="form-grid">
                                {textField("Bill title", "invoice.billTitle", draft.invoice.billTitle, "CASH / CREDIT BILL")}
                                {textField("Footer note", "invoice.footerNote", draft.invoice.footerNote)}
                            </div>
                            <div className="mt-3">{invoiceSwitches("", "invoice", draft.invoice)}</div>
                        </SectionCard>
                    </>
                )}

                {/* ---- Salary (applies to every non-engineering tenant) ---- */}
                {activeTab === "salary" && (
                    <>
                        <SectionCard title="Salary defaults" subtitle="How net salary is worked out for each pay period.">
                            <div className="form-grid settings-three">
                                <Field label="Pay cycle" htmlFor="salary-pay-cycle">
                                    <select id="salary-pay-cycle" className="form-select" value={draft.salary.payCycle}
                                        onChange={(e) => set("salary.payCycle", e.target.value)}>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </Field>
                                <Field label="Working day rule" htmlFor="salary-working-day-rule">
                                    <select id="salary-working-day-rule" className="form-select" value={draft.salary.workingDayRule}
                                        onChange={(e) => set("salary.workingDayRule", e.target.value)}>
                                        <option value="allDays">Every calendar day</option>
                                        <option value="excludeWeeklyOff">Exclude a weekly off day</option>
                                    </select>
                                </Field>
                                {draft.salary.workingDayRule === "excludeWeeklyOff" && (
                                    <Field label="Weekly off day" htmlFor="salary-weekly-off-day">
                                        <select id="salary-weekly-off-day" className="form-select" value={draft.salary.weeklyOffDay}
                                            onChange={(e) => set("salary.weeklyOffDay", Number(e.target.value))}>
                                            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                                                <option key={d} value={i}>{d}</option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                            </div>
                            <span className="field-help">
                                Working days control the salary formula: net = base salary × present days / working days
                                in the settlement period. Applies identically to radiator and automobile tenants.
                            </span>
                        </SectionCard>
                        <SectionCard title="Payslip" subtitle="Heading and footer printed on each payslip.">
                            <div className="form-grid">
                                {textField("Payslip title", "salary.payslip.title", draft.salary.payslip.title, "SALARY SLIP")}
                                {textField("Payslip footer note", "salary.payslip.footerNote", draft.salary.payslip.footerNote)}
                            </div>
                        </SectionCard>
                    </>
                )}

                {/* ---- Engineering tenants only ---- */}
                {isEngineering && draft.engineering && activeTab === "engCatalog" && (
                    <EngCatalogTab eng={draft.engineering} set={set} />
                )}

                {isEngineering && activeTab === "engPeople" && (
                    <SectionCard title="Mechanic list" subtitle="Drag to reorder, or use the chip menu.">
                        <ChipInput id="mechanic-list" label="Mechanic list" values={mechanics} onChange={(v) => set("mechanics", v)}
                            placeholder="Type a name and press Enter" />
                        <span className="field-help">Used as the source for the mechanic dropdown in the service form.</span>
                    </SectionCard>
                )}

                {isEngineering && draft.engineering && activeTab === "engBonus" && (
                    <SectionCard title="Mechanic bonus" subtitle="One percentage of each bill's net total.">
                        <div className="form-grid settings-three">
                            {pctField("eng-mech-pct", "Mechanic bonus % (of net bill total)", draft.engineering.bonus?.mechanicPercent ?? 0,
                                /* whole object: tenants created before this setting have no engineering.bonus yet */
                                (n) => set("engineering.bonus", { mechanicPercent: n }))}
                        </div>
                        <span className="field-help">
                            Each bill earns its mechanic this percentage of the bill's net (post-discount) total, payable in proportion to
                            the amount collected. Bonus settles once a year; the year starts in the month set under Service Catalog<Icons iconName="chevron-right" className="icon-14 mx-1" />
                            Financial year. After changing the percentage, open Bonus<Icons iconName="chevron-right" className="icon-14 mx-1" />Sync to re-price existing bills.
                        </span>
                    </SectionCard>
                )}

                {isEngineering && draft.engineering?.invoice && activeTab === "engInvoice" && (
                    <SectionCard title="Invoice options" subtitle="Title, footer and extras printed on every invoice.">
                        <div className="form-grid">
                            {textField("Bill title", "engineering.invoice.billTitle", draft.engineering.invoice.billTitle, "CASH / CREDIT BILL")}
                            {textField("Footer note", "engineering.invoice.footerNote", draft.engineering.invoice.footerNote)}
                        </div>
                        <div className="mt-3">{invoiceSwitches("eng-", "engineering.invoice", draft.engineering.invoice)}</div>
                    </SectionCard>
                )}
            </div>

            <FormFooter>{saveButton}</FormFooter>
        </>
    );
};

export default SettingsPage;
