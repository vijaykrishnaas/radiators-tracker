import { GridFSBucket } from "mongodb";
import { connectDB } from "../config/db.js";
import { toClientId } from "../utils/tenant.js";

// Generic per-client image asset store backed by GridFS. Two buckets are used:
//   "logos"   — the business logo
//   "qrcodes" — the payment QR printed on invoices

async function bucketOf(name) {
  const db = await connectDB();
  return new GridFSBucket(db, { bucketName: name });
}

export async function saveAsset(bucketName, clientId, buffer, contentType) {
  const cid = toClientId(clientId);
  await deleteAsset(bucketName, cid);
  const b = await bucketOf(bucketName);
  return new Promise((resolve, reject) => {
    const stream = b.openUploadStream(String(cid), { metadata: { clientId: cid, contentType } });
    stream.on("error", reject);
    stream.on("finish", () => resolve(stream.id));
    stream.end(buffer);
  });
}

export async function findAssetFile(bucketName, clientId) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const files = await db
    .collection(`${bucketName}.files`)
    .find({ "metadata.clientId": cid })
    .sort({ uploadDate: -1 })
    .limit(1)
    .toArray();
  return files[0] || null;
}

export async function streamAsset(bucketName, clientId, res) {
  const file = await findAssetFile(bucketName, clientId);
  if (!file) return false;
  const b = await bucketOf(bucketName);
  res.set("Content-Type", file.metadata?.contentType || "image/png");
  res.set("Cache-Control", "public, max-age=300");
  b.openDownloadStream(file._id).pipe(res);
  return true;
}

export async function deleteAsset(bucketName, clientId) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const b = await bucketOf(bucketName);
  const files = await db.collection(`${bucketName}.files`).find({ "metadata.clientId": cid }).toArray();
  for (const f of files) {
    try {
      await b.delete(f._id);
    } catch {
      /* already gone */
    }
  }
}

// --- Convenience wrappers (preserve existing call sites) ---
export const saveLogo = (clientId, buffer, contentType) => saveAsset("logos", clientId, buffer, contentType);
export const streamLogo = (clientId, res) => streamAsset("logos", clientId, res);
export const deleteLogo = (clientId) => deleteAsset("logos", clientId);

export const saveQr = (clientId, buffer, contentType) => saveAsset("qrcodes", clientId, buffer, contentType);
export const streamQr = (clientId, res) => streamAsset("qrcodes", clientId, res);
export const deleteQr = (clientId) => deleteAsset("qrcodes", clientId);
