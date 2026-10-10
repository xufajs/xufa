// Aggregates across reverse relations for the backends that cannot follow them in a query (memory, fs, MongoDB):
// computed by the ORM, as SQL computes them with LEFT JOINs. The rows of the query (their groups, their keys and the
// fields aggregated), then the related rows of those keys (one query for each relation), grouped and aggregated here.
//
//   Author.objects.values('name').annotate({ books: Count('books'), pages: Sum('books__pages') })
//
// A reverse relation is followed at the start of a path (books__pages; books__author__name), not after a foreign key
// or another reverse relation.
import { BackendError } from './errors.js';
import { lastOf, pathKey } from './query.js';

// Nulls first, then numbers, strings, dates... (as the memory backend orders them); decimals by their digits.
const normalize = (value) => (value instanceof Date ? value.getTime() : value);
function compare(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
const keyOf = (values) => JSON.stringify(values.map((value) => (value instanceof Date ? value.getTime() : value)));

// The value of an aggregate of values (null and undefined left out, as SQL does).
function compute(item, rowCount, all) {
  if (!item.fields) return rowCount;
  const decimal = lastOf(item.fields).dbType === 'decimal';
  let values = all.filter((value) => value !== null && value !== undefined);
  if (item.distinct) {
    const seen = new Set();
    values = values.filter((value) => {
      const key = keyOf([value]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const number = (value) => (decimal ? Number(value) : value);
  switch (item.fn) {
    case 'count':
      return values.length;
    case 'sum':
      return values.length ? values.reduce((total, value) => total + number(value), 0) : null;
    case 'avg':
      return values.length ? values.reduce((total, value) => total + number(value), 0) / values.length : null;
    case 'min':
      return values.length ? values.reduce((a, b) => (compare(number(a), number(b)) <= 0 ? a : b)) : null;
    default:
      return values.length ? values.reduce((a, b) => (compare(number(a), number(b)) >= 0 ? a : b)) : null;
  }
}

const isReverse = (item) => Boolean(item.fields && item.fields.some((field) => field.reverse));

// The values at the end of a path that starts with reverse relations, by the key the first one points to: the related
// rows of those keys (one query), and of theirs for the next reverse relation (authors__books), down to the fields of
// the rest of the path.
async function valuesByKey(backend, fields, keys, db) {
  const byKey = new Map();
  if (keys.length === 0) return byKey;
  const foreignKey = fields[0].reverse;
  const rest = fields.slice(1);
  const deeper = rest.length > 0 && Boolean(rest[0].reverse);
  const objects = db ? foreignKey.model.objects.using(db) : foreignKey.model.objects;
  const found = await backend.select({
    ...objects.filter({ [`${foreignKey.name}__in`]: keys }).toQuery(),
    values: [
      { key: 'k', fields: [foreignKey] },
      deeper ? { key: 't', fields: [rest[0].reverse.targetField] } : { key: 'v', fields: rest },
    ],
  });
  const next = deeper
    ? await valuesByKey(backend, rest, [...new Set(found.map((row) => row.t).filter((key) => key !== null))], db)
    : null;
  for (const row of found) {
    const key = keyOf([row.k]);
    if (!byKey.has(key)) byKey.set(key, []);
    const list = byKey.get(key);
    if (deeper) list.push(...(next.get(keyOf([row.t])) || []));
    else list.push(row.v);
  }
  return byKey;
}

// backend.aggregate() for aggregates some of which follow reverse relations: the rows of the groups (`groupBy`, or one
// group of every row), with their aggregates, ordered (query.groupOrder) and sliced as the backend would. `db`: the
// database of the QuerySet (its related rows are read there).
async function aggregateAcross(backend, query, aggregates, groupBy, db = null) {
  const reverse = aggregates.filter(isReverse);
  for (const item of reverse) {
    let first = 0;
    while (first < item.fields.length && item.fields[first].reverse) first += 1;
    if (first === 0 || item.fields.slice(first).some((field) => field.reverse)) {
      throw new BackendError(
        `Aggregates across reverse relations follow them at the start of their path (${pathKey(item.fields)})`
      );
    }
  }
  // The rows: their groups, the fields aggregated directly, and the keys the reverse relations point to.
  const values = [
    ...(groupBy || []).map((item, i) => ({ ...item, key: `g${i}` })),
    ...aggregates.flatMap((item, i) =>
      item.fields && !isReverse(item) ? [{ key: `a${i}`, fields: item.fields }] : []
    ),
    ...reverse.map((item) => ({ key: `t${aggregates.indexOf(item)}`, fields: [item.fields[0].reverse.targetField] })),
  ];
  const rows = await backend.select({ ...query, values, limit: null, offset: 0, orderBy: [], related: [], only: null });
  // The related rows of each relation, by the key they point to: their values of the rest of the path.
  const related = new Map();
  for (const item of reverse) {
    const index = aggregates.indexOf(item);
    const keys = [...new Set(rows.map((row) => row[`t${index}`]).filter((key) => key !== null))];
    related.set(index, await valuesByKey(backend, item.fields, keys, db));
  }
  // The groups, in the order their first rows came.
  const groups = new Map();
  for (const row of rows) {
    const groupValues = (groupBy || []).map((item, i) => row[`g${i}`]);
    const key = keyOf(groupValues);
    if (!groups.has(key)) groups.set(key, { values: groupValues, rows: [] });
    groups.get(key).rows.push(row);
  }
  if (!groupBy && groups.size === 0) groups.set('[]', { values: [], rows: [] });
  let results = [...groups.values()].map((group) => {
    const result = {};
    (groupBy || []).forEach((item, i) => {
      result[item.key] = group.values[i];
    });
    aggregates.forEach((item, i) => {
      let all;
      if (isReverse(item)) {
        const byKey = related.get(i);
        all = group.rows.flatMap((row) => byKey.get(keyOf([row[`t${i}`]])) || []);
      } else all = item.fields ? group.rows.map((row) => row[`a${i}`]) : [];
      result[item.key] = compute(item, group.rows.length, all);
    });
    return result;
  });
  if (query.groupOrder && query.groupOrder.length) {
    results.sort((a, b) => {
      for (const { key, desc } of query.groupOrder) {
        const result = compare(a[key], b[key]);
        if (result !== 0) return desc ? -result : result;
      }
      return 0;
    });
  }
  const start = query.offset || 0;
  results = results.slice(start, query.limit === null || query.limit === undefined ? undefined : start + query.limit);
  return results;
}

export { aggregateAcross, isReverse };
