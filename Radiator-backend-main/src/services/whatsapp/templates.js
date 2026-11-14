// Fixed English UTILITY templates (approved once per shop) and the builders for their send-time components.

export const TEMPLATE_NAMES = ["bill_document", "payment_receipt", "payment_receipt_document", "owner_daily_summary", "connection_test"];

// Meta rejects newlines, tabs and runs of 4+ spaces inside a body parameter, and empty values.
export function cleanParam(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "-";
}

export function money(n) {
  return `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// 05-Nov-2026 (IST), the way a bill date reads on paper (month names fixed: ICU spells September "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(d) {
  const date = d ? new Date(d) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  return `${String(ist.getUTCDate()).padStart(2, "0")}-${MONTHS[ist.getUTCMonth()]}-${ist.getUTCFullYear()}`;
}

const body = (...texts) => ({ type: "body", parameters: texts.map((t) => ({ type: "text", text: cleanParam(t) })) });

export function billDocumentComponents({ customer, word, company, date, total, balance, mediaId, filename }) {
  return [
    { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename: filename || "bill.pdf" } }] },
    body(customer, word, company, fmtDate(date), money(total), money(balance)),
  ];
}

// extra: e.g. "1st month installment, next due 20-Dec-2026", or "-".
function receiptBody({ company, amount, mode, ref, balance, extra }) {
  return body(company, money(amount), mode, ref, money(balance), extra || "-");
}

export function receiptComponents(r) {
  return [receiptBody(r)];
}

export function receiptDocumentComponents(r, mediaId, filename) {
  return [{ type: "header", parameters: [{ type: "document", document: { id: mediaId, filename: filename || "bill.pdf" } }] }, receiptBody(r)];
}

export function summaryComponents({ company, date, bills, billed, collected, pending, overdue }) {
  return [body(company, fmtDate(date), bills, money(billed), money(collected), money(pending), overdue == null ? "-" : money(overdue))];
}

export function connectionTestComponents({ company }) {
  return [body(company)];
}

// Templates whose header is a document: Meta approves them against an uploaded sample file (its handle).
export const DOC_TEMPLATES = ["bill_document", "payment_receipt_document"];
const docHeader = (handle) => ({ type: "HEADER", format: "DOCUMENT", ...(handle ? { example: { header_handle: [handle] } } : {}) });

// A one-page sample PDF ("Sample bill") for that upload: built by hand, so no PDF library is needed on the server.
export function samplePdf() {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // content stream, below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const text = "BT /F1 18 Tf 40 540 Td (Sample bill) Tj ET";
  objs[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const bodyDef = (text, examples) => ({ type: "BODY", text, example: { body_text: [examples] } });

// sampleHandle: the uploaded sample PDF for the document templates (see samplePdf / uploadSampleHandle).
export function templateDefs(sampleHandle = process.env.WHATSAPP_SAMPLE_DOC_HANDLE || "") {
  const receiptText = "Thank you for your payment to {{1}}. Received: {{2}}. Mode: {{3}}. For: {{4}}. Balance: {{5}}. Note: {{6}}. Thank you.";
  const receiptEx = ["Sri Murugan Tyres", "₹5,000", "UPI", "Challan 101", "₹10,000", "1st month installment, next due 20-Dec-2026"];
  return {
    bill_document: {
      name: "bill_document", category: "UTILITY", language: "en",
      components: [
        docHeader(sampleHandle),
        bodyDef("Dear {{1}}, your {{2}} from {{3}} dated {{4}} is attached. Total: {{5}}. Balance: {{6}}. Thank you.", ["Murugan", "bill", "Sri Murugan Tyres", "05-Nov-2026", "₹24,250", "₹0"]),
      ],
    },
    payment_receipt: { name: "payment_receipt", category: "UTILITY", language: "en", components: [bodyDef(receiptText, receiptEx)] },
    payment_receipt_document: { name: "payment_receipt_document", category: "UTILITY", language: "en", components: [docHeader(sampleHandle), bodyDef(receiptText, receiptEx)] },
    owner_daily_summary: {
      name: "owner_daily_summary", category: "UTILITY", language: "en",
      components: [bodyDef("Daily summary for {{1}} on {{2}}: {{3}} bills made today worth {{4}}. Received on them so far: {{5}}. Still due on them: {{6}}. Overdue installments (all challans): {{7}}. Thank you.", ["Sri Murugan Tyres", "05-Nov-2026", "6", "₹48,000", "₹30,000", "₹18,000", "₹4,400"])],
    },
    connection_test: {
      name: "connection_test", category: "UTILITY", language: "en",
      components: [bodyDef("This is a test message from {{1}}. WhatsApp billing is connected. Thank you.", ["Sri Murugan Tyres"])],
    },
  };
}
export const TEMPLATE_DEFS = templateDefs();

// Template approval as shown to the super admin and the company: APPROVED | PENDING | REJECTED | MISSING (+ reason).
export function templateStatuses(account) {
  const out = {};
  for (const name of TEMPLATE_NAMES) {
    const t = account?.templates?.[name];
    out[name] = t?.status ? { status: t.status, ...(t.reason ? { reason: t.reason } : {}) } : { status: "MISSING", ...(t?.reason ? { reason: t.reason } : {}) };
  }
  return out;
}
