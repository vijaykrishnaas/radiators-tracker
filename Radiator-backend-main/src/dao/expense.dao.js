import { connectDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import moment from "moment";
import { toClientId } from "../utils/tenant.js";
import { escapeRegex, toMoney, toCount, toValidDate } from "../utils/sanitize.js";

const COLLECTION = "expenses";

function buildExpenseQuery(clientId, { from = "", to = "", expenseType = "", search = "" } = {}) {
  const query = { clientId: toClientId(clientId) };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = moment(from).startOf("day").toDate();
    if (to) query.date.$lte = moment(to).endOf("day").toDate();
  }
  if (expenseType) query.expenseType = expenseType;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    query.$or = [{ reason: rx }, { "products.name": rx }];
  }
  return query;
}

// Validates + normalizes an expense at the boundary so NaN amounts / invalid
// dates can never persist (they would null out the tenant's $sum analytics).
function sanitizeExpense(data) {
  const clean = { ...data };
  clean.date = toValidDate(data.date, "date");
  if (data.expenseType === "materials") {
    const products = (data.products || []).map((p) => {
      const quantity = toCount(p.quantity, "quantity");
      const unitPrice = toMoney(p.unitPrice ?? 0, "unit price");
      return { name: p.name, quantity, unitPrice, amount: quantity * unitPrice };
    });
    clean.products = products;
    clean.amount = products.reduce((s, p) => s + p.amount, 0);
  } else {
    clean.amount = toMoney(data.amount ?? 0, "amount");
    // Always write an empty products array (not `delete`) so a $set update that
    // switches materials→others clears any stale product rows from the document.
    clean.products = [];
  }
  return clean;
}

export async function getExpenses(clientId, { from = "", to = "", expenseType = "", search = "" } = {}, page = 1, limit = 10) {
  const db = await connectDB();
  const query = buildExpenseQuery(clientId, { from, to, expenseType, search });
  const skip = (page - 1) * limit;

  const [expenses, totalRecords, [aggResult]] = await Promise.all([
    db.collection(COLLECTION).find(query).sort({ date: -1 }).skip(skip).limit(limit).toArray(),
    db.collection(COLLECTION).countDocuments(query),
    db.collection(COLLECTION).aggregate([
      { $match: query },
      { $group: { _id: null, periodTotal: { $sum: "$amount" } } },
    ]).toArray(),
  ]);

  return {
    expenses,
    totalRecords,
    totalPages: Math.ceil(totalRecords / limit) || 1,
    currentPage: page,
    periodTotal: aggResult?.periodTotal || 0,
  };
}

export async function getExpensesForExport(clientId, { from = "", to = "", expenseType = "", search = "" } = {}) {
  const db = await connectDB();
  const query = buildExpenseQuery(clientId, { from, to, expenseType, search });
  return db.collection(COLLECTION).find(query).sort({ date: -1 }).toArray();
}

export async function getExpenseAnalytics(clientId, { from = "", to = "" } = {}) {
  const db = await connectDB();
  const query = { clientId: toClientId(clientId) };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = moment(from).startOf("day").toDate();
    if (to) query.date.$lte = moment(to).endOf("day").toDate();
  }

  const [result] = await db.collection(COLLECTION).aggregate([
    { $match: query },
    {
      $facet: {
        totals: [{ $group: { _id: null, totalExpenses: { $sum: "$amount" } } }],
        byType: [
          { $group: { _id: "$expenseType", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
          { $project: { _id: 0, type: "$_id", count: 1, amount: 1 } },
          { $sort: { amount: -1 } },
        ],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
          { $project: { _id: 0, month: "$_id", count: 1, amount: 1 } },
          { $sort: { month: 1 } },
        ],
      },
    },
  ]).toArray();

  return {
    totalExpenses: result?.totals?.[0]?.totalExpenses || 0,
    byType: result?.byType || [],
    byMonth: result?.byMonth || [],
  };
}

export async function createExpense(clientId, data) {
  const db = await connectDB();
  // Never trust a clientId from the request body — always use the scoped one.
  const { clientId: _ignore, _id, ...rest } = data;
  const doc = { ...sanitizeExpense(rest), clientId: toClientId(clientId), createdAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { insertedId: result.insertedId };
}

export async function updateExpense(clientId, id, data) {
  const db = await connectDB();
  const cid = toClientId(clientId);
  const { clientId: _ignore, _id, ...rest } = data;
  const doc = sanitizeExpense(rest);
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id), clientId: cid },
    { $set: doc }
  );
  if (result.matchedCount === 0) throw new Error("Expense not found");
  return true;
}

export async function deleteExpense(clientId, id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id), clientId: toClientId(clientId) });
  if (result.deletedCount === 0) throw new Error("Expense not found");
  return true;
}
