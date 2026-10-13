// JSON, JSON5 and JSON with comments, read as prettier reads them: the tree Babel's parseExpression() makes of them
// (ObjectExpression, ObjectProperty, StringLiteral, NumericLiteral... with start, end and extra.raw), checked as
// prettier's json parsers check it, in a JsonRoot. A parser of its own: formatting JSON loads no TypeScript (whose
// loading took most of formatting a few JSON files).
//
// What is JSON here is what prettier formats as JSON: comments, trailing commas, holes in arrays, keys that are names
// or numbers, strings in single quotes, numbers as JavaScript writes them (hex, .5, +1), Infinity, NaN, undefined and
// templates without expressions. Anything else of JavaScript is an error, as prettier's: "Identifier 'a' is not
// allowed in JSON.", or a syntax error.

import createError from '../src/common/parser-create-error.js';

const ID_START = /[\p{ID_Start}$_]/u;
const ID_CONTINUE = /[\p{ID_Continue}$‌‍]/u;
const SINGLE_ESCAPES = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', 0: '\0' };

const isLineBreak = (code) => code === 10 || code === 13 || code === 0x2028 || code === 0x2029;
// JavaScript's white space: tab, vertical tab, form feed, space, no-break space, BOM and the Space_Separator class.
const isSpace = (code) =>
  code === 9 ||
  code === 11 ||
  code === 12 ||
  code === 32 ||
  code === 0xa0 ||
  code === 0xfeff ||
  (code > 0x7f && /\p{Space_Separator}/u.test(String.fromCharCode(code)));
const isDigit = (code) => code >= 48 && code <= 57;

/**
 * The JsonRoot of `text`: { type: 'JsonRoot', node, comments, range }. Options: allowComments (false: comments are
 * errors, as for json-stringify), allowEmpty (true: a text of comments only has no node, as for jsonc).
 */
export function parseJson(text, { allowComments = true, allowEmpty = false } = {}) {
  const parser = new Parser(text);
  parser.skipTrivia();
  let node;
  if (parser.index < text.length || !allowEmpty) {
    node = parser.parseValue();
    parser.skipTrivia();
    if (parser.index < text.length) parser.unexpected();
  }
  const { comments } = parser;
  if (!allowComments && comments.length) throw notAllowed(text, comments[0], 'Comment');
  if (node) check(text, node);
  const root = { type: 'JsonRoot', comments, range: [0, text.length], rootMarker: undefined };
  if (node) root.node = node;
  return root;
}

class Parser {
  constructor(text) {
    this.text = text;
    this.index = 0;
    this.comments = [];
  }

  // White space and comments (kept).
  skipTrivia() {
    const { text } = this;
    while (this.index < text.length) {
      const code = text.charCodeAt(this.index);
      if (isSpace(code) || isLineBreak(code)) {
        this.index++;
      } else if (code === 47 && text.charCodeAt(this.index + 1) === 47) {
        const start = this.index;
        let end = start + 2;
        while (end < text.length && !isLineBreak(text.charCodeAt(end))) end++;
        this.comments.push({ type: 'CommentLine', value: text.slice(start + 2, end), start, end });
        this.index = end;
      } else if (code === 47 && text.charCodeAt(this.index + 1) === 42) {
        const start = this.index;
        const close = text.indexOf('*/', start + 2);
        if (close === -1) this.fail('Unterminated comment.', start);
        const end = close + 2;
        this.comments.push({ type: 'CommentBlock', value: text.slice(start + 2, close), start, end });
        this.index = end;
      } else {
        break;
      }
    }
  }

  parseValue() {
    const { text } = this;
    const start = this.index;
    const code = text.charCodeAt(start);
    switch (code) {
      case 123: // {
        return this.parseObject();
      case 91: // [
        return this.parseArray();
      case 34: // "
      case 39: // '
        return this.parseString();
      case 96: // `
        return this.parseTemplate();
      case 43: // +
      case 45: // -
      case 33: // !
      case 126: {
        // ~
        this.index++;
        this.skipTrivia();
        if (this.index >= text.length) this.unexpected();
        const argument = this.parseValue();
        return { type: 'UnaryExpression', start, end: argument.end, operator: text[start], prefix: true, argument };
      }
      case 40: // (
        // (Babel keeps it as a ParenthesizedExpression, which prettier's check refuses.)
        return this.parseParenthesized();
    }
    if (isDigit(code) || (code === 46 && isDigit(text.charCodeAt(start + 1)))) return this.parseNumber();
    if (this.isIdentifierStart(start)) {
      const name = this.readName();
      const end = this.index;
      switch (name) {
        case 'true':
        case 'false':
          return { type: 'BooleanLiteral', start, end, value: name === 'true' };
        case 'null':
          return { type: 'NullLiteral', start, end };
        default:
          return { type: 'Identifier', start, end, name };
      }
    }
    return this.unexpected();
  }

  parseObject() {
    const { text } = this;
    const start = this.index;
    this.index++;
    const properties = [];
    const node = { type: 'ObjectExpression', start, end: 0, properties };
    for (;;) {
      this.skipTrivia();
      const code = text.charCodeAt(this.index);
      if (code === 125) break; // }
      if (code === 91) {
        // A computed key: [a]: b.
        const keyStart = this.index;
        this.index++;
        this.skipTrivia();
        const key = this.parseValue();
        this.skipTrivia();
        this.expect(93);
        this.skipTrivia();
        this.expect(58);
        this.skipTrivia();
        const value = this.parseValue();
        properties.push({
          type: 'ObjectProperty',
          start: keyStart,
          end: value.end,
          method: false,
          key,
          computed: true,
          shorthand: false,
          value,
        });
      } else {
        const key = this.parseKey();
        this.skipTrivia();
        if (text.charCodeAt(this.index) === 58) {
          this.index++;
          this.skipTrivia();
          const value = this.parseValue();
          properties.push({
            type: 'ObjectProperty',
            start: key.start,
            end: value.end,
            method: false,
            key,
            computed: false,
            shorthand: false,
            value,
          });
        } else if (
          key.type === 'Identifier' &&
          (text.charCodeAt(this.index) === 44 || text.charCodeAt(this.index) === 125)
        ) {
          // { a }: shorthand, refused by the check.
          properties.push({
            type: 'ObjectProperty',
            start: key.start,
            end: key.end,
            method: false,
            key,
            computed: false,
            shorthand: true,
            value: key,
          });
        } else {
          this.unexpected();
        }
      }
      this.skipTrivia();
      if (text.charCodeAt(this.index) === 44) {
        const comma = this.index;
        this.index++;
        this.skipTrivia();
        if (text.charCodeAt(this.index) === 125) {
          node.extra = { trailingComma: comma };
          break;
        }
        continue;
      }
      if (text.charCodeAt(this.index) !== 125) this.unexpected();
    }
    this.index++;
    node.end = this.index;
    return node;
  }

  // A key: a string, a number or a name (any, as true or class).
  parseKey() {
    const { text } = this;
    const code = text.charCodeAt(this.index);
    if (code === 34 || code === 39) return this.parseString();
    if (isDigit(code) || (code === 46 && isDigit(text.charCodeAt(this.index + 1)))) return this.parseNumber();
    if (this.isIdentifierStart(this.index)) {
      const start = this.index;
      const name = this.readName();
      return { type: 'Identifier', start, end: this.index, name };
    }
    return this.unexpected();
  }

  parseArray() {
    const { text } = this;
    const start = this.index;
    this.index++;
    const elements = [];
    const node = { type: 'ArrayExpression', start, end: 0, elements };
    for (;;) {
      this.skipTrivia();
      const code = text.charCodeAt(this.index);
      if (code === 93) break; // ]
      if (code === 44) {
        // A hole.
        elements.push(null);
        this.index++;
        continue;
      }
      elements.push(this.parseValue());
      this.skipTrivia();
      if (text.charCodeAt(this.index) === 44) {
        const comma = this.index;
        this.index++;
        this.skipTrivia();
        if (text.charCodeAt(this.index) === 93) {
          node.extra = { trailingComma: comma };
          break;
        }
        continue;
      }
      if (text.charCodeAt(this.index) !== 93) this.unexpected();
    }
    this.index++;
    node.end = this.index;
    return node;
  }

  parseString() {
    const { text } = this;
    const start = this.index;
    const quote = text.charCodeAt(start);
    let value = '';
    let chunk = start + 1;
    let index = start + 1;
    for (;;) {
      if (index >= text.length) this.fail('Unterminated string constant.', start);
      const code = text.charCodeAt(index);
      if (code === quote) break;
      if (code === 92) {
        value += text.slice(chunk, index);
        const [cooked, next] = this.readEscape(index);
        value += cooked;
        index = next;
        chunk = index;
        continue;
      }
      if (code === 10 || code === 13) this.fail('Unterminated string constant.', start);
      index++;
    }
    value += text.slice(chunk, index);
    this.index = index + 1;
    const raw = text.slice(start, this.index);
    return { type: 'StringLiteral', start, end: this.index, extra: { rawValue: value, raw }, value };
  }

  // An escape at `index` (its backslash): [what it stands for, where the text goes on].
  readEscape(index) {
    const { text } = this;
    const character = text[index + 1];
    if (character === undefined) this.fail('Unterminated string constant.', index);
    if (Object.hasOwn(SINGLE_ESCAPES, character) && !(character === '0' && isDigit(text.charCodeAt(index + 2)))) {
      return [SINGLE_ESCAPES[character], index + 2];
    }
    if (character === '\r') return ['', text[index + 2] === '\n' ? index + 3 : index + 2];
    if (isLineBreak(character.charCodeAt(0))) return ['', index + 2];
    if (character === 'x') {
      const hex = text.slice(index + 2, index + 4);
      if (!/^[\da-fA-F]{2}$/.test(hex)) this.fail('Bad character escape sequence.', index);
      return [String.fromCharCode(Number.parseInt(hex, 16)), index + 4];
    }
    if (character === 'u') {
      if (text[index + 2] === '{') {
        const close = text.indexOf('}', index + 3);
        const hex = close === -1 ? '' : text.slice(index + 3, close);
        if (!/^[\da-fA-F]+$/.test(hex) || Number.parseInt(hex, 16) > 0x10ffff)
          this.fail('Bad character escape sequence.', index);
        return [String.fromCodePoint(Number.parseInt(hex, 16)), close + 1];
      }
      const hex = text.slice(index + 2, index + 6);
      if (!/^[\da-fA-F]{4}$/.test(hex)) this.fail('Bad character escape sequence.', index);
      return [String.fromCharCode(Number.parseInt(hex, 16)), index + 6];
    }
    if (/[0-7]/.test(character)) {
      // A legacy octal escape (sloppy code, as Babel's parseExpression reads it).
      const digits = /^[0-7]{1,3}/.exec(text.slice(index + 1))[0];
      let octal = digits;
      if (Number.parseInt(octal, 8) > 255) octal = octal.slice(0, -1);
      return [String.fromCharCode(Number.parseInt(octal, 8)), index + 1 + octal.length];
    }
    return [character, index + 2];
  }

  parseNumber() {
    const { text } = this;
    const start = this.index;
    const rest = text.slice(start, start + 400);
    const match =
      /^0[xX][\da-fA-F](?:_?[\da-fA-F])*n?|^0[oO][0-7](?:_?[0-7])*n?|^0[bB][01](?:_?[01])*n?|^(?:(?:\d(?:_?\d)*)?\.\d(?:_?\d)*|\d(?:_?\d)*\.?)(?:[eE][+-]?\d(?:_?\d)*)?|^\d(?:_?\d)*n/.exec(
        rest.length < 400 ? rest : text.slice(start)
      );
    if (!match) this.unexpected();
    const raw = match[0];
    this.index = start + raw.length;
    if (this.index < text.length && this.isIdentifierStart(this.index))
      this.fail('Identifier directly after number.', this.index);
    if (raw.endsWith('n')) {
      return {
        type: 'BigIntLiteral',
        start,
        end: this.index,
        extra: { rawValue: raw.slice(0, -1), raw },
        value: raw.slice(0, -1),
      };
    }
    const digits = raw.replaceAll('_', '');
    let value;
    if (/^0\d+$/.test(digits)) value = /[89]/.test(digits) ? Number(digits) : Number.parseInt(digits, 8);
    else value = Number(digits);
    return { type: 'NumericLiteral', start, end: this.index, extra: { rawValue: value, raw }, value };
  }

  parseTemplate() {
    const { text } = this;
    const start = this.index;
    let index = start + 1;
    let cooked = '';
    let chunk = index;
    for (;;) {
      if (index >= text.length) this.fail('Unterminated template.', start);
      const code = text.charCodeAt(index);
      if (code === 96) break;
      if (code === 36 && text.charCodeAt(index + 1) === 123) {
        // An expression: TemplateLiteral with expressions, refused by the check.
        this.fail("'TemplateLiteral' with expression is not allowed in JSON.", index + 2);
      }
      if (code === 92) {
        cooked += text.slice(chunk, index);
        const [value, next] = this.readEscape(index);
        cooked += value;
        index = next;
        chunk = index;
        continue;
      }
      index++;
    }
    cooked += text.slice(chunk, index);
    const raw = text.slice(start + 1, index).replace(/\r\n?/g, '\n');
    this.index = index + 1;
    const quasi = { type: 'TemplateElement', start: start + 1, end: index, value: { raw, cooked }, tail: true };
    return { type: 'TemplateLiteral', start, end: this.index, expressions: [], quasis: [quasi] };
  }

  parseParenthesized() {
    const start = this.index;
    this.index++;
    this.skipTrivia();
    const expression = this.parseValue();
    this.skipTrivia();
    this.expect(41);
    return { type: 'ParenthesizedExpression', start, end: this.index, expression };
  }

  isIdentifierStart(index) {
    const code = this.text.codePointAt(index);
    if (code === undefined) return false;
    if ((code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 36 || code === 95) return true;
    return code > 0x7f && ID_START.test(String.fromCodePoint(code));
  }

  readName() {
    const { text } = this;
    const start = this.index;
    let index = start;
    while (index < text.length) {
      const code = text.codePointAt(index);
      if (
        (code >= 97 && code <= 122) ||
        (code >= 65 && code <= 90) ||
        isDigit(code) ||
        code === 36 ||
        code === 95 ||
        (code > 0x7f && ID_CONTINUE.test(String.fromCodePoint(code)))
      ) {
        index += code > 0xffff ? 2 : 1;
      } else {
        break;
      }
    }
    this.index = index;
    return text.slice(start, index);
  }

  expect(code) {
    if (this.text.charCodeAt(this.index) !== code) this.unexpected();
    this.index++;
  }

  unexpected() {
    if (this.index >= this.text.length) this.fail('Unexpected token, expected more.', this.index);
    this.fail('Unexpected token.', this.index);
  }

  fail(message, index) {
    throw errorAt(this.text, message, index, index);
  }
}

// Where an offset is: { line (from 1), column (from 0) }.
function position(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (let index = text.indexOf('\n'); index !== -1 && index < offset; index = text.indexOf('\n', index + 1)) {
    line++;
    lineStart = index + 1;
  }
  return { line, column: offset - lineStart };
}

function errorAt(text, message, start, end) {
  const [from, to] = [position(text, start), position(text, end)];
  return createError(message, {
    loc: { start: { line: from.line, column: from.column + 1 }, end: { line: to.line, column: to.column + 1 } },
  });
}

// A node of JavaScript that is not JSON: as prettier says it.
function notAllowed(text, node, what) {
  return errorAt(text, `${what} is not allowed in JSON.`, node.start, node.end);
}

// prettier's check of the tree (its json parsers' assertJsonNode).
function check(text, node) {
  switch (node.type) {
    case 'ArrayExpression':
      for (const element of node.elements) if (element !== null) check(text, element);
      return;
    case 'ObjectExpression':
      for (const property of node.properties) check(text, property);
      return;
    case 'ObjectProperty':
      if (node.computed) throw notAllowed(text, node.key, 'Computed key');
      if (node.shorthand) throw notAllowed(text, node.key, 'Shorthand property');
      if (node.key.type !== 'Identifier') check(text, node.key);
      check(text, node.value);
      return;
    case 'UnaryExpression': {
      const { operator, argument } = node;
      if (operator !== '+' && operator !== '-') throw notAllowed(text, node, `Operator '${operator}'`);
      if (
        argument.type === 'NumericLiteral' ||
        (argument.type === 'Identifier' && (argument.name === 'Infinity' || argument.name === 'NaN'))
      ) {
        return;
      }
      throw notAllowed(text, argument, `Operator '${operator}' before '${argument.type}'`);
    }
    case 'Identifier':
      if (node.name !== 'Infinity' && node.name !== 'NaN' && node.name !== 'undefined') {
        throw notAllowed(text, node, `Identifier '${node.name}'`);
      }
      return;
    case 'TemplateLiteral':
      for (const quasi of node.quasis) check(text, quasi);
      return;
    case 'NullLiteral':
    case 'BooleanLiteral':
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'TemplateElement':
      return;
    default:
      throw notAllowed(text, node, `'${node.type}'`);
  }
}
