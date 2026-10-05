// The tokens of an expression: numbers, strings, template literals (their parts and the tokens of their ${}),
// names and punctuators. Each token has its type, value and position in the source.
const { ExpressionError } = require('./errors');

// Longest first, so '===' is not read as '==' and '='.
const PUNCTUATORS = [
  '>>>',
  '...',
  '===',
  '!==',
  '**',
  '?.',
  '??',
  '=>',
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
];

const NAME = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const DECIMAL = /(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*|\.)?(?:[eE][+-]?\d(?:_?\d)*)?/y;
const RADIX = /0([xX][\da-fA-F](?:_?[\da-fA-F])*|[oO][0-7](?:_?[0-7])*|[bB][01](?:_?[01])*)(n?)/y;
const BIGINT = /(\d(?:_?\d)*)n/y;
const SPACE = /[\s\uFEFF]/;

const isDigit = (char) => char >= '0' && char <= '9';

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

// Tokens from `start`; with `nested`, until the } that closes a ${ (its position is `end`).
function tokenize(source, start = 0, nested = false) {
  const tokens = [];
  let i = start;
  let depth = 0;
  const { length } = source;
  while (i < length) {
    const char = source[i];
    if (SPACE.test(char)) {
      i += 1;
      continue;
    }
    // Comments are not part of expressions.
    if (char === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      throw new ExpressionError('Comments are not allowed in expressions', { source, position: i });
    }
    if (isDigit(char) || (char === '.' && isDigit(source[i + 1] || ''))) {
      tokens.push(readNumber(source, i));
      i = tokens[tokens.length - 1].end;
      continue;
    }
    if (char === '"' || char === "'") {
      const token = readString(source, i);
      tokens.push(token);
      i = token.end;
      continue;
    }
    if (char === '`') {
      const token = readTemplate(source, i);
      tokens.push(token);
      i = token.end;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(source);
    if (name) {
      tokens.push({ type: 'name', value: name[0], start: i, end: i + name[0].length });
      i += name[0].length;
      continue;
    }
    let punctuator = null;
    for (let p = 0; p < PUNCTUATORS.length; p += 1) {
      if (source.startsWith(PUNCTUATORS[p], i)) {
        punctuator = PUNCTUATORS[p];
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
    tokens.push({ type: 'punctuator', value: punctuator, start: i, end: i + punctuator.length });
    i += punctuator.length;
  }
  if (nested) throw new ExpressionError('Unterminated template literal', { source, position: start });
  return { tokens, end: i };
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

// A template literal: its texts (cooked) and the tokens of each ${}.
function readTemplate(source, i) {
  const quasis = [];
  const expressions = [];
  let text = '';
  let j = i + 1;
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
      text = '';
      const inner = tokenize(source, j + 2, true);
      expressions.push({ tokens: inner.tokens, start: j + 2, end: inner.end });
      j = inner.end + 1;
    } else {
      // Line ends are \n, as JavaScript reads them in template literals.
      if (char === '\r') text += source[j + 1] === '\n' ? '' : '\n';
      else text += char;
      j += 1;
    }
  }
  quasis.push(text);
  return { type: 'template', quasis, expressions, start: i, end: j + 1 };
}

module.exports = { tokenize };
