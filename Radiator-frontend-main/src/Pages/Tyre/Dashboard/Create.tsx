import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Icons from "../../../Components/Icons";
import InputText from "../../../Components/InputText";
import Selector from "../../../Components/Selector";
import RecordPaymentModal from "../../../Components/RecordPaymentModal";
import { printTyreChallan } from "../../../Components/PrintTyreChallan";
import { getData, postData, putData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { useSettings } from "../../../Context/SettingsContext";
import { money, today } from "../../../Utils/format";
import { PageHeader, Field, FormFooter, CardHead, SkeletonRows, SegmentedControl, Badge } from "../../../Components/ui/Basics";
import { AffixInput } from "../../../Components/ui/Inputs";
import { ConfirmDialog } from "../../../Components/ui/Modal";
import { addMonths, fmtDate, monthsBetween, round2, rowLabel, rowTone, type RowStatus, type TyreBill } from "../types";
import { payableRows, submitTyrePayment } from "../payment";

type ItemRow = {
    key: number;
    brandRef: string;
    brandLabel: string;
    modelRef: string;
    modelLabel: string;
    tyreNumber: string;
    tubeType: "tube" | "tubeless";
    flap: "Yes" | "No";
    qty: string;
    rate: string;
};

type PlanRow = {
    key: number;
    id?: string;            // saved rows keep their id, so their payments stay attached
    label: string;
    dueDate: string;        // YYYY-MM-DD
    principal: string;
    interest: string;
    dateTouched: boolean;   // a hand-picked due date is not moved when the challan date changes
    paid: number;           // > 0 ⇒ the row is locked
    balance?: number;
    rowStatus?: RowStatus;
};

let keySeq = 1;
const DEFAULT_LABEL = /^(Initial amount|\d+(st|nd|rd|th) month)$/;

const TUBE_OPTIONS = [{ value: "tube", label: "Tube type" }, { value: "tubeless", label: "Tubeless" }];
const PAY_OPTIONS: { value: "full" | "installment"; label: string }[] = [
    { value: "full", label: "Full payment" },
    { value: "installment", label: "Installments" },
];

const newItem = (tubeType: "tube" | "tubeless"): ItemRow => ({
    key: keySeq++, brandRef: "", brandLabel: "", modelRef: "", modelLabel: "", tyreNumber: "", tubeType, flap: "Yes", qty: "1", rate: "",
});
const newRow = (i: number, billDate: string): PlanRow => ({
    key: keySeq++, label: rowLabel(i), dueDate: addMonths(billDate, i), principal: "", interest: "", dateTouched: false, paid: 0,
});
// The paper challan's starting plan: an initial amount on the day plus two months.
const startPlan = (billDate: string) => [0, 1, 2].map((i) => newRow(i, billDate));

const lineAmount = (r: ItemRow) => round2((Number(r.qty) || 0) * (Number(r.rate) || 0));
const isNum = (v: string) => String(v).trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

// Each row's month in the plan (0 = initial amount). Normally its position, but a paid row keeps its own due date, so
// the rows after it count on from that row's month and never take its name or date (removing an unpaid row before a
// paid "1st month" used to turn the next row into a second "1st month" due the same day).
const planSlots = (rows: Pick<PlanRow, "paid" | "dueDate">[], billDate: string) => {
    let next = 0;
    return rows.map((r) => {
        const slot = r.paid > 0 && r.dueDate && billDate ? Math.max(next, monthsBetween(billDate, r.dueDate)) : next;
        next = slot + 1;
        return slot;
    });
};

// Unlocked rows follow their place in the plan: default names renumber and untouched due dates move with the challan date.
const normalizeRows = (rows: PlanRow[], billDate: string) => {
    const slots = planSlots(rows, billDate);
    return rows.map((r, i) => {
        if (r.paid > 0) return r;
        return {
            ...r,
            label: !r.label.trim() || DEFAULT_LABEL.test(r.label) ? rowLabel(slots[i]) : r.label,
            dueDate: r.dateTouched ? r.dueDate : addMonths(billDate, slots[i]),
        };
    });
};

const TyreCreate = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const tyre = settings.tyre;
    const brands = tyre.brands || [];
    const labels = tyre.labels;

    const isView = location.pathname.includes("/view/");
    const isEdit = !!id && !isView;

    const [loading, setLoading] = useState(false);
    const [loadingRecord, setLoadingRecord] = useState(!!id);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [bill, setBill] = useState<TyreBill | null>(null);
    const [billNo, setBillNo] = useState<number | null>(null);
    const [billDate, setBillDate] = useState(today());
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [vehicleNo, setVehicleNo] = useState("");
    const [mechanic, setMechanic] = useState("");
    const [labour, setLabour] = useState<string[]>([]);
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<ItemRow[]>([newItem(tyre.defaultTubeType || "tube")]);
    const [paymentType, setPaymentType] = useState<"full" | "installment">("installment");
    const [rows, setRows] = useState<PlanRow[]>(() => startPlan(today()));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [mechanics, setMechanics] = useState<string[]>([]);
    // Stock per brand+model, and what this challan already took when it was last saved (edit), so the warning
    // compares against what is really free. Only a warning: the challan still saves.
    const [stock, setStock] = useState<Record<string, number> | null>(null);
    const [savedQty, setSavedQty] = useState<Record<string, number>>({});
    const [payOpen, setPayOpen] = useState(false);
    const [paying, setPaying] = useState(false);

    useEffect(() => {
        getData("tyre-mechanic").then((r) => setMechanics(r.mechdata || [])).catch(() => {});
        if (!isView) getData("inventory/levels").then((r) => setStock(r.levels || {})).catch(() => setStock(null));
    }, [isView]);

    const applyBill = (b: TyreBill) => {
        setBill(b);
        setBillNo(b.billNo);
        const bd = String(b.billDate).slice(0, 10);
        setBillDate(bd);
        setCustomerName(b.customerName || "");
        setPhone(b.phoneNumber || "");
        setAddress(b.address || "");
        setVehicleNo(String(b.vehicleNumber || "").toUpperCase());
        setMechanic(b.mechanicName || "");
        setLabour(b.labourName || []);
        setNotes(b.notes || "");
        setItems((b.items || []).map((i) => ({
            key: keySeq++,
            brandRef: i.brandRef || "", brandLabel: i.brandLabel, modelRef: i.modelRef || "", modelLabel: i.modelLabel,
            tyreNumber: i.tyreNumber || "", tubeType: i.tubeType, flap: i.flap ? "Yes" : "No", qty: String(i.qty), rate: String(i.rate),
        })));
        const taken: Record<string, number> = {};
        (b.items || []).forEach((i) => { if (i.partRef) taken[i.partRef] = (taken[i.partRef] || 0) + (Number(i.qty) || 0); });
        setSavedQty(taken);
        setPaymentType(b.paymentType);
        if (b.paymentType === "installment") {
            const loaded = b.installments.map((r) => ({
                key: keySeq++, id: r.id, label: r.label, dueDate: String(r.dueDate).slice(0, 10),
                principal: String(r.principal), interest: String(r.interest), dateTouched: false,
                paid: r.paid, balance: r.balance, rowStatus: r.rowStatus,
            }));
            const slots = planSlots(loaded, bd);
            setRows(loaded.map((r, i) => ({ ...r, dateTouched: r.dueDate !== addMonths(bd, slots[i]) })));
        } else setRows(startPlan(bd));
    };

    const loadBill = async () => {
        setLoadingRecord(true);
        try {
            applyBill(await getData(`tyrebills/${id}`) as TyreBill);
        } catch (e: any) {
            callAlertMsg(e?.message || "Error loading challan", "error");
        } finally {
            setLoadingRecord(false);
        }
    };

    useEffect(() => {
        if (id) loadBill();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const clearErr = (...keys: string[]) =>
        setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));

    /* ---- Items ---- */
    const setItem = (key: number, patch: Partial<ItemRow>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    const pickBrand = (key: number, ref: string) => {
        const b = brands.find((x) => x.value === ref);
        setItem(key, { brandRef: ref, brandLabel: b?.label || "", modelRef: "", modelLabel: "", rate: "" });
        clearErr(`b${key}`);
    };
    const pickModel = (key: number, brandRef: string, ref: string) => {
        const m = brands.find((x) => x.value === brandRef)?.models.find((x) => x.value === ref);
        // Picking a model fills its default rate from Settings; the rate stays editable on this line.
        setItem(key, { modelRef: ref, modelLabel: m?.label || "", rate: m ? String(m.rate ?? 0) : "" });
        clearErr(`m${key}`, `r${key}`);
    };
    const neededByPart = useMemo(() => {
        const n: Record<string, number> = {};
        items.forEach((i) => { if (i.brandRef && i.modelRef) n[`${i.brandRef}:${i.modelRef}`] = (n[`${i.brandRef}:${i.modelRef}`] || 0) + (Number(i.qty) || 0); });
        return n;
    }, [items]);
    const stockWarning = (i: ItemRow) => {
        const ref = i.brandRef && i.modelRef ? `${i.brandRef}:${i.modelRef}` : "";
        if (!stock || !ref || !(ref in stock)) return "";
        const free = (stock[ref] || 0) + (savedQty[ref] || 0);
        const need = neededByPart[ref] || 0;
        if (need <= free) return "";
        return free <= 0 ? `None in stock (challan needs ${need}). It will still save; stock will show short.`
            : `Only ${free} in stock (challan needs ${need}). It will still save; stock will show short.`;
    };

    /* ---- Plan ---- */
    const hasPayment = !!bill && (bill.paymentType === "installment" ? bill.installments.some((r) => r.paid > 0) : bill.receivedAmount > 0);
    const setRow = (key: number, patch: Partial<PlanRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const addRow = () => setRows((rs) => normalizeRows([...rs, newRow(rs.length, billDate)], billDate));
    const removeRow = (key: number) => setRows((rs) => normalizeRows(rs.filter((r) => r.key !== key), billDate));
    const changeBillDate = (v: string) => {
        setBillDate(v);
        if (v) setRows((rs) => normalizeRows(rs, v));
        clearErr("billDate");
    };

    const tyreAmount = round2(items.reduce((s, i) => s + lineAmount(i), 0));
    const principalSum = round2(rows.reduce((s, r) => s + (Number(r.principal) || 0), 0));
    const interestSum = round2(rows.reduce((s, r) => s + (Number(r.interest) || 0), 0));
    const planGap = round2(tyreAmount - principalSum);
    const isPlan = paymentType === "installment";
    const planOk = planGap === 0 && tyreAmount > 0;
    const toCollect = isPlan ? round2(tyreAmount + interestSum) : round2(tyreAmount - (bill?.discount || 0));

    const validate = () => {
        const e: Record<string, string> = {};
        if (!billDate) e.billDate = "Date is required";
        if (!vehicleNo.trim()) e.vehicleNo = `${labels.vehicleNo} is required`;
        if (!mechanic) e.mechanic = `${labels.agent} is required`;
        if (phone && !/^[0-9]{10}$/.test(phone)) e.phone = "Enter a valid 10 digit number";
        items.forEach((i) => {
            if (!i.brandLabel) e[`b${i.key}`] = "Choose a brand";
            if (!i.modelLabel) e[`m${i.key}`] = "Choose a model / size";
            if (!/^\d+$/.test(i.qty) || Number(i.qty) < 1) e[`q${i.key}`] = "Whole number, 1 or more";
            if (!isNum(i.rate)) e[`r${i.key}`] = "Enter a rate";
        });
        if (isPlan) {
            if (!rows.length) e.plan = "Add at least one installment";
            rows.forEach((r) => {
                if (r.paid > 0) return;
                if (!r.dueDate) e[`d${r.key}`] = "Pick a due date";
                if (!isNum(r.principal || "0") || !isNum(r.interest || "0")) e[`a${r.key}`] = "Amounts must be 0 or more";
                // Before any tyre is priced the plan can't be filled in yet: the tyre errors say what to do first.
                else if (tyreAmount > 0 && (Number(r.principal) || 0) + (Number(r.interest) || 0) <= 0) e[`a${r.key}`] = "Enter an amount (or remove this row)";
            });
            if (rows.length && planGap !== 0) {
                e.plan = planGap > 0
                    ? `Principal is ${money(planGap)} short of the tyre amount. Add it to an installment.`
                    : `Principal is ${money(-planGap)} more than the tyre amount.`;
            }
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const cancel = () => {
        const dirty = !!(vehicleNo || customerName || phone || address || mechanic || items.some((i) => i.brandRef || i.tyreNumber));
        if (!isEdit && dirty) { setDiscardOpen(true); return; }
        navigate("/tyre/billing");
    };

    // After a failed Save, bring the first error on the page into view and put the cursor in its field: on a phone the
    // form is several screens long and the error can be far above or below where Save was pressed.
    const showFirstError = () => setTimeout(() => {
        const err = document.querySelector<HTMLElement>(".field-error");
        if (!err) return;
        err.scrollIntoView({ block: "center", behavior: "smooth" });
        const box = err.closest(".field, .tyre-plan-row, .tyre-item, .card-body");
        box?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus({ preventScroll: true });
    }, 0);

    const save = async () => {
        if (isView || !validate()) {
            if (!isView) {
                callAlertMsg("Fix the highlighted fields", "error");
                showFirstError();
            }
            return;
        }
        setLoading(true);
        try {
            const payload = {
                billDate,
                vehicleNumber: vehicleNo.trim().toUpperCase(),
                customerName,
                phoneNumber: phone,
                address,
                mechanicName: mechanic,
                labourName: labour,
                notes,
                items: items.map((i) => ({
                    brandRef: i.brandRef, brandLabel: i.brandLabel, modelRef: i.modelRef, modelLabel: i.modelLabel,
                    tyreNumber: i.tyreNumber, tubeType: i.tubeType, flap: i.flap === "Yes", qty: Number(i.qty), rate: Number(i.rate) || 0,
                })),
                paymentType,
                installments: isPlan
                    ? rows.map((r) => ({ id: r.id, label: r.label, dueDate: r.dueDate, principal: Number(r.principal) || 0, interest: Number(r.interest) || 0 }))
                    : [],
            };
            const res = isEdit ? await putData(`tyrebills/${id}`, payload) : await postData("tyrebills/add", payload);
            callAlertMsg(res.message || "Saved", "success");
            navigate("/tyre/billing");
        } catch (e: any) {
            callAlertMsg(e?.message || "Error saving. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    const onPay = async (v: { amount: string; discount: string; mode: string; installmentId?: string }) => {
        if (!bill) return;
        setPaying(true);
        const ok = await submitTyrePayment(bill, v, callAlertMsg);
        setPaying(false);
        if (ok) { setPayOpen(false); await loadBill(); }
    };

    const brandOpts = brands.map((b) => ({ label: b.label, value: b.value }));
    const labourOpts = (settings.labour || []).map((n) => ({ label: n, value: n }));
    const title = isView ? "View challan" : isEdit ? "Edit challan" : "New delivery challan";
    const co = settings.company;

    return (
        <>
            <PageHeader
                title={title}
                subtitle={billNo != null ? <>D.C. No. {billNo}</> : "Tyres delivered. Not a tax invoice (no GST)."}
                back={{ to: "/tyre/billing", label: "Challans" }}
                actions={isView && bill ? [
                    { label: "Print", icon: "print", onClick: () => printTyreChallan(bill, settings) },
                    ...(bill.pendingAmount > 0 ? [{ label: "Record Payment", icon: "currencyrupee", onClick: () => setPayOpen(true), tone: "primary" as const }] : []),
                    { label: "Edit", icon: "edit", onClick: () => navigate(`/tyre/dashboard/edit/${bill._id}`) },
                ] : []}
            />
            <div className="card-stack">
                <section className="card">
                    <div className="card-body">
                        <div className="bill-sheet-head">
                            <div>
                                <h2 className="bill-sheet-title">{co.name || "Delivery challan"}</h2>
                                <p className="bill-sheet-sub">{[co.address, co.phone1].filter(Boolean).join(" · ") || "Set your company details in Settings"}</p>
                            </div>
                            <span className="bill-no" title={billNo == null ? "The number is assigned when the challan is saved" : undefined}>
                                D.C. No. {billNo != null ? billNo : id ? "…" : "[AUTO]"}
                            </span>
                        </div>
                        <div className="tyre-to"><CardHead title="Delivered to" /></div>
                        {loadingRecord ? <SkeletonRows rows={3} /> : (
                            <div className="form-grid mt-4">
                                <Field label="Date" htmlFor="ty-date" required error={errors.billDate}>
                                    <input id="ty-date" type="date" className="form-control" value={billDate} disabled={isView}
                                        onChange={(e) => changeBillDate(e.target.value)} />
                                </Field>
                                <Field label={labels.vehicleNo} htmlFor="ty-vehicle" required error={errors.vehicleNo}>
                                    <InputText id="ty-vehicle" value={vehicleNo} placeholder="e.g. TN 58 AB 1234" disabled={isView} autoCapitalize="characters"
                                        onChange={(e) => { setVehicleNo(e.target.value.toUpperCase()); clearErr("vehicleNo"); }} />
                                </Field>
                                <Field label={labels.customer} htmlFor="ty-customer">
                                    <InputText id="ty-customer" value={customerName} placeholder={`Enter ${labels.customer}`} disabled={isView}
                                        onChange={(e) => setCustomerName(e.target.value)} />
                                </Field>
                                <Field label="Phone number" htmlFor="ty-phone" error={errors.phone}>
                                    <InputText id="ty-phone" type="tel" inputMode="numeric" value={phone} placeholder="Customer phone" disabled={isView}
                                        onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); clearErr("phone"); }} />
                                </Field>
                                <Field label="Address" htmlFor="ty-address" className="span-2">
                                    <textarea id="ty-address" className="form-control" rows={2} value={address} placeholder="Delivery address" disabled={isView}
                                        onChange={(e) => setAddress(e.target.value)} />
                                </Field>
                                <Field label={labels.agent} htmlFor="ty-mechanic" required error={errors.mechanic}>
                                    <Selector inputId="ty-mechanic" options={mechanics.map((m) => ({ label: m, value: m }))}
                                        value={mechanic ? { label: mechanic, value: mechanic } : null} isDisabled={isView}
                                        placeholder={`Select ${labels.agent}`} aria-invalid={!!errors.mechanic}
                                        onChange={(o: any) => { setMechanic(o ? o.value : ""); clearErr("mechanic"); }} />
                                </Field>
                                <Field label={labels.worker} htmlFor="ty-labour">
                                    <Selector inputId="ty-labour" isMulti options={labourOpts} isDisabled={isView} placeholder={`Select ${labels.worker}`}
                                        value={labour.map((n) => ({ label: n, value: n }))}
                                        onChange={(v: any) => setLabour((v || []).map((o: any) => o.value))} />
                                </Field>
                                <Field label="Notes" htmlFor="ty-notes" className="span-2">
                                    <InputText id="ty-notes" value={notes} placeholder="Optional notes" disabled={isView} onChange={(e) => setNotes(e.target.value)} />
                                </Field>
                            </div>
                        )}
                    </div>
                </section>

                <section className="card">
                    <div className="card-body">
                        <CardHead title="Tyres" subtitle={!brands.length && !isView ? "Add brands and models in Settings → Tyre catalog first." : undefined} />
                        {loadingRecord ? <SkeletonRows rows={3} /> : (
                            <div className="tyre-items mt-3">
                                {items.map((it, n) => {
                                    const models = brands.find((b) => b.value === it.brandRef)?.models || [];
                                    const modelOpts = models.map((m) => ({ label: m.label, value: m.value }));
                                    const warn = !isView ? stockWarning(it) : "";
                                    return (
                                        <section key={it.key} className="nested-card tyre-item" aria-label={`Tyre ${n + 1}`}>
                                            <div className="tyre-item-head">
                                                <span className="tyre-item-tag">Tyre {n + 1}</span>
                                                <span className="tyre-item-amt tabular">{money(lineAmount(it))}</span>
                                                {!isView && items.length > 1 && (
                                                    <button type="button" className="btn btn-icon" aria-label={`Remove tyre ${n + 1}`}
                                                        onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>
                                                        <Icons iconName="delete" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="tyre-item-grid">
                                                <Field label="Brand" htmlFor={`ty-brand-${it.key}`} required error={errors[`b${it.key}`]}>
                                                    <Selector inputId={`ty-brand-${it.key}`} options={brandOpts} isDisabled={isView} placeholder="Brand"
                                                        value={it.brandLabel ? { label: it.brandLabel, value: it.brandRef } : null}
                                                        onChange={(o: any) => pickBrand(it.key, o ? o.value : "")} />
                                                </Field>
                                                <Field label="Model / size" htmlFor={`ty-model-${it.key}`} required error={errors[`m${it.key}`]} className="tyre-item-model">
                                                    <Selector inputId={`ty-model-${it.key}`} options={modelOpts} isDisabled={isView || !it.brandRef}
                                                        placeholder={it.brandRef ? "Model / size" : "Brand first"}
                                                        value={it.modelLabel ? { label: it.modelLabel, value: it.modelRef } : null}
                                                        onChange={(o: any) => pickModel(it.key, it.brandRef, o ? o.value : "")} />
                                                </Field>
                                                <Field label="Tyre number" htmlFor={`ty-serial-${it.key}`}>
                                                    <InputText id={`ty-serial-${it.key}`} value={it.tyreNumber} placeholder="Serial number" disabled={isView}
                                                        onChange={(e) => setItem(it.key, { tyreNumber: e.target.value })} />
                                                </Field>
                                                <Field label="Tube type" htmlFor={`ty-tube-${it.key}`}>
                                                    <select id={`ty-tube-${it.key}`} className="form-select" value={it.tubeType} disabled={isView}
                                                        onChange={(e) => setItem(it.key, { tubeType: e.target.value as ItemRow["tubeType"] })}>
                                                        {TUBE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </Field>
                                                <Field label="Flap" htmlFor={`ty-flap-${it.key}`}>
                                                    <select id={`ty-flap-${it.key}`} className="form-select" value={it.flap} disabled={isView}
                                                        onChange={(e) => setItem(it.key, { flap: e.target.value as ItemRow["flap"] })}>
                                                        <option>Yes</option>
                                                        <option>No</option>
                                                    </select>
                                                </Field>
                                                <Field label="Qty" htmlFor={`ty-qty-${it.key}`} required error={errors[`q${it.key}`]}>
                                                    <InputText id={`ty-qty-${it.key}`} type="number" inputMode="numeric" min={1} step={1} className="tabular text-end"
                                                        value={it.qty} disabled={isView}
                                                        onChange={(e) => { setItem(it.key, { qty: e.target.value }); clearErr(`q${it.key}`); }} />
                                                </Field>
                                                <Field label="Rate (₹ per tyre)" htmlFor={`ty-rate-${it.key}`} required error={errors[`r${it.key}`]}>
                                                    <AffixInput id={`ty-rate-${it.key}`} prefix="₹" type="number" inputMode="decimal" min={0} className="tabular text-end"
                                                        value={it.rate} disabled={isView} invalid={!!errors[`r${it.key}`]}
                                                        onChange={(e) => { setItem(it.key, { rate: e.target.value }); clearErr(`r${it.key}`); }} />
                                                </Field>
                                            </div>
                                            {warn && (
                                                <p className="tyre-warn" role="status"><Icons iconName="alert-triangle" className="icon-14" />{warn}</p>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        )}
                        {!isView && !loadingRecord && (
                            <button type="button" className="btn btn-secondary mt-3" onClick={() => setItems((xs) => [...xs, newItem(tyre.defaultTubeType || "tube")])}>
                                <Icons iconName="add" />Add tyre
                            </button>
                        )}
                    </div>
                </section>

                <section className="card">
                    <div className="card-body">
                        <CardHead title="Payment" />
                        {loadingRecord ? <SkeletonRows rows={3} /> : (<>
                            <div className="tyre-paytype mt-3">
                                {isView ? (
                                    <Badge tone="brand">{isPlan ? "Installments" : "Full payment"}</Badge>
                                ) : (
                                    <SegmentedControl radio label="Payment type" options={PAY_OPTIONS} value={paymentType}
                                        onChange={(v) => { if (!hasPayment) { setPaymentType(v); clearErr("plan"); } }} />
                                )}
                                {hasPayment && !isView && <span className="field-help m-0">A payment is recorded, so the payment type can't change.</span>}
                            </div>

                            <dl className="tyre-sum mt-3">
                                <div><dt>Tyre amount</dt><dd className="tabular">{money(tyreAmount)}</dd></div>
                                {isPlan && <div><dt>Interest</dt><dd className="tabular">{money(interestSum)}</dd></div>}
                                {!isPlan && (bill?.discount || 0) > 0 && <div><dt>Discount</dt><dd className="tabular">- {money(bill?.discount || 0)}</dd></div>}
                                <div className="is-total"><dt>Amount to collect</dt><dd className="tabular">{money(toCollect)}</dd></div>
                                {bill && <div><dt>Received</dt><dd className="tabular t-success">{money(bill.receivedAmount)}</dd></div>}
                                {bill && <div><dt>Pending</dt><dd className={`tabular${bill.pendingAmount > 0 ? " t-error" : ""}`}>{money(bill.pendingAmount)}</dd></div>}
                            </dl>

                            {isPlan && (
                                <>
                                    <div className="tyre-plan mt-4" role="table" aria-label="Installment plan">
                                        <div className="tyre-plan-cols" role="row">
                                            <span role="columnheader">Installment</span>
                                            <span role="columnheader">Due date</span>
                                            <span role="columnheader" className="num">Principal</span>
                                            <span role="columnheader" className="num">Interest</span>
                                            <span role="columnheader" className="num">Total</span>
                                            <span role="columnheader"><span className="visually-hidden">Status</span></span>
                                        </div>
                                        {rows.map((r) => {
                                            const locked = r.paid > 0 || isView;
                                            const total = round2((Number(r.principal) || 0) + (Number(r.interest) || 0));
                                            const err = errors[`d${r.key}`] || errors[`a${r.key}`];
                                            return (
                                                <div key={r.key} className={`tyre-plan-row${r.paid > 0 ? " is-locked" : ""}`} role="row">
                                                    <div role="cell" className="tyre-plan-label">
                                                        <span className="tyre-mlabel" aria-hidden="true">Installment</span>
                                                        <InputText value={r.label} disabled={locked} aria-label="Installment name"
                                                            onChange={(e) => setRow(r.key, { label: e.target.value })} />
                                                    </div>
                                                    <div role="cell">
                                                        <span className="tyre-mlabel" aria-hidden="true">Due date</span>
                                                        <input type="date" className="form-control" value={r.dueDate} disabled={locked} aria-label={`Due date for ${r.label}`}
                                                            onChange={(e) => { setRow(r.key, { dueDate: e.target.value, dateTouched: true }); clearErr(`d${r.key}`); }} />
                                                    </div>
                                                    <div role="cell">
                                                        <span className="tyre-mlabel" aria-hidden="true">Principal</span>
                                                        <AffixInput prefix="₹" type="number" inputMode="decimal" min={0} className="tabular text-end" value={r.principal} disabled={locked}
                                                            aria-label={`Principal for ${r.label}`} placeholder="0" invalid={!!errors[`a${r.key}`]}
                                                            onChange={(e) => { setRow(r.key, { principal: e.target.value }); clearErr(`a${r.key}`, "plan"); }} />
                                                    </div>
                                                    <div role="cell">
                                                        <span className="tyre-mlabel" aria-hidden="true">Interest</span>
                                                        <AffixInput prefix="₹" type="number" inputMode="decimal" min={0} className="tabular text-end" value={r.interest} disabled={locked}
                                                            aria-label={`Interest for ${r.label}`} placeholder="0" invalid={!!errors[`a${r.key}`]}
                                                            onChange={(e) => { setRow(r.key, { interest: e.target.value }); clearErr(`a${r.key}`); }} />
                                                    </div>
                                                    <div role="cell" className="tyre-plan-total tabular">
                                                        <span className="tyre-mlabel" aria-hidden="true">Total</span>
                                                        {money(total)}
                                                        {r.paid > 0 && <small className="d-block t-muted">{money(r.paid)} paid</small>}
                                                    </div>
                                                    <div role="cell" className="tyre-plan-end">
                                                        {r.rowStatus && id ? <Badge tone={rowTone(r.rowStatus)} dot>{r.rowStatus}</Badge> : null}
                                                        {!locked && rows.length > 1 && (
                                                            <button type="button" className="btn btn-icon" aria-label={`Remove ${r.label}`} onClick={() => removeRow(r.key)}>
                                                                <Icons iconName="x" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {err && <span className="field-error tyre-plan-err" role="alert">{err}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {!isView && (
                                        <button type="button" className="btn btn-secondary mt-3" onClick={addRow}>
                                            <Icons iconName="add" />Add month
                                        </button>
                                    )}
                                    <div className={`tyre-check mt-3 ${planOk ? "is-ok" : "is-bad"}`} aria-live="polite">
                                        <div><span>Principal</span><span className="tabular">{money(principalSum)} of {money(tyreAmount)}</span></div>
                                        <div>
                                            <strong>{tyreAmount <= 0 ? "Add tyres first" : planOk ? "Matches the tyre amount" : planGap > 0 ? "Still to schedule" : "Principal is more by"}</strong>
                                            <strong className="tabular">{planOk ? "✓" : tyreAmount <= 0 ? "" : money(Math.abs(planGap))}</strong>
                                        </div>
                                    </div>
                                    {errors.plan && <p className="field-error mt-2" role="alert">{errors.plan}</p>}
                                    {isView && bill && bill.payments?.length > 0 && (
                                        <p className="t-sm t-muted mt-3 mb-0">Last payment {fmtDate(bill.payments[bill.payments.length - 1].date)}.</p>
                                    )}
                                </>
                            )}
                        </>)}
                    </div>
                </section>
            </div>

            <FormFooter totalLabel="Amount to collect" total={money(toCollect)}
                totalNote={isPlan && interestSum > 0 ? `${money(tyreAmount)} tyres + ${money(interestSum)} interest` : undefined}>
                {isView ? (
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
                ) : (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={loading || loadingRecord} onClick={save}>
                            {loading && <span className="spinner" aria-hidden="true" />}
                            {loading ? "Saving..." : isEdit ? "Update challan" : "Save challan"}
                        </button>
                    </>
                )}
            </FormFooter>

            {bill && (
                <RecordPaymentModal
                    open={payOpen}
                    title={`Record Payment — D.C. ${bill.billNo}`}
                    totalLabel="To collect"
                    total={bill.payableTotal}
                    received={bill.receivedAmount}
                    pending={bill.pendingAmount}
                    withMode
                    installments={payableRows(bill)}
                    initialInstallmentId={bill.nextDue?.id}
                    busy={paying}
                    onClose={() => setPayOpen(false)}
                    onSubmit={onPay}
                />
            )}
            <ConfirmDialog
                open={discardOpen}
                title="Discard this challan?"
                message="Anything entered will be lost."
                confirmLabel="Discard"
                danger={false}
                onConfirm={() => { setDiscardOpen(false); navigate("/tyre/billing"); }}
                onCancel={() => setDiscardOpen(false)}
            />
        </>
    );
};

export default TyreCreate;
