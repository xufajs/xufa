// Selectors of querySelector(), querySelectorAll(), matches() and closest(): lists of complex selectors of types (and
// *), #ids, .classes, attributes ([a], [a=v], ~= |= ^= $= *=, with i), :not(), :first-child, :last-child, :only-child,
// :nth-child() and :nth-last-child() (with of S), :nth-of-type(), :nth-last-of-type(), :first-of-type, :last-of-type,
// :only-of-type, :is(), :where(), :has(), namespace prefixes (*| and |), :enabled, :disabled and :checked (by the
// attributes), :empty, :root, :scope and the combinators
// (descendant, >, +, ~). Others are a SyntaxError.
import { DOMException } from './exception.js';
import { NAMESPACES, NODE_TYPES, asciiLowercase } from './nodes.js';

// Identifiers and their escapes as CSS Syntax has them: \ and 1 to 6 hex digits (and one white space after), \ and
// any other character but a newline, \ at the end of the selector; -- or - and a letter, _, a non-ASCII character
// or an escape first.
const ESCAPE = String.raw`\\(?:[0-9a-fA-F]{1,6}[\t\n\f\r ]?|[^\n\r\f0-9a-fA-F]|$)`;
const IDENT = new RegExp(
  String.raw`^(?:--|-?(?:[_a-zA-Z\u0080-\u{10FFFF}]|${ESCAPE}))(?:[-\w\u0080-\u{10FFFF}]|${ESCAPE})*`,
  'u'
);
// A quoted string; the end of the selector ends one too.
const STRING = /^"((?:[^"\\\n\r\f]|\\[\s\S]|\\$)*)(?:"|$)|^'((?:[^'\\\n\r\f]|\\[\s\S]|\\$)*)(?:'|$)/;

// The code point of a hex escape: U+FFFD for 0, surrogates and past U+10FFFF.
function codePointOf(hex) {
  const code = parseInt(hex, 16);
  return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(code);
}

// The text of an identifier or a string (its escapes read; in strings, \ and a newline are nothing).
const unescape = (text) =>
  text.replace(/\\(?:([0-9a-fA-F]{1,6})[\t\n\f\r ]?|(\r\n|[\n\r\f])|([\s\S])|$)/g, (escape, hex, newline, char) => {
    if (hex) return codePointOf(hex);
    if (newline) return '';
    return char ?? '\uFFFD';
  });

function syntaxError(selector) {
  return new DOMException(`'${selector}' is not a valid selector`, 'SyntaxError');
}

// The argument of a functional pseudo-class: the text up to its ")" (parentheses, brackets and strings within it
// skipped), and what follows; null when it is not closed.
function argumentOf(text) {
  let depth = 1;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') i += 1;
    else if (char === '"' || char === "'") {
      for (i += 1; i < text.length && text[i] !== char; i += 1) if (text[i] === '\\') i += 1;
    } else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') {
      depth -= 1;
      if (depth === 0) return [text.slice(0, i), text.slice(i + 1)];
    }
  }
  return null;
}

// The parts of a selector list, at its top-level commas.
function partsOf(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') i += 1;
    else if (char === '"' || char === "'") {
      for (i += 1; i < text.length && text[i] !== char; i += 1) if (text[i] === '\\') i += 1;
    } else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// A forgiving selector list (:is(), :where()): the parts that parse; the others match nothing.
function parseForgiving(text) {
  return partsOf(text).flatMap((part) => {
    try {
      return part.trim() === '' ? [] : parse(part);
    } catch {
      return [];
    }
  });
}

// The relative selectors of :has(): each a complex selector whose first compound is related to the element tested
// (the anchor) by a combinator, the descendant one when it has none.
function parseRelative(text, selector) {
  return partsOf(text).map((part) => {
    const trimmed = part.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
    const combinator = /^[>+~]/.exec(trimmed);
    const [complex, ...others] = parse(combinator ? trimmed.slice(1) : trimmed);
    if (!complex || others.length > 0) throw syntaxError(selector);
    complex[complex.length - 1].combinator = combinator ? combinator[0] : ' ';
    return [...complex, { combinator: null, compound: [{ kind: 'anchor' }] }];
  });
}

// An+B (odd, even, 2n+1, -n+3, 5...): { a, b }, or null.
const WS = '[\\t\\n\\f\\r ]*';
const AN_PLUS_B = new RegExp(`^([+-]?)(\\d*)n(?:${WS}([+-])${WS}(\\d+))?$`);
function parseNth(text) {
  const value = asciiLowercase(text.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ''));
  if (value === 'odd') return { a: 2, b: 1 };
  if (value === 'even') return { a: 2, b: 0 };
  if (/^[+-]?\d+$/.test(value)) return { a: 0, b: Number(value) };
  const match = AN_PLUS_B.exec(value);
  if (!match) return null;
  const a = (match[1] === '-' ? -1 : 1) * (match[2] === '' ? 1 : Number(match[2]));
  const b = match[3] ? (match[3] === '-' ? -1 : 1) * Number(match[4]) : 0;
  return { a, b };
}

// Whether the index (from 1) of an element is one of An+B's (for an n of 0 or more).
const isNth = ({ a, b }, index) => (a === 0 ? index === b : Number.isInteger((index - b) / a) && (index - b) / a >= 0);

// A selector list: [[{ combinator, compound }]] (each complex selector right to left).
function parse(selector) {
  // (CSS preprocessing: newlines as LF, NUL as U+FFFD; white space before it out.)
  let rest = String(selector)
    .replace(/\r\n|[\r\f]/g, '\n')
    .replace(/\0/g, '\uFFFD')
    .replace(/^[\t\n ]+/, '');
  const list = [];
  let complex = [];
  let combinator = null;
  const take = (pattern) => {
    const match = pattern.exec(rest);
    if (match) rest = rest.slice(match[0].length);
    return match;
  };
  // A namespace prefix before a name: '*' (any), '' (none), undefined when there is none; a declared prefix is a
  // SyntaxError (querySelector has no @namespace).
  const prefix = () => {
    const match = /^(\*|)\|(?![=|])/.exec(rest);
    if (match) {
      rest = rest.slice(match[0].length);
      return match[1];
    }
    const name = IDENT.exec(rest);
    if (name && rest[name[0].length] === '|' && rest[name[0].length + 1] !== '=') throw syntaxError(selector);
    return undefined;
  };
  const compound = () => {
    const tests = [];
    let match;
    const namespace = prefix();
    if ((match = take(/^\*/))) tests.push({ kind: 'any', namespace });
    else if ((match = take(IDENT))) tests.push({ kind: 'type', name: unescape(match[0]), namespace });
    else if (namespace !== undefined) throw syntaxError(selector);
    for (;;) {
      if ((match = take(/^#/))) {
        const id = take(IDENT);
        if (!id) throw syntaxError(selector);
        tests.push({ kind: 'id', value: unescape(id[0]) });
      } else if ((match = take(/^\./))) {
        const name = take(IDENT);
        if (!name) throw syntaxError(selector);
        tests.push({ kind: 'class', value: unescape(name[0]) });
      } else if ((match = take(/^\[[\t\n\f\r ]*/))) {
        const namespace = prefix();
        const name = take(IDENT);
        if (!name) throw syntaxError(selector);
        take(/^[\t\n\f\r ]*/);
        const operator = take(/^([~|^$*]?=)[\t\n\f\r ]*/);
        let value = null;
        let insensitive = false;
        if (operator) {
          const quoted = take(STRING);
          if (quoted) value = unescape(quoted[1] ?? quoted[2]);
          else {
            const bare = take(IDENT);
            if (!bare) throw syntaxError(selector);
            value = unescape(bare[0]);
          }
          take(/^[\t\n\f\r ]*/);
          if (take(/^[iI][\t\n\f\r ]*/)) insensitive = true;
          else take(/^[sS][\t\n\f\r ]*/);
        }
        if (!take(/^\]/)) throw syntaxError(selector);
        tests.push({
          kind: 'attr',
          name: unescape(name[0]),
          namespace,
          operator: operator && operator[1],
          value,
          insensitive,
        });
      } else if ((match = take(/^:(not|is|where|has|nth-child|nth-last-child|nth-of-type|nth-last-of-type)\(/i))) {
        const kind = asciiLowercase(match[1]);
        const argument = argumentOf(rest);
        if (!argument) throw syntaxError(selector);
        [, rest] = argument;
        const [text] = argument;
        if (kind === 'not') tests.push({ kind, list: parse(text) });
        else if (kind === 'has') tests.push({ kind, list: parseRelative(text, selector) });
        else if (kind === 'is' || kind === 'where') tests.push({ kind: 'is', list: parseForgiving(text) });
        else {
          // (An+B, and of S for :nth-child() and :nth-last-child().)
          const of = kind.endsWith('child') ? /[\t\n\f\r ]+of[\t\n\f\r ]+/i.exec(text) : null;
          const nth = parseNth(of ? text.slice(0, of.index) : text);
          if (!nth) throw syntaxError(selector);
          tests.push({ kind, nth, list: of ? parse(text.slice(of.index + of[0].length)) : null });
        }
      } else if (
        (match = take(
          /^:(first-child|last-child|only-child|first-of-type|last-of-type|only-of-type|empty|root|scope|enabled|disabled|checked)(?![-\w(])/i
        ))
      ) {
        tests.push({ kind: asciiLowercase(match[1]) });
      } else break;
    }
    if (!tests.length) throw syntaxError(selector);
    return tests;
  };
  for (;;) {
    complex.unshift({ combinator, compound: compound() });
    const space = take(/^[\t\n\f\r ]+/);
    const symbol = take(/^([>+~,])[\t\n\f\r ]*/);
    if (!rest.length && !symbol) break;
    if (symbol && symbol[1] === ',') {
      list.push(complex);
      complex = [];
      combinator = null;
      if (!rest.length) throw syntaxError(selector);
      continue;
    }
    if (symbol) combinator = symbol[1];
    else if (space) combinator = ' ';
    else throw syntaxError(selector);
    if (!rest.length) throw syntaxError(selector);
  }
  list.push(complex);
  return list;
}

// The index (from 1) of an element among its element siblings (from the last one: last), those of its type
// (sameType), or those that match a selector list.
function indexOf(element, last, sameType, list) {
  let index = 1;
  for (let node = last ? element._next : element._prev; node; node = last ? node._next : node._prev) {
    if (node.nodeType !== NODE_TYPES.ELEMENT_NODE) continue;
    if (sameType && (node._localName !== element._localName || node._namespace !== element._namespace)) continue;
    if (list && !matchesList(node, list)) continue;
    index += 1;
  }
  return index;
}

const elementSiblings = (element, next) => {
  const siblings = [];
  for (let node = next ? element._next : element._prev; node; node = next ? node._next : node._prev) {
    if (node.nodeType === NODE_TYPES.ELEMENT_NODE) siblings.push(node);
  }
  return siblings;
};

// Whether the value of an attribute matches the operator and value of a selector of attributes.
function attrValueMatches(attrValue, test) {
  if (!test.operator) return true;
  let value = attrValue;
  let wanted = test.value;
  if (test.insensitive) {
    value = value.toLowerCase();
    wanted = wanted.toLowerCase();
  }
  switch (test.operator) {
    case '=':
      return value === wanted;
    case '~=':
      return value.split(/[\t\n\f\r ]+/).includes(wanted);
    case '|=':
      return value === wanted || value.startsWith(`${wanted}-`);
    case '^=':
      return wanted !== '' && value.startsWith(wanted);
    case '$=':
      return wanted !== '' && value.endsWith(wanted);
    default:
      return wanted !== '' && value.includes(wanted);
  }
}

// The states of forms as their attributes give them (the HTML standard's, with nothing done in the page: no user
// changed a value).
const isHtml = (element, ...names) => element._namespace === NAMESPACES.HTML && names.includes(element._localName);
const CAN_BE_DISABLED = ['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset'];

// Whether an element is in a disabled fieldset, but not in its first legend.
function inDisabledFieldset(element) {
  for (let child = element, node = element._parent; node; child = node, node = node._parent) {
    if (node.nodeType !== NODE_TYPES.ELEMENT_NODE) return false;
    if (isHtml(node, 'fieldset') && node.hasAttribute('disabled')) {
      let legend = node._first;
      while (legend && !(legend.nodeType === NODE_TYPES.ELEMENT_NODE && isHtml(legend, 'legend'))) legend = legend._next;
      if (child !== legend) return true;
    }
  }
  return false;
}

// "Actually disabled": a form control or fieldset with disabled, or in a disabled fieldset; an optgroup with
// disabled; an option with disabled, or in a disabled optgroup.
function isDisabled(element) {
  if (isHtml(element, 'optgroup')) return element.hasAttribute('disabled');
  if (isHtml(element, 'option')) {
    const parent = element._parent;
    return element.hasAttribute('disabled') || Boolean(parent && isHtml(parent, 'optgroup') && parent.hasAttribute('disabled'));
  }
  return element.hasAttribute('disabled') || inDisabledFieldset(element);
}

// The options of a select, in tree order (its children, and those of its optgroup children).
function optionsOf(select) {
  const options = [];
  for (let child = select._first; child; child = child._next) {
    if (child.nodeType !== NODE_TYPES.ELEMENT_NODE) continue;
    if (isHtml(child, 'option')) options.push(child);
    else if (isHtml(child, 'optgroup')) {
      for (let option = child._first; option; option = option._next) {
        if (option.nodeType === NODE_TYPES.ELEMENT_NODE && isHtml(option, 'option')) options.push(option);
      }
    }
  }
  return options;
}

// Checked: a checkbox or radio with checked; a selected option: with selected (of a select of one choice, the last
// one), or the first one not disabled of a select of one choice shown in a box of one line when none is.
function isChecked(element) {
  if (isHtml(element, 'input')) {
    const type = asciiLowercase(element.getAttribute('type') ?? '');
    return (type === 'checkbox' || type === 'radio') && element.hasAttribute('checked');
  }
  if (!isHtml(element, 'option')) return false;
  let select = element._parent;
  if (select && isHtml(select, 'optgroup')) select = select._parent;
  if (!select || !isHtml(select, 'select') || select.hasAttribute('multiple')) return element.hasAttribute('selected');
  const options = optionsOf(select);
  const selected = options.filter((option) => option.hasAttribute('selected'));
  if (selected.length > 0) return selected[selected.length - 1] === element;
  const size = Number.parseInt(select.getAttribute('size') ?? '1', 10);
  if (size > 1) return false;
  return options.find((option) => !isDisabled(option)) === element;
}

// The element a relative selector of :has() is relative to, while it is matched.
let anchor = null;

// The elements after an element that a relative selector can reach: its descendants, its following siblings and
// their descendants.
function reachable(element) {
  const elements = [];
  const walk = (node) => {
    for (let child = node._first; child; child = child._next) {
      if (child.nodeType === NODE_TYPES.ELEMENT_NODE) {
        elements.push(child);
        walk(child);
      }
    }
  };
  walk(element);
  for (let sibling = element._next; sibling; sibling = sibling._next) {
    if (sibling.nodeType === NODE_TYPES.ELEMENT_NODE) {
      elements.push(sibling);
      walk(sibling);
    }
  }
  return elements;
}

function testOne(element, test) {
  const html = element._namespace === NAMESPACES.HTML && element._owner._isHTML;
  switch (test.kind) {
    case 'any':
      return test.namespace !== '' || element._namespace === null;
    case 'type':
      if (test.namespace === '' && element._namespace !== null) return false;
      return html ? element._localName === asciiLowercase(test.name) : element._localName === test.name;
    case 'id':
      return element.getAttribute('id') === test.value;
    case 'class':
      return (element.getAttribute('class') || '').split(/[\t\n\f\r ]+/).includes(test.value);
    case 'attr': {
      // (No prefix or |: an attribute in no namespace; *|: in any.)
      const name = html ? asciiLowercase(test.name) : test.name;
      return element._attrs.some(
        (attr) =>
          attr._localName === name &&
          (test.namespace === '*' || attr._namespace === null) &&
          attrValueMatches(attr._value, test)
      );
    }
    case 'has': {
      // (The element is the anchor of the relative selectors, among the elements they can reach: its descendants
      // and its following siblings and theirs.)
      const saved = anchor;
      anchor = element;
      try {
        return reachable(element).some((other) => test.list.some((complex) => matchesComplex(other, complex)));
      } finally {
        anchor = saved;
      }
    }
    case 'anchor':
      return element === anchor;
    case 'disabled':
      return element._namespace === NAMESPACES.HTML && CAN_BE_DISABLED.includes(element._localName) && isDisabled(element);
    case 'enabled':
      return element._namespace === NAMESPACES.HTML && CAN_BE_DISABLED.includes(element._localName) && !isDisabled(element);
    case 'checked':
      return isChecked(element);
    case 'not':
      return !matchesList(element, test.list);
    case 'is':
      return matchesList(element, test.list);
    case 'nth-child':
    case 'nth-last-child':
      if (test.list && !matchesList(element, test.list)) return false;
      return isNth(test.nth, indexOf(element, test.kind === 'nth-last-child', false, test.list));
    case 'nth-of-type':
    case 'nth-last-of-type':
      return isNth(test.nth, indexOf(element, test.kind === 'nth-last-of-type', true, null));
    case 'first-of-type':
      return indexOf(element, false, true, null) === 1;
    case 'last-of-type':
      return indexOf(element, true, true, null) === 1;
    case 'only-of-type':
      return indexOf(element, false, true, null) === 1 && indexOf(element, true, true, null) === 1;
    case 'first-child':
      return elementSiblings(element, false).length === 0;
    case 'last-child':
      return elementSiblings(element, true).length === 0;
    case 'only-child':
      return elementSiblings(element, false).length === 0 && elementSiblings(element, true).length === 0;
    case 'empty':
      for (let child = element._first; child; child = child._next) {
        if (child.nodeType === NODE_TYPES.ELEMENT_NODE || (child.nodeType === NODE_TYPES.TEXT_NODE && child._data)) {
          return false;
        }
      }
      return true;
    case 'root':
      return element._parent !== null && element._parent.nodeType === NODE_TYPES.DOCUMENT_NODE;
    case 'scope':
      return scope.nodeType === NODE_TYPES.DOCUMENT_NODE ? element === scope.documentElement : element === scope;
    default:
      return false;
  }
}

// Whether an element matches a complex selector from its part at an index (right to left).
function matchesComplex(element, complex, index = 0) {
  const { compound, combinator } = complex[index];
  if (!compound.every((test) => testOne(element, test))) return false;
  if (index === complex.length - 1) return true;
  const isElement = (node) => node && node.nodeType === NODE_TYPES.ELEMENT_NODE;
  switch (combinator) {
    case '>':
      return isElement(element._parent) && matchesComplex(element._parent, complex, index + 1);
    case '+': {
      const [previous] = elementSiblings(element, false);
      return Boolean(previous) && matchesComplex(previous, complex, index + 1);
    }
    case '~':
      return elementSiblings(element, false).some((sibling) => matchesComplex(sibling, complex, index + 1));
    default:
      for (let node = element._parent; isElement(node); node = node._parent) {
        if (matchesComplex(node, complex, index + 1)) return true;
      }
      return false;
  }
}

function matchesList(element, list) {
  return list.some((complex) => matchesComplex(element, complex));
}

// The scoping root of :scope while a selector is matched (the element of matches(), the root of select()).
let scope = null;

function matches(element, selector) {
  const list = parse(selector);
  scope = element;
  return matchesList(element, list);
}

// The descendant elements of a node that match, in tree order.
function select(root, selector) {
  const list = parse(selector);
  scope = root;
  return root._descendants((element) => matchesList(element, list));
}

// The element or its nearest ancestor that matches, :scope being the element.
function closest(element, selector) {
  const list = parse(selector);
  scope = element;
  for (let node = element; node && node.nodeType === NODE_TYPES.ELEMENT_NODE; node = node._parent) {
    if (matchesList(node, list)) return node;
  }
  return null;
}

export { closest, matches, select };
