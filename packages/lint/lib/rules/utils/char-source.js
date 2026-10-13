// The characters (UTF-16 code units) of a string literal or a template's text, each with the source it is written
// with and where that starts in the literal: `'a\x62\u{1F600}'` is a (start 1), b (start 2, source \x62), and the
// two units of 😀 (both start 6, source \u{1F600}). A line continuation is no character.

class CodeUnit {
  constructor(start, source) {
    this.start = start;
    this.source = source;
  }

  get end() {
    return this.start + this.length;
  }

  get length() {
    return this.source.length;
  }
}

const SIMPLE_ESCAPES = { __proto__: null, b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
const UNICODE_BRACES = /\{(?<hex>[\dA-F]+)\}/iuy;

// The value of an escape (or a line continuation: ''), at `at` (the backslash); and where it ends.
function readEscape(source, at) {
  const char = source[at + 1];
  let end = at + 2;
  if (SIMPLE_ESCAPES[char]) return { value: SIMPLE_ESCAPES[char], end };
  switch (char) {
    case 'x':
      return { value: String.fromCharCode(parseInt(source.slice(end, end + 2), 16)), end: end + 2 };
    case 'u': {
      UNICODE_BRACES.lastIndex = end;
      const match = UNICODE_BRACES.exec(source);
      if (match) return { value: String.fromCodePoint(parseInt(match.groups.hex, 16)), end: UNICODE_BRACES.lastIndex };
      return { value: String.fromCharCode(parseInt(source.slice(end, end + 4), 16)), end: end + 4 };
    }
    case '\r':
      if (source[end] === '\n') end += 1;
      return { value: '', end };
    case '\n':
    case '\u2028':
    case '\u2029':
      return { value: '', end };
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7': {
      // Legacy octal: up to three digits from 0-3, two from 4-7.
      const [octal] = source.slice(at + 1, at + 1 + (char <= '3' ? 3 : 2)).match(/^[0-7]+/u);
      return { value: String.fromCharCode(parseInt(octal, 8)), end: at + 1 + octal.length };
    }
    default:
      return { value: char, end };
  }
}

// The code units an escape is: none, one, or two (a code point above U+FFFF), each with the escape's source.
function escapeUnits(source, at, units) {
  const { value, end } = readEscape(source, at);
  const written = source.slice(at, end);
  for (let i = 0; i < Math.min(value.length, 2); i++) units.push(new CodeUnit(at, written));
  return end;
}

/** The code units of a string literal ('...' or "..."), its quotes included in the source given. */
function parseStringLiteral(source) {
  const quote = source[0];
  const units = [];
  for (let at = 1; source[at] !== quote;) {
    if (source[at] === '\\') {
      at = escapeUnits(source, at, units);
    } else {
      units.push(new CodeUnit(at, source[at]));
      at += 1;
    }
  }
  return units;
}

/** The code units of a template's text (from ` or } to ` or ${), \r\n as one. */
function parseTemplateToken(source) {
  const units = [];
  for (let at = 1; source[at] !== '`' && !(source[at] === '$' && source[at + 1] === '{');) {
    if (source[at] === '\\') {
      at = escapeUnits(source, at, units);
    } else {
      const written = source[at] === '\r' && source[at + 1] === '\n' ? '\r\n' : source[at];
      units.push(new CodeUnit(at, written));
      at += written.length;
    }
  }
  return units;
}

export { parseStringLiteral, parseTemplateToken };
