/**
@import {Node, Comment} from "../types/estree.js";
*/

/**
@param {Node | Comment} node
@return {number}
*/
function locEndWithFullText(node) {
  // @ts-expect-error -- safe
  const end = node.range?.[1] ?? node.end;

  return end;
}

export { locEndWithFullText };
