// Engineering-works mechanic bonus. Mirrors the automobile flat-% model in bonus.dao.js (kept in its own file so the
// radiator / automobile bonus code is not touched): bonus = settings.engineering.bonus.mechanicPercent of the bill's
// net (post-discount) total, payable in proportion to the amount collected, settled per financial year. Entries live
// in the shared "bonuses" collection, so the existing pending/payout/adjust/manual endpoints work unchanged.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { yearKey } from "./bonus.dao.js";

const COLLECTION = "bonuses";
const round2 = (n) => Math.round(n * 100) / 100;

export function computeEngMechanicBonus(bill, settings) {
  const percent = Number(settings?.engineering?.bonus?.mechanicPercent || 0);
  const gross = Number.isFinite(Number(bill.total)) ? Number(bill.total) : 0;
  const discount = Math.max(Number(bill.discount || 0), 0);
  const net = Number.isFinite(Number(bill.netTotal)) ? Number(bill.netTotal) : Math.max(gross - discount, 0);
  const received = Math.min(Math.max(Number(bill.amountReceived) || 0, 0), net);
  const ratio = net > 0 ? Math.min(received / net, 1) : 0;
  const accrued = (net * percent) / 100;
  return { accrued: round2(accrued), payable: round2(accrued * ratio), totalAmount: net, received };
}

// Upserts the bill's mechanic entry. A paid entry is a settlement record and is never rewritten.
export async function syncEngBonusesForRecord(clientId, bill) {
  if (!bill?._id) return;
  const db = await connectDB();
  const collection = db.collection(COLLECTION);
  if (!bill.mechanic) {
    // Mechanic cleared on an edit: drop the pending entry (paid history stays).
    await collection.deleteMany({ clientId: toClientId(clientId), recordId: new ObjectId(bill._id), type: "mechanic", status: "pending" });
    return;
  }
  const settings = await getSettings(clientId);
  const cid = toClientId(clientId);
  const recordId = new ObjectId(bill._id);

  const paid = await collection.findOne({ clientId: cid, recordId, type: "mechanic", status: "paid" });
  if (paid) return;

  const calc = computeEngMechanicBonus(bill, settings);
  await collection.updateOne(
    { clientId: cid, recordId, type: "mechanic", status: "pending" },
    {
      $set: {
        clientId: cid,
        recordId,
        billDate: new Date(bill.billDate),
        updatedAt: new Date(),
        beneficiary: bill.mechanic,
        period: yearKey(bill.billDate, settings?.engineering?.fyStartMonth || 4),
        accruedAmount: calc.accrued,
        payableAmount: calc.payable,
        billAmount: calc.totalAmount,
        receivedAmount: calc.received,
      },
      $setOnInsert: { type: "mechanic", status: "pending", createdAt: new Date() },
    },
    { upsert: true }
  );
}

// Backfills entries from existing engineering bills (e.g. after the bonus % is first set).
export async function backfillEng(clientId, fromDate = "", toDate = "") {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  const bills = await db.collection("engbills").find(query).toArray();
  for (const bill of bills) await syncEngBonusesForRecord(clientId, bill);
  return bills.length;
}

const emptyReview = (granularity = "daily") => ({
  granularity,
  summary: { totalBills: 0, totalOperations: 0, totalRevenue: 0, totalCollected: 0, collectionRate: 0, suggestedBonus: 0 },
  byServiceType: [],
  byProductType: [],
  timeline: [],
  bills: [],
});

// Review data for one mechanic over a date range, shaped like the radiator review so the existing page renders it.
// Engineering has no labour role, so a labour review is empty.
export async function getEngReviewData(clientId, type, name, fromDate, toDate, settings) {
  const diffDays = moment(toDate).diff(moment(fromDate), "days");
  const granularity = diffDays > 90 ? "monthly" : diffDays > 31 ? "weekly" : "daily";
  if (type !== "mechanic") return emptyReview(granularity);

  const db = await connectDB();
  const bills = await db
    .collection("engbills")
    .find({
      clientId: toClientId(clientId),
      mechanic: name,
      billDate: { $gte: moment(fromDate).startOf("day").toDate(), $lte: moment(toDate).endOf("day").toDate() },
    })
    .toArray();
  bills.sort((a, b) => new Date(b.billDate) - new Date(a.billDate));

  const keyFor = (d) => {
    const m = moment(d);
    if (granularity === "monthly") return m.format("YYYY-MM");
    if (granularity === "weekly") return m.startOf("isoWeek").format("YYYY-MM-DD");
    return m.format("YYYY-MM-DD");
  };

  const timelineMap = new Map();
  const byType = new Map();
  const byBs = new Map();
  let totalRevenue = 0;
  let totalCollected = 0;
  let totalOperations = 0;
  let suggestedBonus = 0;

  const outBills = bills.map((b) => {
    const calc = computeEngMechanicBonus(b, settings);
    suggestedBonus += calc.payable;
    totalRevenue += Number(b.total) || 0;
    totalCollected += Number(b.amountReceived) || 0;
    const k = keyFor(b.billDate);
    const t = timelineMap.get(k) || { date: k, count: 0, revenue: 0 };
    t.count += 1;
    t.revenue += Number(b.total) || 0;
    timelineMap.set(k, t);

    const services = [];
    for (const s of b.services || []) {
      const typeKey = s.typeLabel || s.type;
      const ts = byType.get(typeKey) || { type: typeKey, count: 0, revenue: 0 };
      ts.count += 1;
      ts.revenue += Number(s.subtotal) || 0;
      byType.set(typeKey, ts);
      if (s.bsModel) {
        const bs = byBs.get(s.bsModel) || { product: s.bsModel.toUpperCase(), count: 0, revenue: 0 };
        bs.count += 1;
        bs.revenue += Number(s.subtotal) || 0;
        byBs.set(s.bsModel, bs);
      }
      for (const i of s.items || []) {
        totalOperations += 1;
        services.push({
          type: i.label || i.item,
          price: Number(i.amount) || 0,
          ...(i.requiresComment && i.comment ? { comments: i.comment } : {}),
        });
      }
    }
    return {
      billDate: b.billDate,
      truckNumber: b.vehicleNo,
      services,
      totalAmount: Number(b.netTotal) || 0,
      receivedAmount: Number(b.amountReceived) || 0,
    };
  });

  // Gap-fill the timeline so charts show empty days/weeks/months.
  const filled = [];
  const unit = granularity === "monthly" ? "month" : granularity === "weekly" ? "week" : "day";
  const startUnit = granularity === "monthly" ? "month" : granularity === "weekly" ? "isoWeek" : "day";
  let cur = moment(fromDate).startOf(startUnit);
  const end = moment(toDate).startOf(startUnit);
  while (cur.isSameOrBefore(end)) {
    const key = cur.format(granularity === "monthly" ? "YYYY-MM" : "YYYY-MM-DD");
    filled.push(timelineMap.get(key) || { date: key, count: 0, revenue: 0 });
    cur = cur.clone().add(1, unit);
  }

  return {
    granularity,
    summary: {
      totalBills: bills.length,
      totalOperations,
      totalRevenue: round2(totalRevenue),
      totalCollected: round2(totalCollected),
      collectionRate: totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 1000) / 10 : 0,
      suggestedBonus: round2(suggestedBonus),
    },
    byServiceType: [...byType.values()],
    byProductType: [...byBs.values()],
    timeline: filled,
    bills: outBills,
  };
}
