// A walk of a regular expression's tree (parser.js): for each node, depth first, handlers.on<Type>Enter(node) before
// its children and handlers.on<Type>Leave(node) after them, for the handlers given.

// The children of each type of node, in order.
const CHILDREN = {
  Alternative: (node) => node.elements,
  Assertion: (node) => (node.kind === 'lookahead' || node.kind === 'lookbehind' ? node.alternatives : []),
  Backreference: () => [],
  CapturingGroup: (node) => node.alternatives,
  Character: () => [],
  CharacterClass: (node) => node.elements,
  CharacterClassRange: (node) => [node.min, node.max],
  CharacterSet: () => [],
  ClassIntersection: (node) => [node.left, node.right],
  ClassStringDisjunction: (node) => node.alternatives,
  ClassSubtraction: (node) => [node.left, node.right],
  ExpressionCharacterClass: (node) => [node.expression],
  Flags: () => [],
  Group: (node) => (node.modifiers ? [node.modifiers, ...node.alternatives] : node.alternatives),
  Modifiers: (node) => [node.add, node.remove].filter(Boolean),
  ModifierFlags: () => [],
  Pattern: (node) => node.alternatives,
  Quantifier: (node) => [node.element],
  RegExpLiteral: (node) => [node.pattern, node.flags],
  StringAlternative: (node) => node.elements,
};

// The names of the handlers of each type: on<Type>Enter, on<Type>Leave.
const HANDLERS = Object.fromEntries(Object.keys(CHILDREN).map((type) => [type, [`on${type}Enter`, `on${type}Leave`]]));

function visitRegExpAST(node, handlers) {
  const visit = (current) => {
    const children = CHILDREN[current.type];
    if (!children) throw new Error(`Unknown type: ${current.type}`);
    const [enter, leave] = HANDLERS[current.type];
    handlers[enter]?.(current);
    for (const child of children(current)) visit(child);
    handlers[leave]?.(current);
  };
  visit(node);
}

export { visitRegExpAST };
