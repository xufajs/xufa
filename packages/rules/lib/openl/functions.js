// The functions of OpenL Tablets (its array, date, math, string, statistical and special functions), Java's static
// classes (Math, Integer.MAX_VALUE, String.format...) and the constructors of Java's types. Each function takes the
// values of its arguments (and their static types); `returns` says the type of its result when it is known.
import { RulesError } from '../values.js';
import * as rt from './runtime.js';
import { Decimal, MODES } from './decimal.js';
import { inRangeOf, rangeOf, withText } from '../typed.js';

const DAY = 86400000;
const isEmpty = (value) => value === null || value === undefined;
// The values of the arguments as one array: an array given, or the arguments themselves (sum(1, 2, 3)).
const listOf = (values) =>
  values.length === 1 && Array.isArray(values[0])
    ? values[0]
    : values.length === 1 && isEmpty(values[0])
      ? null
      : values;
const numbersOf = (values) => {
  const list = listOf(values);
  return list === null ? null : list.flat(Infinity).filter((value) => !isEmpty(value));
};
const isDecimal = (value) => value instanceof Decimal;
const num = rt.toNumber;
const returns = (type, fn) => Object.assign(fn, { returns: type });
// The type of the elements of the first argument, as the result's.
const elementType = (types) => (types[0] && types[0].endsWith('[]') ? types[0].slice(0, -2) : types[0]);
const sameType = (types) => types[0] ?? null;

function fail(message) {
  throw new RulesError(message, 'XUFA_RULES_ERR_RULE');
}

// Dates are UTC days (as the cells of workbooks are read).
const parts = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), date: d };
};
const makeDate = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => {
  const date = new Date(Date.UTC(2000, m, d, h, mi, s, ms));
  // (Years under 100 are those years, not 1900 and after.)
  date.setUTCFullYear(y + date.getUTCFullYear() - 2000);
  return date;
};
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function fullMonths(start, end) {
  const a = parts(start);
  const b = parts(end);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

// dateDif(start, end, unit): whole days (D, W, WF) truncate their times; the other units count calendar months and
// years (Jan 31 to Feb 28 is no month), and a period backward is the one forward from end to start, negative.
function dateDif(start, end, unit = 'D') {
  if (isEmpty(start) || isEmpty(end)) return null;
  const from = parts(start).date;
  const to = parts(end).date;
  const days = Math.trunc((to - from) / DAY);
  const u = String(unit).toUpperCase();
  if (to < from && !['D', 'W', 'WF'].includes(u)) {
    const forward = dateDif(end, start, unit);
    return forward === 0 ? 0 : -forward;
  }
  switch (u) {
    case 'D':
      return days;
    case 'W':
      return Math.trunc(days / 7);
    case 'WF':
      return days / 7;
    case 'M':
      return fullMonths(from, to);
    case 'Y':
      return Math.trunc(fullMonths(from, to) / 12);
    case 'MD': {
      const a = parts(from);
      const b = parts(to);
      return b.d >= a.d ? b.d - a.d : daysInMonth(b.y, b.m - 1 < 0 ? 11 : b.m - 1) - a.d + b.d;
    }
    case 'YM':
      return fullMonths(from, to) % 12;
    case 'YD': {
      const a = parts(from);
      const b = parts(to);
      let anniversary = makeDate(b.y, a.m, a.d);
      if (anniversary > to) anniversary = makeDate(b.y - 1, a.m, a.d);
      return Math.round((to - anniversary) / DAY);
    }
    case 'YF': {
      // (Full years, and the days after them over the length of the year that follows: 29 / 366.)
      const years = Math.trunc(fullMonths(from, to) / 12);
      const a = parts(from);
      const reached = makeDate(a.y + years, a.m, a.d);
      const next = makeDate(a.y + years + 1, a.m, a.d);
      return years + Math.trunc((to - reached) / DAY) / Math.round((next - reached) / DAY);
    }
    case 'MF':
    case 'YMF': {
      const months = fullMonths(from, to);
      const a = parts(from);
      const reached = makeDate(a.y, a.m + months, Math.min(a.d, daysInMonth(a.y, a.m + months)));
      const next = makeDate(a.y, a.m + months + 1, Math.min(a.d, daysInMonth(a.y, a.m + months + 1)));
      const fraction = (to - reached) / (next - reached);
      const total = months + fraction;
      if (u === 'MF') return total;
      if (u === 'YF') return total / 12;
      return total % 12;
    }
    default:
      return fail(`dateDif has no unit ${unit}`);
  }
}

// Dates of texts: ISO, US (MM/dd/yyyy), and Java's patterns (yyyy, MM, dd, HH, mm, ss).
function toDate(text, format) {
  if (isEmpty(text)) return null;
  if (text instanceof Date) return text;
  const value = String(text).trim();
  if (format) {
    const tokens = [];
    const pattern = String(format).replace(/'([^']*)'|(y+|M+|d+|H+|h+|m+|s+|S+|a)/g, (all, literal, token) => {
      if (literal !== undefined) return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      tokens.push(token);
      return token === 'a' ? '(AM|PM|am|pm)' : token.startsWith('M') && token.length >= 3 ? '([A-Za-z]+)' : '(\\d+)';
    });
    const match = new RegExp(`^${pattern.replace(/[.](?![*+?])/g, '\\.')}$`).exec(value);
    if (!match) return null;
    const read = { y: 1970, M: 0, d: 1, H: 0, m: 0, s: 0 };
    let pm = null;
    tokens.forEach((token, i) => {
      const part = match[i + 1];
      if (token === 'a') pm = /pm/i.test(part);
      else if (token.startsWith('M') && token.length >= 3)
        read.M = MONTHS.findIndex((name) => name.toLowerCase().startsWith(part.toLowerCase().slice(0, 3)));
      else if (token.startsWith('y')) read.y = Number(part) + (token.length === 2 ? 2000 : 0);
      else if (token.startsWith('M')) read.M = Number(part) - 1;
      else if (token.startsWith('d')) read.d = Number(part);
      else if (token.startsWith('H') || token.startsWith('h')) read.H = Number(part);
      else if (token.startsWith('m')) read.m = Number(part);
      else if (token.startsWith('s')) read.s = Number(part);
    });
    if (pm !== null && read.H < 12 && pm) read.H += 12;
    return makeDate(read.y, read.M, read.d, read.H, read.m, read.s);
  }
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (match)
    return makeDate(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
      Number(match[6] ?? 0)
    );
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (match)
    return makeDate(
      Number(match[3]),
      Number(match[1]) - 1,
      Number(match[2]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
      Number(match[6] ?? 0)
    );
  return null;
}
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDate(value, format = 'MM/dd/yyyy') {
  if (isEmpty(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n, size) => String(n).padStart(size, '0');
  return String(format).replace(/'([^']*)'|y+|M+|d+|H+|h+|m+|s+|S+|E+|a/g, (token, literal) => {
    if (literal !== undefined) return literal;
    const size = token.length;
    switch (token[0]) {
      case 'y':
        return size === 2 ? pad(date.getUTCFullYear() % 100, 2) : pad(date.getUTCFullYear(), size);
      case 'M':
        return size >= 4
          ? MONTHS[date.getUTCMonth()]
          : size === 3
            ? MONTHS[date.getUTCMonth()].slice(0, 3)
            : pad(date.getUTCMonth() + 1, size);
      case 'd':
        return pad(date.getUTCDate(), size);
      case 'H':
        return pad(date.getUTCHours(), size);
      case 'h':
        return pad(date.getUTCHours() % 12 || 12, size);
      case 'm':
        return pad(date.getUTCMinutes(), size);
      case 's':
        return pad(date.getUTCSeconds(), size);
      case 'S':
        return pad(date.getUTCMilliseconds(), size);
      case 'E':
        return size >= 4 ? WEEKDAYS[date.getUTCDay()] : WEEKDAYS[date.getUTCDay()].slice(0, 3);
      default:
        return date.getUTCHours() < 12 ? 'AM' : 'PM';
    }
  });
}

// A number as text with all its digits, no exponent and no trailing zeros (toString(1000.0) is 1000).
function plainNumber(value) {
  if (isDecimal(value)) return value.strip(0).toString();
  if (typeof value === 'bigint') return value.toString();
  const n = num(value);
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString();
  return Decimal.from(n).strip(0).toString();
}

// A number as Java's DecimalFormat writes it (0, #, ., ',' and E of a pattern), rounding half even.
function formatNumber(value, pattern) {
  if (isEmpty(value)) return null;
  const n = num(value);
  const [positive, negativePattern] = String(pattern).split(';');
  // (A negative subpattern gives its prefix and suffix; the digits are those of the positive one.)
  if (negativePattern !== undefined && n < 0) {
    const at = negativePattern.search(/[0#.,]/);
    const before = at === -1 ? negativePattern : negativePattern.slice(0, at);
    const after = at === -1 ? '' : negativePattern.slice(at).replace(/^[0#.,E]*/, '');
    return `${before}${formatNumber(-n, positive)}${after}`;
  }
  const { prefix, body, suffix, percent, permille } = patternParts(positive);
  const exponentAt = body.indexOf('E');
  const [integerPart, fractionPart = ''] = body.split('E')[0].split('.');
  const minFraction = (fractionPart.match(/0/g) || []).length;
  const maxFraction = fractionPart.replace(/,/g, '').length;
  const grouping = integerPart.includes(',') ? integerPart.length - integerPart.lastIndexOf(',') - 1 : 0;
  const minInteger = (integerPart.replace(/,/g, '').match(/0/g) || []).length;
  let scaled = percent ? n * 100 : permille ? n * 1000 : n;
  const maxInteger = integerPart.replace(/,/g, '').length;
  if (exponentAt !== -1 && maxInteger > minInteger && maxInteger > 1) {
    const exponent = scaled === 0 ? 0 : Math.floor(Math.floor(Math.log10(Math.abs(scaled))) / maxInteger) * maxInteger;
    const digits = Math.max(minInteger + maxFraction, maxInteger);
    const mantissa = Number((scaled / 10 ** exponent).toPrecision(digits));
    return `${prefix}${plainNumber(mantissa)}E${exponent}${suffix}`;
  }
  if (exponentAt !== -1) {
    const exponent = scaled === 0 ? 0 : Math.floor(Math.log10(Math.abs(scaled))) - Math.max(minInteger, 1) + 1;
    const mantissa = scaled / 10 ** exponent;
    return `${prefix}${formatNumber(mantissa, `${integerPart}.${fractionPart}`)}E${exponent}${suffix}`;
  }
  const negative = scaled < 0;
  // (BigIntegers and BigDecimals by their digits, all of them.)
  const exact =
    isDecimal(value) || typeof value === 'bigint'
      ? Decimal.from(typeof value === 'bigint' ? String(value) : value).multiply(percent ? 100 : permille ? 1000 : 1)
      : null;
  const magnitude = exact ? (exact.signum() < 0 ? exact.negate() : exact) : Decimal.from(Math.abs(scaled));
  const rounded = magnitude.setScale(maxFraction, 'HALF_EVEN').toString();
  let [whole, fraction = ''] = rounded.split('.');
  while (fraction.length > minFraction && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  if (whole === '0' && minInteger === 0 && fraction) whole = '';
  whole = whole.padStart(minInteger, '0');
  if (grouping) whole = whole.replace(new RegExp(`\\B(?=(\\d{${grouping}})+(?!\\d))`, 'g'), ',');
  const text = fraction ? `${whole}.${fraction}` : whole;
  return `${negative && Number(rounded) !== 0 ? '-' : ''}${prefix}${text}${suffix}`;
}

// The parts of a pattern of DecimalFormat: the text before its digits, its digits (0 # . , E), the text after; quoted
// text ('#', '' for a quote) as it is; % and ‰ (outside quotes) scale the number and stay where they are written.
function patternParts(pattern) {
  let prefix = '';
  let body = '';
  let suffix = '';
  let stage = 0;
  let percent = false;
  let permille = false;
  const add = (part) => {
    if (stage === 0) prefix += part;
    else {
      stage = 2;
      suffix += part;
    }
  };
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "'") {
      if (pattern[i + 1] === "'") {
        add("'");
        i += 1;
        continue;
      }
      const end = pattern.indexOf("'", i + 1);
      add(pattern.slice(i + 1, end === -1 ? pattern.length : end));
      i = end === -1 ? pattern.length : end;
      continue;
    }
    if (stage < 2 && (/[0#.,]/.test(char) || (char === 'E' && stage === 1))) {
      stage = 1;
      body += char;
      continue;
    }
    if (char === '%') percent = true;
    if (char === '‰') permille = true;
    add(char);
  }
  return { prefix, body, suffix, percent, permille };
}

// Java's MessageFormat: {0}, {1}... numbers with their groups of thousands (1,234.5).
function messageFormat(pattern, args) {
  return String(pattern).replace(/\{(\d+)(?:,\s*number(?:,\s*([^}]*))?)?\}/g, (all, i, style) => {
    const value = args[Number(i)];
    if (value === undefined) return all;
    if (isEmpty(value)) return 'null';
    if (typeof value === 'number' || typeof value === 'bigint' || isDecimal(value)) {
      return formatNumber(value, style && style !== 'integer' ? style : style === 'integer' ? '#,##0' : '#,##0.###');
    }
    if (value instanceof Date) return formatDate(value, 'M/d/yy, h:mm a');
    return rt.javaText(value);
  });
}

// Rounding a number to a scale, by a mode of Java (half up by default), from its decimal text.
function roundTo(value, scale = 0, mode = 'HALF_UP') {
  if (isEmpty(value)) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return value;
  const modeName = typeof mode === 'number' ? MODES[mode] : String(mode).replace(/^ROUND_/, '');
  const rounded = Decimal.from(value).setScale(Number(scale ?? 0), modeName);
  return isDecimal(value) ? rounded : rounded.toNumber();
}

// like: ? a character, * any characters, # a digit, @ a letter, [a-k] and [!a-k] sets, + one or more of before.
function likePattern(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '[') {
      const close = pattern.indexOf(']', i + 2);
      let set = pattern.slice(i + 1, close === -1 ? pattern.length : close);
      i = close === -1 ? pattern.length : close;
      const negated = set.length > 1 && set.startsWith('!');
      if (negated) set = set.slice(1);
      const escaped = set.replace(/[\\\]^]/g, '\\$&').replace(/^-/, '\\-');
      source += `[${negated ? '^' : ''}${escaped}]`;
    } else if (char === '?') source += '.';
    else if (char === '*') source += '.*';
    else if (char === '#') source += '\\d';
    else if (char === '@') source += '\\p{L}';
    else if (char === '+') source += source && !source.endsWith('+') ? '+' : '\\+';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'u');
}

const mean = (list) => list.reduce((s, x) => s + num(x), 0) / list.length;
const pairs = (y, x) => {
  if (!Array.isArray(y) || !Array.isArray(x) || y.length !== x.length) return null;
  return y
    .map((value, i) => [value, x[i]])
    .filter(([a, b]) => !isEmpty(a) && !isEmpty(b))
    .map(([a, b]) => [num(a), num(b)]);
};
function covariance(y, x, sample) {
  const list = pairs(y, x);
  if (!list || !list.length || (sample && list.length < 2)) return null;
  const my = mean(list.map(([a]) => a));
  const mx = mean(list.map(([, b]) => b));
  return list.reduce((s, [a, b]) => s + (a - my) * (b - mx), 0) / (list.length - (sample ? 1 : 0));
}
function variance(values, sample) {
  const list = numbersOf(values);
  if (!list || list.length < (sample ? 2 : 1)) return null;
  const m = mean(list);
  return list.reduce((s, x) => s + (num(x) - m) ** 2, 0) / (list.length - (sample ? 1 : 0));
}
function regression(y, x) {
  const list = pairs(y, x);
  if (!list || list.length < 2) return null;
  const my = mean(list.map(([a]) => a));
  const mx = mean(list.map(([, b]) => b));
  const sxx = list.reduce((s, [, b]) => s + (b - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = list.reduce((s, [a, b]) => s + (a - my) * (b - mx), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

// Sums of numbers of any kind: decimals exact, BigInts exact, numbers as doubles.
// The type of a sum: the widest of its numbers (of the elements of an array); bytes and shorts sum as ints.
function sumType(types) {
  const elements = types.length === 1 ? [elementType(types)] : types;
  const has = (...names) => elements.some((type) => names.includes(type));
  if (has('BigDecimal')) return 'BigDecimal';
  if (has('BigInteger')) return 'BigInteger';
  if (has('double', 'Double')) return 'double';
  if (has('float', 'Float')) return 'float';
  if (has('long', 'Long')) return 'long';
  if (elements.length && elements.every((type) => rt.isIntType(type))) return 'int';
  return elements[0] ?? null;
}

function sum(values, types) {
  // (Of an array of arrays: the sum of each, sum(new Integer[][] {{1, 2}, {3}}) is 3, 3.)
  const rows = listOf(values);
  if (Array.isArray(rows) && rows.length && rows.every(Array.isArray)) {
    const rowType = elementType(types);
    return rows.map((row) => sum([row], [rowType]));
  }
  const list = numbersOf(values);
  if (list === null) return null;
  if (list.some(isDecimal)) return list.reduce((s, x) => s.add(x), Decimal.from(0));
  if (list.some((x) => typeof x === 'bigint')) return list.reduce((s, x) => s + BigInt(x), 0n);
  const total = list.reduce((s, x) => s + num(x), 0);
  return rt.isIntType(sumType(types)) ? rt.wrapInt(total) : total;
}

function extreme(values, sign) {
  const list = numbersOf(values);
  if (list === null) return null;
  if (!list.length) return null;
  if (list.some((x) => typeof x === 'number' && Number.isNaN(x))) return NaN;
  return list.reduce((best, x) => (rt.compare(x, best) * sign > 0 ? x : best));
}

function sorted(list, descending = false) {
  return [...list].sort((a, b) => {
    if (isEmpty(a) || isEmpty(b)) return isEmpty(a) - isEmpty(b);
    const order = rt.compare(a, b, true);
    return descending ? -order : order;
  });
}

const deepCopy = (value) => {
  if (Array.isArray(value)) return value.map(deepCopy);
  if (value instanceof Date) return new Date(value.getTime());
  if (rt.isRecord(value) && !isDecimal(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepCopy(v)]));
  return value;
};

const strings = {
  contains: (s, t) => (isEmpty(s) || isEmpty(t) ? false : String(s).includes(String(t))),
};

const FUNCTIONS = {
  // Arrays.
  add: returns(
    (types) => {
      const [list, item] = types;
      const element = list && list.endsWith('[]') ? list.slice(0, -2) : null;
      const boxes = {
        int: 'Integer',
        long: 'Long',
        double: 'Double',
        float: 'Float',
        boolean: 'Boolean',
        short: 'Short',
        byte: 'Byte',
        char: 'Character',
      };
      if (element && boxes[element] && item === boxes[element]) return `${item}[]`;
      const order = ['byte', 'short', 'int', 'long', 'float', 'double'];
      if (element && order.includes(element) && order.indexOf(item) > order.indexOf(element)) return `${item}[]`;
      return list ?? null;
    },
    (values, types = []) => {
      const [list, ...rest] = values;
      // (A null of an array type adds nothing; a null element is added.)
      if (rest.length === 1 && rest[0] === null && String(types[1] ?? '').endsWith('[]')) return [...(list ?? [])];
      if (rest.length === 1 && !Array.isArray(rest[0])) return [...(list ?? []), rest[0]];
      return values.flatMap((value) => (Array.isArray(value) ? value : isEmpty(value) ? [] : [value]));
    }
  ),
  addAll: returns(sameType, (values) =>
    values.flatMap((value) => (Array.isArray(value) ? value : isEmpty(value) ? [] : [value]))
  ),
  addElement: returns(sameType, ([list, at, element]) => {
    const copy = [...(list ?? [])];
    // (An array: its elements inserted.)
    copy.splice(at, 0, ...(Array.isArray(element) ? element : [element]));
    return copy;
  }),
  // (Of no values: false.)
  allTrue: returns('boolean', (values) => {
    const list = listOf(values) ?? [];
    return list.length > 0 && list.every((x) => x === true);
  }),
  allYes: returns('boolean', (values) => (listOf(values) ?? []).every((x) => x === true)),
  allFalse: returns('boolean', (values) => {
    const list = listOf(values) ?? [];
    return list.length > 0 && list.every((x) => x === false);
  }),
  allNo: returns('boolean', (values) => (listOf(values) ?? []).every((x) => x === false)),
  anyTrue: returns('boolean', (values) => (listOf(values) ?? []).some((x) => x === true)),
  anyYes: returns('boolean', (values) => (listOf(values) ?? []).some((x) => x === true)),
  anyFalse: returns('boolean', (values) => (listOf(values) ?? []).some((x) => x === false)),
  anyNo: returns('boolean', (values) => (listOf(values) ?? []).some((x) => x === false)),
  avg: returns(
    (types) =>
      ['BigInteger', 'BigDecimal'].includes(sumType(types))
        ? 'BigDecimal'
        : sumType(types) === 'float'
          ? 'float'
          : 'double',
    (values) => {
      const list = numbersOf(values);
      if (!list || !list.length) return null;
      if (list.some((x) => isDecimal(x) || typeof x === 'bigint'))
        return list
          .reduce((s, x) => s.add(typeof x === 'bigint' ? Decimal.from(String(x)) : x), Decimal.from(0))
          .divide(list.length);
      return list.reduce((s, x) => s + num(x), 0) / list.length;
    }
  ),
  big: returns(elementType, ([list, position]) => {
    const items = (list ?? []).filter((x) => !isEmpty(x));
    if (items.some((x) => Number.isNaN(x))) return NaN;
    return sorted(items, true)[position - 1] ?? null;
  }),
  small: returns(elementType, ([list, position]) => {
    const items = (list ?? []).filter((x) => !isEmpty(x));
    if (items.some((x) => Number.isNaN(x))) return NaN;
    return sorted(items)[position - 1] ?? null;
  }),
  concatenate: returns('String', (values) =>
    (listOf(values) ?? []).map((value) => (isEmpty(value) ? '' : rt.javaText(value))).join('')
  ),
  contains: returns('boolean', ([container, element]) => {
    if (isEmpty(container)) return false;
    if (typeof container === 'string') return strings.contains(container, element);
    if (container && 'minIncluded' in container) return inRangeOf(container, element);
    const list = Array.isArray(container) ? container : [container];
    if (Array.isArray(element)) return element.every((item) => list.some((x) => rt.equal(x, item)));
    return list.some((item) =>
      item && typeof item === 'object' && 'minIncluded' in item
        ? FUNCTIONS.contains([item, element])
        : rt.equal(item, element)
    );
  }),
  containsAny: returns('boolean', ([text, chars]) => {
    if (isEmpty(text) || isEmpty(chars)) return false;
    const set = Array.isArray(chars) ? chars.map(String) : [...String(chars)];
    return [...String(text)].some((char) => set.includes(char));
  }),
  indexOf: returns('int', ([list, element]) =>
    Array.isArray(list)
      ? list.findIndex((x) => rt.equal(x, element))
      : isEmpty(list)
        ? -1
        : String(list).indexOf(element)
  ),
  intersection: returns(sameType, ([a, b]) =>
    (b ?? []).filter((x, i, all) => (a ?? []).some((y) => rt.equal(x, y)) && all.findIndex((z) => rt.equal(z, x)) === i)
  ),
  isEmpty: returns('boolean', ([value]) => {
    if (isEmpty(value)) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (value instanceof Map) return value.size === 0;
    return false;
  }),
  isNotEmpty: returns('boolean', ([value]) => !FUNCTIONS.isEmpty([value])),
  flatten: returns(
    (types) => (types[0] ? types[0].replace(/(\[\])+$/, '[]') : null),
    (values) => {
      if (values.every((value) => isEmpty(value))) return null;
      return values.flatMap((value) => (Array.isArray(value) ? value.flat(Infinity) : isEmpty(value) ? [] : [value]));
    }
  ),
  length: returns('int', ([value]) => {
    if (isEmpty(value)) return 0;
    if (value instanceof Map) return value.size;
    return value.length ?? 0;
  }),
  max: returns(elementType, (values) => extreme(values, 1)),
  min: returns(elementType, (values) => extreme(values, -1)),
  median: returns(
    (types) => (sumType(types) === 'BigDecimal' ? 'BigDecimal' : sumType(types) === 'float' ? 'float' : 'double'),
    (values) => {
      const list = numbersOf(values);
      if (!list || !list.length) return null;
      if (list.some((x) => Number.isNaN(x))) return NaN;
      const items = sorted(list).map(num);
      const middle = Math.floor(items.length / 2);
      return items.length % 2 ? items[middle] : (items[middle - 1] + items[middle]) / 2;
    }
  ),
  noNulls: returns('boolean', (values) => {
    const list = listOf(values);
    return Array.isArray(list) && list.length > 0 && list.every((x) => !isEmpty(x));
  }),
  product: returns(
    (types) => (['BigInteger', 'BigDecimal'].includes(sumType(types)) ? sumType(types) : 'double'),
    (values) => {
      const list = numbersOf(values);
      if (!list || !list.length) return null;
      if (list.some(isDecimal)) return list.reduce((s, x) => s.multiply(x), Decimal.from(1));
      if (list.some((x) => typeof x === 'bigint')) return list.reduce((s, x) => s * BigInt(x), 1n);
      return list.reduce((s, x) => s * num(x), 1);
    }
  ),
  remove: returns(sameType, ([list, at]) => {
    if (isEmpty(list)) return null;
    if (at < 0 || at >= list.length) fail(`Index ${at} out of the array of ${list.length}`);
    return list.filter((_, i) => i !== at);
  }),
  removeElement: returns(sameType, ([list, element]) => {
    if (isEmpty(list)) return null;
    const at = list.findIndex((x) => rt.equal(x, element));
    return at === -1 ? [...list] : list.filter((_, i) => i !== at);
  }),
  removeNulls: returns(sameType, (values) => {
    const list = listOf(values);
    return isEmpty(list) ? null : list.filter((x) => !isEmpty(x));
  }),
  slice: returns(sameType, ([list, from, to]) => (isEmpty(list) ? null : list.slice(from, to ?? list.length))),
  sort: returns(sameType, (values) => {
    const list = listOf(values);
    return list === null ? null : sorted(list);
  }),
  sum: returns(sumType, sum),

  // Dates.
  absMonth: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).y * 12 + parts(d).m)),
  absQuarter: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).y * 4 + Math.floor(parts(d).m / 3))),
  amPm: returns('String', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCHours() < 12 ? 'AM' : 'PM')),
  Date: returns('Date', ([y, m, d, h = 0, mi = 0, s = 0, ms = 0]) => makeDate(y, m - 1, d, h, mi, s, ms)),
  setTime: returns('Date', ([date, h = 0, mi = 0, s, ms]) => {
    if (isEmpty(date)) return null;
    const d = new Date(date instanceof Date ? date.getTime() : date);
    d.setUTCHours(h, mi, s ?? d.getUTCSeconds(), ms ?? d.getUTCMilliseconds());
    return d;
  }),
  setDate: returns('Date', ([date, y, m, d]) => {
    if (isEmpty(date)) return null;
    const at = new Date(date instanceof Date ? date.getTime() : date);
    at.setUTCFullYear(y, m - 1, d);
    return at;
  }),
  dateDif: returns('double', ([a, b, unit]) => dateDif(a, b, unit)),
  dayDiff: returns('int', ([a, b]) =>
    isEmpty(a) || isEmpty(b) ? null : Math.trunc((parts(a).date - parts(b).date) / DAY)
  ),
  dayOfMonth: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).d)),
  dayOfWeek: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCDay() + 1)),
  dayOfYear: returns('int', ([d]) =>
    isEmpty(d) ? null : Math.floor((parts(d).date - makeDate(parts(d).y, 0, 1)) / DAY) + 1
  ),
  // isLeap(date or year).
  isLeap: returns('boolean', ([d]) => {
    if (isEmpty(d)) return null;
    const y = d instanceof Date ? parts(d).y : num(d);
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }),
  firstDateOfQuarter: returns('Date', ([q]) => makeDate(Math.floor(q / 4), (q % 4) * 3, 1)),
  lastDateOfQuarter: returns('Date', ([q]) => makeDate(Math.floor(q / 4), (q % 4) * 3 + 3, 0)),
  lastDayOfMonth: returns('int', ([d]) => (isEmpty(d) ? null : daysInMonth(parts(d).y, parts(d).m))),
  hour: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCHours() % 12)),
  hourOfDay: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCHours())),
  minute: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCMinutes())),
  second: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).date.getUTCSeconds())),
  month: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).m + 1)),
  // (Full months from b to a, as dateDif(b, a, "M").)
  monthDiff: returns('int', ([a, b]) => (isEmpty(a) || isEmpty(b) ? null : dateDif(b, a, 'M'))),
  quarter: returns('int', ([d]) => (isEmpty(d) ? null : Math.floor(parts(d).m / 3))),
  toDate: returns('Date', ([text, format]) => toDate(text, format)),
  weekDiff: returns('int', ([a, b]) =>
    isEmpty(a) || isEmpty(b) ? null : Math.trunc(Math.trunc((parts(a).date - parts(b).date) / DAY) / 7)
  ),
  weekOfMonth: returns('int', ([d]) => {
    if (isEmpty(d)) return null;
    const { y, m, d: day } = parts(d);
    const first = makeDate(y, m, 1).getUTCDay();
    return Math.floor((day + first - 1) / 7) + 1;
  }),
  weekOfYear: returns('int', ([d]) => {
    if (isEmpty(d)) return null;
    const { y } = parts(d);
    const start = makeDate(y, 0, 1);
    const days = Math.round((parts(d).date - start) / DAY);
    return Math.floor((days + start.getUTCDay()) / 7) + 1;
  }),
  // (Full years from b to a.)
  yearDiff: returns('int', ([a, b]) => (isEmpty(a) || isEmpty(b) ? null : dateDif(b, a, 'Y'))),
  year: returns('int', ([d]) => (isEmpty(d) ? null : parts(d).y)),

  // Math.
  // (Of ints as Java: abs(Integer.MIN_VALUE) is itself.)
  abs: returns(sameType, ([a], types = []) => {
    if (isEmpty(a)) return null;
    if (isDecimal(a)) return a.abs();
    if (typeof a === 'bigint') return a < 0n ? -a : a;
    const value = Math.abs(num(a));
    return rt.isIntType(types[0]) ? rt.narrow(value, types[0]) : value;
  }),
  acos: returns('double', ([a]) => Math.acos(num(a))),
  asin: returns('double', ([a]) => Math.asin(num(a))),
  atan: returns('double', ([a]) => Math.atan(num(a))),
  atan2: returns('double', ([y, x]) => Math.atan2(num(y), num(x))),
  cbrt: returns('double', ([a]) => Math.cbrt(num(a))),
  ceil: returns('double', ([a]) => (isEmpty(a) ? null : Math.ceil(num(a)))),
  copySign: returns('double', ([m, s]) => Math.abs(num(m)) * (Object.is(num(s), -0) || num(s) < 0 ? -1 : 1)),
  cos: returns('double', ([a]) => Math.cos(num(a))),
  cosh: returns('double', ([a]) => Math.cosh(num(a))),
  exp: returns('double', ([a]) => Math.exp(num(a))),
  expm1: returns('double', ([a]) => Math.expm1(num(a))),
  floor: returns('double', ([a]) => (isEmpty(a) ? null : Math.floor(num(a)))),
  floorDiv: returns(sameType, ([a, b]) => (isEmpty(a) || isEmpty(b) ? null : Math.floor(num(a) / num(b)))),
  hypot: returns('double', ([x, y]) => Math.hypot(num(x), num(y))),
  IEEEremainder: returns('double', ([a, b]) => num(a) - num(b) * Math.round(num(a) / num(b))),
  // (The limits of ints and longs stand for infinity in OpenL too: isInfinite(Long.MAX_VALUE).)
  isInfinite: returns('boolean', ([a]) =>
    typeof a === 'bigint'
      ? a === 2n ** 63n - 1n || a === -(2n ** 63n)
      : typeof a === 'number' && [Infinity, -Infinity, 2147483647, -2147483648].includes(a)
  ),
  isNaN: returns('boolean', ([a]) => typeof a === 'number' && Number.isNaN(a)),
  log: returns('double', ([a]) => Math.log(num(a))),
  log10: returns('double', ([a]) => Math.log10(num(a))),
  log1p: returns('double', ([a]) => Math.log1p(num(a))),
  mod: returns(sameType, ([a, b]) => {
    if (isEmpty(a) || isEmpty(b)) return null;
    const x = num(a);
    const y = num(b);
    if (y === 0) return a;
    return x - y * Math.floor(x / y);
  }),
  pow: returns('double', ([a, b]) => {
    if (isEmpty(a) || isEmpty(b)) return null;
    if (isDecimal(a)) return a.pow(num(b));
    if (typeof a === 'bigint') {
      if (num(b) < 0) fail('A negative power of a BigInteger');
      return a ** BigInt(num(b));
    }
    return num(a) ** num(b);
  }),
  quotient: returns('long', ([a, b], types = []) => {
    if (isEmpty(a) || isEmpty(b)) return null;
    // (Of doubles by zero: Infinity, or NaN; of whole numbers, an error.)
    const doubles = types.some((type) => rt.FLOAT_TYPES.has(type));
    if (num(b) === 0 && doubles) return num(a) === 0 ? NaN : num(a) > 0 ? Infinity : -Infinity;
    if (num(b) === 0) fail('/ by zero');
    return Math.trunc(num(a) / num(b));
  }),
  random: returns('double', () => Math.random()),
  remainder: returns(sameType, ([a, b]) => {
    if (isEmpty(a) || isEmpty(b)) return null;
    if (isDecimal(a) || isDecimal(b)) return Decimal.from(a).remainder(b);
    return num(a) % num(b);
  }),
  rint: returns('double', ([a]) => {
    const x = num(a);
    const floor = Math.floor(x);
    const diff = x - floor;
    if (diff !== 0.5) return Math.round(x);
    return floor % 2 === 0 ? floor : floor + 1;
  }),
  round: returns(
    (types) =>
      types.length > 1 && types[1] !== 'String'
        ? types[0] === 'BigDecimal'
          ? 'BigDecimal'
          : 'double'
        : types[0] === 'BigDecimal'
          ? 'BigInteger'
          : 'int',
    (args, types = []) => {
      let [value, scale, mode] = args;
      if (isEmpty(value)) return null;
      // (A mode of a number, or empty: the ordinal of RoundingMode, 0 being UP.)
      if (args.length > 2 && (mode === null || mode === undefined || typeof mode === 'number')) {
        mode = ['UP', 'DOWN', 'CEILING', 'FLOOR', 'HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'UNNECESSARY'][mode ?? 0];
      }
      // (round(value, DOWN): a mode, the scale 0.)
      let whole = false;
      if (typeof scale === 'string') {
        mode = scale;
        scale = 0;
        whole = true;
      }
      if (types[0] === 'float' || types[0] === 'Float') value = floatText(value);
      if (typeof value === 'number' && Number.isFinite(value) && types[0] !== 'float' && types[0] !== 'Float') {
        value = Number(value.toPrecision(15));
      }
      if (whole && !isDecimal(value)) {
        return Math.max(-2147483648, Math.min(2147483647, Number(roundTo(value, 0, mode))));
      }
      if (scale === undefined) {
        if (isDecimal(value)) return value.setScale(0, 'HALF_UP').toBigInt();
        // (NaN to an int: 0, as Java's Math.round.)
        if (Number.isNaN(value)) return 0;
        const rounded = roundTo(value, 0, 'HALF_UP');
        return Math.max(-2147483648, Math.min(2147483647, rounded));
      }
      return roundTo(value, scale, mode ?? 'HALF_UP');
    }
  ),
  roundStrict: returns('double', ([value, scale = 0]) =>
    isEmpty(value) ? null : roundTo(String(value), scale, 'HALF_UP')
  ),
  scalb: returns('double', ([a, n]) => num(a) * 2 ** num(n)),
  signum: returns('double', ([a]) => (isDecimal(a) ? a.signum() : Math.sign(num(a)))),
  sin: returns('double', ([a]) => Math.sin(num(a))),
  sinh: returns('double', ([a]) => Math.sinh(num(a))),
  sqrt: returns('double', ([a]) => (isEmpty(a) ? null : Math.sqrt(num(a)))),
  tan: returns('double', ([a]) => Math.tan(num(a))),
  tanh: returns('double', ([a]) => Math.tanh(num(a))),
  toDegrees: returns('double', ([a]) => (num(a) * 180) / Math.PI),
  toRadians: returns('double', ([a]) => (num(a) * Math.PI) / 180),
  // (Of a float: the float's, ulp(1.0f) is 1.1920929E-7.)
  ulp: returns(
    (types) => (types[0] === 'float' || types[0] === 'Float' ? 'float' : 'double'),
    ([a], types = []) => {
      const x = Math.abs(num(a));
      if (!Number.isFinite(x)) return x;
      if (types[0] === 'float' || types[0] === 'Float') {
        if (x === 0) return 1.401298464324817e-45;
        return Math.fround(2 ** Math.max(Math.floor(Math.log2(x)) - 23, -149));
      }
      if (x === 0) return Number.MIN_VALUE;
      const exponent = Math.floor(Math.log2(x));
      return 2 ** Math.max(exponent - 52, -1074);
    }
  ),
  getExponent: returns('int', ([a, b]) =>
    b !== undefined ? Math.hypot(num(a), num(b)) : num(a) === 0 ? -1023 : Math.floor(Math.log2(Math.abs(num(a))))
  ),
  // (nextAfter(x): the next up; of floats, the next float.)
  nextAfter: returns(
    (types) => (types[0] === 'float' || types[0] === 'Float' ? 'float' : 'double'),
    ([start, direction], types = []) => {
      const x = num(start);
      const d = direction === undefined ? Infinity : num(direction);
      if (x === d) return d;
      if (types[0] === 'float' || types[0] === 'Float') {
        const floats = new DataView(new ArrayBuffer(4));
        if (x === 0) return d > 0 ? 1.401298464324817e-45 : -1.401298464324817e-45;
        floats.setFloat32(0, x);
        floats.setInt32(0, floats.getInt32(0) + (d > x === x > 0 ? 1 : -1));
        return floats.getFloat32(0);
      }
      const buffer = new DataView(new ArrayBuffer(8));
      buffer.setFloat64(0, x);
      let bits = buffer.getBigInt64(0);
      if (x === 0) return d > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
      bits += d > x === x > 0 ? 1n : -1n;
      buffer.setBigInt64(0, bits);
      return buffer.getFloat64(0);
    }
  ),

  // Texts.
  endsWith: returns('boolean', ([s, t]) => (isEmpty(s) || isEmpty(t) ? false : String(s).endsWith(t))),
  startsWith: returns('boolean', ([s, t]) => (isEmpty(s) || isEmpty(t) ? false : String(s).startsWith(t))),
  isNumeric: returns(
    'boolean',
    ([s]) => !isEmpty(s) && String(s).trim() !== '' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(s).trim())
  ),
  // (Runs of spaces are one space, in both.)
  like: returns('boolean', ([s, pattern]) =>
    likePattern(String(pattern ?? '').replace(/\s+/g, ' ')).test(String(s ?? '').replace(/\s+/g, ' '))
  ),
  // A Locale of Java of a tag (de-DE, en_US): getLanguage(), getCountry(), toString().
  toLocale: returns('Locale', ([tag]) => {
    if (isEmpty(tag)) return null;
    const [, language = '', country = ''] = /^([A-Za-z]{2,3})?(?:[-_]([A-Za-z]{2}|\d{3}))?/.exec(String(tag).trim());
    const lower = language.toLowerCase();
    const upper = country.toUpperCase();
    return {
      getLanguage: () => lower,
      getCountry: () => upper,
      toString: () => (upper ? `${lower}_${upper}` : lower),
    };
  }),
  lowerCase: returns('String', ([s]) => (isEmpty(s) ? null : String(s).toLowerCase())),
  upperCase: returns('String', ([s]) => (isEmpty(s) ? null : String(s).toUpperCase())),
  removeEnd: returns('String', ([s, t]) =>
    isEmpty(s) ? null : !isEmpty(t) && String(s).endsWith(t) ? String(s).slice(0, -t.length || undefined) : s
  ),
  removeStart: returns('String', ([s, t]) =>
    isEmpty(s) ? null : !isEmpty(t) && String(s).startsWith(t) ? String(s).slice(t.length) : s
  ),
  replace: returns('String', ([s, search, replacement, max]) => {
    if (isEmpty(s) || isEmpty(search) || search === '' || replacement === null || replacement === undefined)
      return s ?? null;
    let count = 0;
    const limit = max === undefined || max < 0 ? Infinity : max;
    return String(s)
      .split(search)
      .reduce((out, part, i) => (i === 0 ? part : out + (count++ < limit ? (replacement ?? '') : search) + part), '');
  }),
  substr: returns('String', ([s, pos, length]) => {
    if (isEmpty(s)) return null;
    const text = String(s);
    if (pos >= text.length) return '';
    return text.substr(pos, length);
  }),
  substring: returns('String', ([s, begin, end]) => {
    if (isEmpty(s)) return null;
    const text = String(s);
    const at = (i) => (i < 0 ? Math.max(text.length + i, 0) : Math.min(i, text.length));
    const from = at(begin ?? 0);
    const to = end === undefined || end === null ? text.length : at(end);
    return from > to ? '' : text.slice(from, to);
  }),
  textJoin: returns('String', ([separator, ...values]) =>
    values
      .flat(Infinity)
      .filter((value) => !isEmpty(value) && value !== '')
      .map((value) => (typeof value === 'number' ? plainNumber(value) : rt.javaText(value)))
      .join(separator ?? '')
  ),
  textSplit: returns('String[]', ([separator, text]) => {
    if (isEmpty(text)) return null;
    if (text === '') return [];
    const parts_ = isEmpty(separator) || separator === '' ? [text] : String(text).split(separator);
    return parts_.filter((part) => part !== '');
  }),
  toBoolean: returns('Boolean', ([a]) =>
    isEmpty(a) ? null : typeof a === 'boolean' ? a : /^(true|yes|y|on|1)$/i.test(String(a).trim())
  ),
  toDouble: returns('Double', ([s]) => (isEmpty(s) || String(s).trim() === '' ? null : Number(String(s).trim()))),
  toInteger: returns('Integer', ([s]) => {
    if (isEmpty(s) || String(s).trim() === '') return null;
    const n = Number(String(s).trim());
    if (!Number.isInteger(n)) fail(`"${s}" is no Integer`);
    return n;
  }),
  toNumber: returns('Double', ([s]) => {
    if (isEmpty(s)) return null;
    if (typeof s === 'number') return s;
    const text = String(s).trim().replace(/,/g, '');
    return text === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? null : Number(text);
  }),
  toString: returns('String', ([value, format], types) => {
    if (isEmpty(value)) return null;
    if (value instanceof Date) return formatDate(value, format || 'MM/dd/yyyy');
    // (Infinities as OpenL's formats write them.)
    if (value === Infinity || value === -Infinity) return value > 0 ? '∞' : '-∞';
    if (format !== undefined && (typeof value === 'number' || isDecimal(value) || typeof value === 'bigint'))
      return formatNumber(value, format);
    if (typeof value === 'number' || isDecimal(value) || typeof value === 'bigint') return plainNumber(value);
    return rt.javaText(value, types?.[0]);
  }),
  trim: returns('String', ([s]) => (isEmpty(s) ? null : String(s).trim())),

  // Special.
  copy: returns(sameType, ([value]) => deepCopy(value)),
  getValues: returns(
    (types) => (types[0] ? `${types[0]}[]` : null),
    ([vocabulary]) =>
      vocabulary?.vocabulary ? [...vocabulary.vocabulary.values] : fail('getValues takes a vocabulary datatype')
  ),
  error: ([code, message]) => {
    // error(message), error(code, message) (its text "code: message"), error(object) (its fields).
    if (code && typeof code === 'object' && !Array.isArray(code)) {
      const error = new RulesError(JSON.stringify(code), 'XUFA_RULES_ERR_RULE');
      error.body = code;
      throw error;
    }
    const error = new RulesError(message === undefined ? String(code) : `${code}: ${message}`, 'XUFA_RULES_ERR_RULE');
    if (message !== undefined) error.body = { code, message };
    throw error;
  },
  format: returns('String', ([pattern, ...args]) =>
    messageFormat(pattern, args.length === 1 && Array.isArray(args[0]) ? args[0] : args)
  ),

  // Statistics.
  varS: returns('double', (values) => variance(values, true)),
  varP: returns('double', (values) => variance(values, false)),
  stdevS: returns('double', (values) => {
    const v = variance(values, true);
    return v === null ? null : Math.sqrt(v);
  }),
  stdevP: returns('double', (values) => {
    const v = variance(values, false);
    return v === null ? null : Math.sqrt(v);
  }),
  covarS: returns('double', ([y, x]) => covariance(y, x, true)),
  covarP: returns('double', ([y, x]) => covariance(y, x, false)),
  correl: returns('double', ([y, x]) => {
    const c = covariance(y, x, false);
    const list = pairs(y, x);
    if (c === null || !list) return null;
    const sy = Math.sqrt(variance([list.map(([a]) => a)], false));
    const sx = Math.sqrt(variance([list.map(([, b]) => b)], false));
    return sy === 0 || sx === 0 ? null : c / (sy * sx);
  }),
  rsq: returns('double', ([y, x]) => {
    const r = FUNCTIONS.correl([y, x]);
    return r === null ? null : r * r;
  }),
  slope: returns('double', ([y, x]) => regression(y, x)?.slope ?? null),
  intercept: returns('double', ([y, x]) => regression(y, x)?.intercept ?? null),
  forecast: returns('double', ([target, y, x]) => {
    if (isEmpty(target)) return null;
    const line = regression(y, x);
    return line ? line.intercept + line.slope * num(target) : null;
  }),
};

// Constants of every formula of OpenL: PI, E, and the modes of rounding (round(value, 2, HALF_UP)).
const CONSTANTS = {
  PI: Math.PI,
  E: Math.E,
  ...Object.fromEntries(MODES.map((mode) => [mode, mode])),
};

// The shortest text of a float (32.285f is "32.285"), as Java's BigDecimal.valueOf(float) reads it.
function floatText(value) {
  const n = num(value);
  for (let digits = 1; digits <= 9; digits += 1) {
    const text = n.toPrecision(digits);
    if (Math.fround(Number(text)) === Math.fround(n)) return Number(text);
  }
  return n;
}

// Java's static classes: their constants (and their types) and functions.
const statics = (fields, types = {}) => Object.freeze(Object.assign(Object.create(null), fields, { types }));
const STATICS = {
  Math: statics({
    PI: Math.PI,
    E: Math.E,
    abs: (a) => Math.abs(a),
    max: (a, b) => Math.max(a, b),
    min: (a, b) => Math.min(a, b),
    pow: (a, b) => a ** b,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    floor: Math.floor,
    ceil: Math.ceil,
    round: (a) => Math.floor(a + 0.5),
    rint: (a) => FUNCTIONS.rint([a]),
    signum: Math.sign,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    exp: Math.exp,
    log: Math.log,
    log10: Math.log10,
    hypot: Math.hypot,
    floorDiv: (a, b) => Math.floor(a / b),
    floorMod: (a, b) => a - b * Math.floor(a / b),
    toRadians: (a) => (a * Math.PI) / 180,
    toDegrees: (a) => (a * 180) / Math.PI,
  }),
  Integer: statics(
    {
      MAX_VALUE: 2147483647,
      MIN_VALUE: -2147483648,
      parseInt: returns('int', (s) => FUNCTIONS.toInteger([s])),
      valueOf: returns('Integer', (s) => (typeof s === 'number' ? s : FUNCTIONS.toInteger([s]))),
      toString: returns('String', (n) => rt.javaText(n, 'int')),
      compare: returns('int', (a, b) => rt.compare(a, b)),
      sum: returns('int', (a, b) => rt.wrapInt(a + b)),
      max: returns('int', Math.max),
      min: returns('int', Math.min),
    },
    { MAX_VALUE: 'int', MIN_VALUE: 'int' }
  ),
  Long: statics(
    {
      // (Exact: BigInts, as they are past what a double holds.)
      MAX_VALUE: 2n ** 63n - 1n,
      MIN_VALUE: -(2n ** 63n),
      parseLong: returns('long', (s) => Number(s)),
      valueOf: returns('Long', (s) => Number(s)),
      toString: returns('String', (n) => rt.javaText(n, 'long')),
    },
    { MAX_VALUE: 'long', MIN_VALUE: 'long' }
  ),
  Short: statics({ MAX_VALUE: 32767, MIN_VALUE: -32768 }, { MAX_VALUE: 'short', MIN_VALUE: 'short' }),
  Byte: statics({ MAX_VALUE: 127, MIN_VALUE: -128 }, { MAX_VALUE: 'byte', MIN_VALUE: 'byte' }),
  Float: statics(
    {
      MAX_VALUE: 3.4028234663852886e38,
      MIN_VALUE: 1.401298464324817e-45,
      NaN,
      POSITIVE_INFINITY: Infinity,
      NEGATIVE_INFINITY: -Infinity,
    },
    { MAX_VALUE: 'float', MIN_VALUE: 'float', NaN: 'float', POSITIVE_INFINITY: 'float', NEGATIVE_INFINITY: 'float' }
  ),
  Double: statics(
    {
      MAX_VALUE: Number.MAX_VALUE,
      MIN_VALUE: Number.MIN_VALUE,
      NaN,
      POSITIVE_INFINITY: Infinity,
      NEGATIVE_INFINITY: -Infinity,
      parseDouble: returns('double', (s) => Number(s)),
      valueOf: returns('Double', (s) => Number(s)),
      isNaN: returns('boolean', Number.isNaN),
      compare: returns('int', (a, b) => rt.compare(a, b, true)),
      toString: returns('String', (n) => rt.javaText(n, 'double')),
    },
    {
      MAX_VALUE: 'double',
      MIN_VALUE: 'double',
      NaN: 'double',
      POSITIVE_INFINITY: 'double',
      NEGATIVE_INFINITY: 'double',
    }
  ),
  Boolean: statics({
    TRUE: true,
    FALSE: false,
    parseBoolean: returns('boolean', (s) => String(s).toLowerCase() === 'true'),
    valueOf: (s) => (typeof s === 'boolean' ? s : String(s).toLowerCase() === 'true'),
  }),
  Character: statics({
    isDigit: returns('boolean', (c) => /^\d$/.test(String(c))),
    isLetter: returns('boolean', (c) => /^\p{L}$/u.test(String(c))),
    isLetterOrDigit: returns('boolean', (c) => /^[\p{L}\d]$/u.test(String(c))),
    isUpperCase: returns('boolean', (c) => String(c) !== String(c).toLowerCase()),
    isLowerCase: returns('boolean', (c) => String(c) !== String(c).toUpperCase()),
    isWhitespace: returns('boolean', (c) => /^\s$/.test(String(c))),
    toUpperCase: returns('char', (c) => String(c).toUpperCase()),
    toLowerCase: returns('char', (c) => String(c).toLowerCase()),
    getNumericValue: returns('int', (c) => parseInt(String(c), 36)),
  }),
  String: statics({
    valueOf: returns('String', (v) => rt.javaText(v)),
    format: returns('String', (pattern, ...args) =>
      String(pattern).replace(
        /%(\d+\$)?([-0+ ,]*)(\d+)?(?:\.(\d+))?([sdfxXeb%n])/g,
        (all, position, flags, width, precision, conversion) => {
          if (conversion === '%') return '%';
          if (conversion === 'n') return '\n';
          const value = args.shift();
          let text;
          if (conversion === 'd') text = String(Math.trunc(num(value)));
          else if (conversion === 'f') text = num(value).toFixed(precision === undefined ? 6 : Number(precision));
          else if (conversion === 'e') text = num(value).toExponential(precision === undefined ? 6 : Number(precision));
          else if (conversion === 'x' || conversion === 'X')
            text = num(value).toString(16)[conversion === 'X' ? 'toUpperCase' : 'toLowerCase']();
          else if (conversion === 'b') text = String(Boolean(value));
          else text = rt.javaText(value);
          if (flags?.includes(',')) text = text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          if (width)
            text = flags?.includes('-')
              ? text.padEnd(Number(width))
              : text.padStart(Number(width), flags?.includes('0') ? '0' : ' ');
          return text;
        }
      )
    ),
    join: returns('String', (separator, ...items) =>
      (items.length === 1 && Array.isArray(items[0]) ? items[0] : items).join(separator)
    ),
  }),
  BigDecimal: statics(
    {
      ZERO: Decimal.from(0),
      ONE: Decimal.from(1),
      TEN: Decimal.from(10),
      ROUND_UP: 0,
      ROUND_DOWN: 1,
      ROUND_CEILING: 2,
      ROUND_FLOOR: 3,
      ROUND_HALF_UP: 4,
      ROUND_HALF_DOWN: 5,
      ROUND_HALF_EVEN: 6,
      valueOf: returns('BigDecimal', (v) => Decimal.from(v)),
    },
    { ZERO: 'BigDecimal', ONE: 'BigDecimal', TEN: 'BigDecimal' }
  ),
  BigInteger: statics(
    { ZERO: 0n, ONE: 1n, TWO: 2n, TEN: 10n, valueOf: returns('BigInteger', (v) => BigInt(v)) },
    { ZERO: 'BigInteger', ONE: 'BigInteger', TEN: 'BigInteger' }
  ),
  RoundingMode: statics({
    UP: 'UP',
    DOWN: 'DOWN',
    CEILING: 'CEILING',
    FLOOR: 'FLOOR',
    HALF_UP: 'HALF_UP',
    HALF_DOWN: 'HALF_DOWN',
    HALF_EVEN: 'HALF_EVEN',
    UNNECESSARY: 'UNNECESSARY',
  }),
  // Calendar.getInstance().get(Calendar.YEAR): the date of now, its fields (months from 0, as Java's).
  Calendar: statics({
    YEAR: 1,
    MONTH: 2,
    WEEK_OF_YEAR: 3,
    DAY_OF_MONTH: 5,
    DATE: 5,
    DAY_OF_YEAR: 6,
    DAY_OF_WEEK: 7,
    HOUR: 10,
    HOUR_OF_DAY: 11,
    MINUTE: 12,
    SECOND: 13,
    getInstance: returns('Calendar', () => calendarOf(new Date())),
  }),
  // LocalDate.now(), LocalDate.of(2017, 3, 31), LocalDate.parse("2017-03-31"): dates of days.
  LocalDate: statics({
    now: returns('LocalDate', () =>
      localDateOf(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())))
    ),
    of: returns('LocalDate', (y, m, d) => localDateOf(new Date(Date.UTC(y, m - 1, d)))),
    parse: returns('LocalDate', (text) => localDateOf(toDate(text))),
  }),
  List: statics({ of: (...items) => items, copyOf: (list) => [...(list ?? [])] }),
  Map: statics({
    of: (...keysAndValues) =>
      new Map(
        Array.from({ length: keysAndValues.length / 2 }, (_, i) => [keysAndValues[2 * i], keysAndValues[2 * i + 1]])
      ),
  }),
  Set: statics({ of: (...items) => [...new Set(items)] }),
  Arrays: statics({
    asList: (...items) => (items.length === 1 && Array.isArray(items[0]) ? [...items[0]] : items),
    toString: returns('String', (list) => rt.javaText(list)),
    sort: (list) => {
      list.sort((a, b) => rt.compare(a, b, true));
    },
  }),
};

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// A Calendar of Java over a date: get(field), getTime(), set(field, value), add(field, amount).
function calendarOf(date) {
  const at = new Date(date.getTime());
  const fields = {
    1: () => at.getUTCFullYear(),
    2: () => at.getUTCMonth(),
    3: () => FUNCTIONS.weekOfYear([at]),
    5: () => at.getUTCDate(),
    6: () => FUNCTIONS.dayOfYear([at]),
    7: () => at.getUTCDay() + 1,
    10: () => at.getUTCHours() % 12,
    11: () => at.getUTCHours(),
    12: () => at.getUTCMinutes(),
    13: () => at.getUTCSeconds(),
  };
  const setters = {
    1: 'setUTCFullYear',
    2: 'setUTCMonth',
    5: 'setUTCDate',
    11: 'setUTCHours',
    12: 'setUTCMinutes',
    13: 'setUTCSeconds',
  };
  return new JavaObject(
    'Calendar',
    { at },
    {
      get: (self, field) => fields[field]?.() ?? null,
      getTime: () => new Date(at.getTime()),
      set: (self, field, value) => {
        if (setters[field]) at[setters[field]](value);
      },
      add: (self, field, amount) => {
        if (field === 5 || field === 6 || field === 7) at.setUTCDate(at.getUTCDate() + amount);
        else if (setters[field]) at[setters[field]](fields[field]() + amount);
      },
      toString: () => at.toISOString(),
    }
  );
}

// A LocalDate of Java: its year, month, day, day of week; plus and minus of days, weeks, months and years.
function localDateOf(date) {
  if (!date) return null;
  const at = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const moved = (days = 0, months = 0) =>
    localDateOf(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, at.getUTCDate() + days)));
  return new JavaObject(
    'LocalDate',
    { at },
    {
      getYear: () => at.getUTCFullYear(),
      getMonthValue: () => at.getUTCMonth() + 1,
      getDayOfMonth: () => at.getUTCDate(),
      getDayOfYear: () => FUNCTIONS.dayOfYear([at]),
      getDayOfWeek: () => DAYS[at.getUTCDay()],
      plusDays: (self, n) => moved(n),
      plusWeeks: (self, n) => moved(7 * n),
      plusMonths: (self, n) => moved(0, n),
      plusYears: (self, n) => moved(0, 12 * n),
      minusDays: (self, n) => moved(-n),
      minusWeeks: (self, n) => moved(-7 * n),
      minusMonths: (self, n) => moved(0, -n),
      minusYears: (self, n) => moved(0, -12 * n),
      isBefore: (self, other) => at < other.state.at,
      isAfter: (self, other) => at > other.state.at,
      isLeapYear: () => new Date(Date.UTC(at.getUTCFullYear(), 1, 29)).getUTCMonth() === 1,
      lengthOfMonth: () => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate(),
      toString: () => at.toISOString().slice(0, 10),
    }
  );
}

// A small mutable object of Java (StringBuilder, AtomicInteger): its methods.
class JavaObject {
  constructor(javaName, state, methods) {
    this.state = state;
    this.methods = methods;
    this.javaName = javaName;
  }

  method(name, args) {
    const fn = this.methods[name];
    if (!fn) throw new RulesError(`No method ${name}() of ${this.javaName}`, 'XUFA_RULES_ERR_RULE');
    return fn(this, ...args);
  }

  toJava() {
    return this.methods.toString(this);
  }

  toString() {
    return this.toJava();
  }
}

// A range of OpenL made in code: new IntRange(10, 20) (both ends in), new IntRange("[10; 20)").
function makeRange(args, kind, type) {
  if (args.length === 1) return rangeOf(args[0], kind, type);
  const [min, max] = args.map((value) =>
    value instanceof Date ? value.getTime() : rt.isRecord(value) && 'toNumber' in value ? value.toNumber() : value
  );
  return withText({ min, max, minIncluded: true, maxIncluded: true, kind }, type);
}

// The constructors of Java's types: new BigDecimal("1.5"), new ArrayList(), new StringBuilder()...
function newJava(name) {
  const simple = name.split('.').pop();
  const make = {
    BigDecimal: returns('BigDecimal', ([value]) => Decimal.from(value)),
    BigInteger: returns('BigInteger', ([value]) =>
      isDecimal(value) ? value.toBigInt() : BigInt(typeof value === 'number' ? Math.trunc(value) : String(value).trim())
    ),
    Integer: returns('Integer', ([value]) =>
      typeof value === 'number' ? rt.wrapInt(value) : FUNCTIONS.toInteger([value])
    ),
    Long: returns('Long', ([value]) => Number(value)),
    Double: returns('Double', ([value]) => Number(value)),
    Float: returns('Float', ([value]) => Math.fround(Number(value))),
    Short: returns('Short', ([value]) => Number(value)),
    Byte: returns('Byte', ([value]) => Number(value)),
    String: returns('String', ([value]) =>
      value === undefined ? '' : Array.isArray(value) ? value.join('') : String(value)
    ),
    Boolean: returns('Boolean', ([value]) =>
      typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true'
    ),
    Object: returns('Object', () => ({})),
    Date: returns('Date', (args) => (args.length ? new Date(args[0]) : new Date())),
    ArrayList: returns('List', ([items]) => (Array.isArray(items) ? [...items] : [])),
    LinkedList: returns('List', ([items]) => (Array.isArray(items) ? [...items] : [])),
    HashSet: returns('Set', ([items]) => (Array.isArray(items) ? [...new Set(items)] : [])),
    HashMap: returns('Map', () => new Map()),
    LinkedHashMap: returns('Map', () => new Map()),
    TreeMap: returns('Map', () => new Map()),
    IntRange: returns('IntRange', (args) => makeRange(args, 'number', 'IntRange')),
    LongRange: returns('LongRange', (args) => makeRange(args, 'number', 'LongRange')),
    DoubleRange: returns('DoubleRange', (args) => makeRange(args, 'number', 'DoubleRange')),
    FloatRange: returns('FloatRange', (args) => makeRange(args, 'number', 'FloatRange')),
    BigDecimalRange: returns('BigDecimalRange', (args) => makeRange(args, 'number', 'BigDecimalRange')),
    DateRange: returns('DateRange', (args) => makeRange(args, 'date', 'DateRange')),
    CharRange: returns('CharRange', (args) => makeRange(args, 'char', 'CharRange')),
    StringRange: returns('StringRange', (args) => makeRange(args, 'text', 'StringRange')),
    StringBuilder: returns(
      'StringBuilder',
      ([initial]) =>
        new JavaObject(
          'StringBuilder',
          { text: initial === undefined ? '' : String(initial) },
          {
            append: (self, value) => {
              self.state.text += rt.javaText(value);
              return self;
            },
            length: (self) => self.state.text.length,
            reverse: (self) => {
              self.state.text = [...self.state.text].reverse().join('');
              return self;
            },
            toString: (self) => self.state.text,
          }
        )
    ),
    AtomicInteger: returns(
      'AtomicInteger',
      ([initial = 0]) =>
        new JavaObject(
          'AtomicInteger',
          { value: Number(initial) },
          {
            incrementAndGet: (self) => (self.state.value += 1),
            getAndIncrement: (self) => (self.state.value += 1) - 1,
            decrementAndGet: (self) => (self.state.value -= 1),
            addAndGet: (self, n) => (self.state.value += n),
            get: (self) => self.state.value,
            set: (self, n) => {
              self.state.value = n;
            },
            intValue: (self) => self.state.value,
            toString: (self) => String(self.state.value),
          }
        )
    ),
  }[simple];
  return make ?? null;
}

export { FUNCTIONS, CONSTANTS, STATICS, newJava, toDate, formatDate, plainNumber, formatNumber, Decimal };
