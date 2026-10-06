'use strict';

// The wall clock of a time zone: what an instant is there (year, month, day, hour, minute, second, day of the week).
// Without a time zone, the local one of the process (Date's getters); with one, Intl (an IANA name: 'Europe/Madrid',
// 'UTC', 'America/New_York').
const { SchedulerError } = require('./errors');

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localZone() {
  return {
    name: null,
    exact(ms) {
      return this.parts(ms);
    },
    parts(ms) {
      const date = new Date(ms);
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        weekday: date.getDay(),
      };
    },
  };
}

function intlZone(name) {
  let format;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
  } catch {
    throw new SchedulerError(`timezone: '${name}' is not a time zone`);
  }
  const exact = (ms) => {
    const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, weekday: 0 };
    for (const { type, value } of format.formatToParts(ms)) {
      if (type === 'weekday') out.weekday = WEEKDAYS[value];
      else if (type in out) out[type] = Number(value);
    }
    return out;
  };
  // The offset of the zone from UTC, by quarter of an hour (its changes are at the start of one): Intl once for each,
  // and the parts from the offset.
  const offsets = new Map();
  const offsetAt = (ms) => {
    const quarter = Math.floor(ms / QUARTER);
    let offset = offsets.get(quarter);
    if (offset === undefined) {
      const start = quarter * QUARTER;
      const p = exact(start);
      offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - start;
      if (offsets.size >= 50000) offsets.clear();
      offsets.set(quarter, offset);
    }
    return offset;
  };
  return {
    name,
    exact,
    parts(ms) {
      const date = new Date(ms + offsetAt(ms));
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        weekday: date.getUTCDay(),
      };
    },
  };
}

const QUARTER = 900000;

const zones = new Map();

function zoneOf(name) {
  if (!name) return localZone();
  let zone = zones.get(name);
  if (!zone) {
    zone = intlZone(name);
    zones.set(name, zone);
  }
  return zone;
}

module.exports = { zoneOf };
