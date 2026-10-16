import { getOrInsert } from './get-or-insert.js';

/**
@param {VisitorKeys} visitorKeys
@returns {VisitorKeys}
*/
function generateReferenceSharedVisitorKeys(visitorKeys) {
  /** @type {Map<string, Keys>} */
  const cache = new Map();
  /** @type {VisitorKeys} */
  const result = {};

  for (const [type, keys] of Object.entries(visitorKeys)) {
    // Don't share empty keys, since it's shorter
    if (keys.length === 0) {
      result[type] = keys;
      continue;
    }

    result[type] = getOrInsert(cache, keys.toSorted().join('\0'), keys);
  }

  return result;
}

export { generateReferenceSharedVisitorKeys };
