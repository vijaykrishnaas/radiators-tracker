import { useState } from "react";
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

// Engineering service catalog: pick a service type from the dropdown to edit
// its table (item | price per BS model | needs description | quick add).
// A blank price means "not offered for that BS model"; 0 is still offered.
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
        <>
            <div className="card card-shadow mb-4">
                <div className="card-body">
                    <p className="font-w600 mb-3">BS models</p>
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                        {models.map((m) => (
                            <div key={m.value} className="input-group" style={{ width: 170 }}>
                                <input className="form-control form-control-sm" value={m.label}
                                    onChange={(e) => renameModel(m.value, e.target.value)} />
                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteModel(m.value)}>×</button>
                            </div>
                        ))}
                        <div className="input-group" style={{ width: 220 }}>
                            <input className="form-control form-control-sm" placeholder="Add model (e.g. BS-2)" value={newModel}
                                onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModel()} />
                            <button type="button" className="btn btn-sm btn-primary" onClick={addModel}>Add</button>
                        </div>
                    </div>
                    <small className="text-muted font-s12">Adding a model adds a price column for it on every item.</small>
                </div>
            </div>

            <div className="card card-shadow mb-4">
                <div className="card-body">
                    <div className="d-flex flex-wrap gap-3 align-items-end mb-3">
                        <div style={{ minWidth: 220 }}>
                            <label className="form-label">Service type</label>
                            <select className="form-select" value={activeType} onChange={(e) => setActiveType(e.target.value)}>
                                {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        {current && (
                            <div style={{ minWidth: 200 }}>
                                <label className="form-label">Rename</label>
                                <input className="form-control" value={current.label} onChange={(e) => renameType(e.target.value)} />
                            </div>
                        )}
                        {current && (
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={deleteType}>Delete type</button>
                        )}
                        <div className="input-group ms-auto" style={{ width: 260 }}>
                            <input className="form-control" placeholder="New service type" value={newType}
                                onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} />
                            <button type="button" className="btn btn-primary" onClick={addType}>+ Add type</button>
                        </div>
                    </div>

                    {current ? (
                        <>
                            <div className="table-responsive">
                                <table className="table table-bordered font-s14 align-middle">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            {models.map((m) => <th key={m.value} style={{ width: 120 }}>{m.label} ₹</th>)}
                                            <th className="text-center" style={{ width: 110 }}>Needs description</th>
                                            <th className="text-center" style={{ width: 90 }}>Quick add</th>
                                            <th style={{ width: 50 }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {current.items.map((it, idx) => (
                                            <tr key={it.value}>
                                                <td>
                                                    <input className="form-control form-control-sm" value={it.label}
                                                        onChange={(e) => patchItem(idx, { label: e.target.value })} />
                                                </td>
                                                {models.map((m) => {
                                                    const p = it.prices?.[m.value];
                                                    return (
                                                        <td key={m.value}>
                                                            <input type="number" min={0} className="form-control form-control-sm"
                                                                placeholder="not offered"
                                                                value={p === null || p === undefined ? "" : p}
                                                                onChange={(e) => setPrice(idx, m.value, e.target.value)} />
                                                        </td>
                                                    );
                                                })}
                                                <td className="text-center">
                                                    <input type="checkbox" className="form-check-input" checked={!!it.requiresComment}
                                                        onChange={(e) => patchItem(idx, { requiresComment: e.target.checked })} />
                                                </td>
                                                <td className="text-center">
                                                    <input type="checkbox" className="form-check-input" checked={isQuick(it.value)}
                                                        onChange={() => toggleQuick(it.value)} />
                                                </td>
                                                <td className="text-center">
                                                    <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => deleteItem(idx)}>×</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!current.items.length && (
                                            <tr><td colSpan={models.length + 4} className="text-center text-muted">No items yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="input-group" style={{ maxWidth: 360 }}>
                                <input className="form-control" placeholder="New item name" value={newItem}
                                    onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
                                <button type="button" className="btn btn-primary" onClick={addItem}>Add item</button>
                            </div>
                            <small className="text-muted font-s12 d-block mt-2">
                                Leave a price blank if the item is not offered for that BS model — it will be hidden in the service form.
                                A price of 0 is still offered.
                            </small>
                        </>
                    ) : (
                        <p className="text-muted mb-0">Add a service type to start.</p>
                    )}
                </div>
            </div>

            <div className="card card-shadow mb-4">
                <div className="card-body">
                    <p className="font-w600 mb-3">Bill numbering</p>
                    <div style={{ maxWidth: 260 }}>
                        <label className="form-label">Start bill numbers from</label>
                        <input type="number" min={1} className="form-control" value={eng.billStartNumber ?? 1}
                            onChange={(e) => set("engineering.billStartNumber", Math.max(parseInt(e.target.value, 10) || 1, 1))} />
                        <small className="text-muted font-s12">Continue from your paper bill book (e.g. 802). Only raises the next number, never lowers it.</small>
                    </div>
                </div>
            </div>
        </>
    );
};

export default EngCatalogTab;
