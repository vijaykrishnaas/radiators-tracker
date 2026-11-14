import { BSON } from "mongodb";
import { connectDB } from "../config/db.js";
import { assertClientId, toClientId } from "../utils/tenant.js";

const { EJSON } = BSON;

// A company's data, grouped into the sections the super admin can tick. Only these collections are ever read or
// written here: a backup file can't name any other collection.
export const BACKUP_SECTIONS = {
  bills: { label: "Bills and challans", collections: ["radiators", "autobills", "engbills", "tyrebills"] },
  inventory: { label: "Stock purchases", collections: ["stockentries"] },
  bonuses: { label: "Bonuses", collections: ["bonuses"] },
  expenses: { label: "Expenses", collections: ["expenses"] },
  salary: { label: "Salary (employees, attendance, advances, settled periods)", collections: ["employees", "attendance", "advances", "salaryPeriods"] },
  settings: { label: "Settings and bill numbering", collections: ["settings", "counters"] },
};
export const BACKUP_FORMAT = "svr-company-backup";
const BACKUP_VERSION = 1;

// settings and counters are one document per company, keyed by the company id; the rest carry a clientId field.
const KEYED_BY_ID = new Set(["settings", "counters"]);
// Sections whose records only make sense for the company type they were made in.
const TYPE_BOUND = new Set(["bills", "inventory", "bonuses", "settings"]);

const pickSections = (sections) => {
  const list = (Array.isArray(sections) ? sections : String(sections || "").split(",")).map((s) => String(s).trim()).filter(Boolean);
  const bad = list.filter((s) => !BACKUP_SECTIONS[s]);
  if (bad.length) throw Object.assign(new Error(`Unknown section: ${bad.join(", ")}`), { statusCode: 400 });
  if (!list.length) throw Object.assign(new Error("Choose at least one section"), { statusCode: 400 });
  return [...new Set(list)];
};

const filterFor = (coll, cid) => (KEYED_BY_ID.has(coll) ? { _id: cid } : { clientId: cid });

/** Record counts per section, for the export dialog. */
export async function backupSummary(clientId) {
  assertClientId(clientId);
  const cid = toClientId(clientId);
  const db = await connectDB();
  const out = {};
  for (const [key, s] of Object.entries(BACKUP_SECTIONS)) {
    let n = 0;
    for (const coll of s.collections) n += await db.collection(coll).countDocuments(filterFor(coll, cid));
    out[key] = { label: s.label, count: n };
  }
  return out;
}

/**
 * One file with the chosen sections. Values are Extended JSON (ids and dates keep their type), so the file can be
 * read back by importBackup without losing anything.
 */
export async function exportBackup(clientId, client, sections) {
  assertClientId(clientId);
  const cid = toClientId(clientId);
  const chosen = pickSections(sections);
  const db = await connectDB();
  const data = {};
  for (const key of chosen) {
    for (const coll of BACKUP_SECTIONS[key].collections) {
      data[coll] = EJSON.serialize(await db.collection(coll).find(filterFor(coll, cid)).toArray(), { relaxed: true });
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    company: { name: client?.name || "", code: client?.code || "", businessType: client?.businessType || "" },
    sections: chosen,
    data,
  };
}

/** What a backup file holds, per section, before anything is imported. */
export function describeBackup(backup) {
  if (!backup || backup.format !== BACKUP_FORMAT) {
    throw Object.assign(new Error("This is not a company backup file"), { statusCode: 400 });
  }
  if (backup.version !== BACKUP_VERSION) {
    throw Object.assign(new Error(`Unsupported backup version ${backup.version}`), { statusCode: 400 });
  }
  const sections = {};
  for (const key of backup.sections || []) {
    if (!BACKUP_SECTIONS[key]) continue;
    sections[key] = {
      label: BACKUP_SECTIONS[key].label,
      count: BACKUP_SECTIONS[key].collections.reduce((n, c) => n + (Array.isArray(backup.data?.[c]) ? backup.data[c].length : 0), 0),
    };
  }
  return { company: backup.company || {}, exportedAt: backup.exportedAt, sections };
}

// Bill collections that carry a running number, and the counter each draws from.
const NUMBERED = { autobills: "autobill", engbills: "engbill", tyrebills: "tyrebill" };

const nameKey = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");

// The company the file was exported from: any record's clientId (or the settings / counters id).
const sourceCompanyId = (data) => {
  for (const [coll, docs] of Object.entries(data || {})) {
    const d = Array.isArray(docs) ? docs[0] : null;
    if (!d) continue;
    const id = KEYED_BY_ID.has(coll) ? d._id : d.clientId;
    if (id) return String(id.$oid || id);
  }
  return "";
};

/**
 * Adds the backup's records to a company and never overwrites: a record whose id is already in the database is
 * left as it is. Everything imported is re-tagged with the target company.
 *
 * Restoring into the SAME company keeps every number as it was. Moving into ANOTHER company (e.g. a company's
 * staging data into its production company, which already has bills of its own):
 *  - imported bills are renumbered after the company's last number, in their original order, and keep their old
 *    number as `importedBillNo` (searchable); the company's own bills and numbering are untouched;
 *  - an imported employee whose name matches one of the company's employees is the same person: their
 *    attendance, advances and settled periods are attached to that employee (a day or period the employee already
 *    has is left as it is);
 *  - the company's settings and numbering are never replaced.
 */
export async function importBackup(clientId, client, backup, sections) {
  assertClientId(clientId);
  const cid = toClientId(clientId);
  describeBackup(backup);
  const chosen = pickSections(sections);
  const missing = chosen.filter((s) => !(backup.sections || []).includes(s));
  if (missing.length) {
    throw Object.assign(new Error(`The file has no ${missing.map((s) => BACKUP_SECTIONS[s].label).join(", ")}`), { statusCode: 400 });
  }
  const fromType = backup.company?.businessType || "";
  const toType = client?.businessType || "";
  const typeBound = chosen.filter((s) => TYPE_BOUND.has(s));
  if (fromType && toType && fromType !== toType && typeBound.length) {
    throw Object.assign(new Error(
      `The backup is from ${/^[aeiou]/.test(fromType) ? "an" : "a"} ${fromType} company and this one is ${toType}: ${typeBound.map((s) => BACKUP_SECTIONS[s].label).join(", ")} can't be imported into it`
    ), { statusCode: 400 });
  }
  const sameCompany = sourceCompanyId(backup.data) === String(cid);

  const db = await connectDB();
  const results = {};
  const employeeMap = new Map(); // backup employee id -> this company's employee id (matched by name)
  const insert = async (c, doc, r) => {
    try {
      await c.insertOne(doc);
      r.added += 1;
    } catch (e) {
      if (e?.code === 11000) r.alreadyThere += 1; // a unique index already holds this record
      else throw e;
    }
  };
  for (const key of chosen) {
    const r = { added: 0, alreadyThere: 0, otherCompany: 0, renumbered: 0, matched: 0 };
    for (const coll of BACKUP_SECTIONS[key].collections) {
      const docs = EJSON.deserialize(Array.isArray(backup.data?.[coll]) ? backup.data[coll] : [], { relaxed: true });
      const c = db.collection(coll);
      if (coll === "counters") {
        // A restore keeps the higher of each number. Another company's numbering never comes across: imported bills
        // are renumbered into this company's own sequence instead.
        if (!docs.length || !sameCompany) continue;
        const cur = (await c.findOne({ _id: cid })) || {};
        const next = {};
        for (const [k, v] of Object.entries(docs[0])) {
          if (k !== "_id" && typeof v === "number") next[k] = Math.max(v, typeof cur[k] === "number" ? cur[k] : 0);
        }
        if (Object.keys(next).length) await c.updateOne({ _id: cid }, { $set: next }, { upsert: true });
        continue;
      }
      if (coll === "settings") {
        if (!docs.length) continue;
        if (await c.findOne({ _id: cid })) { r.alreadyThere += 1; continue; }
        await c.insertOne({ ...docs[0], _id: cid, businessType: toType || docs[0].businessType });
        r.added += 1;
        continue;
      }

      // Records not yet in the database (by id); the rest are counted and left alone.
      const fresh = [];
      for (const doc of docs) {
        if (!doc || !doc._id) continue;
        const existing = await c.findOne({ _id: doc._id });
        if (!existing) { fresh.push(doc); continue; }
        if (String(existing.clientId) === String(cid)) r.alreadyThere += 1;
        else r.otherCompany += 1;
      }

      if (NUMBERED[coll] && !sameCompany && fresh.length) {
        const counterKey = NUMBERED[coll];
        const counter = (await db.collection("counters").findOne({ _id: cid })) || {};
        const own = await c.find({ clientId: cid }).toArray();
        let next = Math.max(Number(counter[counterKey]) || 0, ...own.map((b) => Number(b.billNo) || 0));
        fresh.sort((a, b) => (Number(a.billNo) || 0) - (Number(b.billNo) || 0) || new Date(a.billDate) - new Date(b.billDate));
        for (const doc of fresh) {
          next += 1;
          await insert(c, { ...doc, clientId: cid, billNo: next, ...(doc.billNo != null ? { importedBillNo: doc.billNo } : {}) }, r);
          r.renumbered += 1;
        }
        await db.collection("counters").updateOne({ _id: cid }, { $set: { [counterKey]: next } }, { upsert: true });
        continue;
      }

      if (coll === "employees" && !sameCompany) {
        const own = await c.find({ clientId: cid }).toArray();
        const byName = new Map(own.map((e) => [nameKey(e.name), e._id]));
        for (const doc of fresh) {
          const match = byName.get(nameKey(doc.name));
          if (match) { employeeMap.set(String(doc._id), match); r.matched += 1; continue; }
          await insert(c, { ...doc, clientId: cid }, r);
        }
        continue;
      }

      for (const doc of fresh) {
        const row = { ...doc, clientId: cid };
        if (row.employeeId && employeeMap.has(String(row.employeeId))) row.employeeId = employeeMap.get(String(row.employeeId));
        // One attendance mark per person per day, one settled period per person per month: the company's own wins.
        if (coll === "attendance" && await c.findOne({ clientId: cid, employeeId: row.employeeId, date: row.date })) { r.alreadyThere += 1; continue; }
        if (coll === "salaryPeriods" && await c.findOne({ clientId: cid, employeeId: row.employeeId, periodKey: row.periodKey })) { r.alreadyThere += 1; continue; }
        await insert(c, row, r);
      }
    }
    results[key] = { label: BACKUP_SECTIONS[key].label, ...r };
  }
  return results;
}
