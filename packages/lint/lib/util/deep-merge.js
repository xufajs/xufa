// The options of a rule: its defaults (meta.defaultOptions) with the config's over them, item by item; objects merged
// deeply, anything else replaced.

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function deepMergeObjects(first, second) {
  if (second === undefined) return first;
  if (!isObject(first) || !isObject(second)) return second;
  const result = { ...first, ...second };
  for (const key of Object.keys(second)) {
    if (Object.prototype.propertyIsEnumerable.call(first, key)) result[key] = deepMergeObjects(first[key], second[key]);
  }
  return result;
}

/** Two lists of options merged: each item of the first with the one of the second, then the rest of the second. */
function deepMergeArrays(first, second) {
  if (!first || !second) return second || first || [];
  return [
    ...first.map((value, i) => deepMergeObjects(value, i < second.length ? second[i] : undefined)),
    ...second.slice(first.length),
  ];
}

export { deepMergeArrays };
