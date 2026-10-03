import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AppSettings } from "../Context/SettingsContext";
import type { EngBill } from "../Pages/Engineering/types";
import { bsLabel, itemText } from "../Pages/Engineering/types";
import { amountInWords } from "../Utils/amountInWords";

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [18, 70, 130];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as RGB;

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";
const num = (n: number) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchImage(url: string): Promise<{ dataUrl: string; format: string }> {
    const resp = await fetch(url.startsWith("/") ? `${BACKEND}${url}` : url);
    if (!resp.ok) throw new Error("image fetch failed");
    const blob = await resp.blob();
    const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
    });
    const mime = dataUrl.match(/^data:(image\/[a-z+]+);/)?.[1] || "image/png";
    return { dataUrl, format: /jpe?g/.test(mime) ? "JPEG" : "PNG" };
}

// "TN52J2622" -> "TN 52 J 2622" (reads like the plate); anything else is left as typed.
const spacedPlate = (v: string) => {
    const m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec((v || "").replace(/[\s-]/g, "").toUpperCase());
    return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (v || "—");
};

/**
 * Engineering Works bill (A5). Standalone — it shares no drawing code with the
 * radiator / automobile invoices, so those stay byte-identical. Identity,
 * colour and options all come from settings; nothing is hardcoded.
 */
export const printEngInvoice = async (bill: EngBill, settings: AppSettings) => {
    const accent = hexToRgb(settings.branding.primaryColor);
    const deep = mix(accent, [0, 0, 0], 0.22);
    const tint = mix(accent, [255, 255, 255], 0.88);
    const ink: RGB = [29, 29, 31];
    const sub: RGB = [110, 110, 115];
    const hair: RGB = [224, 224, 229];
    const white: RGB = [255, 255, 255];

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 10;
    const co = settings.company;
    const inv = settings.engineering?.invoice;
    const text = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

    // ---- Header band: logo · name · phones ---------------------------------
    const bandH = 30;
    fill(accent); doc.rect(0, 0, W, bandH + 0.4, "F");
    // A brand-new tenant has not filled in Company settings yet: no name and no logo means no badge circle,
    // and the band shows the bill title instead of a blank strip.
    const coName = (co.name || "").trim();
    const hasBadge = !!coName || !!co.logoUrl;
    if (hasBadge) { fill(white); doc.circle(M + 9, bandH / 2, 9, "F"); }
    let logoDrawn = false;
    if (co.logoUrl) {
        try {
            const { dataUrl, format } = await fetchImage(co.logoUrl);
            doc.addImage(dataUrl, format, M + 3.2, bandH / 2 - 5.8, 11.6, 11.6);
            logoDrawn = true;
        } catch { /* fall back to the initial */ }
    }
    if (!logoDrawn && coName) {
        text(accent); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(coName.charAt(0).toUpperCase(), M + 9, bandH / 2 + 2.6, { align: "center" });
    }

    const phones = [co.phone1, co.phone2].filter(Boolean) as string[];
    const phoneBlockW = phones.length ? 34 : 0;
    const nameX = hasBadge ? M + 22 : M;
    const nameW = W - M - phoneBlockW - nameX - 3;
    text(white); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    const nameLines = doc.splitTextToSize(coName || inv?.billTitle || "Invoice", nameW) as string[];
    const nameBlockH = nameLines.length * 5.2;
    doc.text(nameLines, nameX, bandH / 2 - nameBlockH / 2 + 4);

    if (phones.length) {
        text(mix(accent, white, 0.7)); doc.setFont("helvetica", "normal"); doc.setFontSize(6);
        doc.text("PHONE / WHATSAPP", W - M, bandH / 2 - 5.5, { align: "right" });
        text(white); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        phones.forEach((p, i) => doc.text(p, W - M, bandH / 2 - 0.5 + i * 5, { align: "right" }));
    }

    // ---- Address strip -----------------------------------------------------
    let y = bandH;
    if (co.address) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        const lines = doc.splitTextToSize(co.address, W - 2 * M) as string[];
        const stripH = Math.max(8, lines.length * 3.4 + 4);
        fill(deep); doc.rect(0, y, W, stripH, "F");
        text(white); doc.text(lines, M, y + 5);
        y += stripH;
    }

    // ---- Vehicle · Bill no · Date -------------------------------------------
    y += 6;
    const billDate = bill.billDate ? new Date(bill.billDate) : new Date();
    const dateText = billDate.toLocaleDateString("en-GB");
    const boxH = 17;
    const c1 = 58, c2 = 30;
    draw(hair); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W - 2 * M, boxH, 2, 2, "S");
    doc.line(M + c1, y, M + c1, y + boxH);
    doc.line(M + c1 + c2, y, M + c1 + c2, y + boxH);
    const cell = (x: number, label: string, value: string, color: RGB, size: number) => {
        text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
        doc.text(label, x + 4, y + 5.5);
        text(color); doc.setFont("helvetica", "bold"); doc.setFontSize(size);
        doc.text(value, x + 4, y + 12.5, { maxWidth: (x === M ? c1 : x === M + c1 ? c2 : W - M - x) - 8 });
    };
    cell(M, "M/s · Vehicle no.", spacedPlate(bill.vehicleNo), accent, 11.5);
    cell(M + c1, "Bill no.", String(bill.billNo ?? "—"), ink, 11.5);
    cell(M + c1 + c2, "Date", dateText, ink, 11.5);
    y += boxH;

    const meta = [
        bill.lorryAddress && `Lorry: ${bill.lorryAddress}`,
        bill.mechanic && `Mechanic: ${bill.mechanic}`,
        bill.phone && `Ph: ${bill.phone}`,
    ].filter(Boolean) as string[];
    if (meta.length) {
        text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        const lines = doc.splitTextToSize(meta.join("   ·   "), W - 2 * M) as string[];
        doc.text(lines, M, y + 5);
        y += lines.length * 3.4 + 3;
    }
    y += 5;

    // ---- Particulars -------------------------------------------------------
    const rows = (bill.services || []).flatMap((s) =>
        (s.items || []).map((i) => ({
            label: itemText(i),
            tag: [s.typeLabel || s.type, bsLabel(settings, s.bsModel)].filter(Boolean).join(" · "),
            qty: i.qty,
            rate: i.rate,
            amount: i.amount,
        }))
    );
    const showRate = rows.some((r) => Number(r.qty) !== 1);
    const head = ["No", "Particulars", "Qty", ...(showRate ? ["Rate"] : []), "Amount (Rs)"];
    const amountCol = showRate ? 4 : 3;

    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [head],
        body: rows.map((r, i) => [String(i + 1), r.label, String(r.qty), ...(showRate ? [num(r.rate)] : []), num(r.amount)]),
        theme: "plain",
        headStyles: { fontSize: 7, fontStyle: "bold", textColor: ink, cellPadding: { top: 1.5, bottom: 2.8, left: 1, right: 1 } },
        bodyStyles: { fontSize: 8.5, textColor: ink, cellPadding: { top: 3, bottom: rows.some((r) => r.tag) ? 8 : 3, left: 1, right: 1 }, valign: "top" },
        columnStyles: {
            0: { cellWidth: 10, textColor: sub },
            2: { halign: "center", cellWidth: 14 },
            ...(showRate ? { 3: { halign: "right", cellWidth: 20 } } : {}),
            [amountCol]: { halign: "right", cellWidth: 26 },
        },
        didParseCell: (d: any) => {
            if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "center";
            if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = "right";
        },
        didDrawCell: (d: any) => {
            draw(d.section === "head" ? ink : hair);
            doc.setLineWidth(d.section === "head" ? 0.5 : 0.2);
            if (d.section === "head" || d.section === "body") {
                doc.line(d.cell.x - 0.1, d.cell.y + d.cell.height, d.cell.x + d.cell.width + 0.1, d.cell.y + d.cell.height);
            }
            if (d.section === "body" && d.column.index === 1) {
                const tag = rows[d.row.index]?.tag;
                if (!tag) return;
                doc.setFont("helvetica", "bold"); doc.setFontSize(6);
                const tw = doc.getTextWidth(tag) + 4;
                const tx = d.cell.x + 1, ty = d.cell.y + d.cell.height - 6.2;
                fill(tint); doc.roundedRect(tx, ty, tw, 4, 1, 1, "F");
                text(deep); doc.text(tag, tx + 2, ty + 2.9);
            }
        },
    });

    // ---- Totals + payment --------------------------------------------------
    let ty = (doc as any).lastAutoTable.finalY + 7;
    const blockNeeded = 56;
    if (ty + blockNeeded > H - 18) { doc.addPage(); ty = M + 4; }

    const total = Number(bill.total ?? 0);
    const discount = Math.max(Number(bill.discount || 0), 0);
    const net = Number(bill.netTotal ?? Math.max(total - discount, 0));
    const received = Number(bill.amountReceived || 0);
    const balance = Math.max(net - received, 0);
    const itemCount = rows.length;

    // right column
    const rx = W - M - 58;
    let ry = ty;
    const line = (label: string, value: string, color: RGB = ink) => {
        text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(label, rx, ry);
        text(color); doc.text(value, W - M, ry, { align: "right" });
        ry += 5.2;
    };
    line("Items", String(itemCount));
    if (discount > 0) { line("Subtotal", rs(total)); line("Discount", `- ${rs(discount)}`); }
    ry += 1;
    fill(accent); doc.roundedRect(rx - 2, ry - 4, 60, 12, 2.2, 2.2, "F");
    text(white); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text("Total", rx + 2, ry + 3.2);
    doc.setFontSize(11);
    doc.text(rs(net), W - M - 2, ry + 3.4, { align: "right" });
    ry += 13;
    if (received > 0) {
        line("Received", rs(received));
        line("Balance", rs(balance), balance > 0 ? [200, 50, 50] : ink);
    }

    // left column
    text(sub); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    doc.text("AMOUNT IN WORDS", M, ty);
    text(ink); doc.setFontSize(8.5);
    const words = doc.splitTextToSize(amountInWords(net), 60) as string[];
    doc.text(words, M, ty + 4.6);
    const boxY = ty + 4.6 + words.length * 4 + 4;

    let qrData: { dataUrl: string; format: string } | null = null;
    if (co.qrUrl) { try { qrData = await fetchImage(co.qrUrl); } catch { /* ignore */ } }
    if (!qrData && inv?.showQr && co.upiId) {
        const upi = `upi://pay?pa=${encodeURIComponent(co.upiId)}&pn=${encodeURIComponent(co.name)}&am=${net}&cu=INR`;
        qrData = { dataUrl: await QRCode.toDataURL(upi, { margin: 0 }), format: "PNG" };
    }
    if (qrData || co.upiDisplay) {
        const QR = 20;
        const bw = 58, bh = qrData ? QR + 8 : 18;
        draw(mix(sub, white, 0.45)); doc.setLineWidth(0.3);
        (doc as any).setLineDashPattern([1, 1], 0);
        doc.roundedRect(M, boxY, bw, bh, 2, 2, "S");
        (doc as any).setLineDashPattern([], 0);
        let tx = M + 4;
        if (qrData) { doc.addImage(qrData.dataUrl, qrData.format, M + 4, boxY + 4, QR, QR); tx = M + QR + 9; }
        text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.text("Pay by UPI", tx, boxY + 6);
        if (co.upiDisplay) {
            text(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(qrData ? 8.5 : 11);
            doc.text(co.upiDisplay, tx, boxY + 12.5, { maxWidth: bw - (tx - M) - 3 });
        }
        text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
        doc.text("GPay · PhonePe", tx, boxY + (qrData ? 17.5 : 15.5));
    }

    // ---- Footer: note + signature -------------------------------------------
    const fy = H - 14;
    text(sub); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    if (inv?.footerNote) doc.text(doc.splitTextToSize(inv.footerNote, 70) as string[], M, fy + 1);
    if (inv?.showSignature && co.signatureUrl) {
        try {
            const { dataUrl, format } = await fetchImage(co.signatureUrl);
            doc.addImage(dataUrl, format, W - M - 34, fy - 14, 34, 12);
        } catch { /* blank signing space */ }
    }
    draw(ink); doc.setLineWidth(0.3);
    doc.line(W - M - 52, fy - 1.5, W - M, fy - 1.5);
    doc.setFontSize(7);
    if (coName) doc.text(`For ${coName}`, W - M, fy + 2.5, { align: "right", maxWidth: 52 });

    const d = billDate;
    const fileDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    doc.save(`Bill-${bill.billNo ?? ""}-${fileDate}-${bill.vehicleNo || ""}.pdf`);
};
