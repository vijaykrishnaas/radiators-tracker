import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import AlertComponent from "../../../Components/AlertComponent";
import Loader from "../../../Components/Loader";
import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import Selector from "../../../Components/Selector";
import { getData, postData, putData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today } from "../../../Utils/format";
import ItemMultiSelect from "../Components/ItemMultiSelect";
import { PAYMENT_MODES, defaultRate, isOffered, round2, type EngBill } from "../types";

type Row = { item: string; label: string; comment: string; requiresComment: boolean; qty: string; rate: string };
type Card = { key: number; type: string; bsModel: string; rows: Row[] };

let keySeq = 1;
const newCard = (type = "", bsModel = ""): Card => ({ key: keySeq++, type, bsModel, rows: [] });

const EngCreate = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { settings } = useSettings();
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();
    const eng = settings.engineering;
    const serviceTypes = eng?.serviceTypes || [];
    const bsModels = eng?.bsModels || [];

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;

    const [loading, setLoading] = useState(false);
    const [billNo, setBillNo] = useState<number | null>(null);
    const [billDate, setBillDate] = useState(today());
    const [vehicleNo, setVehicleNo] = useState("");
    const [lorryAddress, setLorryAddress] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [phone, setPhone] = useState("");
    const [cards, setCards] = useState<Card[]>([newCard()]);
    const [discount, setDiscount] = useState("");
    const [amountReceived, setAmountReceived] = useState("");
    const [paymentMode, setPaymentMode] = useState("cash");
    const [mechanics, setMechanics] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        getData("engbills/mechanics").then((r) => setMechanics(r.mechanics || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            try {
                const { bill } = (await getData(`engbills/${id}`)) as { bill: EngBill };
                setBillNo(bill.billNo);
                setBillDate(String(bill.billDate).slice(0, 10));
                setVehicleNo(bill.vehicleNo || "");
                setLorryAddress(bill.lorryAddress || "");
                setMechanic(bill.mechanic || "");
                setPhone(bill.phone || "");
                setCards((bill.services || []).map((s) => ({
                    key: keySeq++,
                    type: s.type,
                    bsModel: s.bsModel || "",
                    rows: s.items.map((i) => ({
                        item: i.item, label: i.label, comment: i.comment || "",
                        requiresComment: !!i.requiresComment, qty: String(i.qty), rate: String(i.rate),
                    })),
                })));
                setDiscount(bill.discount ? String(bill.discount) : "");
                setAmountReceived(bill.amountReceived ? String(bill.amountReceived) : "");
                setPaymentMode(bill.paymentMode || "cash");
            } catch (e: any) {
                callAlertMsg(e?.message || "Error loading bill", "error");
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const findType = (t: string) => serviceTypes.find((x) => x.value === t);

    const updateCard = (key: number, fn: (c: Card) => Card) =>
        setCards((cs) => cs.map((c) => (c.key === key ? fn(c) : c)));

    const setType = (key: number, type: string) => updateCard(key, (c) => ({ ...c, type, rows: [] }));

    const setBs = (key: number, bsModel: string) =>
        updateCard(key, (c) => {
            const t = findType(c.type);
            return {
                ...c,
                bsModel,
                rows: c.rows
                    .filter((r) => { const it = t?.items.find((i) => i.value === r.item); return !it || isOffered(it, bsModel); })
                    .map((r) => {
                        const it = t?.items.find((i) => i.value === r.item);
                        return it ? { ...r, rate: String(defaultRate(it, bsModel)) } : r;
                    }),
            };
        });

    const setItems = (key: number, values: string[]) =>
        updateCard(key, (c) => {
            const t = findType(c.type);
            const kept = c.rows.filter((r) => values.includes(r.item));
            const added = values
                .filter((v) => !c.rows.some((r) => r.item === v))
                .map((v) => {
                    const it = t?.items.find((i) => i.value === v);
                    return {
                        item: v, label: it?.label || v, comment: "", requiresComment: !!it?.requiresComment,
                        qty: "1", rate: String(defaultRate(it, c.bsModel)),
                    };
                });
            return { ...c, rows: [...kept, ...added] };
        });

    const setRow = (key: number, item: string, patch: Partial<Row>) => {
        updateCard(key, (c) => ({ ...c, rows: c.rows.map((r) => (r.item === item ? { ...r, ...patch } : r)) }));
        setErrors((e) => {
            const k = patch.comment !== undefined ? `c${key}-${item}` : patch.qty !== undefined ? `q${key}-${item}` : "";
            if (!k || !e[k]) return e;
            const { [k]: _drop, ...rest } = e;
            return rest;
        });
    };

    const quickAdd = (type: string, item: string) => {
        const it = findType(type)?.items.find((i) => i.value === item);
        setCards((cs) => {
            let list = cs;
            let target = list.find((c) => c.type === type);
            if (!target) {
                const blank = list.find((c) => !c.type);
                target = blank ? { ...blank, type } : newCard(type);
                list = blank ? list.map((c) => (c.key === blank.key ? target! : c)) : [...list, target];
            }
            if (target.rows.some((r) => r.item === item)) return list;
            if (it && !isOffered(it, target.bsModel)) return list;
            const row: Row = {
                item, label: it?.label || item, comment: "", requiresComment: !!it?.requiresComment,
                qty: "1", rate: String(defaultRate(it, target.bsModel)),
            };
            return list.map((c) => (c.key === target!.key ? { ...c, rows: [...c.rows, row] } : c));
        });
    };

    const amount = (r: Row) => round2((Number(r.qty) || 0) * (Number(r.rate) || 0));
    const subtotal = (c: Card) => round2(c.rows.reduce((s, r) => s + amount(r), 0));

    const typeTotals = useMemo(() => {
        const t: Record<string, number> = {};
        for (const c of cards) if (c.type) t[c.type] = round2((t[c.type] || 0) + subtotal(c));
        return t;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards]);
    const total = round2(Object.values(typeTotals).reduce((a, b) => a + b, 0));
    const disc = Math.min(Math.max(Number(discount) || 0, 0), total);
    const net = round2(total - disc);
    const received = Math.min(Math.max(Number(amountReceived) || 0, 0), net);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!billDate) e.billDate = "Date is required";
        if (!vehicleNo.trim()) e.vehicleNo = "Truck number is required";
        if (!mechanic) e.mechanic = "Mechanic is required";
        if (phone && !/^[0-9]{10}$/.test(phone)) e.phone = "Enter a valid 10 digit number";
        const filled = cards.filter((c) => c.type && c.rows.length);
        if (!filled.length) e.services = "Add at least one service with an item";
        cards.forEach((c) => c.rows.forEach((r) => {
            if (r.requiresComment && !r.comment.trim()) e[`c${c.key}-${r.item}`] = "Describe the work";
            if (!(Number(r.qty) > 0)) e[`q${c.key}-${r.item}`] = "Qty must be more than 0";
        }));
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const lookupVehicle = async () => {
        const v = vehicleNo.trim().toUpperCase();
        if (!v || isView || isEdit) return;
        try {
            const res = await getData("engbills/lookup-vehicle", { params: { vehicleNo: v } });
            if (res?.match) {
                if (!lorryAddress) setLorryAddress(res.match.lorryAddress || "");
                if (!phone) setPhone(res.match.phone || "");
            }
        } catch { /* autofill is best-effort */ }
    };

    const clearForm = () => {
        setVehicleNo(""); setLorryAddress(""); setMechanic(""); setPhone("");
        setCards([newCard()]); setDiscount(""); setAmountReceived(""); setPaymentMode("cash"); setErrors({});
    };

    const save = async () => {
        if (isView || !validate()) return;
        setLoading(true);
        try {
            const payload = {
                billDate,
                vehicleNo: vehicleNo.trim().toUpperCase(),
                lorryAddress,
                mechanic,
                phone,
                services: cards.filter((c) => c.type && c.rows.length).map((c) => ({
                    type: c.type,
                    bsModel: c.bsModel,
                    items: c.rows.map((r) => ({
                        item: r.item, label: r.label, comment: r.comment, requiresComment: r.requiresComment,
                        qty: Number(r.qty), rate: Number(r.rate) || 0,
                    })),
                })),
                discount: disc,
                amountReceived: received,
                paymentMode,
            };
            const res = isEdit ? await putData(`engbills/${id}`, payload) : await postData("engbills", payload);
            callAlertMsg(res.message || "Saved", "success");
            navigate("/engineering/billing");
        } catch (e: any) {
            callAlertMsg(e?.message || "Error saving. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    const quick = (eng?.quickAdd || [])
        .map((q) => {
            const t = findType(q.type);
            const it = t?.items.find((i) => i.value === q.item);
            return t && it ? { ...q, text: `${t.label} · ${it.label}` } : null;
        })
        .filter(Boolean) as { type: string; item: string; text: string }[];

    const title = isView ? "View service" : isEdit ? "Edit service" : "Turbo & air compressor service";
    const typeOpts = serviceTypes.map((t) => ({ label: t.label, value: t.value }));
    const bsOpts = bsModels.map((b) => ({ label: b.label, value: b.value }));

    return (
        <>
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <Loader loading={loading} />
            <div className="card card-shadow mt-3 p-4">
                <h5 className="font-w600 mb-0">{title}</h5>
                <p className="text-muted font-s13 mb-4">
                    {bsModels.map((b) => b.label).join(" / ") || "BS"} service work record
                    {billNo != null && <span className="ms-2">· Bill no. {billNo}</span>}
                </p>

                <div className="row g-3">
                    <div className="col-md-6">
                        <label className="form-label text-uppercase font-s12 label-required">Create date</label>
                        <input type="date" className="form-control" value={billDate} disabled={isView}
                            onChange={(e) => setBillDate(e.target.value)} />
                        {errors.billDate && <span className="text-danger font-s12">{errors.billDate}</span>}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-uppercase font-s12 label-required">Truck number</label>
                        <InputText value={vehicleNo} placeholder="Enter Truck Number" disabled={isView}
                            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} onBlur={lookupVehicle} />
                        {errors.vehicleNo && <span className="text-danger font-s12">{errors.vehicleNo}</span>}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-uppercase font-s12">Lorry address</label>
                        <InputText value={lorryAddress} placeholder="Enter Lorry Address" disabled={isView}
                            onChange={(e) => setLorryAddress(e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-uppercase font-s12 label-required">Mechanic name</label>
                        <Selector
                            options={mechanics.map((m) => ({ label: m, value: m }))}
                            value={mechanic ? { label: mechanic, value: mechanic } : null}
                            isDisabled={isView}
                            placeholder="Select Mechanic Name"
                            onChange={(o: any) => setMechanic(o ? o.value : "")}
                        />
                        {errors.mechanic && <span className="text-danger font-s12">{errors.mechanic}</span>}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label text-uppercase font-s12">Phone number</label>
                        <InputText value={phone} placeholder="Enter Phone Number" disabled={isView}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                        {errors.phone && <span className="text-danger font-s12">{errors.phone}</span>}
                    </div>
                </div>

                <div className="d-flex justify-content-between align-items-center mt-5 mb-2">
                    <h6 className="font-w600 mb-0">Services</h6>
                    {!isView && (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setCards((cs) => [...cs, newCard()])}>
                            <Icons iconName="addcircle" className="icon-15 icon-white" /> Add New Service
                        </button>
                    )}
                </div>
                {!isView && quick.length > 0 && (
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                        <span className="font-s13 text-muted">Quick add:</span>
                        {quick.map((q) => (
                            <button key={`${q.type}-${q.item}`} type="button" className="btn btn-sm btn-light rounded-pill"
                                onClick={() => quickAdd(q.type, q.item)}>{q.text}</button>
                        ))}
                    </div>
                )}
                {errors.services && <div className="text-danger font-s12 mb-2">{errors.services}</div>}

                {cards.map((c) => {
                    const t = findType(c.type);
                    const itemOpts = (t?.items || []).filter((i) => isOffered(i, c.bsModel)).map((i) => ({ label: i.label, value: i.value }));
                    return (
                        <div key={c.key} className="border rounded p-3 mb-3">
                            <div className="row g-3 align-items-end">
                                <div className="col-md-3">
                                    <label className="form-label text-uppercase font-s12">Service type</label>
                                    <Selector options={typeOpts} isDisabled={isView} placeholder="Select..."
                                        value={c.type ? { label: t?.label || c.type, value: c.type } : null}
                                        onChange={(o: any) => setType(c.key, o ? o.value : "")} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label text-uppercase font-s12">BS model</label>
                                    <Selector options={bsOpts} isDisabled={isView} isClearable placeholder="Select..."
                                        value={c.bsModel ? bsOpts.find((b) => b.value === c.bsModel) || { label: c.bsModel, value: c.bsModel } : null}
                                        onChange={(o: any) => setBs(c.key, o ? o.value : "")} />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label text-uppercase font-s12">Work / service items</label>
                                    <ItemMultiSelect options={itemOpts} value={c.rows.map((r) => r.item)} disabled={isView || !c.type}
                                        placeholder={c.type ? "Select items" : "Select type first"}
                                        onChange={(v) => setItems(c.key, v)} />
                                </div>
                                <div className="col-md-2 text-end">
                                    {!isView && (
                                        <button type="button" className="btn btn-sm btn-outline-danger"
                                            onClick={() => setCards((cs) => (cs.length > 1 ? cs.filter((x) => x.key !== c.key) : [newCard()]))}>
                                            <Icons iconName="delete" className="icon-15 me-1" /> Remove
                                        </button>
                                    )}
                                </div>
                            </div>

                            {c.rows.map((r) => (
                                <div key={r.item} className="d-flex flex-wrap align-items-center gap-2 rounded px-3 py-2 mt-2"
                                    style={{ background: "var(--canvas, #eef0f4)" }}>
                                    <span className="font-w500 flex-grow-1" style={{ minWidth: 140 }}>{r.label}</span>
                                    {r.requiresComment && (
                                        <div style={{ minWidth: 220 }}>
                                            <InputText value={r.comment} placeholder="Describe the work" disabled={isView}
                                                onChange={(e) => setRow(c.key, r.item, { comment: e.target.value })} />
                                            {errors[`c${c.key}-${r.item}`] && <span className="text-danger font-s12">{errors[`c${c.key}-${r.item}`]}</span>}
                                        </div>
                                    )}
                                    <div style={{ width: 90 }}>
                                        <InputText type="number" value={r.qty} placeholder="Qty" disabled={isView}
                                            onChange={(e) => setRow(c.key, r.item, { qty: e.target.value })} />
                                        {errors[`q${c.key}-${r.item}`] && <span className="text-danger font-s12">{errors[`q${c.key}-${r.item}`]}</span>}
                                    </div>
                                    <span className="text-muted">×</span>
                                    <div style={{ width: 140 }}>
                                        <InputText type="number" prefix="₹" value={r.rate} placeholder="Rate" disabled={isView}
                                            onChange={(e) => setRow(c.key, r.item, { rate: e.target.value })} />
                                    </div>
                                    <span className="font-w600 text-end" style={{ width: 110 }}>{money(amount(r))}</span>
                                    {!isView && (
                                        <button type="button" className="btn btn-sm btn-link text-muted p-0" aria-label="Remove item"
                                            onClick={() => setItems(c.key, c.rows.filter((x) => x.item !== r.item).map((x) => x.item))}>×</button>
                                    )}
                                </div>
                            ))}
                            {c.rows.length > 0 && (
                                <div className="text-end font-s13 mt-2">Subtotal: <b>{money(subtotal(c))}</b></div>
                            )}
                        </div>
                    );
                })}

                <div className="row g-3 mt-2">
                    <div className="col-md-3">
                        <label className="form-label text-uppercase font-s12">Discount</label>
                        <InputText type="number" prefix="₹" value={discount} disabled={isView} onChange={(e) => setDiscount(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label text-uppercase font-s12">Amount received</label>
                        <InputText type="number" prefix="₹" value={amountReceived} disabled={isView} onChange={(e) => setAmountReceived(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label text-uppercase font-s12">Payment mode</label>
                        <Selector options={PAYMENT_MODES} isDisabled={isView}
                            value={PAYMENT_MODES.find((m) => m.value === paymentMode) || null}
                            onChange={(o: any) => setPaymentMode(o ? o.value : "cash")} />
                    </div>
                </div>

                <hr className="my-4" />
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-3">
                    <div className="d-flex flex-wrap gap-4">
                        {serviceTypes.map((t) => (
                            <div key={t.value}>
                                <div className="font-s12 text-muted">{t.label}</div>
                                <div className="font-w600">{money(typeTotals[t.value] || 0)}</div>
                            </div>
                        ))}
                        {disc > 0 && (
                            <div>
                                <div className="font-s12 text-muted">Discount</div>
                                <div className="font-w600">−{money(disc)}</div>
                            </div>
                        )}
                        <div>
                            <div className="font-s12 text-muted">Total amount</div>
                            <div className="font-w700 font-s20" style={{ color: "var(--primary)" }}>{money(net)}</div>
                        </div>
                    </div>
                    <div className="d-flex gap-2">
                        {isView ? (
                            <button type="button" className="btn btn-cancel" onClick={() => navigate(-1)}>Back</button>
                        ) : (
                            <>
                                <button type="button" className="btn btn-cancel" onClick={isEdit ? () => navigate(-1) : clearForm}>
                                    {isEdit ? "Cancel" : "Clear form"}
                                </button>
                                <button type="button" className="btn btn-primary" disabled={loading} onClick={save}>
                                    {loading ? "Saving..." : isEdit ? "Update service" : "Save service"}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default EngCreate;
