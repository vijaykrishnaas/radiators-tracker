import crypto from "crypto";

// Meta WhatsApp Cloud API (Graph). Every function takes the account context { phoneNumberId, wabaId, token, appSecret }.
const TIMEOUT_MS = 15000;
const graph = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;

function waError(message, retryable) {
  const err = new Error(message);
  err.statusCode = 400;
  err.retryable = !!retryable;
  return err;
}

async function call(ctx, method, path, { json, form } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${graph()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${ctx.token}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : form,
      signal: ac.signal,
    });
  } catch (e) {
    throw waError(e?.name === "AbortError" ? "WhatsApp request timed out" : `Could not reach WhatsApp: ${e?.message || e}`, true);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const detail = data?.error?.error_user_msg || data?.error?.message;
    throw waError(detail || `WhatsApp API error (${res.status})`, res.status >= 500 || res.status === 429);
  }
  return data || {};
}

export async function testConnection(ctx) {
  const d = await call(ctx, "GET", `/${ctx.phoneNumberId}?fields=display_phone_number,verified_name`);
  return { displayPhone: d.display_phone_number || "", verifiedName: d.verified_name || "" };
}

export async function uploadDocument(ctx, buffer, filename) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename || "bill.pdf");
  const d = await call(ctx, "POST", `/${ctx.phoneNumberId}/media`, { form });
  if (!d.id) throw waError("WhatsApp did not return a media id", false);
  return d.id;
}

async function postMessage(ctx, payload) {
  const d = await call(ctx, "POST", `/${ctx.phoneNumberId}/messages`, { json: { messaging_product: "whatsapp", recipient_type: "individual", ...payload } });
  const id = d.messages?.[0]?.id;
  if (!id) throw waError("WhatsApp did not accept the message", false);
  return id;
}

export function sendTemplate(ctx, to, name, lang = "en", components = []) {
  return postMessage(ctx, { to, type: "template", template: { name, language: { code: lang }, components } });
}

export function sendText(ctx, to, body) {
  return postMessage(ctx, { to, type: "text", text: { body, preview_url: false } });
}

// A template with a DOCUMENT header is approved against a sample file, uploaded through the app's Resumable Upload
// API (POST /{app-id}/uploads opens a session; posting the bytes to it returns the handle "h").
export async function uploadSampleHandle(ctx, buffer, filename = "sample-bill.pdf") {
  if (!ctx.appId) throw waError("App ID is needed to upload the sample PDF", false);
  const q = new URLSearchParams({ file_name: filename, file_length: String(buffer.length), file_type: "application/pdf" });
  const session = await call(ctx, "POST", `/${ctx.appId}/uploads?${q}`);
  if (!session.id) throw waError("WhatsApp did not open an upload session", false);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${graph()}/${session.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${ctx.token}`, file_offset: "0" },
      body: buffer,
      signal: ac.signal,
    });
  } catch (e) {
    throw waError(`Could not upload the sample PDF: ${e?.message || e}`, true);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !data?.h) throw waError(data?.error?.message || `Sample PDF upload failed (${res.status})`, res.status >= 500);
  return data.h;
}

export async function createTemplate(ctx, def) {
  return call(ctx, "POST", `/${ctx.wabaId}/message_templates`, { json: def });
}

export async function listTemplates(ctx) {
  const d = await call(ctx, "GET", `/${ctx.wabaId}/message_templates?fields=name,status,rejected_reason&limit=100`);
  return (d.data || []).map((t) => ({ name: t.name, status: t.status, reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : "" }));
}

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(appSecret, rawBody)
export function verifyWebhook(ctx, rawBody, signatureHeader) {
  if (!ctx?.appSecret || !signatureHeader) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", ctx.appSecret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(String(signatureHeader));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const values = (json) => (json?.entry || []).flatMap((e) => (e.changes || []).map((c) => c.value).filter(Boolean));

// Every phone_number_id a delivery refers to (the route finds the account from it).
export function phoneNumberIds(json) {
  return [...new Set(values(json).map((v) => v.metadata?.phone_number_id).filter(Boolean))];
}

export function parseWebhook(json) {
  const statuses = [];
  const inbound = [];
  for (const v of values(json)) {
    const phoneNumberId = v.metadata?.phone_number_id || "";
    for (const s of v.statuses || []) {
      const e = s.errors?.[0];
      statuses.push({
        id: s.id,
        status: s.status,
        errorText: e ? [e.title || e.message, e.error_data?.details].filter(Boolean).join(": ") : "",
        timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
        phoneNumberId,
      });
    }
    for (const m of v.messages || []) inbound.push({ from: m.from, phoneNumberId });
  }
  return { statuses, inbound };
}
