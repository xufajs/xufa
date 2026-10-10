// Days as texts (YYYY-MM-DD, as date fields give them), in the time of the machine (Django's date.today()):
// today(), addDays(days, from), and dateOf(spec): a day, 'today', one relative to today ('+4w', '-1d', '+3m',
// '+1y'), a Date, or a function that gives one of them (read when it is asked, not when it is written).
const pad = (n) => String(n).padStart(2, '0');
const textOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE = /^([+-])(\d+)([dwmy])$/;

function today() {
  return textOf(new Date());
}

const parse = (day) => {
  if (!DAY.test(day)) throw new TypeError(`A day is YYYY-MM-DD: ${day}`);
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

// The day some days after one (before, for negative days); today by default.
function addDays(days, from = today()) {
  const date = parse(from);
  date.setDate(date.getDate() + days);
  return textOf(date);
}

// The months after a day (the last day of the month when it has not that day: Jan 31 + 1m is Feb 28).
function addMonths(months, from = today()) {
  const date = parse(from);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return textOf(date);
}

function dateOf(spec) {
  if (typeof spec === 'function') return dateOf(spec());
  if (spec instanceof Date) return textOf(spec);
  if (spec === 'today') return today();
  const relative = typeof spec === 'string' ? RELATIVE.exec(spec) : null;
  if (relative) {
    const count = Number(relative[2]) * (relative[1] === '-' ? -1 : 1);
    const unit = relative[3];
    if (unit === 'd') return addDays(count);
    if (unit === 'w') return addDays(count * 7);
    return addMonths(unit === 'm' ? count : count * 12);
  }
  if (typeof spec === 'string' && DAY.test(spec)) return spec;
  throw new TypeError(`A day is YYYY-MM-DD, 'today', '+4w' (d, w, m, y), a Date or a function: ${spec}`);
}

export { today, addDays, addMonths, dateOf };
