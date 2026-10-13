// The tokens of an expression: numbers, strings, template literals (their parts and the tokens of their ${}),
// regular expressions (a / where a value starts), names and punctuators. Each token has its type, value and position in the source, and `newline` when a line ends
// before it (where a statement can end without its ;). Comments only in programs (`comments`).
import { ExpressionError } from './errors.js';

// Longest first, so '===' is not read as '==' and '='.
const PUNCTUATORS = [
  '>>>=',
  '>>>',
  '...',
  '**=',
  '<<=',
  '>>=',
  '&&=',
  '||=',
  '??=',
  '===',
  '!==',
  '**',
  '?.',
  '??',
  '=>',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '~',
  '&',
  '|',
  '^',
  '?',
  ':',
  ',',
  '.',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '=',
  ';',
];

// The punctuators by their first character (each list longest first).
const BY_FIRST = new Map();
for (const punctuator of PUNCTUATORS) {
  if (!BY_FIRST.has(punctuator[0])) BY_FIRST.set(punctuator[0], []);
  BY_FIRST.get(punctuator[0]).push(punctuator);
}

const NAME = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const DECIMAL = /(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*|\.)?(?:[eE][+-]?\d(?:_?\d)*)?/y;
const RADIX = /0([xX][\da-fA-F](?:_?[\da-fA-F])*|[oO][0-7](?:_?[0-7])*|[bB][01](?:_?[01])*)(n?)/y;
const BIGINT = /(\d(?:_?\d)*)n/y;
const SPACE = /[\s\uFEFF]/;

const isDigit = (char) => char >= '0' && char <= '9';
// (ASCII letters, $ and _; and digits too after the first: names without the regular expression of Unicode.)
const isNameStart = (code) => (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 36 || code === 95;
const isNamePart = (code) => isNameStart(code) || (code >= 48 && code <= 57);

// The value of an escape sequence at source[i] (after the backslash): [text, length].
function escapeAt(source, i, position) {
  const char = source[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };
  if (char in simple) return [simple[char], 1];
  if (char === '0' && !isDigit(source[i + 1] || '')) return ['\0', 1];
  if (char === 'x') {
    const hex = source.slice(i + 1, i + 3);
    if (!/^[\da-fA-F]{2}$/.test(hex)) throw new ExpressionError('Invalid \\x escape', { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 3];
  }
  if (char === 'u') {
    if (source[i + 1] === '{') {
      const end = source.indexOf('}', i + 2);
      const hex = end === -1 ? '' : source.slice(i + 2, end);
      const code = /^[\da-fA-F]{1,6}$/.test(hex) ? parseInt(hex, 16) : NaN;
      if (!(code <= 0x10ffff)) throw new ExpressionError('Invalid \\u escape', { source, position });
      return [String.fromCodePoint(code), end - i + 1];
    }
    const hex = source.slice(i + 1, i + 5);
    if (!/^[\da-fA-F]{4}$/.test(hex)) throw new ExpressionError('Invalid \\u escape', { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 5];
  }
  // A line continuation: nothing.
  if (char === '\r' && source[i + 1] === '\n') return ['', 2];
  if (char === '\n' || char === '\r' || char === ' ' || char === ' ') return ['', 1];
  if (isDigit(char)) throw new ExpressionError('Octal escapes are not allowed', { source, position });
  return [char, 1];
}

const LINE = /[\n\r\u2028\u2029]/;

// Tokens from `start`; with `nested`, until the } that closes a ${ (its position is `end`). `options.comments`: // and
// /* */ are skipped (programs); else they are an error.
function tokenize(source, start = 0, nested = false, options = {}) {
  const tokens = [];
  let i = start;
  let depth = 0;
  let newline = false;
  const { length } = source;
  const push = (token) => {
    if (newline) token.newline = true;
    newline = false;
    tokens.push(token);
  };
  while (i < length) {
    const char = source[i];
    const code = source.charCodeAt(i);
    // (Spaces, tabs and line ends of ASCII without regular expressions; the others of Unicode with them.)
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 11 || code === 12) {
      if (code === 10 || code === 13) newline = true;
      i += 1;
      continue;
    }
    if (code > 127 && SPACE.test(char)) {
      if (LINE.test(char)) newline = true;
      i += 1;
      continue;
    }
    if (char === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      if (!options.comments) {
        throw new ExpressionError('Comments are not allowed in expressions', { source, position: i });
      }
      if (source[i + 1] === '/') {
        while (i < length && !LINE.test(source[i])) i += 1;
      } else {
        const end = source.indexOf('*/', i + 2);
        if (end === -1) throw new ExpressionError('Unterminated comment', { source, position: i });
        if (LINE.test(source.slice(i, end))) newline = true;
        i = end + 2;
      }
      continue;
    }
    if (char === '/' && startsValue(tokens[tokens.length - 1])) {
      const token = readRegex(source, i);
      push(token);
      i = token.end;
      continue;
    }
    if (isDigit(char) || (char === '.' && isDigit(source[i + 1] || ''))) {
      push(readNumber(source, i));
      i = tokens[tokens.length - 1].end;
      continue;
    }
    if (char === '"' || char === "'") {
      const token = readString(source, i);
      push(token);
      i = token.end;
      continue;
    }
    if (char === '`') {
      const token = readTemplate(source, i, options);
      push(token);
      i = token.end;
      continue;
    }
    // #name: a private name of a class (of programs; the parser says where it can be).
    if (char === '#') {
      NAME.lastIndex = i + 1;
      const name = NAME.exec(source);
      if (!name) throw new ExpressionError('Unexpected character "#"', { source, position: i });
      push({ type: 'private', value: name[0], start: i, end: i + 1 + name[0].length });
      i += 1 + name[0].length;
      continue;
    }
    if (isNameStart(code)) {
      let end = i + 1;
      while (end < length && isNamePart(source.charCodeAt(end))) end += 1;
      // (A name of ASCII alone; one that goes on with other characters is read by the regular expression.)
      if (end >= length || source.charCodeAt(end) < 128) {
        push({ type: 'name', value: source.slice(i, end), start: i, end });
        i = end;
        continue;
      }
    }
    NAME.lastIndex = i;
    const name = code > 127 || isNameStart(code) ? NAME.exec(source) : null;
    if (name) {
      push({ type: 'name', value: name[0], start: i, end: i + name[0].length });
      i += name[0].length;
      continue;
    }
    let punctuator = null;
    for (const candidate of BY_FIRST.get(char) ?? []) {
      if (source.startsWith(candidate, i)) {
        punctuator = candidate;
        break;
      }
    }
    // ?. followed by a digit is ? and a number (a ?.5 : 1).
    if (punctuator === '?.' && isDigit(source[i + 2] || '')) punctuator = '?';
    if (!punctuator) throw new ExpressionError(`Unexpected character ${JSON.stringify(char)}`, { source, position: i });
    if (nested) {
      if (punctuator === '{') depth += 1;
      else if (punctuator === '}') {
        if (depth === 0) return { tokens, end: i };
        depth -= 1;
      }
    }
    push({ type: 'punctuator', value: punctuator, start: i, end: i + punctuator.length });
    i += punctuator.length;
  }
  if (nested) throw new ExpressionError('Unterminated template literal', { source, position: start });
  return { tokens, end: i };
}

// Words after which a value starts (so a / there starts a regular expression).
const BEFORE_VALUE = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw']);

// Whether a value starts after a token (not after a value: a name, a number, a string, ), ] or }).
function startsValue(token) {
  if (!token) return true;
  if (token.type === 'punctuator') return ![')', ']', '}', '++', '--'].includes(token.value);
  if (token.type === 'name') return BEFORE_VALUE.has(token.value);
  return false;
}

// /pattern/flags: checked as JavaScript reads it.
function readRegex(source, i) {
  let j = i + 1;
  let inClass = false;
  for (;;) {
    const char = source[j];
    if (char === undefined || char === '\n' || char === '\r') {
      throw new ExpressionError('Unterminated regular expression', { source, position: i });
    }
    if (char === '\\') j += 2;
    else {
      if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      else if (char === '/' && !inClass) break;
      j += 1;
    }
  }
  const pattern = source.slice(i + 1, j);
  let end = j + 1;
  while (end < source.length && /[a-z]/i.test(source[end])) end += 1;
  const flags = source.slice(j + 1, end);
  try {
    RegExp(pattern, flags);
  } catch (err) {
    throw new ExpressionError(err.message, { source, position: i });
  }
  return { type: 'regex', pattern, flags, start: i, end };
}

function readNumber(source, i) {
  RADIX.lastIndex = i;
  let match = RADIX.exec(source);
  let value;
  let end;
  if (match) {
    const digits = match[1].replace(/_/g, '');
    value = match[2] ? BigInt(`0${digits}`) : Number(`0${digits}`);
    end = i + match[0].length;
  } else {
    BIGINT.lastIndex = i;
    match = BIGINT.exec(source);
    if (match) {
      value = BigInt(match[1].replace(/_/g, ''));
      end = i + match[0].length;
    } else {
      DECIMAL.lastIndex = i;
      match = DECIMAL.exec(source);
      value = Number(match[0].replace(/_/g, ''));
      end = i + match[0].length;
    }
  }
  // 3in, 1x: a number touching a name is an error, as in JavaScript.
  NAME.lastIndex = end;
  if (NAME.exec(source) && NAME.lastIndex > end) {
    throw new ExpressionError('Invalid number', { source, position: i });
  }
  return { type: 'number', value, start: i, end };
}

function readString(source, i) {
  const quote = source[i];
  let value = '';
  let j = i + 1;
  for (;;) {
    if (j >= source.length) throw new ExpressionError('Unterminated string', { source, position: i });
    const char = source[j];
    if (char === quote) break;
    if (char === '\n' || char === '\r') throw new ExpressionError('Unterminated string', { source, position: i });
    if (char === '\\') {
      const [text, length] = escapeAt(source, j + 1, j);
      value += text;
      j += 1 + length;
    } else {
      value += char;
      j += 1;
    }
  }
  return { type: 'string', value, start: i, end: j + 1 };
}

// A template literal: its texts (cooked, and raw as they are written: for tags) and the tokens of each ${}.
function readTemplate(source, i, options) {
  const quasis = [];
  const raws = [];
  const expressions = [];
  let text = '';
  let j = i + 1;
  let from = j;
  // (Raw texts with their line ends as \n, as JavaScript gives them.)
  const raw = (end) => source.slice(from, end).replace(/\r\n?/g, '\n');
  for (;;) {
    if (j >= source.length) throw new ExpressionError('Unterminated template literal', { source, position: i });
    const char = source[j];
    if (char === '`') break;
    if (char === '\\') {
      const [escaped, length] = escapeAt(source, j + 1, j);
      text += escaped;
      j += 1 + length;
    } else if (char === '$' && source[j + 1] === '{') {
      quasis.push(text);
      raws.push(raw(j));
      text = '';
      const inner = tokenize(source, j + 2, true, options);
      expressions.push({ tokens: inner.tokens, start: j + 2, end: inner.end });
      j = inner.end + 1;
      from = j;
    } else {
      // Line ends are \n, as JavaScript reads them in template literals.
      if (char === '\r') text += source[j + 1] === '\n' ? '' : '\n';
      else text += char;
      j += 1;
    }
  }
  quasis.push(text);
  raws.push(raw(j));
  return { type: 'template', quasis, raws, expressions, start: i, end: j + 1 };
}

export { tokenize };
