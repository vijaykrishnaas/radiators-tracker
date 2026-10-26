// Lays out one "label ........ value" row of a bill's Details block (label left, value right-aligned) in a column
// `colW` wide. The value keeps the room it needs (up to `maxValueW`) and wraps past that; a label too long to sit
// beside it wraps into what is left (never narrower than 18mm). Before, the value only got what the label left over,
// so a long label from Settings squeezed a vehicle number to one character per line.
import type jsPDF from "jspdf";

export function fitDetail(doc: jsPDF, label: string, value: string, colW: number, maxValueW: number) {
    const labelW = doc.getTextWidth(label);
    const valueW = Math.min(maxValueW, doc.getTextWidth(value));
    const fits = labelW + 3 + valueW <= colW;
    const labelRoom = fits ? labelW : Math.max(18, colW - valueW - 3);
    const labelLines: string[] = fits ? [label] : doc.splitTextToSize(label, labelRoom);
    const valueRoom = Math.min(maxValueW, colW - labelRoom - 3);
    // A text that fits is never split: splitTextToSize sums character widths and can come out a hair over the
    // measured width, which broke "TN04LONG" into "TN04LON" / "G".
    const valueLines: string[] = doc.getTextWidth(value) <= valueRoom + 0.5 ? [value] : doc.splitTextToSize(value, valueRoom);
    return { labelLines, valueLines, lines: Math.max(labelLines.length, valueLines.length) };
}
