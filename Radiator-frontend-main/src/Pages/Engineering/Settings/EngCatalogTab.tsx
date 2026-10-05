import { useState } from "react";
import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import { CardHead, Field } from "../../../Components/ui/Basics";
import { AffixInput, Switch } from "../../../Components/ui/Inputs";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { useDesktopShell } from "../../../Components/ui/hooks";
import type { AppSettings, EngItem, EngServiceType } from "../../../Context/SettingsContext";

type Eng = AppSettings["engineering"];
type Props = { eng: Eng; set: (path: string, value: unknown) => void };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const uniqueSlug = (base: string, taken: string[]) => {
    let v = slug(base) || "item";
    let n = 2;
    while (taken.includes(v)) v = `${slug(base) || "item"}-${n++}`;
    return v;
};

// Engineering service catalog: master/detail. The left rail lists service
// types; the panel edits the selected type's items (name | price per BS model |
// asks for description | quick add). A blank price means "not offered for that
// BS model"; 0 is still offered. Below tablet width each item becomes a card.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const EngCatalogTab = ({ eng, set }: Props) => {
    const types = eng.serviceTypes || [];
    const models = eng.bsModels || [];
    const quick = eng.quickAdd || [];
    const [activeType, setActiveType] = useState(types[0]?.value || "");
    const [newType, setNewType] = useState("");
    const [newItem, setNewItem] = useState("");
    const [newModel, setNewModel] = useState("");
    const [confirm, setConfirm] = useState<null | { kind: "type" } | { kind: "model"; value: string }>(null);
    const wide = useDesktopShell();

    const typeIdx = types.findIndex((t) => t.value === activeType);
    const current: EngServiceType | undefined = types[typeIdx];

    const setTypes = (next: EngServiceType[]) => set("engineering.serviceTypes", next);
    const setItems = (items: EngItem[]) => setTypes(types.map((t, i) => (i === typeIdx ? { ...t, items } : t)));

    const addType = () => {
        const label = newType.trim();
        if (!label) return;
        const value = uniqueSlug(label, types.map((t) => t.value));
        setTypes([...types, { label, value, items: [] }]);
        setActiveType(value);
        setNewType("");
    };

    const renameType = (label: string) => setTypes(types.map((t, i) => (i === typeIdx ? { ...t, label } : t)));

    const deleteType = () => {
        if (!current) return;
        setTypes(types.filter((_, i) => i !== typeIdx));
        set("engineering.quickAdd", quick.filter((q) => q.type !== current.value));
        setActiveType(types.find((_, i) => i !== typeIdx)?.value || "");
    };

    const addItem = () => {
        const label = newItem.trim();
        if (!label || !current) return;
        const value = uniqueSlug(label, current.items.map((i) => i.value));
        const prices: Record<string, number | null> = {};
        models.forEach((m) => { prices[m.value] = 0; });
        setItems([...current.items, { label, value, prices }]);
        setNewItem("");
    };

    const patchItem = (idx: number, patch: Partial<EngItem>) =>
        current && setItems(current.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

    const setPrice = (idx: number, model: string, raw: string) => {
        if (!current) return;
        const it = current.items[idx];
        patchItem(idx, { prices: { ...it.prices, [model]: raw === "" ? null : Math.max(Number(raw) || 0, 0) } });
    };

    const deleteItem = (idx: number) => {
        if (!current) return;
        const it = current.items[idx];
        setItems(current.items.filter((_, i) => i !== idx));
        set("engineering.quickAdd", quick.filter((q) => !(q.type === current.value && q.item === it.value)));
    };

    const isQuick = (item: string) => !!current && quick.some((q) => q.type === current.value && q.item === item);
    const toggleQuick = (item: string) => {
        if (!current) return;
        set("engineering.quickAdd", isQuick(item)
            ? quick.filter((q) => !(q.type === current.value && q.item === item))
            : [...quick, { type: current.value, item }]);
    };

    const addModel = () => {
        const label = newModel.trim();
        if (!label) return;
        const value = uniqueSlug(label, models.map((m) => m.value));
        set("engineering.bsModels", [...models, { label, value }]);
        setTypes(types.map((t) => ({ ...t, items: t.items.map((it) => ({ ...it, prices: { ...it.prices, [value]: 0 } })) })));
        setNewModel("");
    };

    const renameModel = (value: string, label: string) =>
        set("engineering.bsModels", models.map((m) => (m.value === value ? { ...m, label } : m)));

    const deleteModel = (value: string) => {
        set("engineering.bsModels", models.filter((m) => m.value !== value));
        setTypes(types.map((t) => ({
            ...t,
            items: t.items.map((it) => {
                const { [value]: _drop, ...rest } = it.prices || {};
                return { ...it, prices: rest };
            }),
        })));
    };

    return (
        <div className="card-stack">
            <section className="card" aria-label="BS models">
                <div className="card-body">
                    <CardHead title="BS models" subtitle="Adding a model adds a price column for it on every item." />
                    <ul className="chip-list mb-0" aria-label="BS models">
                        {models.map((m) => (
                            <li key={m.value} className="chip">
                                <input value={m.label} aria-label={`Rename ${m.label}`}
                                    onChange={(e) => renameModel(m.value, e.target.value)} />
                                <button type="button" className="chip-x" aria-label={`Delete ${m.label}`}
                                    onClick={() => setConfirm({ kind: "model", value: m.value })}>
                                    <Icons iconName="x" />
                                </button>
                            </li>
                        ))}
                        <li className="chip chip-add">
                            <input placeholder="Add model" value={newModel} aria-label="New BS model"
                                onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModel()} />
                            <button type="button" className="btn btn-link" disabled={!newModel.trim()} onClick={addModel}>Add</button>
                        </li>
                    </ul>
                </div>
            </section>

            <div className="cat-split">
                {wide ? (
                    <nav className="card cat-rail" aria-label="Service types">
                        <p className="cat-rail-title">Service types</p>
                        {types.map((t) => (
                            <button key={t.value} type="button" aria-current={t.value === activeType}
                                className={`cat-type${t.value === activeType ? " is-active" : ""}`}
                                onClick={() => setActiveType(t.value)}>
                                <span>{t.label || "Untitled"}</span>
                                <span className="cat-type-count">{t.items.length}</span>
                            </button>
                        ))}
                        <div className="cat-rail-add">
                            <InputText placeholder="New service type" value={newType} aria-label="New service type"
                                onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} />
                            <button type="button" className="btn btn-secondary" disabled={!newType.trim()} onClick={addType}>Add</button>
                        </div>
                    </nav>
                ) : (
                    <div className="card cat-picker">
                        <div className="card-body">
                            <Field label="Service type" htmlFor="cat-type-select">
                                <select id="cat-type-select" className="form-select" value={activeType} onChange={(e) => setActiveType(e.target.value)}>
                                    {types.map((t) => <option key={t.value} value={t.value}>{`${t.label || "Untitled"} (${t.items.length})`}</option>)}
                                </select>
                            </Field>
                            <div className="cat-rail-add">
                                <InputText placeholder="New service type" value={newType} aria-label="New service type"
                                    onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} />
                                <button type="button" className="btn btn-secondary" disabled={!newType.trim()} onClick={addType}>Add</button>
                            </div>
                        </div>
                    </div>
                )}

                <section className="card cat-panel" aria-label="Service items">
                    {current ? (
                        <div className="card-body">
                            <div className="cat-panel-head">
                                <InputText className="cat-title-input" value={current.label} aria-label="Service type name"
                                    onChange={(e) => renameType(e.target.value)} />
                                <button type="button" className="btn btn-outline-danger" onClick={() => setConfirm({ kind: "type" })}>Delete type</button>
                            </div>

                            <div className="cat-scroll">
                                <div className="cat-grid" style={{ ["--n" as string]: models.length }}>
                                    <div className="cat-row cat-head" aria-hidden="true">
                                        <span>Item</span>
                                        {models.map((m) => <span key={m.value} className="num">{m.label}</span>)}
                                        <span>Description</span>
                                        <span>Quick add</span>
                                        <span />
                                    </div>

                                    {current.items.map((it, idx) => (
                                        <div key={it.value} className="cat-row cat-item">
                                            <div className="cat-name">
                                                <InputText value={it.label} aria-label="Item name"
                                                    onChange={(e) => patchItem(idx, { label: e.target.value })} />
                                            </div>
                                            {models.map((m) => {
                                                const p = it.prices?.[m.value];
                                                const off = p === null || p === undefined;
                                                return (
                                                    <div key={m.value} className={`cat-price${off ? " is-off" : ""}`}
                                                        title={off ? `Not offered for ${m.label}` : undefined}>
                                                        <span className="cat-price-label">{m.label}</span>
                                                        <AffixInput prefix="₹" type="number" min={0} inputMode="decimal" placeholder="—" className="num"
                                                            aria-label={`${it.label} price for ${m.label}`}
                                                            value={off ? "" : p}
                                                            onChange={(e) => setPrice(idx, m.value, e.target.value)} />
                                                    </div>
                                                );
                                            })}
                                            <div className="cat-switch">
                                                <Switch id={`cat-desc-${current.value}-${it.value}`}
                                                    label={<span className="cat-switch-text">Ask for a description</span>}
                                                    checked={!!it.requiresComment}
                                                    onChange={(v) => patchItem(idx, { requiresComment: v })} />
                                            </div>
                                            <div className="cat-switch">
                                                <Switch id={`cat-quick-${current.value}-${it.value}`}
                                                    label={<span className="cat-switch-text">Quick-add chip</span>}
                                                    checked={isQuick(it.value)}
                                                    onChange={() => toggleQuick(it.value)} />
                                            </div>
                                            <div className="cat-del">
                                                <button type="button" className="btn btn-icon is-danger" aria-label={`Delete ${it.label}`}
                                                    onClick={() => deleteItem(idx)}>
                                                    <Icons iconName="delete" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {!current.items.length && <p className="t-sm t-muted mt-3 mb-0">No items yet. Add the first one below.</p>}

                            <div className="cat-additem">
                                <InputText placeholder="New item name" value={newItem} aria-label="New item name"
                                    onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
                                <button type="button" className="btn btn-primary" disabled={!newItem.trim()} onClick={addItem}>Add item</button>
                            </div>
                            <p className="field-help mb-0">
                                Empty = not offered for that BS model (hidden in the service form). ₹0 is still offered.
                            </p>
                        </div>
                    ) : (
                        <div className="card-body"><p className="t-sm t-muted mb-0">Add a service type to start.</p></div>
                    )}
                </section>
            </div>

            <section className="card" aria-label="Bill numbering">
                <div className="card-body">
                    <CardHead title="Bill numbering" subtitle="Continue from your paper bill book (e.g. 802). This only ever raises the next number, never lowers it." />
                    <div className="cat-narrow">
                        <Field label="Start bill numbers from" htmlFor="cat-bill-start">
                            <input id="cat-bill-start" type="number" min={1} className="form-control num" value={eng.billStartNumber ?? 1}
                                onChange={(e) => set("engineering.billStartNumber", Math.max(parseInt(e.target.value, 10) || 1, 1))} />
                        </Field>
                    </div>
                </div>
            </section>

            <section className="card" aria-label="Financial year">
                <div className="card-body">
                    <CardHead title="Financial year" subtitle={'The Dashboard starts from the first day of this month (default April) and "This FY" uses it.'} />
                    <div className="cat-narrow">
                        <Field label="Financial year starts in" htmlFor="cat-fy-month">
                            <select id="cat-fy-month" className="form-select" value={eng.fyStartMonth ?? 4}
                                onChange={(e) => set("engineering.fyStartMonth", parseInt(e.target.value, 10))}>
                                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        </Field>
                    </div>
                </div>
            </section>

            <ConfirmDialog
                open={confirm?.kind === "type"}
                title="Delete service type"
                message={`Delete service type "${current?.label ?? ""}" and all its items?`}
                confirmLabel="Delete type"
                onCancel={() => setConfirm(null)}
                onConfirm={() => { deleteType(); setConfirm(null); }}
            />
            <ConfirmDialog
                open={confirm?.kind === "model"}
                title="Delete BS model"
                message="Delete this BS model and its price column?"
                confirmLabel="Delete model"
                onCancel={() => setConfirm(null)}
                onConfirm={() => { if (confirm?.kind === "model") deleteModel(confirm.value); setConfirm(null); }}
            />
        </div>
    );
};

export default EngCatalogTab;
