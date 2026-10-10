// Functions the generated serializers call to write values: the same results as fast-json-stringify.
import { writeNumberText } from './writer.js';

// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;

// The strings are joined with +, not template literals: V8 makes fewer strings of them (measured: 2-3 ns a call).
/* eslint-disable prefer-template */
function asString(str) {
  const len = str.length;
  if (len === 0) return '""';
  if (len < 42) {
    // Short strings: quotes and backslashes are escaped here, anything else to escape goes to JSON.stringify.
    let result = '';
    let last = -1;
    for (let i = 0; i < len; i += 1) {
      const point = str.charCodeAt(i);
      if (point === 34 || point === 92) {
        if (last === -1) last = 0;
        result += str.slice(last, i) + '\\';
        last = i;
      } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
        return JSON.stringify(str);
      }
    }
    return last === -1 ? '"' + str + '"' : '"' + result + str.slice(last) + '"';
  }
  if (len < 5000 && !NEEDS_ESCAPE.test(str)) return '"' + str + '"';
  return JSON.stringify(str);
}
/* eslint-enable prefer-template */

// A value of a property of type string that is not a string.
function asStringValue(value) {
  if (typeof value === 'string') return asString(value);
  if (value === null) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  if (value instanceof RegExp) return asString(value.source);
  return asString(value.toString());
}

function asUnsafeString(str) {
  return `"${str}"`;
}

function createAsInteger(rounding) {
  let round = Math.trunc;
  if (rounding === 'floor') round = Math.floor;
  else if (rounding === 'ceil') round = Math.ceil;
  else if (rounding === 'round') round = Math.round;
  return function asInteger(value) {
    if (Number.isInteger(value)) return `${value}`;
    if (typeof value === 'bigint') return value.toString();
    const integer = round(value);
    if (integer === Infinity || integer === -Infinity || Number.isNaN(integer)) {
      throw new Error(`The value "${value}" cannot be converted to an integer.`);
    }
    return `${integer}`;
  };
}

function asNumber(value) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return `${value}`;
    if (Number.isNaN(value)) throw new Error(`The value "${value}" cannot be converted to a number.`);
    return 'null';
  }
  const num = Number(value);
  if (Number.isNaN(num)) throw new Error(`The value "${value}" cannot be converted to a number.`);
  if (num === Infinity || num === -Infinity) return 'null';
  return `${num}`;
}

function asBoolean(value) {
  return value ? 'true' : 'false';
}

function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
}

function asDateTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${date.toISOString()}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date-time.`);
}

function asDate(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(0, 10)}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date.`);
}

function asTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(11, 19)}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a time.`);
}

// What JSON.stringify writes for a value, or "undefined" as fast-json-stringify does.
function asAny(value) {
  return `${JSON.stringify(value)}`;
}

function createRuntime(options = {}) {
  const asInteger = createAsInteger(options.rounding);
  return {
    asString,
    asStringValue,
    asUnsafeString,
    asInteger,
    // The writers of numbers of the 'bytes' output: the text of asInteger and asNumber, without making it for the
    // numbers that are written as they are.
    writeInteger(value) {
      writeNumberText(Number.isInteger(value) ? '' + value : asInteger(value)); // eslint-disable-line prefer-template
    },
    writeNumber(value) {
      writeNumberText(typeof value === 'number' && Number.isFinite(value) ? '' + value : asNumber(value)); // eslint-disable-line prefer-template
    },
    asNumber,
    asBoolean,
    asDateTime,
    asDate,
    asTime,
    asAny,
  };
}

export { createRuntime, asString, asNumber, asBoolean, asDateTime, asDate, asTime };
