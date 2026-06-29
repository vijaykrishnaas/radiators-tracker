import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AppSettings } from "../Context/SettingsContext";

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m
        ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
        : [18, 70, 130];
};

const money = (n: number) => `${Number(n || 0).toLocaleString("en-IN")}`;

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";

// Fetches an uploaded image (e.g. the payment QR) as a base64 data URL for jsPDF.
async function fetchImageDataUrl(url: string): Promise<{ dataUrl: string; format: string }> {
    const full = url.startsWith("/") ? `${BACKEND}${url}` : url;
    const resp = await fetch(full);
    if (!resp.ok) throw new Error("image fetch failed");
    const blob = await resp.blob();
    const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
    });
    const mime = dataUrl.match(/^data:(image\/[a-z+]+);/)?.[1] || "image/png";
    const format = /jpe?g/.test(mime) ? "JPEG" : "PNG";
    return { dataUrl, format };
}

// "Other" services print their comment text instead of the word "Other"
const particularText = (s: { type: string; comments?: string }) =>
    s.type?.toLowerCase() === "other" ? (s.comments || "Comment") : s.type;

/**
 * Modern A5 invoice. All company identity, branding, and invoice options come
 * from settings — nothing company-specific is hardcoded here.
 */
export const printInvoice = async (o: any, settings: AppSettings) => {
    const accent = hexToRgb(settings.branding.primaryColor);
    const ink: RGB = [29, 29, 31];      // Apple-ish near-black
    const sub: RGB = [110, 110, 115];   // secondary grey
    const hair: RGB = [224, 224, 229];  // hairline
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;

    const setRGB = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const drawRGB = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
    const rs = (n: number) => `Rs ${money(n)}`;

    /* ---- amounts (gross → discount → net → paid → balance) ---- */
    const gross = o.totalAmount ?? (o.serviceInfo || []).reduce((sum: number, s: any) => sum + Number(s.price || 0), 0);
    const discount = Math.max(Number(o.discount || 0), 0);
    const net = o.netAmount ?? Math.max(gross - discount, 0);
    const received = Number(o.receivedAmount || 0);
    const pending = o.pendingAmount ?? Math.max(net - received, 0);
    const billDateObj = o.billDate ? new Date(o.billDate) : new Date();
    const billDate = billDateObj.toLocaleDateString("en-IN");

    /* ---- Header: company (left) · INVOICE + date (right) ---- */
    setRGB(ink);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text(settings.company.name, M, 16.5, { maxWidth: 88 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setRGB(sub);
    let cy = 22;
    if (settings.company.address) { doc.text(settings.company.address, M, cy, { maxWidth: 82 }); cy += doc.getTextDimensions(settings.company.address, { maxWidth: 82, fontSize: 7 }).h + 1; }
    const phone = `${settings.company.phone1 || ""}${settings.company.phone2 ? "  ·  " + settings.company.phone2 : ""}`;
    if (phone.trim()) doc.text(phone, M, cy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    setRGB(accent);
    doc.text((settings.invoice.billTitle || "Invoice").toUpperCase(), W - M, 15, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setRGB(sub);
    doc.text(billDate, W - M, 20.5, { align: "right" });

    /* ---- Billed to / Details ---- */
    let y = 35;
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, y - 4, W - M, y - 4);

    const colR = W / 2 + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub);
    doc.text("BILLED TO", M, y);
    doc.text("DETAILS", colR, y);

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink);
    doc.text(o.transportName || "—", M, y + 5);
    if (o.phoneNumber) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub); doc.text(String(o.phoneNumber), M, y + 9.5); }

    const details: [string, string][] = [[settings.labels.vehicleNo || "Vehicle", o.truckNumber || "—"]];
    if (o.mechanicName) details.push(["Mechanic", o.mechanicName]);
    if (o.radiatorType) details.push([settings.labels.product || "Model", o.radiatorType]);
    doc.setFontSize(7.5);
    let dy = y + 5;
    details.forEach(([k, v]) => {
        doc.setFont("helvetica", "normal"); setRGB(sub); doc.text(k, colR, dy);
        doc.setFont("helvetica", "normal"); setRGB(ink); doc.text(String(v), W - M, dy, { align: "right", maxWidth: 50 });
        dy += 4.6;
    });
    y = Math.max(y + 13, dy + 3);

    /* ---- Line items — clean hairline rows (no fills) ---- */
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Description", "Qty", "Amount"]],
        body: (o.serviceInfo || []).map((s: any) => [particularText(s), "1", rs(Number(s.price || 0))]),
        theme: "plain",
        headStyles: { fontSize: 7, fontStyle: "bold", textColor: sub, cellPadding: { top: 1, bottom: 2.5 } },
        bodyStyles: { fontSize: 8, textColor: ink, cellPadding: { top: 2.6, bottom: 2.6 } },
        // halign in columnStyles applies to BOTH head and body, so the header
        // labels line up with their column data (Qty centred, Amount right).
        columnStyles: {
            0: { halign: "left" },
            1: { halign: "center", cellWidth: 16 },
            2: { halign: "right", cellWidth: 32 },
        },
        didDrawCell: (data: any) => {
            if (data.section === "head" || data.section === "body") {
                drawRGB(hair);
                doc.setLineWidth(data.section === "head" ? 0.35 : 0.2);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },
    });

    /* ---- Totals (right aligned) ---- */
    let ty = (doc as any).lastAutoTable.finalY + 7;
    const valX = W - M;
    const labX = W - 58;
    const row = (label: string, val: string, opt: { bold?: boolean; size?: number; lc?: RGB; vc?: RGB; gap?: number } = {}) => {
        doc.setFont("helvetica", opt.bold ? "bold" : "normal");
        doc.setFontSize(opt.size || 8);
        setRGB(opt.lc || sub); doc.text(label, labX, ty);
        setRGB(opt.vc || ink); doc.text(val, valX, ty, { align: "right" });
        ty += opt.gap || 5;
    };
    row("Subtotal", rs(gross));
    if (discount > 0) row("Discount", `- ${rs(discount)}`);
    drawRGB(hair); doc.setLineWidth(0.3); doc.line(labX, ty - 1.8, valX, ty - 1.8); ty += 1.5;
    row("Total", rs(net), { bold: true, size: 9.5, lc: ink });
    if (received > 0) row("Amount paid", rs(received));

    /* ---- Payment QR (enlarged) + signature (anchored near the bottom) ---- */
    const QR = 32;
    const sectionY = Math.max(ty + 5, H - 50);
    let qrShown = false;
    const drawQrCaption = () => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setRGB(ink);
        doc.text("Scan to pay", M, sectionY + QR + 5);
        if (settings.company.upiDisplay) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); setRGB(sub); doc.text(settings.company.upiDisplay, M, sectionY + QR + 9); }
    };
    if (settings.company.qrUrl) {
        try {
            const { dataUrl, format } = await fetchImageDataUrl(settings.company.qrUrl);
            doc.addImage(dataUrl, format, M, sectionY, QR, QR);
            drawQrCaption(); qrShown = true;
        } catch { /* fall through */ }
    }
    if (!qrShown && settings.invoice.showQr && settings.company.upiId) {
        const upi = `upi://pay?pa=${encodeURIComponent(settings.company.upiId)}&pn=${encodeURIComponent(settings.company.name)}&am=${pending > 0 ? pending : net}&cu=INR`;
        const qr = await QRCode.toDataURL(upi, { margin: 0 });
        doc.addImage(qr, "PNG", M, sectionY, QR, QR);
        drawQrCaption();
    } else if (!qrShown && settings.company.upiDisplay) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub); doc.text("PAY VIA", M, sectionY + 6);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink); doc.text(settings.company.upiDisplay, M, sectionY + 11);
    }

    /* ---- Signature block (right) — optional uploaded signature image ---- */
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    doc.text(`For ${settings.company.name}`, W - M, sectionY + 5, { align: "right" });
    if (settings.invoice.showSignature && settings.company.signatureUrl) {
        try {
            const { dataUrl, format } = await fetchImageDataUrl(settings.company.signatureUrl);
            doc.addImage(dataUrl, format, W - 46, sectionY + 8, 34, 14);
        } catch { /* fall through to a blank signing space */ }
    }
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(W - 48, sectionY + 24, W - M, sectionY + 24);
    doc.setFontSize(6.5); setRGB(sub);
    doc.text("Authorised signatory", W - M, sectionY + 28, { align: "right" });

    /* ---- Footer ---- */
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, H - 9, W - M, H - 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setRGB(sub);
    const footer = [settings.invoice.footerNote, settings.company.name].filter(Boolean).join("  ·  ");
    doc.text(footer, W / 2, H - 5, { align: "center" });

    const fileDate = `${billDateObj.getFullYear()}-${String(billDateObj.getMonth() + 1).padStart(2, "0")}-${String(billDateObj.getDate()).padStart(2, "0")}`;
    doc.save(`Invoice-${fileDate}-${o.truckNumber || ""}.pdf`);
};

/**
 * A4 summary report over the currently filtered records: totals, payment
 * position, and breakdowns by product model, service type, and mechanic.
 */
export const printReport = (
    data: any[],
    filters: { from?: string; to?: string },
    settings: AppSettings
) => {
    const navy = hexToRgb(settings.branding.primaryColor);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    /* ---- Header ---- */
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setTextColor(255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${settings.company.name} — Summary Report`, pageWidth / 2, 12, { align: "center" });

    let y = 27;
    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const rangeText =
        filters.from && filters.to
            ? `Period: ${filters.from} to ${filters.to}`
            : `Generated: ${new Date().toLocaleDateString("en-IN")}`;
    doc.text(rangeText, 14, y);
    y += 6;

    /* ---- Summary ---- */
    const totalRevenue = data.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const totalReceived = data.reduce((sum, r) => sum + (r.receivedAmount || 0), 0);
    const totalPending = data.reduce((sum, r) => sum + (r.pendingAmount || 0), 0);
    const counts = {
        received: data.filter((r) => r.status === "Received").length,
        partial: data.filter((r) => r.status === "Partial").length,
        notReceived: data.filter((r) => r.status === "Not Received").length,
    };

    autoTable(doc, {
        startY: y,
        head: [["Records", "Revenue (Rs)", "Received (Rs)", "Pending (Rs)", "Paid", "Partial", "Unpaid"]],
        body: [[
            data.length,
            money(totalRevenue),
            money(totalReceived),
            money(totalPending),
            counts.received,
            counts.partial,
            counts.notReceived,
        ]],
        headStyles: { fillColor: navy },
        styles: { halign: "center", fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 9;

    const sectionTable = (title: string, head: string[], body: any[][]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30);
        doc.text(title, 14, y);
        y += 3;
        autoTable(doc, {
            startY: y,
            head: [head],
            body,
            headStyles: { fillColor: navy },
            styles: { fontSize: 9 },
        });
        y = (doc as any).lastAutoTable.finalY + 9;
    };

    /* ---- By product model ---- */
    const modelMap: Record<string, { count: number; revenue: number }> = {};
    data.forEach((r) => {
        const key = r.radiatorType || "Unknown";
        modelMap[key] = modelMap[key] || { count: 0, revenue: 0 };
        modelMap[key].count++;
        modelMap[key].revenue += r.totalAmount || 0;
    });
    sectionTable(
        `Breakdown by ${settings.labels.product}`,
        [settings.labels.product, "Records", "Revenue (Rs)"],
        Object.entries(modelMap).map(([k, v]) => [k, v.count, money(v.revenue)])
    );

    /* ---- By service type ---- */
    const serviceMap: Record<string, { count: number; revenue: number }> = {};
    data.forEach((r) => {
        (r.serviceInfo || []).forEach((s: any) => {
            const key = particularText(s);
            serviceMap[key] = serviceMap[key] || { count: 0, revenue: 0 };
            serviceMap[key].count++;
            serviceMap[key].revenue += Number(s.price || 0);
        });
    });
    sectionTable(
        "Breakdown by Service Type",
        ["Service Type", "Count", "Revenue (Rs)"],
        Object.entries(serviceMap).map(([k, v]) => [k, v.count, money(v.revenue)])
    );

    /* ---- Top mechanics ---- */
    const mechMap: Record<string, number> = {};
    data.forEach((r) => {
        if (r.mechanicName) mechMap[r.mechanicName] = (mechMap[r.mechanicName] || 0) + 1;
    });
    sectionTable(
        "Top Mechanics",
        ["Mechanic Name", "Records Handled"],
        Object.entries(mechMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([k, v]) => [k, v])
    );

    doc.save(`report-${new Date().toISOString().slice(0, 10)}.pdf`);
};
