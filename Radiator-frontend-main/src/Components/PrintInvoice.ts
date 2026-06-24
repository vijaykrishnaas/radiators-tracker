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
    const navy = hexToRgb(settings.branding.primaryColor);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    /* ---- Header band ---- */
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 26, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(settings.company.name, pageWidth / 2, 10, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(settings.company.address, pageWidth / 2, 16, { align: "center" });
    doc.text(
        `Ph: ${settings.company.phone1}${settings.company.phone2 ? "  /  " + settings.company.phone2 : ""}`,
        pageWidth / 2,
        21,
        { align: "center" }
    );

    /* ---- Bill title pill ---- */
    let y = 31;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(8, y, pageWidth - 16, 18, 2, 2, "F");

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(settings.invoice.billTitle, pageWidth / 2, y + 5, { align: "center" });

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const billDateObj = o.billDate ? new Date(o.billDate) : new Date();
    const billDate = billDateObj.toLocaleDateString("en-IN");
    doc.text(`Date: ${billDate}`, 12, y + 11);
    doc.text(`To: ${o.transportName}  ·  ${o.truckNumber}`, 12, y + 15.5);

    y += 23;

    /* ---- Mechanic / labour line ---- */
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    const crew = [
        o.mechanicName ? `Mechanic: ${o.mechanicName}` : "",
        o.labourName?.length ? `Labour: ${o.labourName.join(", ")}` : "",
        o.radiatorType ? `Model: ${o.radiatorType}` : "",
    ]
        .filter(Boolean)
        .join("   |   ");
    if (crew) doc.text(crew, 8, y);
    y += 4;

    /* ---- Services table ---- */
    const total = o.totalAmount ?? (o.serviceInfo || []).reduce(
        (sum: number, s: any) => sum + Number(s.price || 0), 0);
    const received = o.receivedAmount ?? 0;
    const pending = o.pendingAmount ?? Math.max(total - received, 0);

    const foot: any[] = [["", "Grand Total", "", money(total)]];
    if (received > 0) {
        foot.push(["", "Received", "", money(received)]);
        foot.push(["", "Pending", "", money(pending)]);
    }

    autoTable(doc, {
        startY: y,
        margin: { left: 8, right: 8 },
        head: [["#", "Description", "Qty", "Amount (Rs)"]],
        body: (o.serviceInfo || []).map((s: any, i: number) => [
            i + 1,
            particularText(s),
            1,
            money(Number(s.price || 0)),
        ]),
        foot,
        theme: "striped",
        headStyles: { fillColor: navy, textColor: 255, fontSize: 8, halign: "center" },
        bodyStyles: { fontSize: 8 },
        footStyles: {
            fillColor: [245, 247, 250],
            textColor: 30,
            fontStyle: "bold",
            fontSize: 8.5,
            halign: "right",
        },
        alternateRowStyles: { fillColor: [248, 250, 253] },
        columnStyles: {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "left" },
            2: { halign: "center", cellWidth: 12 },
            3: { halign: "right", cellWidth: 26 },
        },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    /* ---- Payment + signature section ---- */
    const sectionY = Math.max(y, pageHeight - 44);

    // QR slot. Priority: an uploaded payment-QR image; otherwise a UPI QR
    // auto-generated from the UPI ID (when showQr is on).
    let qrShown = false;
    if (settings.company.qrUrl) {
        try {
            const { dataUrl, format } = await fetchImageDataUrl(settings.company.qrUrl);
            doc.addImage(dataUrl, format, 8, sectionY, 24, 24);
            doc.setFontSize(7);
            doc.setTextColor(60);
            doc.text("Scan & Pay", 10, sectionY + 27);
            if (settings.company.upiDisplay) doc.text(settings.company.upiDisplay, 8, sectionY + 31);
            qrShown = true;
        } catch {
            /* fall through to the generated QR / text */
        }
    }
    if (!qrShown && settings.invoice.showQr && settings.company.upiId) {
        const upi = `upi://pay?pa=${encodeURIComponent(settings.company.upiId)}&pn=${encodeURIComponent(settings.company.name)}&am=${pending > 0 ? pending : total}&cu=INR`;
        const qr = await QRCode.toDataURL(upi);
        doc.addImage(qr, "PNG", 8, sectionY, 24, 24);
        doc.setFontSize(7);
        doc.setTextColor(60);
        doc.text("Scan & Pay", 10, sectionY + 27);
        if (settings.company.upiDisplay) {
            doc.text(settings.company.upiDisplay, 8, sectionY + 31);
        }
    } else if (!qrShown && settings.company.upiDisplay) {
        doc.setFontSize(8);
        doc.setTextColor(60);
        doc.text("Payment:", 8, sectionY + 10);
        doc.setFont("helvetica", "bold");
        doc.text(settings.company.upiDisplay, 8, sectionY + 15);
        doc.setFont("helvetica", "normal");
    }

    doc.setFontSize(8);
    doc.setTextColor(30);
    doc.setFont("helvetica", "bold");
    doc.text(`For ${settings.company.name}`, pageWidth - 8, sectionY + 8, { align: "right" });
    doc.setDrawColor(150);
    doc.line(pageWidth - 52, sectionY + 22, pageWidth - 8, sectionY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text("Authorised Signatory", pageWidth - 8, sectionY + 26, { align: "right" });

    /* ---- Footer stripe ---- */
    doc.setFillColor(...navy);
    doc.rect(0, pageHeight - 7, pageWidth, 7, "F");
    doc.setTextColor(255);
    doc.setFontSize(7);
    doc.text(
        `${settings.invoice.footerNote} · ${settings.company.name}`,
        pageWidth / 2,
        pageHeight - 2.8,
        { align: "center" }
    );

    const fileDate = `${billDateObj.getFullYear()}-${String(billDateObj.getMonth() + 1).padStart(2, "0")}-${String(billDateObj.getDate()).padStart(2, "0")}`;
    doc.save(`Bill-${fileDate}-${o.truckNumber || ""}.pdf`);
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
