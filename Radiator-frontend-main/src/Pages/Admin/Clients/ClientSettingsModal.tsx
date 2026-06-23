import React, { useEffect, useState } from "react";
import Loader from "../../../Components/Loader";
import { getClientSettings, type ClientMeta } from "../../../Services/AdminApi";

type Props = { clientId: string; clientName: string; onClose: () => void };

const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-IN") : "—";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="settings-view-section">
        <div className="settings-view-heading">{title}</div>
        {children}
    </div>
);

const KV: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
    const empty = value === undefined || value === null || value === "";
    return (
        <div className="kv-row">
            <div className="kv-label">{label}</div>
            <div className={`kv-value${empty ? " kv-value--empty" : ""}`}>{empty ? "—" : value}</div>
        </div>
    );
};

const Chips: React.FC<{ items: any[] }> = ({ items }) => {
    const list = (items || []).filter((x) => x !== undefined && x !== null && x !== "");
    if (!list.length) return <span className="kv-value kv-value--empty">—</span>;
    return (
        <div className="kv-chips">
            {list.map((x, i) => (
                <span className="kv-chip" key={i}>{typeof x === "object" ? x.label ?? JSON.stringify(x) : String(x)}</span>
            ))}
        </div>
    );
};

const Swatch: React.FC<{ color?: string }> = ({ color }) =>
    color ? (
        <span className="kv-swatch">
            <span className="kv-swatch-dot" style={{ background: color }} />
            <code>{color}</code>
        </span>
    ) : (
        <span className="kv-value kv-value--empty">—</span>
    );

// products: [{label,value}] ; services: [{label,value}] ; matrix: { [productValue]: { [serviceValue]: number } }
const MatrixTable: React.FC<{ products: any[]; services: any[]; matrix: any; money?: boolean }> = ({ products, services, matrix, money }) => {
    if (!products?.length || !services?.length) return <span className="kv-value kv-value--empty">—</span>;
    return (
        <div style={{ overflowX: "auto" }}>
            <table className="settings-price-table">
                <thead>
                    <tr>
                        <th>Model \ Service</th>
                        {services.map((s) => <th key={s.value}>{s.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.value}>
                            <td className="font-w600">{p.label}</td>
                            {services.map((s) => {
                                const v = matrix?.[p.value]?.[s.value];
                                return <td key={s.value}>{v === undefined || v === null ? "—" : (money ? `₹${Number(v).toLocaleString("en-IN")}` : v)}</td>;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
        <div className="modal fade show d-block" tabIndex={-1} role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                <div className="modal-content">
                    <div className="modal-header">
                        <span className="modal-title">Client Settings — {clientName}</span>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>
                    <div className="modal-body" style={{ maxHeight: "75vh" }}>
                        <Loader loading={loading} />
                        {error && <p className="text-danger font-s14">{error}</p>}

                        {!loading && !error && (
                            <>
                                <Section title="Provisioning (set up by super-admin)">
                                    <div className="kv-grid">
                                        <KV label="Business Name" value={meta?.name} />
                                        <KV label="Business Code" value={meta?.code ? <code>{meta.code}</code> : undefined} />
                                        <KV label="Admin Username" value={meta?.adminUserId} />
                                        <KV label="Status" value={
                                            <span className={`status-badge ${meta?.status === "active" ? "status-badge-success" : "status-badge-warning"}`}>
                                                {meta?.status === "active" ? "Active" : "Suspended"}
                                            </span>
                                        } />
                                        <KV label="Last Login" value={fmtDate(meta?.lastLoginAt ?? null)} />
                                        <KV label="Created" value={fmtDate(meta?.createdAt ?? null)} />
                                    </div>
                                </Section>

                                <Section title="Company Profile">
                                    <div className="kv-grid">
                                        <KV label="Company Name" value={company.name} />
                                        <KV label="Address" value={company.address} />
                                        <KV label="Phone 1" value={company.phone1} />
                                        <KV label="Phone 2" value={company.phone2} />
                                        <KV label="UPI ID" value={company.upiId} />
                                        <KV label="UPI Display" value={company.upiDisplay} />
                                        <KV label="Logo" value={company.logoUrl ? "Uploaded" : "Not set"} />
                                        <KV label="Payment QR" value={company.qrUrl ? "Uploaded" : "Not set"} />
                                        <KV label="Login Background" value={company.loginBgUrl ? "Uploaded" : "Default (gradient)"} />
                                    </div>
                                </Section>

                                <Section title="Branding">
                                    <div className="kv-grid">
                                        <KV label="Primary Color" value={<Swatch color={branding.primaryColor} />} />
                                        <KV label="Accent Color" value={<Swatch color={branding.accentColor} />} />
                                    </div>
                                </Section>

                                <Section title="Field Labels">
                                    <div className="kv-grid">
                                        <KV label="Vehicle Number" value={labels.vehicleNo} />
                                        <KV label="Party / Customer" value={labels.party} />
                                        <KV label="Agent / Mechanic" value={labels.agent} />
                                        <KV label="Product" value={labels.product} />
                                        <KV label="Worker" value={labels.worker} />
                                    </div>
                                </Section>

                                <Section title="Workforce">
                                    <div className="kv-grid">
                                        <KV label="Mechanics" value={<Chips items={s?.mechanics} />} />
                                        <KV label="Labour" value={<Chips items={s?.labour} />} />
                                    </div>
                                </Section>

                                <Section title="Catalog & Prices">
                                    <div className="kv-grid" style={{ marginBottom: 12 }}>
                                        <KV label="Product Types" value={<Chips items={catalog.productTypes} />} />
                                        <KV label="Service Types" value={<Chips items={catalog.serviceTypes} />} />
                                    </div>
                                    <div className="kv-label" style={{ marginBottom: 4 }}>Price Matrix</div>
                                    <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={catalog.priceMatrix} money />
                                </Section>

                                <Section title="Invoice">
                                    <div className="kv-grid">
                                        <KV label="Bill Title" value={invoice.billTitle} />
                                        <KV label="Footer Note" value={invoice.footerNote} />
                                        <KV label="Bill No. Prefix" value={invoice.billNoPrefix} />
                                        <KV label="Show QR on Invoice" value={invoice.showQr ? "Yes" : "No"} />
                                    </div>
                                </Section>

                                <Section title="Login Highlights">
                                    <Chips items={s?.loginHighlights} />
                                </Section>

                                <Section title="Bonus Configuration">
                                    <div className="kv-grid" style={{ marginBottom: 12 }}>
                                        <KV label="Mechanic — Default %" value={bonus?.mechanic?.defaultPercent} />
                                        <KV label="Mechanic — Year Starts (month)" value={bonus?.mechanic?.yearStartMonth} />
                                        <KV label="Labour — Default %" value={bonus?.labour?.defaultPercent} />
                                    </div>
                                    <div className="kv-label" style={{ marginBottom: 4 }}>Mechanic Bonus % Matrix</div>
                                    <div style={{ marginBottom: 12 }}>
                                        <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={bonus?.mechanic?.matrix} />
                                    </div>
                                    <div className="kv-label" style={{ marginBottom: 4 }}>Labour Bonus % Matrix</div>
                                    <MatrixTable products={catalog.productTypes} services={priceableServices} matrix={bonus?.labour?.matrix} />
                                </Section>
                            </>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-cancel btn-sm" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientSettingsModal;
