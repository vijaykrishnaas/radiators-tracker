import React, { useEffect, useState } from "react";
import Modal from "../../../Components/ui/Modal";
import { Badge, SkeletonRows } from "../../../Components/ui/Basics";
import { getClientSettings, type ClientMeta } from "../../../Services/AdminApi";

type Props = { clientId: string; clientName: string; onClose: () => void };

const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-IN") : "—";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="view-section">
        <h3 className="view-section-title">{title}</h3>
        {children}
    </section>
);

const KV: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
    const empty = value === undefined || value === null || value === "";
    return (
        <div>
            <dt>{label}</dt>
            <dd className={empty ? "t-muted" : undefined}>{empty ? "—" : value}</dd>
        </div>
    );
};

const Chips: React.FC<{ items: any[] }> = ({ items }) => {
    const list = (items || []).filter((x) => x !== undefined && x !== null && x !== "");
    if (!list.length) return <span className="t-muted">—</span>;
    return (
        <div className="d-flex flex-wrap gap-2">
            {list.map((x, i) => (
                <span className="badge badge-neutral" key={i}>{typeof x === "object" ? x.label ?? JSON.stringify(x) : String(x)}</span>
            ))}
        </div>
    );
};

const Swatch: React.FC<{ color?: string }> = ({ color }) =>
    color ? (
        <span className="d-inline-flex align-items-center">
            <span className="swatch" style={{ background: color }} aria-hidden="true" />
            <span className="t-mono">{color}</span>
        </span>
    ) : (
        <span className="t-muted">—</span>
    );

// products: [{label,value}] ; services: [{label,value}] ; matrix: { [productValue]: { [serviceValue]: number } }
const MatrixTable: React.FC<{ products: any[]; services: any[]; matrix: any; money?: boolean }> = ({ products, services, matrix, money }) => {
    if (!products?.length || !services?.length) return <span className="t-muted">—</span>;
    return (
        <div className="mini-table"><div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Model \ Service</th>
                        {services.map((s) => <th key={s.value}>{s.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.value}>
                            <td className="key">{p.label}</td>
                            {services.map((s) => {
                                const v = matrix?.[p.value]?.[s.value];
                                return <td key={s.value} className="num">{v === undefined || v === null ? "—" : (money ? `₹${Number(v).toLocaleString("en-IN")}` : v)}</td>;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div></div>
    );
};

const ClientSettingsModal: React.FC<Props> = ({ clientId, clientName, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [meta, setMeta] = useState<ClientMeta | null>(null);
    const [s, setS] = useState<any>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getClientSettings(clientId)
            .then((res) => { if (active) { setMeta(res.client); setS(res.settings || {}); } })
            .catch((e) => { if (active) setError(e?.message || "Failed to load settings"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [clientId]);

    const company = s?.company || {};
    const branding = s?.branding || {};
    const labels = s?.labels || {};
    const catalog = s?.catalog || {};
    const invoice = s?.invoice || {};
    const bonus = s?.bonus || {};
    const priceableServices = (catalog.serviceTypes || []).filter((x: any) => !x.requiresComment);

    return (
        <Modal
            open
            onClose={onClose}
            title={`Client Settings — ${clientName}`}
            size="lg"
            initialFocus="confirm"
            footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
        >
                        {loading && <SkeletonRows rows={4} />}
                        {error && <p className="field-error" role="alert">{error}</p>}

                        {!loading && !error && (
                            <>
                                <Section title="Provisioning (set up by super-admin)">
                                    <dl className="kv-list">
                                        <KV label="Business Name" value={meta?.name} />
                                        <KV label="Business Code" value={meta?.code ? <span className="t-mono">{meta.code}</span> : undefined} />
                                        <KV label="Admin Username" value={meta?.adminUserId} />
                                        <KV label="Status" value={
                                            <Badge tone={meta?.status === "active" ? "success" : "neutral"} dot>
                                                {meta?.status === "active" ? "Active" : "Suspended"}
                                            </Badge>
                                        } />
                                        <KV label="Last Login" value={fmtDate(meta?.lastLoginAt ?? null)} />
                                        <KV label="Created" value={fmtDate(meta?.createdAt ?? null)} />
                                    </dl>
                                </Section>

                                <Section title="Company Profile">
                                    <dl className="kv-list">
                                        <KV label="Company Name" value={company.name} />
                                        <KV label="Address" value={company.address} />
                                        <KV label="Phone 1" value={company.phone1} />
                                        <KV label="Phone 2" value={company.phone2} />
                                        <KV label="UPI ID" value={company.upiId} />
                                        <KV label="UPI Display" value={company.upiDisplay} />
                                        <KV label="Logo" value={company.logoUrl ? "Uploaded" : "Not set"} />
                                        <KV label="Payment QR" value={company.qrUrl ? "Uploaded" : "Not set"} />
                                        <KV label="Login Background" value={company.loginBgUrl ? "Uploaded" : "Default (gradient)"} />
                                    </dl>
                                </Section>

                                <Section title="Branding">
                                    <dl className="kv-list">
                                        <KV label="Primary Color" value={<Swatch color={branding.primaryColor} />} />
                                        <KV label="Accent Color" value={<Swatch color={branding.accentColor} />} />
                                    </dl>
                                </Section>

                                <Section title="Field Labels">
                                    <dl className="kv-list">
                                        <KV label="Vehicle Number" value={labels.vehicleNo} />
                                        <KV label="Party / Customer" value={labels.party} />
                                        <KV label="Agent / Mechanic" value={labels.agent} />
                                        <KV label="Product" value={labels.product} />
                                        <KV label="Worker" value={labels.worker} />
                                    </dl>
                                </Section>

                                <Section title="Workforce">
                                    <dl className="kv-list">
                                        <KV label="Mechanics" value={<Chips items={s?.mechanics} />} />
                                        <KV label="Labour" value={<Chips items={s?.labour} />} />
                                    </dl>
                                </Section>

                                <Section title="Catalog & Prices">
                                    <dl className="kv-list mb-3">
                                        <KV label="Product Types" value={<Chips items={catalog.productTypes} />} />
                                        <KV label="Service Types" value={<Chips items={catalog.serviceTypes} />} />
                                    </dl>
                                    <p className="t-xs t-muted mb-1">Price Matrix</p>
                                    <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={catalog.priceMatrix} money />
                                </Section>

                                <Section title="Invoice">
                                    <dl className="kv-list">
                                        <KV label="Bill Title" value={invoice.billTitle} />
                                        <KV label="Footer Note" value={invoice.footerNote} />
                                        <KV label="Show QR on Invoice" value={invoice.showQr ? "Yes" : "No"} />
                                    </dl>
                                </Section>

                                <Section title="Login Highlights">
                                    <Chips items={s?.loginHighlights} />
                                </Section>

                                <Section title="Bonus Configuration">
                                    <dl className="kv-list mb-3">
                                        <KV label="Mechanic — Default %" value={bonus?.mechanic?.defaultPercent} />
                                        <KV label="Mechanic — Year Starts (month)" value={bonus?.mechanic?.yearStartMonth} />
                                        <KV label="Labour — Default %" value={bonus?.labour?.defaultPercent} />
                                    </dl>
                                    <p className="t-xs t-muted mb-1">Mechanic Bonus % Matrix</p>
                                    <div className="mb-3">
                                        <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={bonus?.mechanic?.matrix} />
                                    </div>
                                    <p className="t-xs t-muted mb-1">Labour Bonus % Matrix</p>
                                    <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={bonus?.labour?.matrix} />
                                </Section>
                            </>
                        )}
        </Modal>
    );
};

export default ClientSettingsModal;
