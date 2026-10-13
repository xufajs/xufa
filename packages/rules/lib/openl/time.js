// The values of java.time in books of OpenL Tablets: LocalDate, LocalTime, LocalDateTime, ZonedDateTime and Instant, of
// the texts cells and defaults write (ISO, or as the US writes them: 03/31/2017, 09:30 PM, 9/20/2019 10:50 AM,
// 10/10/2019 10:15 AM America/Los_Angeles), written as Java writes them (2017-03-31, 21:30, 2019-09-20T10:50,
// 2019-10-10T10:15-07:00[America/Los_Angeles], 2019-10-10T17:15:00Z). Wall times are kept as UTC dates (as every date
// of a book is), and zones by their names, their offsets told by Intl.

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const pad = (n, size = 2) => String(n).padStart(size, '0');

// A value of java.time: its methods (called as those of Java) and its text.
class JavaTime {
  constructor(javaName, state, methods) {
    this.javaName = javaName;
    this.state = state;
    this.methods = methods;
  }

  method(name, args) {
    const fn = this.methods[name];
    if (!fn) throw new Error(`No method ${name}() of ${this.javaName}`);
    return fn(...args);
  }

  toJava() {
    return this.methods.toString();
  }

  toString() {
    return this.toJava();
  }

  valueOf() {
    return this.state.at.getTime();
  }
}

// hh:mm(:ss)? of a wall time; seconds only when they are not 0 (as Java writes times).
const clock = (at) =>
  `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}${at.getUTCSeconds() ? `:${pad(at.getUTCSeconds())}` : ''}`;
const day = (at) => `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
const dayOfWeek = (at) => {
  const name = DAYS[at.getUTCDay()];
  return { toString: () => name, name: () => name, getValue: () => ((at.getUTCDay() + 6) % 7) + 1, toJava: () => name };
};

function localDate(at) {
  return new JavaTime(
    'LocalDate',
    { at },
    {
      getYear: () => at.getUTCFullYear(),
      getMonthValue: () => at.getUTCMonth() + 1,
      getDayOfMonth: () => at.getUTCDate(),
      getDayOfWeek: () => dayOfWeek(at),
      toString: () => day(at),
    }
  );
}

function localTime(at) {
  return new JavaTime(
    'LocalTime',
    { at },
    {
      getHour: () => at.getUTCHours(),
      getMinute: () => at.getUTCMinutes(),
      getSecond: () => at.getUTCSeconds(),
      toString: () => clock(at),
    }
  );
}

function localDateTime(at) {
  return new JavaTime(
    'LocalDateTime',
    { at },
    {
      getYear: () => at.getUTCFullYear(),
      getMonthValue: () => at.getUTCMonth() + 1,
      getDayOfMonth: () => at.getUTCDate(),
      getHour: () => at.getUTCHours(),
      getMinute: () => at.getUTCMinutes(),
      getDayOfWeek: () => dayOfWeek(at),
      toLocalDate: () => localDate(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))),
      toString: () => `${day(at)}T${clock(at)}`,
    }
  );
}

// The offset of a zone (minutes east of UTC) at an instant.
function offsetOf(zone, instant) {
  if (/^(UTC|Z|GMT)$/i.test(zone)) return 0;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  );
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((wall - instant.getTime()) / 60000);
}

// The instant of a wall time in a zone.
function instantOf(wall, zone) {
  let instant = new Date(wall.getTime() - offsetOf(zone, wall) * 60000);
  instant = new Date(wall.getTime() - offsetOf(zone, instant) * 60000);
  return instant;
}

const offsetText = (minutes) =>
  minutes === 0
    ? 'Z'
    : `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;

function zonedDateTime(wall, zone) {
  const instant = instantOf(wall, zone);
  return new JavaTime(
    'ZonedDateTime',
    { at: instant, wall, zone },
    {
      getZone: () => zone,
      toInstant: () => javaInstant(instant),
      toLocalDateTime: () => localDateTime(wall),
      getDayOfWeek: () => dayOfWeek(wall),
      toString: () => `${day(wall)}T${clock(wall)}${offsetText(offsetOf(zone, instant))}[${zone}]`,
    }
  );
}

function javaInstant(instant) {
  return new JavaTime(
    'Instant',
    { at: instant },
    {
      toEpochMilli: () => instant.getTime(),
      toString: () => instant.toISOString().replace(/\.000Z$/, 'Z'),
    }
  );
}

// A wall time of a text: ISO (2019-09-20T10:20, 2019-09-20 10:20:30) or of the US (9/20/2019 10:50 AM); a zone after
// it (Z, [UTC], America/Los_Angeles) apart.
function wallOf(text) {
  const value = String(text).trim();
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?(?:\[([^\]]+)\])?$/.exec(
      value
    );
  if (iso) {
    const [, y, m, d, h = 0, mi = 0, s = 0, offset, zone] = iso;
    const wall = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(mi), Number(s)));
    return { wall, zone: zone ?? (offset === 'Z' ? 'UTC' : null), offset: offset ?? null };
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?(?:\s+(\S+))?$/.exec(
    value
  );
  if (us) {
    const [, m, d, y, h = 0, mi = 0, s = 0, half, zone] = us;
    let hours = Number(h);
    if (half && /p/i.test(half) && hours < 12) hours += 12;
    if (half && /a/i.test(half) && hours === 12) hours = 0;
    const wall = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hours, Number(mi), Number(s)));
    return { wall, zone: zone ?? null, offset: null };
  }
  return null;
}

// A time of day of a text: 10:30, 21:30:15, 09:30 PM.
function timeOf(text) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(String(text).trim());
  if (!match) return null;
  let hours = Number(match[1]);
  if (match[4] && /p/i.test(match[4]) && hours < 12) hours += 12;
  if (match[4] && /a/i.test(match[4]) && hours === 12) hours = 0;
  return new Date(Date.UTC(1970, 0, 1, hours, Number(match[2]), Number(match[3] ?? 0)));
}

const TIME_TYPES = new Set(['localdate', 'localtime', 'localdatetime', 'zoneddatetime', 'instant']);

// A value of a java.time type of a text (or a date), or null when it is none.
function timeValueOf(raw, type) {
  const kind = String(type)
    .toLowerCase()
    .replace(/^java\.time\./, '');
  if (raw instanceof JavaTime) return raw;
  if (kind === 'localtime') {
    const at = raw instanceof Date ? raw : timeOf(raw);
    return at ? localTime(at) : null;
  }
  const parsed = raw instanceof Date ? { wall: raw, zone: 'UTC', offset: null } : wallOf(raw);
  if (!parsed) return null;
  const { wall, zone, offset } = parsed;
  if (kind === 'localdate')
    return localDate(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())));
  if (kind === 'localdatetime') return localDateTime(wall);
  // (A zone of an offset alone: as UTC moved by it.)
  const shift =
    offset && offset !== 'Z'
      ? Number(offset.slice(0, 3)) * 60 + Math.sign(Number(offset.slice(0, 3)) || 1) * Number(offset.slice(-2))
      : 0;
  if (kind === 'zoneddatetime') return zonedDateTime(wall, zone ?? 'UTC');
  if (kind === 'instant') {
    const instant = zone ? instantOf(wall, zone) : new Date(wall.getTime() - shift * 60000);
    return javaInstant(instant);
  }
  return null;
}

export { JavaTime, TIME_TYPES, timeValueOf, localDate, localTime, localDateTime, zonedDateTime, javaInstant };
