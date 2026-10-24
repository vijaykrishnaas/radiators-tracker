// Server-side sorting for paginated lists: ?sortBy=<key>&sortDir=asc|desc.
// Sorting happens before skip/limit, so page 2 continues the order of page 1 (sorting only the rows on screen would
// not). Only whitelisted keys are accepted, so a client can never sort on (or probe) arbitrary fields.

// Case-insensitive text order ("anil" next to "Anil"), numeric-aware ("TN 9" before "TN 10").
export const SORT_COLLATION = { locale: "en", strength: 2, numericOrdering: true };

/**
 * @param query    req.query (reads sortBy / sortDir)
 * @param fields   sort key → stored field path (string), an aggregation expression for a computed value, or a
 *                 function (dir) → expression when the value depends on the direction (e.g. empty values last both ways)
 * @param fallback the list's default order when no (or an unknown) key is asked for
 * @returns { sort, computed } — `computed` is the expression to $addFields as __sort, or null for a plain find().
 */
export function parseSort(query = {}, fields = {}, fallback = { _id: -1 }) {
  const key = String(query.sortBy || "");
  if (!key || !Object.prototype.hasOwnProperty.call(fields, key)) return { sort: fallback, computed: null };
  const dir = String(query.sortDir).toLowerCase() === "asc" ? 1 : -1;
  const field = fields[key];
  // _id as the tie-breaker keeps the order stable across pages when many rows share a value.
  if (typeof field === "string") return { sort: { [field]: dir, _id: dir }, computed: null };
  return { sort: { __sort: dir, _id: dir }, computed: typeof field === "function" ? field(dir) : field };
}

// Row count for the same filter as findSortedPage. The page query runs with SORT_COLLATION, which also makes exact-match
// filters case-insensitive; counting without it would undercount ("ravi" vs "Ravi") and the last pages become unreachable.
export function countMatching(coll, query) {
  return coll.countDocuments(query, { collation: SORT_COLLATION });
}

// One page of `coll` matching `query` in the parsed order.
export function findSortedPage(coll, query, { sort, computed }, skip, limit, projection = null) {
  if (!computed) {
    const cursor = coll.find(query, { collation: SORT_COLLATION, ...(projection ? { projection } : {}) }).sort(sort);
    return cursor.skip(skip).limit(limit).toArray();
  }
  const pipeline = [
    { $match: query },
    { $addFields: { __sort: computed } },
    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
    { $project: { __sort: 0, ...(projection || {}) } },
  ];
  return coll.aggregate(pipeline, { collation: SORT_COLLATION }).toArray();
}
