/**
@typedef {(node: Node) => VisitorKeys} GetVisitorKeys
@typedef {NonNullable<object>} Node
@typedef {readonly string[]} VisitorKeys
*/

/**
@param {Record<string, VisitorKeys>} visitorKeys
@param {string} [typeProperty="type"]
@returns {GetVisitorKeys}
*/
function createGetVisitorKeys(visitorKeys, typeProperty = 'type') {
  /** @type {GetVisitorKeys} */
  function getVisitorKeys(node) {
    const type = node[typeProperty];

    const keys = visitorKeys[type];
    /* c8 ignore next 5 */
    if (!Array.isArray(keys)) {
      throw Object.assign(new Error(`Missing visitor keys for '${type}'.`), {
        node,
      });
    }

    return keys;
  }

  return getVisitorKeys;
}

export default createGetVisitorKeys;
