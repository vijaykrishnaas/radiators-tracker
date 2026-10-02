import { useState } from "react";
import "../engineering.css";
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
const EngCatalogTab = ({ eng, set }: Props) => {
    const types = eng.serviceTypes || [];
    const models = eng.bsModels || [];
    const quick = eng.quickAdd || [];
    const [activeType, setActiveType] = useState(types[0]?.value || "");
    const [newType, setNewType] = useState("");
    const [newItem, setNewItem] = useState("");
    const [newModel, setNewModel] = useState("");

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
        if (!current || !window.confirm(`Delete service type "${current.label}" and all its items?`)) return;
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
        if (!window.confirm("Delete this BS model and its price column?")) return;
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
        <div className="eng-stack">
            <section className="eng-card eng-card-pad" aria-label="BS models">
                <p className="eng-eyebrow">BS models</p>
                <div className="eng-chips">
                    {models.map((m) => (
                        <div key={m.value} className="eng-chip">
                            <input value={m.label} aria-label={`Rename ${m.label}`}
                                onChange={(e) => renameModel(m.value, e.target.value)} />
                            <button type="button" className="eng-icon-btn" aria-label={`Delete ${m.label}`}
                                onClick={() => deleteModel(m.value)}>×</button>
                        </div>
                    ))}
                    <div className="eng-add">
                        <input placeholder="Add model" value={newModel} aria-label="New BS model"
                            onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModel()} />
                        <button type="button" className="eng-link-btn" disabled={!newModel.trim()} onClick={addModel}>Add</button>
                    </div>
                </div>
                <p className="eng-hint">Adding a model adds a price column for it on every item.</p>
            </section>

            <div className="eng-split">
                <nav className="eng-card eng-rail" aria-label="Service types">
                    <p className="eng-eyebrow eng-rail-title">Service types</p>
                    {types.map((t) => (
                        <button key={t.value} type="button" aria-current={t.value === activeType}
                            className={`eng-type${t.value === activeType ? " is-active" : ""}`}
                            onClick={() => setActiveType(t.value)}>
                            <span>{t.label || "Untitled"}</span>
                            <span className="eng-type-count">{t.items.length}</span>
                        </button>
                    ))}
                    <div className="eng-rail-add">
                        <div className="eng-add">
                            <input placeholder="New service type" value={newType} aria-label="New service type"
                                onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} />
                            <button type="button" className="eng-link-btn" disabled={!newType.trim()} onClick={addType}>Add</button>
                        </div>
                    </div>
                </nav>

                <section className="eng-card" aria-label="Service items" style={{ overflow: "hidden" }}>
                    {current ? (
                        <>
                            <div className="eng-panel-head">
                                <input className="eng-title-input" value={current.label} aria-label="Service type name"
                                    onChange={(e) => renameType(e.target.value)} />
                                <button type="button" className="eng-link-btn is-danger" onClick={deleteType}>Delete type</button>
                            </div>

                            <div className="eng-items" style={{ ["--n" as string]: models.length }}>
                                <div className="eng-items-head" aria-hidden="true">
                                    <span>Item</span>
                                    {models.map((m) => <span key={m.value} className="is-num">{m.label}</span>)}
                                    <span className="is-mid">Asks detail</span>
                                    <span className="is-mid">Quick add</span>
                                    <span />
                                </div>

                                {current.items.map((it, idx) => (
                                    <div key={it.value} className="eng-item">
                                        <div className="eng-name-cell">
                                            <input className="eng-name" value={it.label} aria-label="Item name"
                                                onChange={(e) => patchItem(idx, { label: e.target.value })} />
                                        </div>
                                        <div className="eng-del-cell">
                                            <button type="button" className="eng-icon-btn" aria-label={`Delete ${it.label}`}
                                                onClick={() => deleteItem(idx)}>×</button>
                                        </div>
                                        {models.map((m) => {
                                            const p = it.prices?.[m.value];
                                            const off = p === null || p === undefined;
                                            return (
                                                <label key={m.value} className={`eng-price${off ? " is-off" : ""}`}
                                                    title={off ? `Not offered for ${m.label}` : undefined}>
                                                    <span className="eng-price-label">{m.label}</span>
                                                    <span className="eng-rs">₹</span>
                                                    <input type="number" min={0} inputMode="decimal" placeholder="—"
                                                        aria-label={`${it.label} price for ${m.label}`}
                                                        value={off ? "" : p}
                                                        onChange={(e) => setPrice(idx, m.value, e.target.value)} />
                                                </label>
                                            );
                                        })}
                                        <div className="eng-cell-mid">
                                            <label className="eng-switch">
                                                <input type="checkbox" checked={!!it.requiresComment}
                                                    onChange={(e) => patchItem(idx, { requiresComment: e.target.checked })} />
                                                <span className="eng-switch-track" />
                                                <span className="eng-switch-text">Ask for a description</span>
                                            </label>
                                        </div>
                                        <div className="eng-cell-mid">
                                            <label className="eng-switch">
                                                <input type="checkbox" checked={isQuick(it.value)} onChange={() => toggleQuick(it.value)} />
                                                <span className="eng-switch-track" />
                                                <span className="eng-switch-text">Quick-add chip</span>
                                            </label>
                                        </div>
                                    </div>
                                ))}

                                {!current.items.length && (
                                    <div className="eng-empty">No items yet. Add the first one below.</div>
                                )}
                            </div>

                            <div className="eng-additem">
                                <input placeholder="New item name" value={newItem} aria-label="New item name"
                                    onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
                                <button type="button" className="btn btn-primary btn-sm" disabled={!newItem.trim()} onClick={addItem}>Add item</button>
                            </div>
                            <div className="eng-legend">
                                <span><i />Empty = not offered for that BS model (hidden in the service form)</span>
                                <span>₹0 is still offered</span>
                            </div>
                        </>
                    ) : (
                        <div className="eng-empty">Add a service type to start.</div>
                    )}
                </section>
            </div>

            <section className="eng-card eng-card-pad eng-numbering" aria-label="Bill numbering">
                <div>
                    <p className="eng-eyebrow" style={{ marginBottom: 4 }}>Bill numbering</p>
                    <p className="eng-hint" style={{ margin: 0 }}>
                        Continue from your paper bill book (e.g. 802). This only ever raises the next number, never lowers it.
                    </p>
                </div>
                <label style={{ display: "grid", gap: 4, margin: 0 }}>
                    <span className="eng-hint" style={{ margin: 0 }}>Start bill numbers from</span>
                    <input type="number" min={1} className="eng-number-input" value={eng.billStartNumber ?? 1}
                        onChange={(e) => set("engineering.billStartNumber", Math.max(parseInt(e.target.value, 10) || 1, 1))} />
                </label>
            </section>
        </div>
    );
};

export default EngCatalogTab;
