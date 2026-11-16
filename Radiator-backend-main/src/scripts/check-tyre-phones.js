// Read-only report: delivery challans whose phone number is not a valid 10-digit Indian mobile, so WhatsApp can't
// reach them. Before November 2026 the challan form could cut a pasted "+91 ..." or "0..." number short; the lost
// digits can't be worked out, so the shop has to correct these by hand. Nothing is changed.
//
//   npm run check:tyre-phones
//
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { connectDB } = await import("../config/db.js");
const { toWaNumber } = await import("../utils/waPhone.js");

async function run() {
  const db = await connectDB();
  const clients = new Map((await db.collection("clients").find({}).toArray()).map((c) => [String(c._id), c.name || c.code || String(c._id)]));
  const bills = await db.collection("tyrebills").find({ phoneNumber: { $nin: [null, ""] } }).project({ clientId: 1, billNo: 1, customerName: 1, phoneNumber: 1 }).sort({ clientId: 1, billNo: 1 }).toArray();
  const bad = bills.filter((b) => !toWaNumber(b.phoneNumber));
  for (const b of bad) console.log(`${clients.get(String(b.clientId)) || b.clientId}\tD.C. ${b.billNo}\t${b.customerName || ""}\t${b.phoneNumber}`);
  console.log(`\n${bad.length} of ${bills.length} challans with a phone number need it corrected.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("[check-tyre-phones] FAILED:", err);
  process.exit(1);
});
