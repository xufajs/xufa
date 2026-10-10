// Durations as numbers of seconds or as text: '30s', '15m', '12h', '7d', '2w' (and their sums: '1h30m').
const UNITS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

function seconds(value, name = 'duration') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0)
      throw new TypeError(`${name} must be a number of seconds, ${value} given`);
    return value;
  }
  if (typeof value !== 'string' || !/^(\s*\d+(\.\d+)?\s*[smhdw]\s*)+$/.test(value)) {
    throw new TypeError(`${name} must be a number of seconds or a text as '15m', '12h', '7d': ${String(value)} given`);
  }
  let total = 0;
  for (const [, amount, , unit] of value.matchAll(/(\d+(\.\d+)?)\s*([smhdw])/g)) total += Number(amount) * UNITS[unit];
  return total;
}

export { seconds };
