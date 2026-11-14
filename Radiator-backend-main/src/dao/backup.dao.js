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

/**
 * Adds the backup's records to a company and never overwrites: a record whose id is already in the database is
 * left as it is. Everything imported is re-tagged with the target company. Bill numbering only ever moves up, so
 * imported bill numbers are never handed out again.
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

  const db = await connectDB();
  const results = {};
  for (const key of chosen) {
    const r = { added: 0, alreadyThere: 0, otherCompany: 0 };
    for (const coll of BACKUP_SECTIONS[key].collections) {
      const docs = EJSON.deserialize(Array.isArray(backup.data?.[coll]) ? backup.data[coll] : [], { relaxed: true });
      const c = db.collection(coll);
      if (coll === "counters") {
        // Keep the higher of each number, so neither existing nor imported bill numbers are reused.
        if (!docs.length) continue;
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
      for (const doc of docs) {
        if (!doc || !doc._id) continue;
        const existing = await c.findOne({ _id: doc._id });
        if (existing) {
          if (String(existing.clientId) === String(cid)) r.alreadyThere += 1;
          else r.otherCompany += 1;
          continue;
        }
        await c.insertOne({ ...doc, clientId: cid });
        r.added += 1;
      }
    }
    results[key] = { label: BACKUP_SECTIONS[key].label, ...r };
  }
  return results;
}
