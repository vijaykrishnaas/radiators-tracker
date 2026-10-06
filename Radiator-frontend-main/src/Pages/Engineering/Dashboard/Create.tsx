import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import Selector from "../../../Components/Selector";
import { getData, postData, putData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today } from "../../../Utils/format";
import { PageHeader, Field, FormFooter, CardHead, SkeletonRows } from "../../../Components/ui/Basics";
import { AffixInput } from "../../../Components/ui/Inputs";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { defaultRate, isOffered, round2, type EngBill } from "../types";

// cost: only typed on free-description rows ("Other"); catalog items take their cost from Settings on save.
type Row = { item: string; label: string; comment: string; requiresComment: boolean; qty: string; rate: string; cost: string };
type Card = { key: number; type: string; bsModel: string; rows: Row[] };

let keySeq = 1;
const newCard = (type = "", bsModel = ""): Card => ({ key: keySeq++, type, bsModel, rows: [] });

const EngCreate = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const eng = settings.engineering;
    const serviceTypes = eng?.serviceTypes || [];
    const bsModels = eng?.bsModels || [];

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;

    const [loading, setLoading] = useState(false);          // submit in flight
    const [loadingRecord, setLoadingRecord] = useState(!!id); // edit/view record being fetched
    const [lookingUp, setLookingUp] = useState(false);
    const [filledNote, setFilledNote] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [billNo, setBillNo] = useState<number | null>(null);
    const [billDate, setBillDate] = useState(today());
    const [vehicleNo, setVehicleNo] = useState("");
    const [lorryAddress, setLorryAddress] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [phone, setPhone] = useState("");
    const [cards, setCards] = useState<Card[]>([newCard()]);
    // One BS model for the whole bill (header select). Cards still carry it so the saved payload shape is unchanged.
    const [billBs, setBillBs] = useState("");
    const [discount, setDiscount] = useState("");
    const [mechanics, setMechanics] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        getData("engbills/mechanics").then((r) => setMechanics(r.mechanics || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoadingRecord(true);
            try {
                const { bill } = (await getData(`engbills/${id}`)) as { bill: EngBill };
                setBillNo(bill.billNo);
                setBillDate(String(bill.billDate).slice(0, 10));
                setVehicleNo(bill.vehicleNo || "");
                setLorryAddress(bill.lorryAddress || "");
                setMechanic(bill.mechanic || "");
                setPhone(bill.phone || "");
                const bsSet = new Set((bill.services || []).map((s) => s.bsModel || ""));
                setBillBs(bsSet.size === 1 ? [...bsSet][0] : ""); // legacy bills with mixed BS per card show "Mixed" and keep each card's own value
                setCards((bill.services || []).map((s) => ({
                    key: keySeq++,
                    type: s.type,
                    bsModel: s.bsModel || "",
                    rows: s.items.map((i) => ({
                        item: i.item, label: i.label, comment: i.comment || "",
                        requiresComment: !!i.requiresComment, qty: String(i.qty), rate: String(i.rate),
                        cost: i.requiresComment && i.cost ? String(i.cost) : "",
                    })),
                })));
                setDiscount(bill.discount ? String(bill.discount) : "");
            } catch (e: any) {
                callAlertMsg(e?.message || "Error loading bill", "error");
            } finally {
                setLoadingRecord(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const findType = (t: string) => serviceTypes.find((x) => x.value === t);

    const updateCard = (key: number, fn: (c: Card) => Card) =>
        setCards((cs) => cs.map((c) => (c.key === key ? fn(c) : c)));

    const setType = (key: number, type: string) => updateCard(key, (c) => ({ ...c, type, rows: [] }));

    // Changing the bill's BS model re-applies the catalog rate on every card and drops items not offered for that model.
    const setBs = (bsModel: string) => {
        setBillBs(bsModel);
        setCards((cs) => cs.map((c) => {
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
        }));
    };

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
                        qty: "1", rate: String(defaultRate(it, c.bsModel)), cost: "",
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
                target = blank ? { ...blank, type } : newCard(type, billBs);
                list = blank ? list.map((c) => (c.key === blank.key ? target! : c)) : [...list, target];
            }
            if (target.rows.some((r) => r.item === item)) return list;
            if (it && !isOffered(it, target.bsModel)) return list;
            const row: Row = {
                item, label: it?.label || item, comment: "", requiresComment: !!it?.requiresComment,
                qty: "1", rate: String(defaultRate(it, target.bsModel)), cost: "",
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

    useEffect(() => () => clearTimeout(noteTimer.current), []);

    const lookupVehicle = async () => {
        const v = vehicleNo.trim().toUpperCase();
        if (!v || isView || isEdit) return;
        setLookingUp(true);
        try {
            const res = await getData("engbills/lookup-vehicle", { params: { vehicleNo: v } });
            if (res?.match) {
                let filled = false;
                if (!lorryAddress && res.match.lorryAddress) { setLorryAddress(res.match.lorryAddress); filled = true; }
                if (!phone && res.match.phone) { setPhone(res.match.phone); filled = true; }
                if (filled) {
                    setFilledNote(true);
                    clearTimeout(noteTimer.current);
                    noteTimer.current = setTimeout(() => setFilledNote(false), 3000);
                }
            }
        } catch { /* autofill is best-effort */ }
        finally { setLookingUp(false); }
    };

    // Cancel returns to the bills list. A new bill with anything entered asks first; editing just leaves (as before).
    const cancel = () => {
        const dirty = !!(vehicleNo || lorryAddress || mechanic || phone || billBs || cards.some((c) => c.type || c.rows.length));
        if (!isEdit && dirty) { setDiscardOpen(true); return; }
        navigate("/engineering/billing");
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
                        ...(r.requiresComment && r.cost !== "" ? { cost: Math.max(Number(r.cost) || 0, 0) } : {}),
                    })),
                })),
                // Payment fields are no longer on this form. New bills start unpaid; when editing they are left out so the
                // server keeps what is stored (and a payment recorded elsewhere meanwhile is not overwritten).
                ...(isEdit ? {} : { discount: 0, amountReceived: 0, paymentMode: "cash" }),
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
    const mixedBs = !billBs && new Set(cards.filter((c) => c.type).map((c) => c.bsModel || "")).size > 1;
    const typeOpts = serviceTypes.map((t) => ({ label: t.label, value: t.value }));
    const bsOpts = bsModels.map((b) => ({ label: b.label, value: b.value }));
    const subtitle = (
        <>
            {bsModels.map((b) => b.label).join(" / ") || "BS"} service work record
            {billNo != null && <> · Bill no. {billNo}</>}
        </>
    );

    return (
        <>
            <PageHeader title={title} subtitle={subtitle} back={{ to: "/engineering/billing", label: "Bills" }} />
            <div className="card-stack">
                <section className="card">
                    <div className="card-body">
                        <CardHead title="Bill details" />
                        {loadingRecord ? <SkeletonRows rows={3} /> : (
                            <div className="form-grid mt-4">
                                <Field label="Bill date" htmlFor="eng-bill-date" required error={errors.billDate}>
                                    <input id="eng-bill-date" type="date" className="form-control" value={billDate} disabled={isView}
                                        onChange={(e) => setBillDate(e.target.value)} />
                                </Field>
                                <Field label="Truck number" htmlFor="eng-truck-no" required error={errors.vehicleNo}
                                    help={filledNote ? <span className="t-success" role="status">Filled from last bill</span> : undefined}>
                                    <div className="input-icon">
                                        <InputText id="eng-truck-no" value={vehicleNo} placeholder="Enter Truck Number" disabled={isView}
                                            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} onBlur={lookupVehicle} />
                                        {lookingUp && <span className="spinner input-spinner" role="status" aria-label="Looking up truck" />}
                                    </div>
                                </Field>
                                <Field label="Lorry address" htmlFor="eng-lorry-address">
                                    <InputText id="eng-lorry-address" value={lorryAddress} placeholder="Enter Lorry Address" disabled={isView}
                                        onChange={(e) => setLorryAddress(e.target.value)} />
                                </Field>
                                <Field label="Mechanic name" htmlFor="eng-mechanic" required error={errors.mechanic}>
                                    <Selector
                                        inputId="eng-mechanic"
                                        options={mechanics.map((m) => ({ label: m, value: m }))}
                                        value={mechanic ? { label: mechanic, value: mechanic } : null}
                                        isDisabled={isView}
                                        placeholder="Select Mechanic Name"
                                        aria-invalid={!!errors.mechanic}
                                        onChange={(o: any) => setMechanic(o ? o.value : "")}
                                    />
                                </Field>
                                <Field label="Phone number" htmlFor="eng-phone" error={errors.phone}>
                                    <InputText id="eng-phone" type="tel" inputMode="numeric" value={phone} placeholder="Enter Phone Number" disabled={isView}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                                </Field>
                                <Field label="BS model" htmlFor="eng-bs">
                                    <Selector inputId="eng-bs" options={bsOpts} isDisabled={isView} isClearable
                                        placeholder={mixedBs ? "Mixed" : "Select BS model"}
                                        value={billBs ? bsOpts.find((b) => b.value === billBs) || { label: billBs, value: billBs } : null}
                                        onChange={(o: any) => setBs(o ? o.value : "")} />
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
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCards((cs) => [...cs, newCard("", billBs)])}>
                                    <Icons iconName="add" />Add New Service
                                </button>
                            )}
                        />
                        {!isView && quick.length > 0 && (
                            <div className="eng-quick-row mt-4">
                                <span className="t-xs t-muted">Quick add</span>
                                {quick.map((q) => (
                                    <button key={`${q.type}-${q.item}`} type="button" className="chip-btn" onClick={() => quickAdd(q.type, q.item)}>
                                        <Icons iconName="add" />{q.text}
                                    </button>
                                ))}
                            </div>
                        )}
                        {errors.services && <p className="field-error mt-3" role="alert">{errors.services}</p>}

                        <div className="d-grid gap-3 mt-4">
                            {cards.map((c, ci) => {
                                const t = findType(c.type);
                                const chosen = new Set(c.rows.map((r) => r.item));
                                const addOpts = (t?.items || []).filter((i) => isOffered(i, c.bsModel) && !chosen.has(i.value)).map((i) => ({ label: i.label, value: i.value }));
                                return (
                                    <section key={c.key} className="nested-card eng-svc" aria-label={`Service ${ci + 1}`}>
                                        <div className="eng-svc-head">
                                            <span className="eng-svc-tag">Service {ci + 1}</span>
                                            <div className="eng-svc-type">
                                                <Selector inputId={`eng-type-${c.key}`} aria-label={`Service type for service ${ci + 1}`} options={typeOpts} isDisabled={isView}
                                                    placeholder="Select service type"
                                                    value={c.type ? { label: t?.label || c.type, value: c.type } : null}
                                                    onChange={(o: any) => setType(c.key, o ? o.value : "")} />
                                            </div>
                                            {!isView && (
                                                <button type="button" className="btn btn-icon btn-secondary eng-svc-remove" aria-label="Remove service" title="Remove service"
                                                    onClick={() => setCards((cs) => (cs.length > 1 ? cs.filter((x) => x.key !== c.key) : [newCard("", billBs)]))}>
                                                    <Icons iconName="delete" />
                                                </button>
                                            )}
                                        </div>

                                        {c.rows.length > 0 && (
                                            <div className="eng-cols" aria-hidden="true">
                                                <span>Item</span><span className="num">Qty</span><span>Rate</span><span className="num">Amount</span><span />
                                            </div>
                                        )}
                                        {c.rows.length > 0 && (
                                            <ul className="eng-lines" aria-label={`Items for service ${ci + 1}`}>
                                                {c.rows.map((r) => {
                                                    const ce = errors[`c${c.key}-${r.item}`];
                                                    const qe = errors[`q${c.key}-${r.item}`];
                                                    return (
                                                        <li key={r.item} className="eng-line">
                                                            <div className="eng-line-main">
                                                                <span className="eng-line-name">{r.label}</span>
                                                                {r.requiresComment && (
                                                                    <div className="eng-line-extra">
                                                                        <div className={`eng-line-comment field${ce ? " has-error" : ""}`}>
                                                                            <InputText value={r.comment} placeholder="Describe the work" aria-label={`Description for ${r.label}`} disabled={isView}
                                                                                onChange={(e) => setRow(c.key, r.item, { comment: e.target.value })} />
                                                                            {ce && <span className="field-error" role="alert">{ce}</span>}
                                                                        </div>
                                                                        <div className="eng-line-cost" title="What this work cost you (for profit). Optional.">
                                                                            <AffixInput prefix="Cost ₹" type="number" min={0} inputMode="decimal" value={r.cost} placeholder="optional" disabled={isView}
                                                                                aria-label={`Cost for ${r.label}`} className="tabular text-end"
                                                                                onChange={(e) => setRow(c.key, r.item, { cost: e.target.value })} />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className={`eng-line-qty field${qe ? " has-error" : ""}`}>
                                                                <span className="eng-mlabel" aria-hidden="true">Qty</span>
                                                                <InputText type="number" inputMode="decimal" value={r.qty} placeholder="Qty" aria-label={`Quantity for ${r.label}`} disabled={isView}
                                                                    className="tabular text-end" onChange={(e) => setRow(c.key, r.item, { qty: e.target.value })} />
                                                                {qe && <span className="field-error" role="alert">{qe}</span>}
                                                            </div>
                                                            <div className="eng-line-rate">
                                                                <span className="eng-mlabel" aria-hidden="true">Rate</span>
                                                                <AffixInput prefix="₹" type="number" inputMode="decimal" value={r.rate} placeholder="Rate" aria-label={`Rate for ${r.label}`} disabled={isView}
                                                                    className="tabular text-end" onChange={(e) => setRow(c.key, r.item, { rate: e.target.value })} />
                                                            </div>
                                                            <span className="eng-line-amt tabular"><span className="eng-mlabel" aria-hidden="true">Amount</span>{money(amount(r))}</span>
                                                            {!isView ? (
                                                                <button type="button" className="btn btn-icon eng-line-x" aria-label="Remove item"
                                                                    onClick={() => setItems(c.key, c.rows.filter((x) => x.item !== r.item).map((x) => x.item))}>
                                                                    <Icons iconName="x" />
                                                                </button>
                                                            ) : <span className="eng-line-x" />}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}

                                        <div className="eng-svc-foot">
                                            {!isView ? (
                                                <div className="eng-add">
                                                    <Selector
                                                        inputId={`eng-items-${c.key}`}
                                                        aria-label={`Add item to service ${ci + 1}`}
                                                        options={addOpts}
                                                        value={null}
                                                        isDisabled={!c.type || !addOpts.length}
                                                        placeholder={!c.type ? "Select type first" : addOpts.length ? "+ Add item" : "All items added"}
                                                        onChange={(o: any) => { if (o) setItems(c.key, [...c.rows.map((x) => x.item), o.value]); }}
                                                    />
                                                </div>
                                            ) : <span />}
                                            {c.rows.length > 0 && (
                                                <div className="eng-subtotal">
                                                    <span>Subtotal</span>
                                                    <strong className="tabular">{money(subtotal(c))}</strong>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>

            <FormFooter totalLabel="Total amount" total={money(net)}>
                {isView ? (
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
                ) : (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={loading || loadingRecord} onClick={save}>
                            {loading && <span className="spinner" aria-hidden="true" />}
                            {loading ? "Saving..." : isEdit ? "Update service" : "Save service"}
                        </button>
                    </>
                )}
            </FormFooter>

            <ConfirmDialog
                open={discardOpen}
                title="Discard this bill?"
                message="Anything entered will be lost."
                confirmLabel="Discard"
                danger={false}
                onConfirm={() => { setDiscardOpen(false); navigate("/engineering/billing"); }}
                onCancel={() => setDiscardOpen(false)}
            />
        </>
    );
};

export default EngCreate;
