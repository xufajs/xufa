// Cron expressions: 'minute hour day-of-month month day-of-week', or with seconds first (6 fields). Each field is *
// (or ?), a value, a range (1-5), a list (1,15,30), and steps (*/15, 0-30/10, 5/20); months and days of the week by
// name too (jan-dec, sun-sat; 0 and 7 are Sunday). The macros @yearly (@annually), @monthly, @weekly, @daily
// (@midnight) and @hourly. As in Vixie cron, when both the day of the month and of the week are restricted, a day
// matching either runs.
//
// next(after) is the first instant after another one on the wall clock of a time zone: times that do not exist there
// (a clock going forward) are skipped; an hour that repeats (a clock going back) is found twice, which the scheduler
// runs once.
import { SchedulerError } from './errors.js';
import { zoneOf } from './zone.js';

const MACROS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FIELDS = [
  { name: 'second', min: 0, max: 59 },
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of the month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTHS, offset: 1 },
  { name: 'day of the week', min: 0, max: 7, names: DAYS, offset: 0 },
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // February: of leap years
const HOUR = 3600000;
const MINUTE = 60000;
const LIMIT = 200000; // steps of the search: decades of days, for expressions that (almost) never match

function value(text, field, expression) {
  const lower = text.toLowerCase();
  if (field.names) {
    const index = field.names.indexOf(lower);
    if (index !== -1) return index + field.offset;
  }
  if (!/^\d+$/.test(text)) {
    throw new SchedulerError(`cron '${expression}': '${text}' is not a ${field.name}`);
  }
  const number = Number(text);
  if (number < field.min || number > field.max) {
    throw new SchedulerError(`cron '${expression}': ${number} is out of the ${field.name} (${field.min}-${field.max})`);
  }
  return number;
}

// The values of a field: a Set, and whether it is restricted (not * or ?).
function parseField(text, field, expression) {
  const values = new Set();
  let restricted = true;
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/');
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
        throw new SchedulerError(`cron '${expression}': '${stepText}' is not a step of the ${field.name}`);
      }
      step = Number(stepText);
    }
    let from;
    let to;
    if (range === '*' || range === '?') {
      from = field.min;
      to = field.max;
      if (stepText === undefined && text.split(',').length === 1) restricted = false;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      from = value(a, field, expression);
      to = value(b, field, expression);
      if (from > to) throw new SchedulerError(`cron '${expression}': the range ${range} of the ${field.name} is empty`);
    } else {
      from = value(range, field, expression);
      to = stepText === undefined ? from : field.max;
    }
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return { values, restricted };
}

function parse(expression) {
  if (typeof expression !== 'string') throw new SchedulerError('cron: an expression is a text');
  const source = expression.trim();
  const text = MACROS[source.toLowerCase()] || source;
  const parts = text.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new SchedulerError(`cron '${expression}': 5 fields (minute hour day month weekday), or 6 with seconds first`);
  }
  if (parts.length === 5) parts.unshift('0');
  const [second, minute, hour, day, month, weekday] = parts.map((part, i) => parseField(part, FIELDS[i], expression));
  if (weekday.values.has(7)) weekday.values.add(0);
  // Days of the month that no month of the expression has (30 February): it would never run.
  if (day.restricted && !weekday.restricted) {
    const possible = [...month.values].some((m) => [...day.values].some((d) => d <= DAYS_IN_MONTH[m - 1]));
    if (!possible) throw new SchedulerError(`cron '${expression}': no month of it has those days: it never runs`);
  }
  return {
    seconds: second.values,
    minutes: minute.values,
    hours: hour.values,
    days: day.values,
    months: month.values,
    weekdays: weekday.values,
    // Vixie: either day field, when both are restricted; else the restricted one (or any day).
    either: day.restricted && weekday.restricted,
  };
}

const firstAfter = (set, current, max) => {
  for (let v = current + 1; v <= max; v += 1) if (set.has(v)) return v;
  return -1;
};

class Cron {
  constructor(expression, { timezone } = {}) {
    this.expression = expression;
    this.fields = parse(expression);
    this.zone = zoneOf(timezone);
  }

  dayMatches(p) {
    const { days, weekdays, either } = this.fields;
    if (either) return days.has(p.day) || weekdays.has(p.weekday);
    return days.has(p.day) && weekdays.has(p.weekday);
  }

  // The first instant (ms) after `after` (ms) that matches, or null when there is none for decades.
  next(after) {
    const { seconds, minutes, hours, months } = this.fields;
    let t = Math.floor(after / 1000) * 1000 + 1000;
    for (let steps = 0; steps < LIMIT; steps += 1) {
      const p = this.zone.parts(t);
      const startOfHour = t - (p.minute * 60 + p.second) * 1000;
      if (!months.has(p.month) || !this.dayMatches(p)) {
        // To the last hour of the day (a change of the clock may land an hour off: the next steps correct it).
        t = p.hour < 22 ? startOfHour + (23 - p.hour) * HOUR : startOfHour + HOUR;
        continue;
      }
      if (!hours.has(p.hour)) {
        const hour = firstAfter(hours, p.hour, 23);
        t = this.toHour(startOfHour, p, hour === -1 ? 24 : hour);
        continue;
      }
      if (!minutes.has(p.minute)) {
        const minute = firstAfter(minutes, p.minute, 59);
        t = minute === -1 ? startOfHour + HOUR : startOfHour + minute * MINUTE;
        continue;
      }
      if (!seconds.has(p.second)) {
        const second = firstAfter(seconds, p.second, 59);
        const startOfMinute = t - p.second * 1000;
        t = second === -1 ? startOfMinute + MINUTE : startOfMinute + second * 1000;
        continue;
      }
      return t;
    }
    return null;
  }

  // The start of the hour `hour` (24: the next midnight) of the day of `p`, from the start of its hour: as many hours
  // later, unless the clock went forward in between and that lands past it (then that much earlier, when the hour
  // exists that day; when it does not, the time after it).
  toHour(startOfHour, p, hour) {
    const t = startOfHour + (hour - p.hour) * HOUR;
    const q = this.zone.parts(t);
    const target = hour === 24 ? 0 : hour;
    const sameDay = hour === 24 ? q.day !== p.day : q.day === p.day;
    if (!sameDay || q.hour <= target) return t;
    const back = t - (q.hour - target) * HOUR;
    const r = this.zone.parts(back);
    return r.hour === target && (hour === 24 ? r.day !== p.day : r.day === p.day) ? back : t;
  }

  // The wall-clock time of an instant, as text: two runs at the same one (an hour that repeats) are one.
  wallKey(ms) {
    const p = this.zone.parts(ms);
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  }
}

export { Cron, parse };
