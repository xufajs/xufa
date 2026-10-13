// The tokens of the language of OpenL Tablets (Java's, with its own): numbers with the suffixes of Java (10L, 1.5f,
// 2d) and percents (10%), strings and chars, names ($Column$Row and $Name of spreadsheets too), and operators, the
// longest first (==== before ==, <== before <=, string== before string).
import { RulesError } from '../values.js';

const OPERATORS = [
  'string<>',
  'string!=',
  'string==',
  'string<=',
  'string>=',
  'string<',
  'string>',
  '!===',
  '====',
  '<===',
  '>===',
  '>>>=',
  '>>>',
  '<<=',
  '>>=',
  '!==',
  '<==',
  '>==',
  '**',
  '==',
  '!=',
  '<>',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '<<',
  '>>',
  '!>',
  '!<',
  '^@',
  'v@',
  '~@',
  '*!@',
  '*@',
  '!@',
  '@',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '=',
  '!',
  '?',
  ':',
  '.',
  ',',
  ';',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '&',
  '|',
  '^',
  '~',
];

const isDigit = (char) => char >= '0' && char <= '9';
const isNameStart = (char) => /[A-Za-z_$À-￿]/.test(char);
const isNamePart = (char) => /[\w$À-￿]/.test(char);

class OpenLSyntaxError extends RulesError {
  constructor(message, source, at) {
    super(`${message} (column ${at + 1} of "${source}")`, 'XUFA_RULES_ERR_EXPRESSION');
    this.at = at;
  }
}

function readNumber(source, i) {
  const start = i;
  let kind = 'int';
  if (source[i] === '0' && /[xX]/.test(source[i + 1] ?? '')) {
    i += 2;
    while (/[\da-fA-F_]/.test(source[i] ?? '')) i += 1;
  } else {
    while (isDigit(source[i] ?? '') || source[i] === '_') i += 1;
    if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
      kind = 'double';
      i += 1;
      while (isDigit(source[i] ?? '') || source[i] === '_') i += 1;
    }
    if (/[eE]/.test(source[i] ?? '') && /[\d+-]/.test(source[i + 1] ?? '')) {
      kind = 'double';
      i += 2;
      while (isDigit(source[i] ?? '')) i += 1;
    }
  }
  let text = source.slice(start, i).replace(/_/g, '');
  const suffix = source[i] ?? '';
  if (/[lL]/.test(suffix)) {
    kind = 'long';
    i += 1;
  } else if (/[fF]/.test(suffix)) {
    kind = 'float';
    i += 1;
  } else if (/[dD]/.test(suffix) && !isNamePart(source[i + 1] ?? '')) {
    kind = 'double';
    i += 1;
  }
  // 10%: a percent (when no operand follows the %).
  let percent = false;
  if (source[i] === '%' && !/^\s*[\w($"'-]/.test(source.slice(i + 1))) {
    percent = true;
    i += 1;
  }
  let value;
  if (/^0[xX]/.test(text)) value = parseInt(text, 16);
  else if (kind === 'int' && /^0\d+$/.test(text)) value = parseInt(text, 8);
  else value = Number(text);
  if (percent) {
    // (Of the digits written: 0.07% is exactly 0.0007.)
    value = /^0[xX]/.test(text) ? value / 100 : Number(`${text}e-2`);
    kind = 'double';
  }
  if (kind === 'int' && !Number.isSafeInteger(value)) kind = 'long';
  else if (kind === 'int' && (value > 2147483647 || value < -2147483648)) kind = 'long';
  return { token: { type: 'number', value, kind, text: source.slice(start, i) }, end: i };
}

function readString(source, i) {
  const quote = source[i];
  let value = '';
  i += 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === '\\') {
      const next = source[i + 1];
      const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0', '\\': '\\', '"': '"', "'": "'" };
      if (next === 'u') {
        value += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      value += escapes[next] ?? next;
      i += 2;
      continue;
    }
    value += source[i];
    i += 1;
  }
  if (source[i] !== quote) throw new OpenLSyntaxError('A text without its end', source, i);
  return { token: { type: quote === "'" && value.length === 1 ? 'char' : 'string', value }, end: i + 1 };
}

// The tokens of a source: { type: number | string | char | name | operator | end, value, at }.
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    const at = i;
    if (isDigit(char) || (char === '.' && isDigit(source[i + 1] ?? ''))) {
      const { token, end } = readNumber(source, i);
      tokens.push({ ...token, at });
      i = end;
      continue;
    }
    // `Name`: a name of any characters.
    if (char === '`') {
      const close = source.indexOf('`', i + 1);
      if (close === -1) throw new OpenLSyntaxError('A name without its end', source, i);
      tokens.push({ type: 'name', value: source.slice(i + 1, close), at });
      i = close + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const { token, end } = readString(source, i);
      tokens.push({ ...token, at });
      i = end;
      continue;
    }
    // string== and the other operators of texts are words followed by an operator.
    const operator = OPERATORS.find((op) => source.startsWith(op, i));
    if (operator && operator.startsWith('string')) {
      tokens.push({ type: 'operator', value: operator, at });
      i += operator.length;
      continue;
    }
    if (isNameStart(char)) {
      let end = i + 1;
      while (end < source.length && isNamePart(source[end])) end += 1;
      // v@ is an operator, not the name v.
      if (source.slice(i, end) === 'v' && source[end] === '@') {
        tokens.push({ type: 'operator', value: 'v@', at });
        i = end + 1;
        continue;
      }
      tokens.push({ type: 'name', value: source.slice(i, end), at });
      i = end;
      continue;
    }
    if (operator) {
      tokens.push({ type: 'operator', value: operator, at });
      i += operator.length;
      continue;
    }
    throw new OpenLSyntaxError(`Unexpected "${char}"`, source, i);
  }
  tokens.push({ type: 'end', value: null, at: source.length });
  return tokens;
}

export { tokenize, OpenLSyntaxError };
