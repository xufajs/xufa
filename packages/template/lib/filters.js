// HTML escaping, strings that are HTML already (SafeString), and the filters templates have by default:
// {{ name | upper }}, {{ price | number('es-ES', { style: 'currency', currency: 'EUR' }) }}...

class SafeString {
  constructor(value) {
    this.value = String(value);
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return this.value;
  }
}

const UNSAFE = /[&<>"'`]/;

// HTML escaped: the text scanned once, the safe runs between the characters to escape copied as they are.
function escapeHtml(value) {
  const text = String(value);
  const first = text.search(UNSAFE);
  if (first === -1) return text;
  let result = '';
  let last = 0;
  for (let i = first; i < text.length; i += 1) {
    let entity;
    switch (text.charCodeAt(i)) {
      case 38:
        entity = '&amp;';
        break;
      case 60:
        entity = '&lt;';
        break;
      case 62:
        entity = '&gt;';
        break;
      case 34:
        entity = '&quot;';
        break;
      case 39:
        entity = '&#39;';
        break;
      case 96:
        entity = '&#96;';
        break;
      default:
        continue;
    }
    if (last !== i) result += text.slice(last, i);
    result += entity;
    last = i + 1;
  }
  return last === text.length ? result : result + text.slice(last);
}

const isEmpty = (value) => value === null || value === undefined || value === '';
const text = (value) => (value === null || value === undefined ? '' : String(value));
const listOf = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [...value];
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
};

const FILTERS = {
  upper: (value) => text(value).toUpperCase(),
  lower: (value) => text(value).toLowerCase(),
  capitalize: (value) => {
    const string = text(value);
    return string.charAt(0).toUpperCase() + string.slice(1);
  },
  trim: (value) => text(value).trim(),
  default: (value, fallback = '') => (isEmpty(value) ? fallback : value),
  json: (value, indent) => JSON.stringify(value, null, indent),
  join: (value, separator = ', ') => listOf(value).join(separator),
  length: (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string' || Array.isArray(value)) return value.length;
    if (value instanceof Map || value instanceof Set) return value.size;
    return typeof value === 'object' ? Object.keys(value).length : 0;
  },
  first: (value) => listOf(value)[0],
  last: (value) => {
    const list = listOf(value);
    return list[list.length - 1];
  },
  reverse: (value) => (typeof value === 'string' ? [...value].reverse().join('') : [...listOf(value)].reverse()),
  slice: (value, start, end) => (typeof value === 'string' ? value.slice(start, end) : listOf(value).slice(start, end)),
  keys: (value) => (value && typeof value === 'object' ? Object.keys(value) : []),
  values: (value) => (value && typeof value === 'object' ? Object.values(value) : []),
  truncate: (value, length = 80, end = '…') => {
    const string = text(value);
    return string.length > length ? string.slice(0, Math.max(0, length - end.length)) + end : string;
  },
  replace: (value, search, replacement = '') => text(value).split(String(search)).join(String(replacement)),
  round: (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  },
  fixed: (value, digits = 0) => Number(value).toFixed(digits),
  number: (value, locale, options) => new Intl.NumberFormat(locale, options).format(value),
  date: (value, locale, options) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, options).format(date);
  },
  urlencode: (value) => encodeURIComponent(text(value)),
  escape: (value) => new SafeString(escapeHtml(text(value))),
  safe: (value) => new SafeString(text(value)),
};

module.exports = { FILTERS, SafeString, escapeHtml };
