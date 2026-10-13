/**
@import {Node, Comment} from "../types/estree.js";
*/

/**
@param {Node | Comment} node
@return {number}
*/
function locStart(node) {
  // @ts-expect-error -- safe
  const start = node.range?.[0] ?? node.start;

  // Handle nodes with decorators. They should start at the first decorator
  // @ts-expect-error -- safe
  const firstDecorator = (node.declaration?.decorators ?? node.decorators)?.[0];
  if (firstDecorator) {
    return Math.min(locStart(firstDecorator), start);
  }

  return start;
}

export { locStart };
