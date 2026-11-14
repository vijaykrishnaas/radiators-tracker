import * as meta from "./meta.js";

// A provider module exports functions that all take the account context { phoneNumberId, wabaId, token, appSecret }:
//   testConnection(ctx) -> { displayPhone, verifiedName }
//   uploadDocument(ctx, buffer, filename) -> mediaId
//   sendTemplate(ctx, to, name, lang, components) -> providerMessageId
//   sendText(ctx, to, body) -> providerMessageId
//   createTemplate(ctx, def) / listTemplates(ctx) -> [{ name, status, reason }]
//   verifyWebhook(ctx, rawBody, signatureHeader) -> boolean
//   parseWebhook(json) -> { statuses: [{ id, status, errorText, timestamp }], inbound: [{ from, phoneNumberId }] }
// Errors carry .statusCode (400) and .retryable (network / 5xx / 429).
const PROVIDERS = { meta };

export function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) {
    const err = new Error(`Unknown WhatsApp provider "${name}"`);
    err.statusCode = 400;
    throw err;
  }
  return p;
}
