// Settings tabs for tyre tenants: the brand → model catalog with default rates, the mechanic / labour bonus, and the
// labels and challan print options. Rendered by Pages/Settings/Index.tsx; every change goes through its `set(path, v)`
// and is persisted by Save All Settings.
import { useState } from "react";

import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import type { TyreSettings } from "../../../Context/SettingsContext";
import { CardHead, Field, SegmentedControl } from "../../../Components/ui/Basics";
import { AffixInput, Switch } from "../../../Components/ui/Inputs";

type SetFn = (path: string, value: unknown) => void;

const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || label.toLowerCase();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

    const setBrands = (next: TyreSettings["brands"]) => set("tyre.brands", next);

    const addBrand = () => {
        const label = newBrand.trim();
        if (!label) return;
        const value = slugify(label);
        if (brands.some((b) => b.value === value)) { setError(`${label} is already in the catalog`); return; }
        setBrands([...brands, { label, value, models: [] }]);
        setNewBrand(""); setError("");
    };
    const addModel = (brandValue: string) => {
        const draft = newModel[brandValue] || { label: "", rate: "" };
        const label = draft.label.trim();
        if (!label) return;
        const value = slugify(label);
        const brand = brands.find((b) => b.value === brandValue);
        if (brand?.models.some((m) => m.value === value)) { setError(`${brand.label} ${label} is already in the catalog`); return; }
        setBrands(brands.map((b) => (b.value === brandValue ? { ...b, models: [...b.models, { label, value, rate: Math.max(Number(draft.rate) || 0, 0) }] } : b)));
        setNewModel((m) => ({ ...m, [brandValue]: { label: "", rate: "" } }));
        setError("");
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
                        <InputText id="new-tyre-brand" value={newBrand} placeholder="e.g. MRF" onChange={(e) => setNewBrand(e.target.value)}
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
                                                        <AffixInput prefix="₹" type="number" className="num" min={0} aria-label={`${b.label} ${m.label} rate`} value={m.rate}
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
                                                        value={nm.label} onChange={(e) => setNewModel((x) => ({ ...x, [b.value]: { ...nm, label: e.target.value } }))}
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
                        <InputText id="tyre-start-no" type="number" min={1} className="num" value={tyre.billStartNumber ?? 1}
                            onChange={(e) => set("tyre.billStartNumber", Math.max(parseInt(e.target.value, 10) || 1, 1))} />
                    </Field>
                </div>
            </Section>
        </>
    );
}

/* ---------------- Bonus ---------------- */
export function TyreBonusTab({ tyre, set }: { tyre: TyreSettings; set: SetFn }) {
    const bonus = tyre.bonus;
    const setBonus = (patch: Partial<TyreSettings["bonus"]>) => set("tyre.bonus", { ...bonus, ...patch });
    const role = (key: "mechanic" | "labour", name: string, split: boolean) => {
        const fixed = bonus[`${key}Mode`] === "amount";
        return (
            <Section title={`${name} bonus`} subtitle={`${key === "mechanic" ? "Settled yearly." : "Settled daily."} ${split ? "Split equally among the workers on each challan." : ""}`}>
                <div className="form-grid settings-three">
                    <Field label="Bonus type" labelId={`tyre-${key}-mode-label`}>
                        <SegmentedControl<"percent" | "amount">
                            label={`${name} bonus type`}
                            radio
                            full
                            options={[{ value: "percent", label: "% of tyre amount" }, { value: "amount", label: "₹ per challan" }]}
                            value={fixed ? "amount" : "percent"}
                            onChange={(v) => setBonus({ [`${key}Mode`]: v } as Partial<TyreSettings["bonus"]>)}
                        />
                    </Field>
                    {fixed ? (
                        <Field label={`${name} bonus per challan${split ? " (shared)" : ""}`} htmlFor={`tyre-${key}-amt`}>
                            <AffixInput id={`tyre-${key}-amt`} type="number" className="num" prefix="₹" min={0} step={10} value={bonus[`${key}Amount`] || ""} placeholder="0"
                                onChange={(e) => setBonus({ [`${key}Amount`]: Math.max(Number(e.target.value || 0), 0) } as Partial<TyreSettings["bonus"]>)} />
                        </Field>
                    ) : (
                        <Field label={`${name} bonus %`} htmlFor={`tyre-${key}-pct`}>
                            <AffixInput id={`tyre-${key}-pct`} type="number" className="num" suffix="%" min={0} max={100} step={0.5} value={bonus[`${key}Percent`]}
                                onChange={(e) => setBonus({ [`${key}Percent`]: Number(e.target.value || 0) } as Partial<TyreSettings["bonus"]>)} />
                        </Field>
                    )}
                    {key === "mechanic" && (
                        <Field label="Bonus year starts in" htmlFor="tyre-year-start">
                            <select id="tyre-year-start" className="form-select" value={bonus.yearStartMonth || 4} onChange={(e) => setBonus({ yearStartMonth: Number(e.target.value) })}>
                                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        </Field>
                    )}
                </div>
            </Section>
        );
    };
    return (
        <>
            {role("mechanic", tyre.labels.agent, false)}
            {role("labour", tyre.labels.worker, true)}
            <span className="field-help">
                The percentage is of the tyre amount (after any discount). Installment interest is never counted. The bonus becomes
                payable as the tyre amount is collected: when half the tyre price is received, half the bonus is ready, and all of it
                once the tyre price is paid, even if interest is still owed. After changing the bonus, use Recalculate on the Bonus page
                to re-price challans not paid out yet.
            </span>
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
                    {text("Agent label", "tyre.labels.agent", tyre.labels.agent, "Mechanic")}
                    {text("Worker label", "tyre.labels.worker", tyre.labels.worker, "Labour")}
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
