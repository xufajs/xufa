// Enough of semver to check the version ranges plugins declare: 1.2.3, >=1.2, <2, ^1.2.3, ~1.2, 1.x, *, a - b, ||.

const VERSION = /^v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(text) {
  const match = VERSION.exec(String(text).trim());
  if (!match) return null;
  const part = (value) =>
    value === undefined || value === 'x' || value === 'X' || value === '*' ? null : Number(value);
  return {
    major: Number(match[1]),
    minor: part(match[2]),
    patch: part(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a, b) {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Number(a) - Number(b);
  if (numA) return -1;
  if (numB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    const diff = (a[key] || 0) - (b[key] || 0);
    if (diff !== 0) return diff;
  }
  // A version with a prerelease is lower than the same version without one.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return b.prerelease.length - a.prerelease.length;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    if (a.prerelease[i] === undefined) return -1;
    if (b.prerelease[i] === undefined) return 1;
    const diff = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

const version = (major, minor, patch, prerelease = []) => ({ major, minor, patch, prerelease });

// The comparators of one range of a "||" list: [operator, version] pairs that must all hold.
function comparators(range) {
  const text = range.trim();
  if (text === '' || text === '*' || text === 'x' || text === 'X') return [['>=', version(0, 0, 0)]];
  const hyphen = text.split(/\s+-\s+/);
  if (hyphen.length === 2) {
    const low = parse(hyphen[0]);
    const high = parse(hyphen[1]);
    return [...expand('>=', low), ...expand('<=', high)];
  }
  const out = [];
  for (const token of text.split(/\s+/)) {
    const match = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(token);
    const op = match[1] || '';
    const parsed = parse(match[2]);
    if (parsed === null) throw new TypeError(`Invalid version range: ${range}`);
    out.push(...expand(op, parsed));
  }
  return out;
}

function expand(op, v) {
  const { major, minor, patch, prerelease } = v;
  const full = version(major, minor || 0, patch || 0, prerelease);
  switch (op) {
    case '^':
      if (major > 0 || minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      if (minor > 0 || patch === null)
        return [
          ['>=', full],
          ['<', version(0, minor + 1, 0)],
        ];
      return [
        ['>=', full],
        ['<', version(0, 0, patch + 1)],
      ];
    case '~':
      if (minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      return [
        ['>=', full],
        ['<', version(major, minor + 1, 0)],
      ];
    case '>':
      if (minor === null) return [['>=', version(major + 1, 0, 0)]];
      if (patch === null) return [['>=', version(major, minor + 1, 0)]];
      return [['>', full]];
    case '<=':
      if (minor === null) return [['<', version(major + 1, 0, 0)]];
      if (patch === null) return [['<', version(major, minor + 1, 0)]];
      return [['<=', full]];
    case '>=':
    case '<':
      return [[op, full]];
    default:
      // 1.2.3 is exact; 1 and 1.2 (or 1.x) stand for every version they start.
      if (minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      if (patch === null)
        return [
          ['>=', full],
          ['<', version(major, minor + 1, 0)],
        ];
      return [['=', full]];
  }
}

function test(v, [op, bound]) {
  const diff = compare(v, bound);
  switch (op) {
    case '>':
      return diff > 0;
    case '>=':
      return diff >= 0;
    case '<':
      return diff < 0;
    case '<=':
      return diff <= 0;
    default:
      return diff === 0;
  }
}

function satisfies(versionText, range, options = {}) {
  const v = parse(versionText);
  if (v === null) return false;
  return range.split('||').some((part) => {
    let list = comparators(part);
    // With prereleases, the bounds include them: >=99.0.0 is >=99.0.0-0, <100.0.0 is <100.0.0-0.
    if (options.includePrerelease) {
      list = list.map(([op, bound]) =>
        bound.prerelease.length === 0 && op !== '=' && op !== '<=' ? [op, { ...bound, prerelease: ['0'] }] : [op, bound]
      );
    }
    if (!list.every((comparator) => test(v, comparator))) return false;
    // Prereleases only match ranges naming a prerelease of the same version, unless asked.
    if (v.prerelease.length === 0 || options.includePrerelease) return true;
    return list.some(
      ([, bound]) =>
        bound.prerelease.length > 0 && bound.major === v.major && bound.minor === v.minor && bound.patch === v.patch
    );
  });
}

// The first version in a text ("^98.1" -> 98.1.0), or null.
function coerce(text) {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(text));
  if (!match) return null;
  return version(Number(match[1]), Number(match[2] || 0), Number(match[3] || 0));
}

function gt(a, b) {
  const va = typeof a === 'string' ? parse(a) : a;
  const vb = typeof b === 'string' ? parse(b) : b;
  return va !== null && vb !== null && compare(va, vb) > 0;
}

module.exports = { satisfies, parse, compare, coerce, gt };
