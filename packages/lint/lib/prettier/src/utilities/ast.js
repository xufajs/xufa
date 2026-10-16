import isObject from './is-object.js';

/**
@import {GetVisitorKeys, Node} from "./create-get-visitor-keys.js"
@typedef {(node: Node) => boolean} Predicate
*/

/**
@param {Node} node
@param {{getVisitorKeys: GetVisitorKeys, filter?: Predicate}} options
*/
function* getChildren(node, options) {
  const { getVisitorKeys, filter = () => true } = options;
  const isMatchedNode = (node) => isObject(node) && filter(node);

  for (const key of getVisitorKeys(node)) {
    const value = node[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isMatchedNode(child)) {
          yield child;
        }
      }
    } else if (isMatchedNode(value)) {
      yield value;
    }
  }
}

export { getChildren };
