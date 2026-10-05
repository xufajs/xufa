'use strict';

// A deep copy of schemas, as rfdc({ proto: true, circles: false }) makes it: objects become plain objects with their
// enumerable properties (inherited ones too), arrays, dates, maps, sets and typed arrays are copied, functions and
// other values are kept as they are.
function clone(value) {
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [key, clone(item)]));
  if (value instanceof Set) return new Set([...value].map(clone));
  if (ArrayBuffer.isView(value)) return value.slice();
  if (value instanceof RegExp) return value;
  const copy = {};
  // eslint-disable-next-line guard-for-in
  for (const key in value) copy[key] = clone(value[key]);
  return copy;
}

module.exports = clone;
