import isNonEmptyArray from '../../utilities/is-non-empty-array.js';

function iterateClassMembersPath(path, iteratee) {
  const { node } = path;
  if (node.type === 'ClassBody' || node.type === 'TSInterfaceBody') {
    path.each(iteratee, 'body');
    return;
  }

  if (node.type === 'TSTypeLiteral') {
    path.each(iteratee, 'members');
    return;
  }
}

/**
@param {
  | NodeMap["ClassBody"]
  | NodeMap["TSInterfaceBody"]
  | NodeMap["RecordDeclarationBody"]
  | NodeMap["ObjectTypeAnnotation"]
} node
@returns {boolean}
*/
function isNonEmptyClassBody(node) {
  const members = node.body;

  return isNonEmptyArray(members);
}

export { isNonEmptyClassBody, iterateClassMembersPath };
