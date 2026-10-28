// Settings tabs for tyre tenants: the brand → model catalog with default rates, and the labels and challan print
// options (a tyre shop has no mechanic / labour bonus). Rendered by Pages/Settings/Index.tsx; every change goes through its `set(path, v)`
// and is persisted by Save All Settings.
import { useState } from "react";

import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import type { TyreSettings } from "../../../Context/SettingsContext";
import { CardHead, Field } from "../../../Components/ui/Basics";
import { AffixInput, Switch } from "../../../Components/ui/Inputs";

type SetFn = (path: string, value: unknown) => void;

const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || label.toLowerCase();
// A renamed brand / model keeps its old value, so a new one with that old name gets the next free value ("mrf-2").
const freeValue = (base: string, taken: string[]) => {
    let value = base;
    for (let n = 2; taken.includes(value); n++) value = `${base}-${n}`;
    return value;
};

// Names are compared as the add boxes compare them (case, spaces and punctuation ignored). Renaming has no such check
// while typing, so Save asks this before saving two brands, or two models of one brand, under the same name.
export function catalogDuplicate(brands: TyreSettings["brands"]): string | null {
    const seen = new Map<string, string>();
    for (const b of brands || []) {
        const key = slugify(String(b.label || "").trim());
        if (seen.has(key)) return `${String(b.label).trim()} is in the Tyre Catalog twice. Give each brand its own name, then save.`;
        seen.set(key, b.label);
        const models = new Set<string>();
        for (const m of b.models || []) {
            const mk = slugify(String(m.label || "").trim());
            if (models.has(mk)) return `${String(m.label).trim()} is under ${String(b.label).trim()} twice. Give each model its own name, then save.`;
            models.add(mk);
        }
    }
    return null;
}

const Section = ({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) => (
    <section className="card" aria-label={title}>
        <div className="card-body">
            <CardHead title={title} subtitle={subtitle} />
            {children}
        </div>
    </section>
);

/* ---------------- Catalog ---------------- */
export function TyreCatalogTab({ tyre, set }: { tyre: TyreSettings; set: SetFn }) {
    const brands = tyre.brands || [];
    const [newBrand, setNewBrand] = useState("");
    const [newModel, setNewModel] = useState<Record<string, { label: string; rate: string }>>({});
    const [error, setError] = useState("");
    // A model's error shows in its own brand's card, next to the + the user pressed (not at the top of a long catalog).
    const [modelError, setModelError] = useState<Record<string, string>>({});

    const setBrands = (next: TyreSettings["brands"]) => set("tyre.brands", next);

    const addBrand = () => {
        const label = newBrand.trim();
        if (!label) return;
        // A duplicate is judged by the names on screen, not the stored values (a renamed brand keeps its old value).
        if (brands.some((b) => slugify(b.label) === slugify(label))) { setError(`${label} is already in the catalog`); return; }
        const value = freeValue(slugify(label), brands.map((b) => b.value));
        setBrands([...brands, { label, value, models: [] }]);
        setNewBrand(""); setError("");
    };
    const addModel = (brandValue: string) => {
        const draft = newModel[brandValue] || { label: "", rate: "" };
        const label = draft.label.trim();
        if (!label) return;
        const brand = brands.find((b) => b.value === brandValue);
        if (brand?.models.some((m) => slugify(m.label) === slugify(label))) { setModelError((e) => ({ ...e, [brandValue]: `${label} is already under ${brand.label}` })); return; }
        setBrands(brands.map((b) => (b.value === brandValue ? { ...b, models: [...b.models, { label, value: freeValue(slugify(label), b.models.map((m) => m.value)), rate: Math.max(Number(draft.rate) || 0, 0) }] } : b)));
        setNewModel((m) => ({ ...m, [brandValue]: { label: "", rate: "" } }));
        setModelError((e) => ({ ...e, [brandValue]: "" }));
    };
    // Renaming keeps the stored value, so challans and stock already saved stay linked to the brand / model.
    const renameBrand = (value: string, label: string) => setBrands(brands.map((b) => (b.value === value ? { ...b, label } : b)));
    const removeBrand = (value: string) => setBrands(brands.filter((b) => b.value !== value));
    const updateModel = (brandValue: string, modelValue: string, patch: { label?: string; rate?: number }) =>
        setBrands(brands.map((b) => (b.value === brandValue
            ? { ...b, models: b.models.map((m) => (m.value === modelValue ? { ...m, ...patch } : m)) }
            : b)));
    const removeModel = (brandValue: string, modelValue: string) =>
        setBrands(brands.map((b) => (b.value === brandValue ? { ...b, models: b.models.filter((m) => m.value !== modelValue) } : b)));

    return (
        <>
            <Section title="Tyre catalog" subtitle="Brands and their models / sizes, each with a default rate per tyre. Stock is tracked per model under Inventory.">
                <div className="settings-add-row">
                    <Field label="Brand" htmlFor="new-tyre-brand">
                        <InputText id="new-tyre-brand" value={newBrand} placeholder="e.g. MRF" onChange={(e) => { setNewBrand(e.target.value); setError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBrand(); } }} />
                    </Field>
                    <button type="button" className="btn btn-primary" onClick={addBrand}><Icons iconName="plus-circle" />Add brand</button>
                </div>
                {error && <p className="field-error" role="alert">{error}</p>}
                {!brands.length && <p className="t-sm t-muted mt-3 mb-0">No brands yet. Add a brand, then its models / sizes.</p>}

                <div className="d-grid gap-3 mt-3">
                    {brands.map((b) => {
                        const nm = newModel[b.value] || { label: "", rate: "" };
                        return (
                            <section key={b.value} className="nested-card tyre-brand-card" aria-label={`${b.label} models`}>
                                <div className="d-flex gap-2 align-items-end">
                                    <Field label="Brand name" htmlFor={`tyre-brand-${b.value}`} className="flex-grow-1">
                                        <InputText id={`tyre-brand-${b.value}`} value={b.label} onChange={(e) => renameBrand(b.value, e.target.value)} />
                                    </Field>
                                    <button type="button" className="btn btn-icon is-danger" aria-label={`Remove ${b.label} and its models`} onClick={() => removeBrand(b.value)}>
                                        <Icons iconName="delete" />
                                    </button>
                                </div>
                                <div className="matrix-wrap mt-3">
                                    <table className="matrix matrix-parts">
                                        <thead>
                                            <tr>
                                                <th scope="col">Model / size</th>
                                                <th scope="col">Default rate (₹ per tyre)</th>
                                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {b.models.map((m) => (
                                                <tr key={m.value}>
                                                    <th scope="row">
                                                        <input type="text" className="form-control" aria-label={`${b.label} ${m.label} name`} value={m.label}
                                                            onChange={(e) => updateModel(b.value, m.value, { label: e.target.value })} />
                                                    </th>
                                                    <td>
                                                        <AffixInput prefix="₹" type="number" className="num" min={0} aria-label={`${b.label} ${m.label} rate`} value={m.rate || ""} placeholder="0"
                                                            onChange={(e) => updateModel(b.value, m.value, { rate: Math.max(Number(e.target.value || 0), 0) })} />
                                                    </td>
                                                    <td className="matrix-actions">
                                                        <button type="button" className="btn btn-icon is-danger" aria-label={`Remove ${b.label} ${m.label}`} onClick={() => removeModel(b.value, m.value)}>
                                                            <Icons iconName="delete" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <th scope="row">
                                                    <input type="text" className="form-control" aria-label={`New ${b.label} model / size`} placeholder="e.g. 10.00-20 Steel Muscle"
                                                        value={nm.label} onChange={(e) => { setNewModel((x) => ({ ...x, [b.value]: { ...nm, label: e.target.value } })); setModelError((x) => ({ ...x, [b.value]: "" })); }}
                                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(b.value); } }} />
                                                </th>
                                                <td>
                                                    <AffixInput prefix="₹" type="number" className="num" min={0} aria-label={`New ${b.label} model rate`} placeholder="0"
                                                        value={nm.rate} onChange={(e) => setNewModel((x) => ({ ...x, [b.value]: { ...nm, rate: e.target.value } }))}
                                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(b.value); } }} />
                                                </td>
                                                <td className="matrix-actions">
                                                    <button type="button" className="btn btn-icon" aria-label={`Add ${b.label} model`} onClick={() => addModel(b.value)}>
                                                        <Icons iconName="plus-circle" />
                                                    </button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                {modelError[b.value] && <p className="field-error mt-2 mb-0" role="alert">{modelError[b.value]}</p>}
                            </section>
                        );
                    })}
                </div>
                <span className="field-help">Picking a model on the challan fills its rate; the rate can still be changed on each challan.</span>
            </Section>

            <Section title="Challan defaults">
                <div className="form-grid">
                    <Field label="Default tube type for a new tyre line" htmlFor="tyre-default-tube">
                        <select id="tyre-default-tube" className="form-select" value={tyre.defaultTubeType || "tube"} onChange={(e) => set("tyre.defaultTubeType", e.target.value)}>
                            <option value="tube">Tube type</option>
                            <option value="tubeless">Tubeless</option>
                        </select>
                    </Field>
                    <Field label="First D.C. number" htmlFor="tyre-start-no" help="For a shop continuing from a paper challan book. Numbers already used are never reused.">
                        {/* The box may be empty while typing (forcing 1 back in turned "clear, type 501" into 1501, and the
                            counter never goes back down); left empty, it becomes 1 again. */}
                        <InputText id="tyre-start-no" type="number" min={1} className="num" value={tyre.billStartNumber ?? 1}
                            onChange={(e) => set("tyre.billStartNumber", e.target.value === "" ? "" : Math.max(parseInt(e.target.value, 10) || 1, 1))}
                            onBlur={() => { if (!tyre.billStartNumber) set("tyre.billStartNumber", 1); }} />
                    </Field>
                </div>
            </Section>
        </>
    );
}

/* ---------------- Labels & challan ---------------- */
export function TyreInvoiceTab({ tyre, set }: { tyre: TyreSettings; set: SetFn }) {
    const text = (label: string, path: string, value: string, placeholder = "") => {
        const id = `setting-${path.replace(/\./g, "-")}`;
        return (
            <Field label={label} htmlFor={id}>
                <InputText id={id} value={value} placeholder={placeholder} onChange={(e) => set(path, e.target.value)} />
            </Field>
        );
    };
    return (
        <>
            <Section title="Field labels" subtitle="Rename the fields shown on challan forms and lists.">
                <div className="form-grid">
                    {text("Vehicle number label", "tyre.labels.vehicleNo", tyre.labels.vehicleNo, "Vehicle Number")}
                    {text("Customer label", "tyre.labels.customer", tyre.labels.customer, "Customer Name")}
                </div>
            </Section>
            <Section title="Challan print" subtitle="Title and lines printed on every delivery challan.">
                <div className="form-grid">
                    {text("Title", "tyre.invoice.billTitle", tyre.invoice.billTitle, "DELIVERY CHALLAN")}
                    {text("Line under the company", "tyre.invoice.subtitle", tyre.invoice.subtitle, "Goods delivered. Not a tax invoice (no GST).")}
                    {text("Receiver's note", "tyre.invoice.footerNote", tyre.invoice.footerNote, "Goods received in good condition")}
                </div>
                <div className="form-grid mt-3">
                    <Switch id="tyre-show-signature" label="Show signature on the challan (requires a signature image)" checked={!!tyre.invoice.showSignature}
                        onChange={(v) => set("tyre.invoice.showSignature", v)} />
                </div>
            </Section>
        </>
    );
}
