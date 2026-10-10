// Cron expressions: what they parse to, their errors, and next() against a search minute by minute (and second by
// second) of the wall clock, for random expressions, in UTC, the local zone and a zone that changes its clock. And
// the changes of the clock: times that do not exist are skipped, and an hour that repeats is found twice.
import { Cron, parse } from '../lib/cron.js';
import { zoneOf } from '../lib/zone.js';
import { nextRuns, toMs, SchedulerError } from '../index.js';

const iso = (ms) => new Date(ms).toISOString();

describe('parse', () => {
  it('fields, lists, ranges, steps, names and macros', () => {
    const f = parse('*/15 9-17 1,15 jan-mar mon-fri');
    expect([...f.seconds]).toEqual([0]);
    expect([...f.minutes]).toEqual([0, 15, 30, 45]);
    expect([...f.hours]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...f.days]).toEqual([1, 15]);
    expect([...f.months]).toEqual([1, 2, 3]);
    expect([...f.weekdays]).toEqual([1, 2, 3, 4, 5]);
    expect(f.either).toBe(true);
    expect([...parse('5/20 * * * *').minutes]).toEqual([5, 25, 45]);
    expect([...parse('0-30/10 * * * *').minutes]).toEqual([0, 10, 20, 30]);
    expect([...parse('30 */20 * * * *').seconds]).toEqual([30]);
    expect([...parse('0 0 * * 7').weekdays].sort()).toEqual([0, 7]);
    expect(parse('@hourly')).toEqual(parse('0 * * * *'));
    expect(parse('@WEEKLY')).toEqual(parse('0 0 * * sun'));
    expect(parse('0 0 * * *').either).toBe(false);
    expect(parse('0 0 13 * *').either).toBe(false);
  });

  it('errors', () => {
    for (const [expression, message] of [
      ['* * * *', /5 fields/],
      ['* * * * * * *', /5 fields/],
      ['60 * * * *', /60 is out of the minute \(0-59\)/],
      ['* 24 * * *', /out of the hour/],
      ['* * 0 * *', /out of the day of the month/],
      ['* * * 13 *', /out of the month/],
      ['* * * * 8', /out of the day of the week/],
      ['*/0 * * * *', /'0' is not a step/],
      ['10-5 * * * *', /range 10-5 of the minute is empty/],
      ['* * * foo *', /'foo' is not a month/],
      ['L * * * *', /'L' is not a minute/],
    ]) {
      expect(() => parse(expression)).toThrow(message);
      expect(() => parse(expression)).toThrow(SchedulerError);
    }
    expect(() => parse(5)).toThrow(/is a text/);
    expect(() => new Cron('* * * * *', { timezone: 'Mars/Olympus' })).toThrow(/not a time zone/);
  });
});

describe('next()', () => {
  it('known times, in UTC', () => {
    const utc = (expression, from) => iso(new Cron(expression, { timezone: 'UTC' }).next(Date.parse(from)));
    expect(utc('*/15 * * * *', '2026-10-06T10:07:30Z')).toBe('2026-10-06T10:15:00.000Z');
    expect(utc('*/15 * * * *', '2026-10-06T10:15:00Z')).toBe('2026-10-06T10:30:00.000Z');
    expect(utc('0 0 1 1 *', '2026-10-06T10:00:00Z')).toBe('2027-01-01T00:00:00.000Z');
    expect(utc('@monthly', '2026-12-31T23:59:59Z')).toBe('2027-01-01T00:00:00.000Z');
    expect(utc('0 9 * * mon', '2026-10-06T10:00:00Z')).toBe('2026-10-12T09:00:00.000Z'); // a Tuesday: next Monday
    expect(utc('0 0 29 2 *', '2026-10-06T00:00:00Z')).toBe('2028-02-29T00:00:00.000Z');
    expect(utc('*/10 * * * * *', '2026-10-06T10:00:05Z')).toBe('2026-10-06T10:00:10.000Z');
    // Vixie: the 13th, or a Friday.
    expect(utc('0 0 13 * fri', '2026-10-06T00:00:00Z')).toBe('2026-10-09T00:00:00.000Z');
    expect(utc('0 0 13 * fri', '2026-10-10T00:00:00Z')).toBe('2026-10-13T00:00:00.000Z');
  });

  it('days no month of it has: an error (it would never run); with a day of the week, those days run', () => {
    expect(() => new Cron('0 0 30 2 *')).toThrow(/no month of it has those days: it never runs/);
    expect(() => nextRuns('0 0 31 4,6 *')).toThrow(/never runs/);
    expect(new Cron('0 0 31 2,5 *').fields.days.has(31)).toBe(true); // May has a 31st
    // The 30th of February, or a Monday of February: the Mondays.
    const either = nextRuns('0 0 30 2 mon', 1, { timezone: 'UTC', from: new Date('2026-10-06T00:00:00Z') });
    expect(either.map((d) => d.toISOString())).toEqual(['2027-02-01T00:00:00.000Z']);
  });

  it('nextRuns()', () => {
    const runs = nextRuns('0 8 * * mon-fri', 3, { timezone: 'Europe/Madrid', from: new Date('2026-10-09T00:00:00Z') });
    expect(runs.map((d) => d.toISOString())).toEqual([
      '2026-10-09T06:00:00.000Z',
      '2026-10-12T06:00:00.000Z',
      '2026-10-13T06:00:00.000Z',
    ]);
  });

  // The reference: every second (or minute) of the wall clock from `from` on, until one matches.
  function reference(cron, from, stepMs, limitMs) {
    const zone = cron.zone;
    const f = cron.fields;
    let t = Math.floor(from / 1000) * 1000 + 1000;
    if (stepMs === 60000) t = Math.ceil(t / 60000) * 60000; // minutes (expressions of second 0)
    for (const end = from + limitMs; t <= end; t += stepMs) {
      const p = zone.exact(t); // Intl itself
      const dayOk = f.either ? f.days.has(p.day) || f.weekdays.has(p.weekday) : f.days.has(p.day) && f.weekdays.has(p.weekday);
      if (f.seconds.has(p.second) && f.minutes.has(p.minute) && f.hours.has(p.hour) && f.months.has(p.month) && dayOk) {
        return t;
      }
    }
    return undefined; // not within the limit
  }

  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  function field(min, max) {
    const kind = Math.floor(rnd() * 6);
    const a = min + Math.floor(rnd() * (max - min + 1));
    const b = Math.min(max, a + Math.floor(rnd() * 6));
    if (kind === 0) return '*';
    if (kind === 1) return String(a);
    if (kind === 2) return `${a}-${b}`;
    if (kind === 3) return `*/${1 + Math.floor(rnd() * 12)}`;
    if (kind === 4) return `${a},${b}`;
    return `${a}-${b}/${1 + Math.floor(rnd() * 3)}`;
  }

  for (const timezone of ['UTC', 'Europe/Madrid', 'America/New_York', 'Asia/Kolkata', undefined]) {
    it(`random expressions match the reference (${timezone || 'local zone'})`, () => {
      let compared = 0;
      for (let i = 0; i < 80; i += 1) {
        const expression = [field(0, 59), field(0, 23), pick(['*', '*', field(1, 31)]), pick(['*', '*', field(1, 12)]), pick(['*', field(0, 6)])].join(' ');
        const cron = new Cron(expression, { timezone });
        // From a time around the changes of the clock of 2026 (March and October/November), and others.
        const from = pick([Date.parse('2026-03-28T20:13:00Z'), Date.parse('2026-10-24T21:41:30Z'), Date.parse('2026-11-01T03:59:59Z'), Date.parse('2026-06-15T12:00:00Z')]);
        const expected = reference(cron, from, 60000, 5 * 86400000);
        if (expected === undefined) continue;
        compared += 1;
        const got = cron.next(from);
        if (got !== expected) throw new Error(`${expression} from ${iso(from)}: ${iso(got)} instead of ${iso(expected)}`);
      }
      expect(compared).toBeGreaterThan(35);
    });
  }

  it('random expressions with seconds match the reference', () => {
    for (let i = 0; i < 60; i += 1) {
      const expression = [field(0, 59), field(0, 59), '*', '*', '*', '*'].join(' ');
      const cron = new Cron(expression, { timezone: 'Europe/Madrid' });
      const from = Date.parse('2026-10-25T00:58:31Z'); // the clock goes back at 01:00 UTC
      const expected = reference(cron, from, 1000, 3 * 3600000);
      expect([expression, cron.next(from)]).toEqual([expression, expected]);
    }
  });

  it('a time that does not exist (the clock goes forward) is skipped; an hour that repeats is found twice', () => {
    const madrid = (expression) => new Cron(expression, { timezone: 'Europe/Madrid' });
    // 29 March 2026: 02:00 is 03:00 in Madrid; 02:30 does not exist that day.
    expect(iso(madrid('30 2 * * *').next(Date.parse('2026-03-28T12:00:00Z')))).toBe('2026-03-30T00:30:00.000Z');
    // 25 October 2026: 03:00 is 02:00 again; 02:30 is twice (00:30 and 01:30 UTC).
    const back = madrid('30 2 * * *');
    const first = back.next(Date.parse('2026-10-24T12:00:00Z'));
    const second = back.next(first);
    expect([iso(first), iso(second)]).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    expect(back.wallKey(first)).toBe(back.wallKey(second));
    expect(zoneOf('Europe/Madrid').parts(first)).toMatchObject({ hour: 2, minute: 30 });
  });
});

describe('durations', () => {
  it('numbers and texts', () => {
    expect(toMs(1500)).toBe(1500);
    expect(toMs('1500')).toBe(1500);
    expect(toMs('500ms')).toBe(500);
    expect(toMs('30s')).toBe(30000);
    expect(toMs('10m')).toBe(600000);
    expect(toMs('1h30m')).toBe(5400000);
    expect(toMs('1h 30m')).toBe(5400000);
    expect(toMs('1.5h')).toBe(5400000);
    expect(toMs('2d')).toBe(172800000);
    expect(toMs('1w')).toBe(604800000);
    for (const wrong of ['', 'soon', '10 minutes', '-5s', -1, NaN, null]) {
      expect(() => toMs(wrong)).toThrow(SchedulerError);
    }
  });
});
