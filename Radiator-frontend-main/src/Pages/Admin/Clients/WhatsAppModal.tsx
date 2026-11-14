import React, { useCallback, useEffect, useState } from "react";
import Modal from "../../../Components/ui/Modal";
import { Badge, Callout, Field, SegmentedControl, SkeletonRows, type Tone } from "../../../Components/ui/Basics";
import { Switch } from "../../../Components/ui/Inputs";
import { useAlertMsg } from "../../../Services/AllServices";
import {
    getClientWhatsApp, getClientWhatsAppUsage, removeClientWhatsApp, saveClientWhatsApp,
    syncClientWhatsAppTemplates, testClientWhatsApp,
    type ClientRow, type WhatsAppAccount, type WhatsAppTemplates, type WhatsAppUsage,
} from "../../../Services/AdminApi";

const TEMPLATE_LABELS: Record<string, string> = {
    bill_document: "Bill / challan",
    payment_receipt: "Payment receipt",
    payment_receipt_document: "Payment receipt with bill PDF",
    owner_daily_summary: "Owner's daily summary",
    connection_test: "Connection test",
};
const KIND_LABELS: Record<string, string> = {
    bill: "Bills", bill_update: "Updated bills", receipt: "Receipts", summary: "Daily summaries", autoreply: "Auto-replies",
};
const KIND_ORDER = ["bill", "bill_update", "receipt", "summary", "autoreply"];
const STATUS_TONE: Record<string, Tone> = { APPROVED: "success", PENDING: "warning", REJECTED: "error", MISSING: "neutral" };

const currentMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

type Errors = Partial<Record<"phoneNumberId" | "wabaId" | "accessToken" | "appSecret", string>>;

const TemplateList: React.FC<{ templates: WhatsAppTemplates }> = ({ templates }) => (
    <ul className="list-unstyled d-grid gap-2 m-0">
        {Object.entries(templates).map(([name, t]) => (
            <li key={name} className="d-flex flex-wrap align-items-center gap-2">
                <span className="flex-grow-1">{TEMPLATE_LABELS[name] || name}</span>
                <Badge tone={STATUS_TONE[t.status] || "neutral"} dot>{t.status}</Badge>
                {t.status === "REJECTED" && t.reason && <span className="t-sm t-muted w-100">{t.reason}</span>}
            </li>
        ))}
    </ul>
);

/** Super admin › Clients › WhatsApp: enable per client, enter the provider details, sync templates, see usage. */
export default function WhatsAppModal({ client, onClose, onChanged }: { client: ClientRow; onClose: () => void; onChanged?: () => void }) {
    const { callAlertMsg } = useAlertMsg();
    const [account, setAccount] = useState<WhatsAppAccount | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState("");
    const [on, setOn] = useState(false);
    const [numberType, setNumberType] = useState<"new" | "existing">("new");
    const [phoneNumberId, setPhoneNumberId] = useState("");
    const [wabaId, setWabaId] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [appSecret, setAppSecret] = useState("");
    const [errors, setErrors] = useState<Errors>({});
    const [apiError, setApiError] = useState("");
    const [info, setInfo] = useState("");
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [month, setMonth] = useState(currentMonth());
    const [usage, setUsage] = useState<WhatsAppUsage | null>(null);
    const [usageError, setUsageError] = useState("");

    const applyAccount = useCallback((a: WhatsAppAccount | null) => {
        setAccount(a);
        setOn(!!a?.enabled);
        if (a) { setNumberType(a.numberType || "new"); setPhoneNumberId(a.phoneNumberId || ""); setWabaId(a.wabaId || ""); }
        setAccessToken(""); setAppSecret("");
    }, []);

    useEffect(() => {
        let active = true;
        getClientWhatsApp(client._id)
            .then((r) => { if (active) applyAccount(r.account); })
            .catch((e: any) => { if (active) setApiError(e?.message || "Could not load WhatsApp details"); })
            .finally(() => { if (active) setLoaded(true); });
        return () => { active = false; };
    }, [client._id, applyAccount]);

    const loadUsage = useCallback(() => {
        setUsageError("");
        getClientWhatsAppUsage(client._id, month)
            .then(setUsage)
            .catch((e: any) => setUsageError(e?.message || "Could not load usage"));
    }, [client._id, month]);
    useEffect(() => { if (account) loadUsage(); else setUsage(null); }, [account, loadUsage]);

    const validate = (): boolean => {
        const e: Errors = {};
        if (!phoneNumberId.trim()) e.phoneNumberId = "Enter the Phone number ID";
        if (!wabaId.trim()) e.wabaId = "Enter the WhatsApp Business Account ID";
        if (!accessToken.trim() && !account?.hasToken) e.accessToken = "Enter the access token";
        if (!appSecret.trim() && !account?.hasAppSecret) e.appSecret = "Enter the app secret";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key); setApiError(""); setInfo("");
        try { await fn(); } catch (err: any) { setApiError(err?.message || "Something went wrong"); } finally { setBusy(""); }
    };

    const save = () => {
        if (!validate()) return;
        const wasEnabled = !!account?.enabled;
        run("save", async () => {
            const res = await saveClientWhatsApp(client._id, {
                enabled: true, provider: "meta", numberType, phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim(),
                ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
                ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
            });
            applyAccount(res.account);
            callAlertMsg(wasEnabled ? "WhatsApp details saved" : "WhatsApp enabled", "success");
            onChanged?.();
        });
    };

    const disable = () => {
        if (!account) { setOn(false); return; }
        run("disable", async () => {
            const res = await saveClientWhatsApp(client._id, {
                enabled: false, provider: "meta", numberType: account.numberType, phoneNumberId: account.phoneNumberId, wabaId: account.wabaId,
            });
            applyAccount(res.account);
            callAlertMsg("WhatsApp disabled. Details are kept.", "success");
            onChanged?.();
        });
    };

    const test = () => run("test", async () => {
        const r = await testClientWhatsApp(client._id);
        setInfo(`Connected: ${r.displayPhone}${r.verifiedName ? ` (${r.verifiedName})` : ""}`);
    });
    const syncTemplates = () => run("templates", async () => {
        const r = await syncClientWhatsAppTemplates(client._id);
        setAccount((a) => (a ? { ...a, templates: r.templates } : a));
        setInfo("Templates synced");
    });
    const remove = () => run("remove", async () => {
        await removeClientWhatsApp(client._id);
        setConfirmRemove(false);
        applyAccount(null);
        setUsage(null);
        callAlertMsg("WhatsApp details removed", "success");
        onChanged?.();
    });

    const toggle = (v: boolean) => {
        setApiError(""); setInfo(""); setErrors({});
        if (!v && account?.enabled) disable(); else setOn(v);
    };

    const enabled = !!account?.enabled;
    const showForm = on;
    const totalOf = (u: WhatsAppUsage) => {
        if (u.total && typeof u.total === "object") return u.total;
        const rows = Object.values(u.byKind || {});
        return { sent: rows.reduce((n, r) => n + r.sent, 0), failed: rows.reduce((n, r) => n + r.failed, 0) };
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={!!busy}
            size="lg"
            title={`WhatsApp: ${client.name}`}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={!!busy}>Close</button>
                    {showForm && (
                        <button type="button" className="btn btn-primary" onClick={save} disabled={!!busy || !loaded}>
                            {busy === "save" && <span className="spinner" aria-hidden="true" />}
                            {busy === "save" ? "Checking…" : enabled ? "Save changes" : "Enable"}
                        </button>
                    )}
                </>
            }
        >
            <div className="d-grid gap-3">
                {!loaded ? <SkeletonRows rows={4} /> : (
                    <>
                        <Switch id="wa-enable" label="Enable WhatsApp" checked={on} onChange={toggle} disabled={!!busy} />
                        {apiError && <Callout tone="error" title="Could not save">{apiError}</Callout>}
                        {info && <Callout tone="success">{info}</Callout>}

                        {showForm && (
                            <form className="d-grid gap-3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
                                <Field label="Provider" htmlFor="wa-provider">
                                    <select id="wa-provider" className="form-select" value="meta" onChange={() => {}}>
                                        <option value="meta">Meta WhatsApp Cloud API</option>
                                    </select>
                                </Field>
                                <Field label="Number type" labelId="wa-numtype-label">
                                    <SegmentedControl radio full label="Number type" value={numberType} onChange={setNumberType}
                                        options={[{ value: "new", label: "New dedicated number" }, { value: "existing", label: "Existing number (coexistence)" }]} />
                                </Field>
                                <Field label="Phone number ID" htmlFor="wa-phone-id" required error={errors.phoneNumberId}>
                                    <input id="wa-phone-id" className={`form-control${errors.phoneNumberId ? " is-invalid" : ""}`} value={phoneNumberId}
                                        onChange={(e) => setPhoneNumberId(e.target.value)} autoComplete="off" inputMode="numeric" />
                                </Field>
                                <Field label="WhatsApp Business Account ID" htmlFor="wa-waba-id" required error={errors.wabaId}>
                                    <input id="wa-waba-id" className={`form-control${errors.wabaId ? " is-invalid" : ""}`} value={wabaId}
                                        onChange={(e) => setWabaId(e.target.value)} autoComplete="off" inputMode="numeric" />
                                </Field>
                                <Field label="Access token" htmlFor="wa-token" required={!account?.hasToken} error={errors.accessToken}
                                    help={account?.hasToken ? "Leave blank to keep the saved token" : undefined}>
                                    <input id="wa-token" type="password" className={`form-control${errors.accessToken ? " is-invalid" : ""}`} value={accessToken}
                                        onChange={(e) => setAccessToken(e.target.value)} autoComplete="new-password"
                                        placeholder={account?.hasToken ? account.tokenMasked : ""} />
                                </Field>
                                <Field label="App secret" htmlFor="wa-secret" required={!account?.hasAppSecret} error={errors.appSecret}
                                    help={account?.hasAppSecret ? "Leave blank to keep the saved secret" : undefined}>
                                    <input id="wa-secret" type="password" className={`form-control${errors.appSecret ? " is-invalid" : ""}`} value={appSecret}
                                        onChange={(e) => setAppSecret(e.target.value)} autoComplete="new-password"
                                        placeholder={account?.hasAppSecret ? "Saved" : ""} />
                                </Field>
                                <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true">Submit</button>
                            </form>
                        )}

                        {account && (
                            <section className="d-grid gap-2" aria-labelledby="wa-status-h">
                                <h3 id="wa-status-h" className="view-section-title">Status</h3>
                                <dl className="kv-list">
                                    <div><dt>Status</dt><dd>{enabled ? <Badge tone="success" dot>Enabled</Badge> : <Badge dot>Disabled</Badge>}</dd></div>
                                    <div><dt>Number</dt><dd>{account.displayPhone || "—"}</dd></div>
                                    <div><dt>Verified name</dt><dd>{account.verifiedName || "—"}</dd></div>
                                    <div><dt>Enabled since</dt><dd>{fmtDate(account.enabledAt)}</dd></div>
                                </dl>
                                <p className="t-sm t-muted m-0">A message type sends only after its template is approved.</p>
                                <TemplateList templates={account.templates || {}} />
                                <div className="d-flex flex-wrap gap-2">
                                    <button type="button" className="btn btn-secondary" onClick={test} disabled={!!busy}>
                                        {busy === "test" && <span className="spinner" aria-hidden="true" />}Test connection
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={syncTemplates} disabled={!!busy}>
                                        {busy === "templates" && <span className="spinner" aria-hidden="true" />}Create / sync templates
                                    </button>
                                    {enabled && <button type="button" className="btn btn-secondary" onClick={disable} disabled={!!busy}>Disable</button>}
                                    {!confirmRemove && <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemove(true)} disabled={!!busy}>Remove details</button>}
                                </div>
                                {confirmRemove && (
                                    <Callout tone="warning" title="Remove saved details?">
                                        <p className="m-0 mb-2">This turns WhatsApp off and deletes the saved token and secret.</p>
                                        <div className="d-flex flex-wrap gap-2">
                                            <button type="button" className="btn btn-danger" onClick={remove} disabled={!!busy}>
                                                {busy === "remove" && <span className="spinner" aria-hidden="true" />}Yes, remove
                                            </button>
                                            <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemove(false)} disabled={!!busy}>Cancel</button>
                                        </div>
                                    </Callout>
                                )}
                            </section>
                        )}

                        {account && (
                            <section className="d-grid gap-2" aria-labelledby="wa-usage-h">
                                <h3 id="wa-usage-h" className="view-section-title">Usage</h3>
                                <Field label="Month" htmlFor="wa-month">
                                    <input id="wa-month" type="month" className="form-control" value={month} max={currentMonth()}
                                        onChange={(e) => e.target.value && setMonth(e.target.value)} />
                                </Field>
                                {usageError && <p className="field-error" role="alert">{usageError}</p>}
                                {usage && (
                                    <dl className="kv-list" data-testid="wa-usage">
                                        {KIND_ORDER.map((k) => (
                                            <div key={k}>
                                                <dt>{KIND_LABELS[k]}</dt>
                                                <dd className="tabular">{usage.byKind?.[k]?.sent ?? 0} sent, {usage.byKind?.[k]?.failed ?? 0} failed</dd>
                                            </div>
                                        ))}
                                        <div>
                                            <dt>Total</dt>
                                            <dd className="tabular">{totalOf(usage).sent} sent, {totalOf(usage).failed} failed</dd>
                                        </div>
                                    </dl>
                                )}
                            </section>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
