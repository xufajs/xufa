// Durations: milliseconds as numbers, or text: '500ms', '30s', '10m', '2h', '1d', '1w', and sums ('1h30m').
import { SchedulerError } from './errors.js';

const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const PART = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)/gy;

function toMs(value, what = 'duration') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new SchedulerError(`${what}: ${value} is not a duration`);
    return value;
  }
  if (typeof value !== 'string') throw new SchedulerError(`${what}: ${String(value)} is not a duration`);
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0;
  let at = 0;
  PART.lastIndex = 0;
  while (at < text.length) {
    PART.lastIndex = at;
    const match = PART.exec(text);
    if (!match) throw new SchedulerError(`${what}: '${value}' is not a duration (as '30s', '10m' or '1h30m')`);
    total += Number(match[1]) * UNITS[match[2]];
    at = PART.lastIndex;
    while (text[at] === ' ') at += 1;
  }
  if (text.length === 0) throw new SchedulerError(`${what}: '' is not a duration`);
  return total;
}

export { toMs };
