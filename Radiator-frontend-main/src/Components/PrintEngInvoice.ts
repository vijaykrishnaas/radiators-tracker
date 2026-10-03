import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AppSettings } from "../Context/SettingsContext";
import type { EngBill } from "../Pages/Engineering/types";
import { bsLabel, itemText, typeLabel } from "../Pages/Engineering/types";

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [18, 70, 130];
};

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";
const rs = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; // radiator format: no forced decimals

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
 * Engineering Works bill (A5), laid out like the radiator / automobile invoices: masthead (company left, bill
 * title + date + bill no. right), Billed to / Details, plain particulars table, totals, QR + signature, footer.
 * Standalone — it shares no drawing code with those invoices, so they stay byte-identical. Identity, colour and
 * options all come from settings; nothing is hardcoded.
 */
export const printEngInvoice = async (bill: EngBill, settings: AppSettings) => {
    const accent = hexToRgb(settings.branding.primaryColor);
    const ink: RGB = [29, 29, 31];
    const sub: RGB = [110, 110, 115];
    const hair: RGB = [224, 224, 229];
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;
    const co = settings.company;
    const inv = settings.engineering?.invoice;
    const setRGB = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const drawRGB = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

    const gross = Number(bill.total ?? (bill.services || []).reduce((sum, s) => sum + Number(s.subtotal || 0), 0));
    const discount = Math.max(Number(bill.discount || 0), 0);
    const net = Number(bill.netTotal ?? Math.max(gross - discount, 0));
    const received = Number(bill.amountReceived || 0);
    const pending = Number(bill.balance ?? Math.max(net - received, 0));
    const billDateObj = bill.billDate ? new Date(bill.billDate) : new Date();
    const billDate = billDateObj.toLocaleDateString("en-IN");

    /* ---- Masthead: company (left) · title + date + bill no. (right) ---- */
    const titleText = (inv?.billTitle || "Invoice").toUpperCase();
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    const titleW = doc.getTextWidth(titleText);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    const metaW = Math.max(titleW, doc.getTextWidth(billDate));
    const nameMaxW = Math.max(46, W - 2 * M - metaW - 8);

    const coName = (co.name || "").trim().toUpperCase();
    const nameY = 15.5;
    setRGB(ink); doc.setFont("times", "bold"); doc.setFontSize(17);
    doc.text(coName, M, nameY, { maxWidth: nameMaxW });
    const nameH = coName ? doc.getTextDimensions(coName, { maxWidth: nameMaxW, fontSize: 17 }).h : 6;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); setRGB(accent);
    doc.text(titleText, W - M, nameY - 0.5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    doc.text(billDate, W - M, nameY + 5, { align: "right" });
    if (bill.billNo != null) doc.text(`Bill No: ${bill.billNo}`, W - M, nameY + 9.5, { align: "right" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setRGB(sub);
    let cy = nameY + Math.max(nameH, 6) + 2.5;
    if (co.address) {
        doc.text(co.address, M, cy, { maxWidth: 84 });
        cy += doc.getTextDimensions(co.address, { maxWidth: 84, fontSize: 7 }).h + 1;
    }
    const phone = `${co.phone1 || ""}${co.phone2 ? "  ·  " + co.phone2 : ""}`;
    if (phone.trim()) doc.text(phone, M, cy);

    /* ---- Billed to / Details ---- */
    let y = Math.max(36, cy + 7);
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, y - 4, W - M, y - 4);

    const colR = W / 2 + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub);
    doc.text("BILLED TO", M, y);
    doc.text("DETAILS", colR, y);

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink);
    doc.text(spacedPlate(bill.vehicleNo), M, y + 5);
    let by = y + 9.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    if (bill.lorryAddress) {
        doc.text(bill.lorryAddress, M, by, { maxWidth: colR - M - 6 });
        by += doc.getTextDimensions(bill.lorryAddress, { maxWidth: colR - M - 6, fontSize: 7.5 }).h + 0.8;
    }
    if (bill.phone) { doc.text(String(bill.phone), M, by); by += 4; }

    const bsSet = [...new Set((bill.services || []).map((s) => bsLabel(settings, s.bsModel)).filter(Boolean))];
    const details: [string, string][] = [];
    if (bill.mechanic) details.push(["Mechanic", bill.mechanic]);
    if (bsSet.length) details.push(["BS model", bsSet.join(", ")]);
    doc.setFontSize(7.5);
    let dy = y + 5;
    details.forEach(([k, v]) => {
        doc.setFont("helvetica", "normal"); setRGB(sub); doc.text(k, colR, dy);
        setRGB(ink); doc.text(v, W - M, dy, { align: "right", maxWidth: 50 });
        dy += 4.6;
    });
    y = Math.max(y + 13, dy + 3, by + 2);

    /* ---- Particulars: a quiet group row per service, then its items ---- */
    const body: any[] = [];
    (bill.services || []).forEach((s) => {
        const tag = [s.typeLabel || typeLabel(settings, s.type), bsLabel(settings, s.bsModel)].filter(Boolean).join(" · ");
        body.push([{ content: tag.toUpperCase(), colSpan: 4, styles: { fontSize: 6.5, fontStyle: "bold", textColor: sub, cellPadding: { top: 2.4, bottom: 0.6 } } }]);
        s.items.forEach((i) => body.push([itemText(i), String(i.qty), rs(Number(i.rate || 0)), rs(Number(i.amount || 0))]));
    });

    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Particulars", "Qty", "Rate", "Amount"]],
        body,
        theme: "plain",
        headStyles: { fontSize: 7, fontStyle: "bold", textColor: sub, cellPadding: { top: 1, bottom: 2.5 } },
        bodyStyles: { fontSize: 8, textColor: ink, cellPadding: { top: 2.6, bottom: 2.6 } },
        columnStyles: {
            0: { halign: "left" },
            1: { halign: "center", cellWidth: 16 },
            2: { halign: "right", cellWidth: 28 },
            3: { halign: "right", cellWidth: 30 },
        },
        didParseCell: (data: any) => {
            if (data.cell.colSpan > 1) return;
            data.cell.styles.halign = data.column.index === 0 ? "left" : data.column.index === 1 ? "center" : "right";
        },
        didDrawCell: (data: any) => {
            if (data.section === "head" || (data.section === "body" && data.cell.colSpan === 1)) {
                drawRGB(hair);
                doc.setLineWidth(data.section === "head" ? 0.35 : 0.2);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },
    });

    let ty = (doc as any).lastAutoTable.finalY + 7;
    const valX = W - M;
    const labX = W - 58;
    // Keep the totals together: if they would run into the signature block, move to a new page.
    if (ty + 22 > H - 46) { doc.addPage(); ty = M + 8; }
    const row = (label: string, val: string, opt: { bold?: boolean; size?: number; lc?: RGB; vc?: RGB; gap?: number } = {}) => {
        doc.setFont("helvetica", opt.bold ? "bold" : "normal");
        doc.setFontSize(opt.size || 8);
        setRGB(opt.lc || sub); doc.text(label, labX, ty);
        setRGB(opt.vc || ink); doc.text(val, valX, ty, { align: "right" });
        ty += opt.gap || 5;
    };
    row("Subtotal", rs(gross));
    if (discount > 0) row("Discount", `- ${rs(discount)}`);
    drawRGB(hair); doc.setLineWidth(0.3); doc.line(labX, ty - 2.6, valX, ty - 2.6); ty += 1.5;
    row("Total", rs(net), { bold: true, size: 9.5, lc: ink });
    if (received > 0) row("Amount paid", rs(received));

    /* ---- QR (left) · signature (right) ---- */
    const QR = 30;
    const footerLineY = H - 9;
    const blockH = Math.max(QR + 9, 28);
    const sectionY = Math.max(ty + 4, footerLineY - 3 - blockH);
    let qrShown = false;
    const drawQrCaption = () => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setRGB(ink);
        doc.text("Scan to pay", M, sectionY + QR + 5);
        if (co.upiDisplay) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); setRGB(sub); doc.text(co.upiDisplay, M, sectionY + QR + 9); }
    };
    if (co.qrUrl) {
        try {
            const { dataUrl, format } = await fetchImage(co.qrUrl);
            doc.addImage(dataUrl, format, M, sectionY, QR, QR);
            drawQrCaption(); qrShown = true;
        } catch { /* fall through */ }
    }
    if (!qrShown && inv?.showQr && co.upiId) {
        const upi = `upi://pay?pa=${encodeURIComponent(co.upiId)}&pn=${encodeURIComponent(co.name)}&am=${pending > 0 ? pending : net}&cu=INR`;
        const qr = await QRCode.toDataURL(upi, { margin: 0 });
        doc.addImage(qr, "PNG", M, sectionY, QR, QR);
        drawQrCaption();
    } else if (!qrShown && co.upiDisplay) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub); doc.text("PAY VIA", M, sectionY + 6);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink); doc.text(co.upiDisplay, M, sectionY + 11);
    }

    const fitOneLine = (t: string, maxW: number, size: number) => {
        doc.setFontSize(size);
        if (doc.getTextWidth(t) <= maxW) return t;
        let c = t;
        while (c.length > 1 && doc.getTextWidth(c + "…") > maxW) c = c.slice(0, -1);
        return c.trimEnd() + "…";
    };
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    if (co.name) doc.text(fitOneLine(`For ${co.name}`, 58, 7.5), W - M, sectionY + 5, { align: "right" });
    if (inv?.showSignature && co.signatureUrl) {
        try {
            const { dataUrl, format } = await fetchImage(co.signatureUrl);
            doc.addImage(dataUrl, format, W - 46, sectionY + 8, 34, 14);
        } catch { /* blank signing space */ }
    }
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(W - 48, sectionY + 24, W - M, sectionY + 24);
    doc.setFontSize(6.5); setRGB(sub);
    doc.text("Authorised signatory", W - M, sectionY + 28, { align: "right" });

    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, H - 9, W - M, H - 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setRGB(sub);
    const footer = [inv?.footerNote, co.name].filter(Boolean).join("  ·  ");
    doc.text(footer, W / 2, H - 5, { align: "center" });

    const fileDate = `${billDateObj.getFullYear()}-${String(billDateObj.getMonth() + 1).padStart(2, "0")}-${String(billDateObj.getDate()).padStart(2, "0")}`;
    doc.save(`Bill-${bill.billNo ?? ""}-${fileDate}-${bill.vehicleNo || ""}.pdf`);
};
