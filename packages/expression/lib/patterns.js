// Destructuring and default values of programs, lowered by the parser into what the compilers have (so with their
// checks): names, members, conditionals and intrinsics (destructurable, arrayOf, arrayRest, objectRest), with names of
// their own for the values in between (#d1, #d2...: names no source can write, as # is no character of a name).
//
// Patterns: Identifier, MemberExpression (of assignments), AssignmentPattern { left, right } (a default value),
// ObjectPattern { properties: [{ key, computed, value }], rest } and ArrayPattern { elements (null: a hole), rest }.

const span = (node) => ({ start: node.start, end: node.end });

const intrinsic = (name, args, from) => ({ type: 'Intrinsic', name, arguments: args, ...span(from) });

const literal = (value, from) => ({ type: 'Literal', value, ...span(from) });

class Lowering {
  constructor() {
    this.count = 0;
  }

  // A name of its own (positioned as what it holds: errors show that source).
  temp(from) {
    this.count += 1;
    return { type: 'Identifier', name: `#d${this.count}`, ...span(from) };
  }

  // [{ target, value }] of a pattern and the value it takes, in the order JavaScript reads them: target a name
  // (Identifier) or, in assignments, a member.
  bindings(pattern, value, out = []) {
    switch (pattern.type) {
      case 'Identifier':
      case 'MemberExpression':
        out.push({ target: pattern, value });
        return out;
      case 'AssignmentPattern': {
        // (The default when the value is undefined.)
        const held = this.temp(value);
        out.push({ target: held, value });
        const chosen = {
          type: 'ConditionalExpression',
          test: {
            type: 'BinaryExpression',
            operator: '===',
            left: held,
            right: { type: 'Identifier', name: 'undefined', ...span(held) },
            ...span(held),
          },
          consequent: pattern.right,
          alternate: held,
          ...span(pattern),
        };
        return this.bindings(pattern.left, chosen, out);
      }
      case 'ObjectPattern': {
        const object = this.temp(value);
        out.push({ target: object, value: intrinsic('destructurable', [value], value) });
        const keys = [];
        for (const property of pattern.properties) {
          let key = property.key;
          if (property.computed) {
            // (A computed key read once: for its member and for the rest.)
            const held = this.temp(property.key);
            out.push({ target: held, value: property.key });
            key = held;
            keys.push(held);
          } else keys.push(literal(key, property));
          const member = {
            type: 'MemberExpression',
            object,
            property: key,
            computed: Boolean(property.computed),
            optional: false,
            ...span(property),
          };
          this.bindings(property.value, member, out);
        }
        if (pattern.rest) {
          const rest = intrinsic(
            'objectRest',
            [object, { type: 'ArrayExpression', elements: keys, ...span(pattern) }],
            pattern
          );
          this.bindings(pattern.rest, rest, out);
        }
        return out;
      }
      case 'ArrayPattern': {
        const array = this.temp(value);
        out.push({ target: array, value: intrinsic('arrayOf', [value], value) });
        pattern.elements.forEach((element, i) => {
          if (!element) return;
          const member = {
            type: 'MemberExpression',
            object: array,
            property: literal(i, element),
            computed: true,
            optional: false,
            ...span(element),
          };
          this.bindings(element, member, out);
        });
        if (pattern.rest) {
          const rest = intrinsic('arrayRest', [array, literal(pattern.elements.length, pattern)], pattern);
          this.bindings(pattern.rest, rest, out);
        }
        return out;
      }
      default:
        throw new Error(`Unexpected pattern ${pattern.type}`);
    }
  }

  // A declaration of a pattern: its declarators (one a name: the values in between too).
  declarators(pattern, value) {
    return this.bindings(pattern, value).map(({ target, value: init }) => ({
      type: 'VariableDeclarator',
      id: target.name,
      init,
      ...span(target),
    }));
  }

  // An assignment of a pattern (a = 1 in expressions): its value first (what the assignment gives), then each target.
  // Its names in between are given to declare (in the function or program around).
  assignment(pattern, value, declare) {
    const held = this.temp(value);
    const parts = [{ target: held, value }, ...this.bindings(pattern, held)];
    for (const { target } of parts)
      if (target.type === 'Identifier' && target.name.startsWith('#')) declare(target.name);
    const expressions = parts.map(({ target, value: right }) => ({
      type: 'AssignmentExpression',
      operator: '=',
      left: target,
      right,
      ...span(target),
    }));
    expressions.push(held);
    return { type: 'SequenceExpression', expressions, ...span(value) };
  }
}

// The names a pattern binds (for duplicates of parameters).
function patternNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name);
      break;
    case 'AssignmentPattern':
      patternNames(pattern.left, out);
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) patternNames(property.value, out);
      patternNames(pattern.rest, out);
      break;
    case 'ArrayPattern':
      for (const element of pattern.elements) patternNames(element, out);
      patternNames(pattern.rest, out);
      break;
    default:
  }
  return out;
}

export { Lowering, patternNames };
