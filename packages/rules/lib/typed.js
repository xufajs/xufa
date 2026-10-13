// The value of a cell as a type of OpenL Tablets says (the inputs of tests, the records of Data tables, the cells of
// decision tables): arrays of lists (a, b, c; \, for a comma), ranges of every type (IntRange, DoubleRange, DateRange,
// CharRange, StringRange...), numbers ($1,000, 1K), booleans (true, yes), dates, characters, BigDecimal and BigInteger.
import { parseRange, parseNumber, parseDate, splitList, compareNatural } from './conditions.js';
import { Decimal } from './openl/decimal.js';
import { TIME_TYPES, timeValueOf } from './openl/time.js';

const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const INTEGERS = new Set(['int', 'integer', 'long', 'short', 'byte']);
const DECIMALS = new Set(['double', 'float', 'number']);
const RANGES = {
  intrange: 'number',
  longrange: 'number',
  doublerange: 'number',
  floatrange: 'number',
  numberrange: 'number',
  bigdecimalrange: 'number',
  bigintegerrange: 'number',
  daterange: 'date',
  charrange: 'char',
  stringrange: 'text',
};

// A range of a kind: { min, max, minIncluded, maxIncluded, kind }; a single value is a range of itself. type: its
// type of Java (IntRange, DoubleRange...), for its text.
function rangeOf(raw, kind, type) {
  if (raw && typeof raw === 'object' && 'minIncluded' in raw) return raw;
  return withText(
    rangeOfText(raw, kind),
    type ?? { number: 'DoubleRange', date: 'DateRange', char: 'CharRange', text: 'StringRange' }[kind]
  );
}

// The text of a range, as OpenL writes it: [1..5], (1.5..2.0], >= 2, < 5, [01/01/2017 00:00:00..01/01/2019 00:00:00).
function withText(range, type) {
  if (!range) return range;
  const pad = (n) => String(n).padStart(2, '0');
  const show = (value) => {
    if (range.kind === 'date') {
      const d = new Date(value);
      return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }
    if (range.kind === 'number' && /^(Double|Float|BigDecimal)Range$/.test(type) && Number.isInteger(value))
      return `${value}.0`;
    return String(value);
  };
  const text = () => {
    if (range.min === -Infinity) return `${range.maxIncluded ? '<=' : '<'} ${show(range.max)}`;
    if (range.max === Infinity) return `${range.minIncluded ? '>=' : '>'} ${show(range.min)}`;
    return `${range.minIncluded ? '[' : '('}${show(range.min)}..${show(range.max)}${range.maxIncluded ? ']' : ')'}`;
  };
  Object.defineProperty(range, 'toJava', { value: text, enumerable: false });
  return range;
}

function rangeOfText(raw, kind) {
  const parse =
    kind === 'date'
      ? (text) => parseDate(text)
      : kind === 'number'
        ? parseNumber
        : (text) => {
            const bound = String(text).trim();
            if (!bound || (kind === 'char' ? bound.length !== 1 : /\s/.test(bound))) return NaN;
            return bound;
          };
  const value = typeof raw === 'number' || raw instanceof Date ? null : parseRange(String(raw), parse);
  if (value) return { ...value, kind };
  const single = typeof raw === 'number' ? raw : raw instanceof Date ? raw.getTime() : parse(String(raw));
  if (Number.isNaN(single)) return null;
  return { min: single, max: single, minIncluded: true, maxIncluded: true, kind };
}

// Whether a value is in a range (texts in their natural order: A2 before A10).
function inRangeOf(range, value) {
  if (value === null || value === undefined) return false;
  const text = range.kind === 'char' || range.kind === 'text';
  const at = text
    ? String(value)
    : value instanceof Date
      ? value.getTime()
      : range.kind === 'date'
        ? parseDate(value)
        : Number(value);
  const compare = text ? compareNatural : (a, b) => a - b;
  const low = range.min === -Infinity ? 1 : compare(at, range.min);
  const high = range.max === Infinity ? -1 : compare(at, range.max);
  return (range.minIncluded ? low >= 0 : low > 0) && (range.maxIncluded ? high <= 0 : high < 0);
}

// A number of a cell: 1,000.5, $5K, and as decimals 100% (1), 0.07% (exactly 0.0007), 1e2; NaN when it is none.
function numberOfCell(text) {
  const n = parseNumber(text);
  if (!Number.isNaN(n)) return n;
  const trimmed = String(text).trim().replace(/,/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?%?$/.test(trimmed)) return NaN;
  return Number(String(Decimal.from(trimmed)));
}

function valueOfType(raw, type) {
  if (isEmpty(raw)) return null;
  const name = String(type || '').trim();
  const lower = name.toLowerCase();
  if (lower.endsWith('[]')) {
    const element = name.slice(0, -2);
    const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? splitList(raw) : [raw];
    return items.map((item) => valueOfType(item, element)).filter((item) => item !== null);
  }
  if (RANGES[lower]) return rangeOf(raw, RANGES[lower], name);
  if (INTEGERS.has(lower)) {
    const n = typeof raw === 'number' ? raw : numberOfCell(String(raw));
    return Number.isNaN(n) ? raw : n;
  }
  if (DECIMALS.has(lower)) {
    const n = typeof raw === 'number' ? raw : numberOfCell(String(raw));
    return Number.isNaN(n) ? raw : n;
  }
  if (lower === 'bigdecimal') return Decimal.from(typeof raw === 'string' ? raw.trim().replace(/,/g, '') : raw);
  if (lower === 'biginteger') {
    if (typeof raw === 'number') return BigInt(Math.trunc(raw));
    const text = String(raw).trim().replace(/,/g, '');
    // (1E20, 600%: as a decimal first.)
    return /^-?\d+$/.test(text) ? BigInt(text) : Decimal.from(text).toBigInt();
  }
  if (lower === 'boolean' || lower === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const text = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on'].includes(text)) return true;
    if (['false', 'no', 'n', '0', 'off'].includes(text)) return false;
    return raw;
  }
  // (Values of java.time: LocalDate, LocalTime, LocalDateTime, ZonedDateTime, Instant.)
  if (TIME_TYPES.has(lower.replace(/^java\.time\./, ''))) return timeValueOf(raw, lower) ?? raw;
  if (lower === 'date') {
    if (raw instanceof Date) return raw;
    if (typeof raw === 'number') return new Date(raw);
    const time = parseDate(String(raw));
    return Number.isNaN(time) ? raw : new Date(time);
  }
  if (lower === 'char' || lower === 'character') return typeof raw === 'number' ? String(raw) : String(raw).charAt(0);
  if (lower === 'string') return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw);
  return raw;
}

export { valueOfType, rangeOf, inRangeOf, withText };
