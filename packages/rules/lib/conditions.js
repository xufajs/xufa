// Conditions of cells as OpenL Tablets writes them in its smart and simple tables: a value, a list of values or
// ranges ("US, CA", "Z100-Z105, Z107"), or a range in any of its forms, of numbers, dates or texts; empty or * for
// any value. Numbers may have a $, commas between thousands and K, M or B after them ($1,500; 2K).
//
//   [1; 5]  (1 .. 5)  [1 - 5)  1 – 5  1 .. 5  1 … 5  <5  <=5  >1  >=1  >1 <5  1+  1 and more  more than 1  less than 5
import { normalize } from './values.js';

const NUMBER_TYPES = new Set([
  'integer',
  'int',
  'long',
  'short',
  'byte',
  'double',
  'float',
  'number',
  'bigdecimal',
  'biginteger',
  'intrange',
  'doublerange',
  'floatrange',
  'numberrange',
]);
const DATE_TYPES = new Set(['date', 'daterange', 'localdate', 'localdatetime']);
const BOOLEAN_TYPES = new Set(['boolean', 'bool']);

// The kind of the values of a type: number, date, boolean or text.
function kindOf(type) {
  const name = String(type || '')
    .toLowerCase()
    .replace(/\[\]$/, '');
  if (NUMBER_TYPES.has(name)) return 'number';
  if (DATE_TYPES.has(name)) return 'date';
  if (BOOLEAN_TYPES.has(name)) return 'boolean';
  return 'text';
}

const SCALE = { k: 1e3, m: 1e6, b: 1e9 };
// What stands for a comma between thousands while a list is split by its commas (a character of private use).
const THOUSANDS = String.fromCharCode(0xe000);

// A number as people write it: -1,500.25, $2K, 3M; NaN when it is none.
function parseNumber(text) {
  if (typeof text === 'number') return text;
  const match = /^\s*(-)?\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([kmb])?\s*$/i.exec(String(text));
  if (!match) return NaN;
  const value = Number(match[2].replace(/,/g, '')) * (match[3] ? SCALE[match[3].toLowerCase()] : 1);
  return match[1] ? -value : value;
}

// A date: ISO (1999-01-31, with a time too) or of the US (01/31/1999); NaN when it is none.
function parseDate(text) {
  if (text instanceof Date) return text.getTime();
  const value = String(text).trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (us) {
    const [hours, minutes, seconds] = [us[4], us[5], us[6]].map((part) => Number(part ?? 0));
    return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), hours, minutes, seconds);
  }
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(value))
    return Date.parse(
      value.includes('T') || value.includes(' ')
        ? value.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? '' : 'Z')
        : `${value}T00:00:00Z`
    );
  return NaN;
}

// Texts compared as OpenL does in string ranges: the numbers in them as numbers (A2 is between A1 and A10).
function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

// Texts compared as OpenL compares them, exactly: by the codes of their characters, the numbers in them as numbers.
function compareNatural(a, b) {
  const x = String(a).match(/\d+|\D+/g) || [];
  const y = String(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const digits = /^\d/.test(x[i]) && /^\d/.test(y[i]);
    if (digits) {
      const difference = Number(x[i]) - Number(y[i]);
      if (difference) return Math.sign(difference);
    } else if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return Math.sign(x.length - y.length);
}

const BOUND = /^\s*(.+?)\s*$/;

// [min, max] of a text with a separator between two values (each place of each separator tried), or null.
function splitBounds(text, separators, parse) {
  for (const separator of separators) {
    let at = text.indexOf(separator, 1);
    while (at > 0) {
      const min = parse(text.slice(0, at).trim());
      const max = parse(text.slice(at + separator.length).trim());
      if (
        !Number.isNaN(min) &&
        !Number.isNaN(max) &&
        text.slice(0, at).trim() &&
        text.slice(at + separator.length).trim()
      ) {
        return [min, max];
      }
      at = text.indexOf(separator, at + 1);
    }
  }
  return null;
}

// A range of a text, or null: { min, max, minIncluded, maxIncluded } of values as `parse` reads them (NaN: not one).
function parseRange(text, parse) {
  const value = String(text).trim();
  let match;
  // [a; b]  (a .. b)  [a - b): each separator tried at each place, until both ends are values (dates have - too).
  if ((match = /^([[(])(.+)([\])])$/.exec(value))) {
    const both = splitBounds(match[2], [';', '..', '…', '-'], parse);
    if (!both) return null;
    return { min: both[0], max: both[1], minIncluded: match[1] === '[', maxIncluded: match[3] === ']' };
  }
  // a … b (excluded), a .. b, a – b, a - b (included)
  for (const [separator, open] of [
    ['…', true],
    ['...', true],
    ['..', false],
    ['–', false],
    ['—', false],
    ['-', false],
    [';', false],
  ]) {
    if (!value.includes(separator)) continue;
    const both = splitBounds(value, [separator], parse);
    if (both) return { min: both[0], max: both[1], minIncluded: !open, maxIncluded: !open };
  }
  // more than a less than b (either order)
  if ((match = /^more\s+than\s+(.+?)\s+less\s+than\s+(.+)$/i.exec(value))) {
    const [min, max] = [parse(match[1]), parse(match[2])];
    return Number.isNaN(min) || Number.isNaN(max) ? null : { min, max, minIncluded: false, maxIncluded: false };
  }
  if ((match = /^less\s+than\s+(.+?)\s+more\s+than\s+(.+)$/i.exec(value))) {
    const [max, min] = [parse(match[1]), parse(match[2])];
    return Number.isNaN(min) || Number.isNaN(max) ? null : { min, max, minIncluded: false, maxIncluded: false };
  }
  // a or less, a or more
  if ((match = /^(.+?)\s+or\s+less$/i.exec(value))) {
    const max = parse(match[1]);
    return Number.isNaN(max) ? null : { min: -Infinity, max, minIncluded: true, maxIncluded: true };
  }
  if ((match = /^(.+?)\s+or\s+more$/i.exec(value))) {
    const min = parse(match[1]);
    return Number.isNaN(min) ? null : { min, max: Infinity, minIncluded: true, maxIncluded: true };
  }
  // a+, a and more, more than a, less than b
  if ((match = /^(.+?)\s*\+$/.exec(value)) || (match = /^(.+?)\s+and\s+more$/i.exec(value))) {
    const min = parse(match[1]);
    return Number.isNaN(min) ? null : { min, max: Infinity, minIncluded: true, maxIncluded: true };
  }
  if ((match = /^more\s+than\s+(.+)$/i.exec(value))) {
    const min = parse(match[1]);
    return Number.isNaN(min) ? null : { min, max: Infinity, minIncluded: false, maxIncluded: true };
  }
  if ((match = /^less\s+than\s+(.+)$/i.exec(value))) {
    const max = parse(match[1]);
    return Number.isNaN(max) ? null : { min: -Infinity, max, minIncluded: true, maxIncluded: false };
  }
  // <b, <=b, >a, >=a, and two of them (>a <b in any order)
  const parts = value.match(/(<=|>=|<|>)\s*[^<>]+/g);
  if (parts && parts.join('').replace(/\s/g, '') === value.replace(/\s/g, '') && parts.length <= 2) {
    const range = { min: -Infinity, max: Infinity, minIncluded: true, maxIncluded: true };
    for (const part of parts) {
      const [, operator, bound] = /^(<=|>=|<|>)\s*(.+)$/.exec(part.trim());
      const limit = parse(BOUND.exec(bound)[1]);
      if (Number.isNaN(limit)) return null;
      if (operator[0] === '<') {
        range.max = limit;
        range.maxIncluded = operator === '<=';
      } else {
        range.min = limit;
        range.minIncluded = operator === '>=';
      }
    }
    return range;
  }
  return null;
}

// Splits a list by its commas (not those escaped as \,).
function splitList(text) {
  const items = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\' && text[i + 1] === ',') {
      current += ',';
      i += 1;
    } else if (text[i] === ',') {
      items.push(current.trim());
      current = '';
    } else current += text[i];
  }
  items.push(current.trim());
  return items.filter((item) => item !== '');
}

const textRange = (text) => {
  // Z100-Z105: a range of texts only when both ends are a prefix and a number, the same prefix.
  const match = /^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/.exec(String(text).trim());
  if (!match || match[1].toLowerCase() !== match[3].toLowerCase()) return null;
  return { min: `${match[1]}${match[2]}`, max: `${match[3]}${match[4]}`, minIncluded: true, maxIncluded: true };
};

const inRange = (range, value, compare) => {
  // (Open ends: -Infinity and Infinity, for texts too.)
  const low = range.min === -Infinity ? 1 : compare(value, range.min);
  const high = range.max === Infinity ? -1 : compare(value, range.max);
  return (range.minIncluded ? low >= 0 : low > 0) && (range.maxIncluded ? high <= 0 : high < 0);
};

const numeric = (a, b) => a - b;

const isChar = (type) => /^(char|character)$/i.test(String(type || ''));
const RANGE_LIKE = /^[[(<>]|\+$|^(more|less)\s+than\b|\s+(and|or)\s+(more|less)$|\s[-–—]\s|\.\.|…/;
// A bound of a range of texts: a character (of chars), a word (of texts); NaN when it is none.
const textBound = (type) => (text) => {
  const bound = String(text).trim();
  if (!bound || (isChar(type) ? bound.length !== 1 : /\s/.test(bound))) return NaN;
  return bound;
};

// The items of the list of a cell (numbers keep their commas between thousands: 1,500 is one value).
function itemsOf(text, kind) {
  const items = splitList(kind === 'number' ? text.replace(/(\d),(\d{3})(?!\d)/g, `$1${THOUSANDS}$2`) : text).map(
    (item) => item.split(THOUSANDS).join(',')
  );
  return items.length ? items : [text];
}

// The values where the condition of a cell can change (for the analysis of gaps): the ends of its ranges and its
// values; numbers, dates as times, texts.
function pointsOf(cell, type) {
  if (cell === null || cell === undefined) return [];
  const kind = kindOf(type);
  if (Array.isArray(cell)) return cell.flatMap((item) => pointsOf(item, type));
  if (cell instanceof Date) return [cell.getTime()];
  if (typeof cell === 'boolean' || kind === 'boolean') return [];
  if (typeof cell === 'number') return [kind === 'text' ? String(cell) : cell];
  const text = String(cell).trim();
  if (!text || text === '*') return [];
  return itemsOf(text, kind).flatMap((one) => {
    if (kind === 'text') {
      const range = textRange(one);
      return range ? [range.min, range.max] : [one];
    }
    const parse = kind === 'date' ? parseDate : parseNumber;
    const range = parseRange(one, parse);
    return (range ? [range.min, range.max] : [parse(one)]).filter(Number.isFinite);
  });
}

// A test (value) => boolean of the cell of a condition of a type. smart: ranges of texts too (SmartRules).
function conditionOf(cell, type, { smart = true, exact = false } = {}) {
  if (
    cell === null ||
    cell === undefined ||
    (typeof cell === 'string' && (cell.trim() === '' || cell.trim() === '*'))
  ) {
    return () => true;
  }
  const kind = kindOf(type);
  // (A range: a constant of a range type.)
  if (cell && typeof cell === 'object' && 'minIncluded' in cell) {
    const order = cell.kind === 'char' || cell.kind === 'text' ? (exact ? compareNatural : compareText) : numeric;
    return (value) =>
      value !== null &&
      value !== undefined &&
      inRange(cell, cell.kind === 'char' || cell.kind === 'text' ? String(value) : Number(value), order);
  }
  if (Array.isArray(cell)) {
    const tests = cell.map((item) => conditionOf(item, type, { smart, exact }));
    return (value) => tests.some((test) => test(value));
  }
  if (typeof cell === 'number') {
    if (kind === 'text') {
      const expected = String(cell);
      return (value) => value !== null && value !== undefined && String(value) === expected;
    }
    return (value) => Number(value) === cell;
  }
  if (typeof cell === 'boolean') return (value) => Boolean(value) === cell;
  if (cell instanceof Date) {
    const time = cell.getTime();
    return (value) => value !== null && value !== undefined && parseDate(value) === time;
  }
  const text = String(cell).trim();
  const items = itemsOf(text, kind);
  if (items.length > 1) {
    const tests = items.map((item) => conditionOf(item.replace(/,/g, '\\,'), type, { smart, exact }));
    return (value) => tests.some((test) => test(value));
  }
  const [one] = items;
  if (kind === 'number') {
    const range = parseRange(one, parseNumber);
    if (range)
      return (value) => value !== null && value !== undefined && value !== '' && inRange(range, Number(value), numeric);
    const expected = parseNumber(one);
    return (value) => value !== null && value !== undefined && value !== '' && Number(value) === expected;
  }
  if (kind === 'date') {
    const range = parseRange(one, parseDate);
    if (range) return (value) => value !== null && value !== undefined && inRange(range, parseDate(value), numeric);
    const expected = parseDate(one);
    return (value) => value !== null && value !== undefined && parseDate(value) === expected;
  }
  if (kind === 'boolean') {
    const expected = /^(true|yes|y|1)$/i.test(one);
    return (value) => Boolean(value) === expected;
  }
  // Ranges of texts: A1 - A10 (a prefix and numbers), and of characters (Character, char) or written as ranges
  // ([A; C), >= H < K, X+, more than T, B - C with spaces).
  const range = smart
    ? (textRange(one) ?? (isChar(type) || RANGE_LIKE.test(one) ? parseRange(one, textBound(type)) : null))
    : null;
  // (Exact, in books of OpenL: case and accents count, texts in the order of their characters.)
  const order = exact ? compareNatural : compareText;
  if (range) return (value) => value !== null && value !== undefined && inRange(range, String(value), order);
  if (exact) return (value) => value !== null && value !== undefined && String(value) === one;
  const expected = normalize(one).toLowerCase();
  return (value) => value !== null && value !== undefined && normalize(value).toLowerCase() === expected;
}

export { conditionOf, compareNatural, pointsOf, parseNumber, parseDate, parseRange, splitList, kindOf, compareText };
