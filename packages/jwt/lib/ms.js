// Spans of time written as text ('2 days', '10h', '1.5 hours', '-3m'), in milliseconds, as the ms package reads
// them; undefined when the text is not one. Numbers are given back formatted ('2d'), as ms does.
const S = 1000;
const M = S * 60;
const H = M * 60;
const D = H * 24;
const W = D * 7;
const Y = D * 365.25;

const UNITS = {
  years: Y,
  year: Y,
  yrs: Y,
  yr: Y,
  y: Y,
  weeks: W,
  week: W,
  w: W,
  days: D,
  day: D,
  d: D,
  hours: H,
  hour: H,
  hrs: H,
  hr: H,
  h: H,
  minutes: M,
  minute: M,
  mins: M,
  min: M,
  m: M,
  seconds: S,
  second: S,
  secs: S,
  sec: S,
  s: S,
  milliseconds: 1,
  millisecond: 1,
  msecs: 1,
  msec: 1,
  ms: 1,
};

const PATTERN =
  /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;

function parse(text) {
  const str = String(text);
  if (str.length > 100) return undefined;
  const match = PATTERN.exec(str);
  if (!match) return undefined;
  return parseFloat(match[1]) * UNITS[(match[2] || 'ms').toLowerCase()];
}

function format(ms) {
  const abs = Math.abs(ms);
  if (abs >= D) return `${Math.round(ms / D)}d`;
  if (abs >= H) return `${Math.round(ms / H)}h`;
  if (abs >= M) return `${Math.round(ms / M)}m`;
  if (abs >= S) return `${Math.round(ms / S)}s`;
  return `${ms}ms`;
}

function ms(value) {
  if (typeof value === 'string' && value.length > 0) return parse(value);
  if (typeof value === 'number' && Number.isFinite(value)) return format(value);
  throw new Error(`val is not a non-empty string or a valid number. val=${JSON.stringify(value)}`);
}

export default ms;
export { ms as 'module.exports' };
