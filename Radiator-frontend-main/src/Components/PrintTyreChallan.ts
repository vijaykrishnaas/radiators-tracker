import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchPdfImage } from "../Utils/pdfImage";
import type { AppSettings } from "../Context/SettingsContext";
import type { TyreBill } from "../Pages/Tyre/types";
import { TUBE_LABEL } from "../Pages/Tyre/types";

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [18, 70, 130];
};

const rs = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN") : "-");

/**
 * Tyre delivery challan (A5), following the paper challan: masthead (company left; title, date and D.C. no. right),
 * "not a tax invoice" line, Delivered to / Details, the tyres, totals, the installment schedule when the challan is on
 * installments, then the receiver's and the authorised signatures. Standalone: shares no drawing code with the other
 * invoices. Identity, colour and wording come from settings.
 */
export const printTyreChallan = async (bill: TyreBill, settings: AppSettings) => {
    const accent = hexToRgb(settings.branding.primaryColor);
    const ink: RGB = [29, 29, 31];
    const sub: RGB = [110, 110, 115];
    const hair: RGB = [224, 224, 229];
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;
    const co = settings.company;
    const inv = settings.tyre?.invoice;
    const labels = settings.tyre?.labels;
    const setRGB = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const drawRGB = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
    const isPlan = bill.paymentType === "installment";
    const billDateObj = bill.billDate ? new Date(bill.billDate) : new Date();
    const billDate = billDateObj.toLocaleDateString("en-IN");

    /* ---- Masthead ---- */
    const titleText = (inv?.billTitle || "Delivery Challan").toUpperCase();
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    const titleW = doc.getTextWidth(titleText);
    const nameMaxW = Math.max(46, W - 2 * M - titleW - 8);
    const coName = (co.name || "").trim().toUpperCase();
    const nameY = 15.5;
    setRGB(ink); doc.setFont("times", "bold"); doc.setFontSize(17);
    doc.text(coName, M, nameY, { maxWidth: nameMaxW });
    const nameH = coName ? doc.getTextDimensions(coName, { maxWidth: nameMaxW, fontSize: 17 }).h : 6;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); setRGB(accent);
    doc.text(titleText, W - M, nameY - 0.5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    doc.text(billDate, W - M, nameY + 5, { align: "right" });
    doc.text(`D.C. No: ${bill.billNo ?? "-"}`, W - M, nameY + 9.5, { align: "right" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setRGB(sub);
    let cy = nameY + Math.max(nameH, 6) + 2.5;
    if (co.address) {
        doc.text(co.address, M, cy, { maxWidth: 84 });
        cy += doc.getTextDimensions(co.address, { maxWidth: 84, fontSize: 7 }).h + 1;
    }
    const phone = `${co.phone1 || ""}${co.phone2 ? "  ·  " + co.phone2 : ""}`;
    if (phone.trim()) { doc.text(phone, M, cy); cy += 4; }
    if (inv?.subtitle) { doc.setFont("helvetica", "italic"); doc.text(inv.subtitle, M, cy); cy += 1; }

    /* ---- Delivered to / Details ---- */
    let y = Math.max(36, cy + 6);
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, y - 4, W - M, y - 4);
    const colR = W / 2 + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub);
    doc.text("DELIVERED TO", M, y);
    doc.text("DETAILS", colR, y);

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink);
    doc.text(bill.customerName || bill.vehicleNumber || "-", M, y + 5, { maxWidth: colR - M - 6 });
    let by = y + 9.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    if (bill.address) {
        doc.text(bill.address, M, by, { maxWidth: colR - M - 6 });
        by += doc.getTextDimensions(bill.address, { maxWidth: colR - M - 6, fontSize: 7.5 }).h + 0.8;
    }
    if (bill.phoneNumber) { doc.text(String(bill.phoneNumber), M, by); by += 4; }

    const details: [string, string][] = [[labels?.vehicleNo || "Vehicle", bill.vehicleNumber || "-"]];
    if (bill.mechanicName) details.push([labels?.agent || "Mechanic", bill.mechanicName]);
    details.push(["Payment", isPlan ? "Installments" : "Full payment"]);
    let dy = y + 5;
    details.forEach(([k, v]) => {
        doc.setFont("helvetica", "normal"); setRGB(sub); doc.text(k, colR, dy);
        setRGB(ink); doc.text(v, W - M, dy, { align: "right", maxWidth: 40 });
        dy += 4.6;
    });
    y = Math.max(y + 13, dy + 3, by + 2);

    /* ---- Tyres ---- */
    const plainLines = {
        theme: "plain" as const,
        margin: { left: M, right: M },
        headStyles: { fontSize: 6.8, fontStyle: "bold" as const, textColor: sub, cellPadding: { top: 1, bottom: 2.2 } },
        bodyStyles: { fontSize: 7.6, textColor: ink, cellPadding: { top: 2.2, bottom: 2.2 } },
        didDrawCell: (data: any) => {
            if (data.section === "head" || data.section === "body") {
                drawRGB(hair);
                doc.setLineWidth(data.section === "head" ? 0.35 : 0.2);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },
    };
    autoTable(doc, {
        ...plainLines,
        startY: y,
        head: [["Tyre", "Tyre no.", "Tube / flap", "Qty", "Rate", "Amount"]],
        body: (bill.items || []).map((i) => [
            i.particulars,
            i.tyreNumber || "-",
            `${TUBE_LABEL[i.tubeType] || i.tubeType} / ${i.flap ? "Flap" : "No flap"}`,
            String(i.qty),
            rs(i.rate),
            rs(i.amount),
        ]),
        columnStyles: {
            0: { halign: "left" },
            1: { halign: "left", cellWidth: 24 },
            2: { halign: "left", cellWidth: 26 },
            3: { halign: "center", cellWidth: 9 },
            4: { halign: "right", cellWidth: 20 },
            5: { halign: "right", cellWidth: 22 },
        },
    });

    let ty = (doc as any).lastAutoTable.finalY + 6;
    const valX = W - M;
    const labX = W - 62;
    if (ty + 26 > H - 40) { doc.addPage(); ty = M + 8; }
    const row = (label: string, val: string, opt: { bold?: boolean; size?: number; lc?: RGB; vc?: RGB } = {}) => {
        doc.setFont("helvetica", opt.bold ? "bold" : "normal");
        doc.setFontSize(opt.size || 8);
        setRGB(opt.lc || sub); doc.text(label, labX, ty);
        setRGB(opt.vc || ink); doc.text(val, valX, ty, { align: "right" });
        ty += 5;
    };
    row("Tyre amount", rs(bill.tyreAmount));
    if (bill.discount > 0) row("Discount", `- ${rs(bill.discount)}`);
    if (isPlan && bill.interestTotal > 0) row("Interest", rs(bill.interestTotal));
    drawRGB(hair); doc.setLineWidth(0.3); doc.line(labX, ty - 2.6, valX, ty - 2.6); ty += 1.5;
    row(isPlan ? "Amount to collect" : "Total", rs(bill.payableTotal), { bold: true, size: 9.5, lc: ink });
    if (bill.receivedAmount > 0) {
        row("Received", rs(bill.receivedAmount));
        row("Balance", rs(bill.pendingAmount), { bold: true });
    }

    /* ---- Installment schedule ---- */
    if (isPlan && bill.installments.length) {
        ty += 2;
        if (ty + 20 > H - 40) { doc.addPage(); ty = M + 8; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub);
        doc.text("INSTALLMENTS", M, ty);
        autoTable(doc, {
            ...plainLines,
            startY: ty + 2,
            head: [["Installment", "Due date", "Principal", "Interest", "Total", "Paid"]],
            body: bill.installments.map((r) => [r.label, d(r.dueDate), rs(r.principal), rs(r.interest), rs(r.total), r.paid > 0 ? rs(r.paid) : "-"]),
            columnStyles: {
                0: { halign: "left" },
                1: { halign: "left", cellWidth: 20 },
                2: { halign: "right", cellWidth: 21 },
                3: { halign: "right", cellWidth: 18 },
                4: { halign: "right", cellWidth: 21 },
                5: { halign: "right", cellWidth: 21 },
            },
        });
        ty = (doc as any).lastAutoTable.finalY + 4;
    }

    /* ---- Signatures: receiver (left) · company (right) ---- */
    const footerLineY = H - 9;
    let sy = Math.max(ty + 8, footerLineY - 30);
    if (sy + 24 > footerLineY) { doc.addPage(); sy = footerLineY - 30; }
    if (inv?.showSignature && co.signatureUrl) {
        try {
            const { dataUrl, format } = await fetchPdfImage(co.signatureUrl);
            doc.addImage(dataUrl, format, W - 46, sy + 4, 34, 14);
        } catch { /* blank signing space */ }
    }
    drawRGB(ink); doc.setLineWidth(0.3);
    doc.line(M, sy + 20, M + 52, sy + 20);
    doc.line(W - M - 52, sy + 20, W - M, sy + 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setRGB(sub);
    doc.text("Receiver's name and signature", M, sy + 24);
    if (inv?.footerNote) doc.text(inv.footerNote, M, sy + 27.5, { maxWidth: 60 });
    doc.text(co.name ? `For ${co.name}` : "For the company", W - M, sy + 24, { align: "right", maxWidth: 60 });
    doc.text("Authorised signatory", W - M, sy + 27.5, { align: "right" });

    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, footerLineY, W - M, footerLineY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setRGB(sub);
    doc.text([co.name, co.phone1].filter(Boolean).join("  ·  "), W / 2, H - 5, { align: "center" });

    const fileDate = `${billDateObj.getFullYear()}-${String(billDateObj.getMonth() + 1).padStart(2, "0")}-${String(billDateObj.getDate()).padStart(2, "0")}`;
    doc.save(`Challan-${bill.billNo ?? ""}-${fileDate}-${bill.vehicleNumber || ""}.pdf`);
};
