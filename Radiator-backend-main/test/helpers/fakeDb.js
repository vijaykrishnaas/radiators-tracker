// Minimal in-memory Mongo-like fake used to exercise the REAL engbill.dao.js
// exported functions (createEngBill, updateEngBill, recordEngPayment, ...)
// against fake collections, without a live MongoDB connection.
import { ObjectId } from "mongodb";

function matches(doc, query) {
  return Object.entries(query).every(([key, val]) => {
    const docVal = doc[key];
    if (val && typeof val === "object" && !(val instanceof ObjectId)) {
      if ("$exists" in val) {
        const has = Object.prototype.hasOwnProperty.call(doc, key) && docVal !== undefined;
        return val.$exists ? has : !has;
      }
      // only equality is used elsewhere by these DAOs' queries
      return String(docVal) === String(val);
    }
    if (val instanceof ObjectId || docVal instanceof ObjectId) {
      return String(docVal) === String(val);
    }
    return docVal === val;
  });
}

// Tiny evaluator for the one aggregation-pipeline update used by nextBillNo:
// [{ $set: { engbill: { $add: [{ $max: [{ $ifNull: ["$engbill", 0] }, start-1] }, 1] } } }]
function evalExpr(expr, doc) {
  if (expr && typeof expr === "object" && !Array.isArray(expr)) {
    if ("$ifNull" in expr) {
      const [field, fallback] = expr.$ifNull;
      const v = evalExpr(field, doc);
      return v == null ? evalExpr(fallback, doc) : v;
    }
    if ("$max" in expr) {
      return Math.max(...expr.$max.map((e) => evalExpr(e, doc)));
    }
    if ("$add" in expr) {
      return expr.$add.reduce((sum, e) => sum + evalExpr(e, doc), 0);
    }
    throw new Error("Unsupported expr: " + JSON.stringify(expr));
  }
  if (typeof expr === "string" && expr.startsWith("$")) {
    return doc[expr.slice(1)];
  }
  return expr;
}

function applyPipelineUpdate(doc, pipeline) {
  const next = { ...doc };
  for (const stage of pipeline) {
    if (stage.$set) {
      for (const [k, expr] of Object.entries(stage.$set)) {
        next[k] = evalExpr(expr, next);
      }
    }
  }
  return next;
}

class FakeCollection {
  constructor() {
    this.docs = [];
  }

  async insertOne(doc) {
    const _id = doc._id || new ObjectId();
    const stored = { ...doc, _id };
    this.docs.push(stored);
    return { insertedId: _id, acknowledged: true };
  }

  async findOne(query) {
    return this.docs.find((d) => matches(d, query)) || null;
  }

  find(query) {
    let results = this.docs.filter((d) => matches(d, query));
    let projectFields = null;
    const api = {
      sort(spec) {
        const keys = Object.entries(spec);
        results = [...results].sort((a, b) => {
          for (const [k, dir] of keys) {
            const av = a[k];
            const bv = b[k];
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
          }
          return 0;
        });
        return api;
      },
      skip(n) {
        results = results.slice(n);
        return api;
      },
      limit(n) {
        results = results.slice(0, n);
        return api;
      },
      project(fields) {
        projectFields = fields;
        return api;
      },
      async toArray() {
        if (!projectFields) return results;
        return results.map((r) => {
          const out = {};
          for (const k of Object.keys(projectFields)) out[k] = r[k];
          return out;
        });
      },
    };
    return api;
  }

  async countDocuments(query) {
    return this.docs.filter((d) => matches(d, query)).length;
  }

  async updateOne(query, update) {
    const idx = this.docs.findIndex((d) => matches(d, query));
    if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) this.docs[idx] = { ...this.docs[idx], ...update.$set };
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    let modifiedCount = 0;
    this.docs = this.docs.map((d) => {
      if (!matches(d, query)) return d;
      modifiedCount++;
      return update.$set ? { ...d, ...update.$set } : d;
    });
    return { matchedCount: modifiedCount, modifiedCount };
  }

  async deleteOne(query) {
    const idx = this.docs.findIndex((d) => matches(d, query));
    if (idx === -1) return { deletedCount: 0 };
    this.docs.splice(idx, 1);
    return { deletedCount: 1 };
  }

  async findOneAndUpdate(query, update, opts = {}) {
    let idx = this.docs.findIndex((d) => matches(d, query));
    let doc;
    if (idx === -1) {
      if (!opts.upsert) return { value: null };
      doc = { _id: query._id };
      this.docs.push(doc);
      idx = this.docs.length - 1;
    } else {
      doc = this.docs[idx];
    }
    const updated = Array.isArray(update) ? applyPipelineUpdate(doc, update) : { ...doc, ...(update.$set || {}) };
    this.docs[idx] = updated;
    // Mimic mongodb driver v7: findOneAndUpdate resolves to the document itself.
    return updated;
  }

  aggregate() {
    throw new Error("aggregate() not implemented in fakeDb");
  }
}

export class FakeDb {
  constructor() {
    this.collections = {};
  }
  collection(name) {
    if (!this.collections[name]) this.collections[name] = new FakeCollection();
    return this.collections[name];
  }
}
