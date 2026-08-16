import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AppSettings } from "../Context/SettingsContext";

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m
        ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
        : [18, 70, 130];
};

const money = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-IN")}`;

export type SalaryPeriod = {
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    periodKey: string;
    workingDays: number;
    presentDaysUsed: number;
    presentDaysMode: string;
    baseSalary: number;
    grossAmount: number;
    advancesApplied?: { amount: number; date: string; reason?: string }[];
    advancesDeducted: number;
    deductions?: { amount: number; reason?: string }[];
    deductionsTotal: number;
    netAmount: number;
    status: string;
    paidAt?: string;
    adjustments?: { at: string; type: string; amount: number; reason?: string }[];
};

/**
 * Standalone salary payslip PDF — a NEW file, never touches printInvoice's
 * exports. Layout mirrors printInvoice's A5 masthead/footer conventions so the
 * app's printed documents stay visually consistent.
 */
export const printPayslip = (period: SalaryPeriod, settings: AppSettings) => {
    const accent = hexToRgb(settings.branding.primaryColor);
    const ink: RGB = [29, 29, 31];
    const sub: RGB = [110, 110, 115];
    const hair: RGB = [224, 224, 229];
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;

    const setRGB = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const drawRGB = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

    const title = (settings.salary?.payslip?.title || "SALARY SLIP").toUpperCase();
    const periodLabel = new Date(period.periodStart).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    /* ---- Header: company (left) · SLIP title + period (right) ---- */
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    const titleW = doc.getTextWidth(title);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    const metaW = Math.max(titleW, doc.getTextWidth(periodLabel));
    const nameMaxW = Math.max(46, W - 2 * M - metaW - 8);

    const coName = (settings.company.name || "").trim().toUpperCase();
    const nameY = 15.5;
    setRGB(ink); doc.setFont("times", "bold"); doc.setFontSize(17);
    doc.text(coName, M, nameY, { maxWidth: nameMaxW });
    const nameH = coName
        ? doc.getTextDimensions(coName, { maxWidth: nameMaxW, fontSize: 17 }).h
        : 6;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); setRGB(accent);
    doc.text(title, W - M, nameY - 0.5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
    doc.text(periodLabel, W - M, nameY + 5, { align: "right" });

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setRGB(sub);
    let cy = nameY + Math.max(nameH, 6) + 2.5;
    if (settings.company.address) {
        doc.text(settings.company.address, M, cy, { maxWidth: 84 });
        cy += doc.getTextDimensions(settings.company.address, { maxWidth: 84, fontSize: 7 }).h + 1;
    }

    /* ---- Employee / period details ---- */
    let y = Math.max(36, cy + 7);
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, y - 4, W - M, y - 4);

    const colR = W / 2 + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); setRGB(sub);
    doc.text("EMPLOYEE", M, y);
    doc.text("DETAILS", colR, y);

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setRGB(ink);
    doc.text(String(period.employeeName || "—").trim(), M, y + 5);

    const details: [string, string][] = [
        ["Period", `${new Date(period.periodStart).toLocaleDateString("en-IN")} - ${new Date(period.periodEnd).toLocaleDateString("en-IN")}`],
        ["Working Days", String(period.workingDays)],
        ["Present Days", `${period.presentDaysUsed} (${period.presentDaysMode})`],
    ];
    doc.setFontSize(7.5);
    let dy = y + 5;
    details.forEach(([k, v]) => {
        doc.setFont("helvetica", "normal"); setRGB(sub); doc.text(k, colR, dy);
        doc.setFont("helvetica", "normal"); setRGB(ink); doc.text(v, W - M, dy, { align: "right", maxWidth: 50 });
        dy += 4.6;
    });
    y = Math.max(y + 13, dy + 3);

    /* ---- Earnings / deductions table ---- */
    const rows: (string | number)[][] = [
        ["Base Salary (full period)", money(period.baseSalary)],
        [`Gross (${period.presentDaysUsed}/${period.workingDays} days)`, money(period.grossAmount)],
    ];
    (period.advancesApplied || []).forEach((a) => {
        rows.push([`Advance — ${a.reason || new Date(a.date).toLocaleDateString("en-IN")}`, `- ${money(a.amount)}`]);
    });
    (period.deductions || []).forEach((d) => {
        rows.push([`Deduction — ${d.reason || "—"}`, `- ${money(d.amount)}`]);
    });

    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Particulars", "Amount"]],
        body: rows,
        theme: "plain",
        headStyles: { fontSize: 7, fontStyle: "bold", textColor: sub, cellPadding: { top: 1, bottom: 2.5 } },
        bodyStyles: { fontSize: 8, textColor: ink, cellPadding: { top: 2.6, bottom: 2.6 } },
        columnStyles: { 0: { halign: "left" }, 1: { halign: "right", cellWidth: 32 } },
        didDrawCell: (data: any) => {
            if (data.section === "head" || data.section === "body") {
                drawRGB(hair);
                doc.setLineWidth(data.section === "head" ? 0.35 : 0.2);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        },
    });

    /* ---- Net total ---- */
    let ty = (doc as any).lastAutoTable.finalY + 7;
    const valX = W - M;
    const labX = W - 58;
    drawRGB(hair); doc.setLineWidth(0.3); doc.line(labX, ty - 2.6, valX, ty - 2.6); ty += 1.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setRGB(ink);
    doc.text("Net Paid", labX, ty);
    doc.text(money(period.netAmount), valX, ty, { align: "right" });
    ty += 6;

    const adjTotal = (period.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    if (adjTotal) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setRGB(sub);
        doc.text(`+ ${money(adjTotal)} in later adjustments (see settlement history)`, labX, ty);
    }

    /* ---- Footer ---- */
    drawRGB(hair); doc.setLineWidth(0.3);
    doc.line(M, H - 9, W - M, H - 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setRGB(sub);
    const footer = [settings.salary?.payslip?.footerNote, settings.company.name].filter(Boolean).join("  ·  ");
    doc.text(footer, W / 2, H - 5, { align: "center" });

    doc.save(`Payslip-${period.periodKey}-${(period.employeeName || "").replace(/\s+/g, "-")}.pdf`);
};
