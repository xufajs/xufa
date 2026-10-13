/**
@import {Node, Comment, NodeMap, CommentMap} from "../types/estree.js";
*/

/**
@typedef {Node | Comment} NodeOrComment
@typedef {NodeOrComment["type"]} NodeOrCommentTypes
*/

/**
@template {NodeOrCommentTypes[] | readonly NodeOrCommentTypes[]} InputNodeTypes
@param {InputNodeTypes} typesArray
*/
function createTypeCheckFunction(typesArray) {
  // (Up to four types, compared: faster than a set's lookup, these checks run for every node.)
  const unique = [...new Set(typesArray)];
  const [a, b, c, d] = unique;
  switch (unique.length) {
    case 1:
      return (node) => node?.type === a;
    case 2:
      return (node) => {
        const type = node?.type;
        return type === a || type === b;
      };
    case 3:
      return (node) => {
        const type = node?.type;
        return type === a || type === b || type === c;
      };
    case 4:
      return (node) => {
        const type = node?.type;
        return type === a || type === b || type === c || type === d;
      };
  }
  const types = new Set(typesArray);

  /**
  @param {Node | Comment | undefined | null} node
  @returns {node is (NodeMap & CommentMap)[InputNodeTypes[number]]}
  */
  return (node) => types.has(node?.type);
}

export { createTypeCheckFunction };
