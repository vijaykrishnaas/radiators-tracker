// "Fix a name on past bills": lists the names a company's bills use for one kind of thing (a part, a unit, a
// mechanic, an engineering item) and renames one of them everywhere it is stored: the bills, the mechanic's bonus
// entries, and the matching entry in Settings, so new bills pick up the corrected name too.
// Matching is exact (case and spaces included), always inside one company.
import { connectDB } from "../config/db.js";
import { toClientId } from "../utils/tenant.js";
import { getSettings } from "./settings.dao.js";

const MAX_NAME = 120;

const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Which kinds each business type has. Tyre bills have no mechanic, part or unit names to fix.
export const KINDS_BY_TYPE = {
  automobile: ["part", "unit", "mechanic"],
  radiator: ["mechanic"],
  engineering: ["mechanic", "engItem"],
  tyre: [],
};

export const KIND_LABELS = { part: "Part", unit: "Unit", mechanic: "Mechanic", engItem: "Service item" };

// For each kind: the collections and how to read / rewrite the name on one bill.
const ITEMS = (field) => ({
  names: (d) => (d.items || []).map((i) => i?.[field]),
  rename: (d, from, to) => ({ items: (d.items || []).map((i) => (i?.[field] === from ? { ...i, [field]: to } : i)) }),
});
const TOP = (field) => ({
  names: (d) => [d[field]],
  rename: (d, from, to) => (d[field] === from ? { [field]: to } : {}),
});
const ENG_ITEMS = {
  names: (d) => (d.services || []).flatMap((s) => (s.items || []).map((i) => i?.label)),
  rename: (d, from, to) => ({
    services: (d.services || []).map((s) => ({ ...s, items: (s.items || []).map((i) => (i?.label === from ? { ...i, label: to } : i)) })),
  }),
};

const SOURCES = {
  part: [["autobills", ITEMS("particulars"), "items.particulars"]],
  unit: [["autobills", ITEMS("unit"), "items.unit"]],
  mechanic: [["radiators", TOP("mechanicName"), "mechanicName"], ["autobills", TOP("mechanicName"), "mechanicName"], ["engbills", TOP("mechanic"), "mechanic"]],
  engItem: [["engbills", ENG_ITEMS, "services.items.label"]],
};

async function kindsFor(clientId) {
  const s = await getSettings(clientId);
  return { settings: s, kinds: KINDS_BY_TYPE[s?.businessType || "radiator"] || [] };
}

function checkKind(kinds, kind) {
  if (!kinds.includes(kind)) throw httpError("This kind of name can't be fixed for this company");
}

// The kinds this company can fix, with their labels.
export async function nameKinds(clientId) {
  const { kinds } = await kindsFor(clientId);
  return kinds.map((k) => ({ kind: k, label: KIND_LABELS[k] }));
}

// Distinct names on this company's bills for one kind, with how many bills use each, most used first.
export async function namesInUse(clientId, kind) {
  const { kinds } = await kindsFor(clientId);
  checkKind(kinds, kind);
  const db = await connectDB();
  const cid = toClientId(clientId);
  const counts = new Map();
  for (const [coll, how, path] of SOURCES[kind]) {
    const docs = await db.collection(coll).find({ clientId: cid }).project({ [path.split(".")[0]]: 1 }).toArray();
    for (const d of docs) {
      for (const n of new Set(how.names(d).filter((v) => typeof v === "string" && v !== ""))) counts.set(n, (counts.get(n) || 0) + 1);
    }
  }
  return [...counts].map(([name, bills]) => ({ name, bills })).sort((a, b) => b.bills - a.bills || a.name.localeCompare(b.name));
}

const replaceIn = (list, from, to) => [...new Set((list || []).map((v) => (v === from ? to : v)))];

// What Settings should hold after the rename: whole top-level sections, only those that change.
function settingsPatch(settings, kind, from, to) {
  if (kind === "mechanic") {
    return (settings.mechanics || []).includes(from) ? { mechanics: replaceIn(settings.mechanics, from, to) } : {};
  }
  if (kind === "unit") {
    const auto = settings.automobile || {};
    const parts = (auto.parts || []).map((p) => (p.unit === from ? { ...p, unit: to } : p));
    const changed = (auto.units || []).includes(from) || parts.some((p, i) => p !== auto.parts[i]);
    return changed ? { automobile: { ...auto, units: replaceIn(auto.units, from, to), parts } } : {};
  }
  if (kind === "part") {
    const parts = settings.automobile?.parts || [];
    // A catalog part already carrying the new name stays as it is (no second part of the same name).
    if (!parts.some((p) => p.label === from) || parts.some((p) => p.label === to)) return {};
    return { automobile: { ...settings.automobile, parts: parts.map((p) => (p.label === from ? { ...p, label: to } : p)) } };
  }
  if (kind === "engItem") {
    const types = settings.engineering?.serviceTypes || [];
    if (!types.some((t) => (t.items || []).some((i) => i.label === from))) return {};
    return {
      engineering: { ...settings.engineering, serviceTypes: types.map((t) => ({
        ...t,
        // Same rule as parts: within one service type, an item already named `to` keeps its name.
        items: (t.items || []).some((i) => i.label === to) ? t.items : (t.items || []).map((i) => (i.label === from ? { ...i, label: to } : i)),
      })) },
    };
  }
  return {};
}

// Renames `from` to `to` on every bill of this company. Returns how many records changed, by place.
export async function renameName(clientId, kind, rawFrom, rawTo) {
  const { settings, kinds } = await kindsFor(clientId);
  checkKind(kinds, kind);
  const from = typeof rawFrom === "string" ? rawFrom : "";
  const to = String(rawTo ?? "").trim();
  if (!from) throw httpError("Choose the name to fix");
  if (!to) throw httpError("Enter the correct name");
  if (to.length > MAX_NAME) throw httpError(`The name must be ${MAX_NAME} characters or fewer`);
  if (kind === "unit" && to.length > 20) throw httpError("A unit must be 20 characters or fewer");
  if (to === from) throw httpError("The correct name is the same as the current one");

  const db = await connectDB();
  const cid = toClientId(clientId);
  const changed = {};
  for (const [coll, how, path] of SOURCES[kind]) {
    const docs = await db.collection(coll).find({ clientId: cid, [path]: from }).toArray();
    const ops = docs
      .filter((d) => how.names(d).includes(from))
      .map((d) => ({ updateOne: { filter: { _id: d._id, clientId: cid }, update: { $set: { ...how.rename(d, from, to), updatedAt: new Date() } } } }));
    if (ops.length) await db.collection(coll).bulkWrite(ops);
    changed[coll] = (changed[coll] || 0) + ops.length;
  }
  if (kind === "mechanic") {
    const r = await db.collection("bonuses").updateMany({ clientId: cid, type: "mechanic", beneficiary: from }, { $set: { beneficiary: to } });
    changed.bonuses = r.modifiedCount ?? 0;
  }
  const patch = settingsPatch(settings, kind, from, to);
  if (Object.keys(patch).length) await db.collection("settings").updateOne({ _id: cid }, { $set: patch });
  const bills = Object.entries(changed).filter(([k]) => k !== "bonuses").reduce((s, [, n]) => s + n, 0);
  return { kind, from, to, bills, bonuses: changed.bonuses || 0, settingsUpdated: Object.keys(patch).length > 0, changed };
}
