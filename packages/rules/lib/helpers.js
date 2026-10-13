// The functions that the expressions of a book have under Fun (Fun.mean(scores), Fun.sort(list)): the ones of the
// engine this one follows, with their names and results, so its books run as they are. Functions of a list and a
// function (map, filter, some...) take the list or its first argument alone and give a function of the rest.

const listOf = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) || typeof value === 'string') return value;
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  if (typeof value === 'object') return Object.values(value);
  return [value];
};

const curried =
  (fn) =>
  (...args) =>
    args.length === 1 ? (rest, ...more) => fn(args[0], rest, ...more) : fn(...args);

const numbers = (args) => (args.length === 1 && typeof args[0] === 'object' ? [...listOf(args[0])] : args);

function sortByValue(values, descending) {
  const numeric = typeof values[0] === 'number';
  const sorted = numeric ? values.sort((a, b) => a - b) : values.sort();
  return descending ? sorted.reverse() : sorted;
}

// Sorts lists by the values of the first: the others follow its order.
function sortSeveralBy(lists, descending) {
  const [first] = lists;
  const order = first.map((value, index) => ({ value, index }));
  const numeric = typeof first[0] === 'number';
  order.sort((a, b) => {
    if (numeric) return a.value - b.value;
    if (a.value === b.value) return 0;
    return String(a.value) < String(b.value) ? -1 : 1;
  });
  if (descending) order.reverse();
  return lists.map((list) => order.map(({ index }) => list[index]));
}

// The combinations of the values of every part but the last (each part a list, or a text of lines or commas), with
// the last part's values added to the list at each: addToNested({}, ['a,b', 'x', [1, 2]]) gives
// { a: { x: [1, 2] }, b: { x: [1, 2] } }.
function addToNested(target, parts) {
  const values = (Array.isArray(parts) ? parts : Object.values(parts)).map((value) => {
    if (typeof value === 'string') return value.split(/\r?\n|,/);
    return Array.isArray(value) ? value : [value];
  });
  let paths = [[]];
  for (const keys of values.slice(0, -1)) paths = keys.flatMap((key) => paths.map((path) => [...path, key]));
  for (const path of paths) {
    let node = target;
    path.forEach((key, i) => {
      const leaf = i === path.length - 1;
      if (node[key] === undefined || node[key] === null) node[key] = leaf ? [] : {};
      if (leaf && !Array.isArray(node[key])) node[key] = [node[key]];
      node = node[key];
    });
    node.push(...values[values.length - 1]);
  }
  return target;
}

const indexSet = (indexes) => new Set(listOf(indexes).map(Number));
const keepByIndex = (keep) => (list, indexes) => {
  const set = indexSet(indexes);
  return [...listOf(list)].filter((_, i) => set.has(i) === keep);
};
const keepByIndexSrc = (keep) => (list, indexes) => {
  const set = indexSet(indexes);
  if (typeof list === 'string') return [...list].filter((_, i) => set.has(i) === keep).join('');
  return keepByIndex(keep)(list, indexes);
};

const Fun = Object.freeze({
  addToNested,
  splitString: (text) => (typeof text === 'string' ? text.split(/\r?\n/) : text),
  clamp: (value, min, max) => {
    const one = (n) => Math.min(Math.max(n, min), max);
    return Array.isArray(value) ? value.map(one) : one(value);
  },
  sort: (list) => sortByValue(list, false),
  sortDesc: (list) => sortByValue(list, true),
  sortSeveral: (...lists) => sortSeveralBy(lists, false),
  sortSeveralDesc: (...lists) => sortSeveralBy(lists, true),
  first: (list, n) => list.slice(0, n),
  firstSeveral: (lists, n) => lists.map((list) => list.slice(0, n)),
  last: (list, n) => list.slice(-n),
  lastSeveral: (lists, n) => lists.map((list) => list.slice(-n)),
  reverse: (list) => list.reverse(),
  reverseSeveral: (lists) => lists.map((list) => list.reverse()),
  mean: (...args) => {
    const list = numbers(args);
    return list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : NaN;
  },
  median: (...args) => {
    const list = [...numbers(args)].sort((a, b) => a - b);
    if (!list.length) return NaN;
    const middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  },
  concat: (...lists) => lists.flatMap((list) => [...listOf(list)]),
  max: (...args) => Math.max(...numbers(args)),
  min: (...args) => Math.min(...numbers(args)),
  sum: (...args) => numbers(args).reduce((sum, n) => sum + Number(n), 0),
  flat: (list, depth = 1) => list.flat(depth),
  zip: (a, b) => {
    const left = listOf(a);
    const right = listOf(b);
    return Array.from({ length: Math.min(left.length, right.length) }, (_, i) => [left[i], right[i]]);
  },
  zipObj: (keys, values) => {
    const names = listOf(keys);
    const items = listOf(values);
    const result = {};
    for (let i = 0; i < Math.min(names.length, items.length); i += 1) result[names[i]] = items[i];
    return result;
  },
  some: curried(
    (list, fn) => list !== undefined && list !== null && [...listOf(list)].some((v, i, l) => fn(v, i, l) === true)
  ),
  every: curried(
    (list, fn) => list !== undefined && list !== null && [...listOf(list)].every((v, i, l) => fn(v, i, l) !== false)
  ),
  none: curried(
    (list, fn) => list === undefined || list === null || ![...listOf(list)].some((v, i, l) => fn(v, i, l) === true)
  ),
  map: curried((list, fn) => [...listOf(list)].map(fn)),
  mapRight: curried((list, fn) => [...listOf(list)].reverse().map((v, i, l) => fn(v, l.length - 1 - i, l))),
  mapSrc: curried((list, fn) => (typeof list === 'string' ? [...list].map(fn).join('') : [...listOf(list)].map(fn))),
  mapRightSrc: curried((list, fn) =>
    typeof list === 'string' ? [...list].reverse().map(fn).join('') : [...listOf(list)].reverse().map(fn)
  ),
  filter: curried((list, fn) => [...listOf(list)].filter(fn)),
  filterSrc: curried((list, fn) =>
    typeof list === 'string' ? [...list].filter(fn).join('') : [...listOf(list)].filter(fn)
  ),
  forEach: curried((list, fn) => [...listOf(list)].forEach(fn)),
  forEachRight: curried((list, fn) => {
    const items = [...listOf(list)];
    for (let i = items.length - 1; i >= 0; i -= 1) fn(items[i], i, items);
  }),
  allowIndexes: curried(keepByIndex(true)),
  denyIndexes: curried(keepByIndex(false)),
  allowIndexesSrc: curried(keepByIndexSrc(true)),
  denyIndexesSrc: curried(keepByIndexSrc(false)),
});

export { Fun };
