import { isSimpleTypeAnnotation } from './is-simple-type-annotation.js';
import isTsKeywordType from './is-ts-keyword-type.js';

/**
@import {
  Node,
} from "../types/estree.js";
*/

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isSimpleType(node) {
  return (
    isTsKeywordType(node) || isSimpleTypeAnnotation(node) || (node.type === 'TSTypeReference' && !node.typeArguments)
  );
}

export { isSimpleType };
