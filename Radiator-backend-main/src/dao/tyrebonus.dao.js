// Tyre-vertical mechanic + labour bonus. Same flat model as the automobile / engineering bonus (kept in its own file so
// their code is not touched): each role gets settings.tyre.bonus.<role>Percent of the challan's TYRE amount (after any
// discount; installment interest is never part of it), or a fixed <role>Amount per challan when <role>Mode is
// "amount". It becomes payable in step with collection of the tyre amount: payable = accrued × received ÷ tyre amount
// (capped at 1), so interest is ignored on both sides and the bonus is fully ready once the tyre price is paid, even
// while interest is still owed. Labour's share is split equally among the challan's workers. Entries live in the shared "bonuses" collection, so the existing pending / payout /
// adjust / manual endpoints work unchanged.
import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { getSettings } from "./settings.dao.js";
import { toClientId } from "../utils/tenant.js";
import { yearKey, SETTLED } from "./bonus.dao.js";

const COLLECTION = "bonuses";
const round2 = (n) => Math.round(n * 100) / 100;
const dayKey = (d) => moment(d).format("YYYY-MM-DD");

export function computeTyreRoleBonus(bill, role, settings) {
  const cfg = settings?.tyre?.bonus || {};
  // Settings are saved without server-side checks, so clamp here: 0–100 %, and a fixed amount of 0–₹10,00,000.
  const fixed = cfg[`${role}Mode`] === "amount";
  const percent = Math.min(Math.max(Number(cfg[`${role}Percent`]) || 0, 0), 100);
  const perBill = Math.min(Math.max(Number(cfg[`${role}Amount`]) || 0, 0), 1_000_000);

  const tyreAmount = Math.max(Number(bill.tyreAmount) || 0, 0);
  const discount = Math.max(Number(bill.discount) || 0, 0);
  const base = Math.max(tyreAmount - discount, 0);
  const received = Math.min(Math.max(Number(bill.receivedAmount) || 0, 0), base);
  const ratio = base > 0 ? Math.min(received / base, 1) : 0;
  const accrued = fixed ? (base > 0 ? perBill : 0) : (base * percent) / 100;
  return { accrued: round2(accrued), payable: round2(accrued * ratio), totalAmount: base, received };
}

// One person's entry for one challan. Before any payout it carries the whole bonus. A payout made part-way through
// collection is settlement history and is never rewritten; the bonus earned after it (e.g. the next installments
// coming in) goes on a new pending "rest" entry for the same person, so the full bonus is paid once the tyre price is
// collected. A cancelled payout, or a payout made to someone who is no longer on the challan, stays closed as before.
async function syncEntry(collection, key, name, calc, period, base) {
  const settled = await collection.find({ ...key, status: { $in: SETTLED } }).toArray();
  let fields = { accruedAmount: calc.accrued, payableAmount: calc.payable, billAmount: calc.totalAmount, receivedAmount: calc.received };
  if (settled.length) {
    if (settled.some((d) => d.status !== "paid" || d.beneficiary !== name)) {
      await collection.deleteMany({ ...key, status: "pending" });
      return;
    }
    // A part payout settled only what it paid: its "earned" is trimmed to that (the amount paid is never touched), and
    // the rest entry carries the bonus still to come plus the money collected since. Each person's earned / ready /
    // paid / collected totals on the bonus pages then add up, counted once, in both the Pending and All views.
    for (const d of settled) {
      const paid = round2(Number(d.paidAmount) || 0);
      if ((Number(d.accruedAmount) || 0) > paid) {
        await collection.updateOne({ _id: d._id, status: "paid" }, { $set: { accruedAmount: paid, payableAmount: paid } });
        d.accruedAmount = paid;
      }
    }
    const sum = (f) => settled.reduce((t, d) => t + (Number(d[f]) || 0), 0);
    const accrued = round2(Math.max(calc.accrued - sum("accruedAmount"), 0));
    const payable = round2(Math.max(calc.payable - sum("paidAmount"), 0));
    if (accrued <= 0 && payable <= 0) {
      await collection.deleteMany({ ...key, status: "pending" });
      return;
    }
    fields = {
      accruedAmount: accrued,
      payableAmount: payable,
      billAmount: round2(Math.max(calc.totalAmount - sum("billAmount"), 0)),
      receivedAmount: round2(Math.max(calc.received - sum("receivedAmount"), 0)),
      rest: true,
    };
  }
  await collection.updateOne(
    { ...key, status: "pending" },
    { $set: { ...base, beneficiary: name, period, ...fields }, $setOnInsert: { type: key.type, status: "pending", createdAt: new Date() } },
    { upsert: true }
  );
}

// Upserts the challan's entries (one mechanic + one per labour name).
export async function syncTyreBonusesForRecord(clientId, bill) {
  if (!bill?._id) return;
  const db = await connectDB();
  const collection = db.collection(COLLECTION);
  const settings = await getSettings(clientId);
  const cid = toClientId(clientId);
  const recordId = new ObjectId(bill._id);
  const base = { clientId: cid, recordId, billDate: new Date(bill.billDate), updatedAt: new Date() };

  // ---- Mechanic ----
  if (!bill.mechanicName) {
    await collection.deleteMany({ clientId: cid, recordId, type: "mechanic", status: "pending" });
  } else {
    await syncEntry(collection, { clientId: cid, recordId, type: "mechanic" }, bill.mechanicName,
      computeTyreRoleBonus(bill, "mechanic", settings), yearKey(bill.billDate, settings?.tyre?.bonus?.yearStartMonth || 4), base);
  }

  // ---- Labour (equal split) ----
  const names = Array.isArray(bill.labourName) ? bill.labourName.filter(Boolean) : [];
  await collection.deleteMany({ clientId: cid, recordId, type: "labour", status: "pending", beneficiary: { $nin: names } });
  const l = computeTyreRoleBonus(bill, "labour", settings);
  const share = names.length || 1;
  const each = { ...l, accrued: round2(l.accrued / share), payable: round2(l.payable / share) };
  for (const name of names) {
    await syncEntry(collection, { clientId: cid, recordId, type: "labour", beneficiary: name }, name, each, dayKey(bill.billDate), base);
  }
}

// Backfills entries from existing challans (e.g. after the bonus % is first set).
export async function backfillTyre(clientId, fromDate = "", toDate = "") {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (fromDate || toDate) {
    query.billDate = {};
    if (fromDate) query.billDate.$gte = moment(fromDate).startOf("day").toDate();
    if (toDate) query.billDate.$lte = moment(toDate).endOf("day").toDate();
  }
  const bills = await db.collection("tyrebills").find(query).toArray();
  for (const bill of bills) await syncTyreBonusesForRecord(clientId, bill);
  return bills.length;
}

// Review data for one mechanic / labour over a date range, shaped like the radiator review so the existing review
// page renders it: tyre lines as "services", brands as the "product" breakdown.
export async function getTyreReviewData(clientId, type, name, fromDate, toDate, settings) {
  const diffDays = moment(toDate).diff(moment(fromDate), "days");
  const granularity = diffDays > 90 ? "monthly" : diffDays > 31 ? "weekly" : "daily";
  const db = await connectDB();
  const bills = await db
    .collection("tyrebills")
    .find({
      clientId: toClientId(clientId),
      ...(type === "mechanic" ? { mechanicName: name } : { labourName: name }),
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
  const role = type === "mechanic" ? "mechanic" : "labour";
  const timelineMap = new Map();
  const byBrand = new Map();
  const byPayment = new Map();
  let totalRevenue = 0;
  let totalCollected = 0;
  let totalOperations = 0;
  let suggestedBonus = 0;

  const outBills = bills.map((b) => {
    const calc = computeTyreRoleBonus(b, role, settings);
    const share = role === "labour" ? (Array.isArray(b.labourName) ? b.labourName.filter(Boolean).length : 0) || 1 : 1;
    suggestedBonus += calc.payable / share;
    const amount = Number(b.payableTotal) || 0;
    totalRevenue += amount;
    totalCollected += Number(b.receivedAmount) || 0;
    const k = keyFor(b.billDate);
    const t = timelineMap.get(k) || { date: k, count: 0, revenue: 0 };
    t.count += 1;
    t.revenue += amount;
    timelineMap.set(k, t);

    const payKey = b.paymentType === "installment" ? "Installments" : "Full payment";
    const p = byPayment.get(payKey) || { type: payKey, count: 0, revenue: 0 };
    p.count += 1;
    p.revenue += amount;
    byPayment.set(payKey, p);

    const services = (b.items || []).map((i) => {
      totalOperations += Number(i.qty) || 0;
      const brand = byBrand.get(i.brandLabel) || { product: i.brandLabel, count: 0, revenue: 0 };
      brand.count += Number(i.qty) || 0;
      brand.revenue += Number(i.amount) || 0;
      byBrand.set(i.brandLabel, brand);
      return { type: `${i.particulars}${Number(i.qty) > 1 ? ` × ${i.qty}` : ""}`, price: Number(i.amount) || 0 };
    });
    return {
      billDate: b.billDate,
      truckNumber: String(b.vehicleNumber || "").toUpperCase(),
      services,
      totalAmount: amount,
      receivedAmount: Number(b.receivedAmount) || 0,
    };
  });

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
    byServiceType: [...byPayment.values()],
    byProductType: [...byBrand.values()],
    timeline: filled,
    bills: outBills,
  };
}
