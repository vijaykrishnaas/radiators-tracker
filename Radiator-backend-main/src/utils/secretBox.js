import crypto from "crypto";

// AES-256-GCM box for secrets stored in the database (WhatsApp tokens). The key lives only in the
// environment (WHATSAPP_ENC_KEY): 32 bytes as 64 hex characters or base64. Format: v1:<iv>:<tag>:<data> (base64).

const configError = (message) => Object.assign(new Error(message), { statusCode: 400 });

function loadKey() {
  const raw = String(process.env.WHATSAPP_ENC_KEY || "").trim();
  if (!raw) throw configError("WHATSAPP_ENC_KEY is not set (generate one with: openssl rand -hex 32)");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw configError("WHATSAPP_ENC_KEY must be 32 bytes (64 hex characters or base64)");
  return key;
}

export function encryptSecret(plain) {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(box) {
  const key = loadKey();
  const [v, iv, tag, data] = String(box || "").split(":");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("Stored secret is not in a readable format");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored secret could not be decrypted (wrong WHATSAPP_ENC_KEY or tampered data)");
  }
}
