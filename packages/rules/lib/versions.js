// Versions of a table by business dimensions, as OpenL Tablets dispatches them: tables of the same name whose
// properties (effectiveDate, expirationDate, lob, state, country... or any of the book's own) say where each applies,
// one chosen by the runtime context of a call ({ currentDate, lob, usState, ... }). Only the dimensions the context
// gives are compared; a table without a property applies to every value of it. When several apply, the most specific
// (whose values are within the others') is chosen, Deviation over Base over none (origin), then the one that restricts
// fewer dimensions the context does not give; else the call is ambiguous.
import { RulesError, listOf } from './values.js';
import { parseDate } from './conditions.js';

// The properties that are no dimension (information and behaviour of tables).
const NOT_DIMENSIONS = new Set([
  'name',
  'category',
  'createdBy',
  'createdOn',
  'modifiedBy',
  'modifiedOn',
  'description',
  'tags',
  'version',
  'active',
  'id',
  'buildPhase',
  'validateDT',
  'failOnMiss',
  'scope',
  'priority',
  'datatypePackage',
  'spreadsheetResultPackage',
  'cacheable',
  'recalculate',
  'emptyResultProcessing',
  'precision',
  'tableStructureDetails',
  'autoType',
  'calculateAllCells',
  'parallel',
  'origin',
  'language',
  'dialect',
]);

// The key of the context of a dimension property (their names in OpenL), or the property's own name.
const CONTEXT_KEYS = { state: 'usState', usregion: 'usRegion', caRegions: 'caRegion', caProvinces: 'caProvince' };

const isDimension = (name) =>
  !NOT_DIMENSIONS.has(name) && !/^(effective|expiration|startRequest|endRequest)Date$/.test(name);
const isSet = (value) => value !== null && value !== undefined && value !== '';
const timeOf = (value) => (value instanceof Date ? value.getTime() : parseDate(value));

// Whether a table's properties apply to a context: null if not, else how many of the context's dimensions they
// restrict and how many dimensions they restrict that the context does not give (unknown).
function fit(properties, context) {
  let restricts = 0;
  let unknown = 0;
  const date = (from, to, key) => {
    if (!isSet(properties[from]) && !isSet(properties[to])) return true;
    if (!isSet(context[key])) {
      unknown += 1;
      return true;
    }
    const at = timeOf(context[key]);
    if (isSet(properties[from]) && at < timeOf(properties[from])) return false;
    if (isSet(properties[to]) && at > timeOf(properties[to])) return false;
    restricts += 1;
    return true;
  };
  if (!date('effectiveDate', 'expirationDate', 'currentDate')) return null;
  if (!date('startRequestDate', 'endRequestDate', 'requestDate')) return null;
  for (const [name, value] of Object.entries(properties)) {
    if (!isDimension(name) || !isSet(value)) continue;
    const key = CONTEXT_KEYS[name] ?? name;
    if (!isSet(context[key])) {
      unknown += 1;
      continue;
    }
    const allowed = listOf(value).map((item) => String(item).toLowerCase());
    if (!allowed.includes(String(context[key]).toLowerCase())) return null;
    restricts += 1;
  }
  return { restricts, unknown };
}

const ORIGIN = { deviation: 2, base: 1 };

// What a version restricts of each dimension the context gives: a set of values, or an interval of dates.
function scopeOf(properties, context) {
  const scope = {};
  const interval = (from, to, key) => {
    if (!isSet(context[key]) || (!isSet(properties[from]) && !isSet(properties[to]))) return;
    scope[key] = {
      from: isSet(properties[from]) ? timeOf(properties[from]) : -Infinity,
      to: isSet(properties[to]) ? timeOf(properties[to]) : Infinity,
    };
  };
  interval('effectiveDate', 'expirationDate', 'currentDate');
  interval('startRequestDate', 'endRequestDate', 'requestDate');
  for (const [name, value] of Object.entries(properties)) {
    if (!isDimension(name) || !isSet(value)) continue;
    const key = CONTEXT_KEYS[name] ?? name;
    if (!isSet(context[key])) continue;
    scope[key] = new Set(listOf(value).map((item) => String(item).toLowerCase()));
  }
  return scope;
}

// Whether a scope is within another (each of its restrictions inside the other's; the other's unrestricted
// dimensions hold everything), and not the same.
function within(inner, outer) {
  let smaller = false;
  for (const key of new Set([...Object.keys(inner), ...Object.keys(outer)])) {
    const a = inner[key];
    const b = outer[key];
    if (!b) {
      if (a) smaller = true;
      continue;
    }
    if (!a) return false;
    if (a instanceof Set) {
      if (![...a].every((value) => b.has(value))) return false;
      if (a.size < b.size) smaller = true;
    } else {
      if (a.from < b.from || a.to > b.to) return false;
      if (a.from > b.from || a.to < b.to) smaller = true;
    }
  }
  return smaller;
}

// The table of versions that applies to a context: of those that apply, Deviation over Base over none (origin), then
// the most specific (none other within it); of several as specific, the one that restricts fewer dimensions the
// context does not tell; else the call is ambiguous.
function choose(name, versions, context) {
  const fitting = [];
  for (const table of versions) {
    const properties = table.properties || {};
    if (properties.active === false || String(properties.active).toLowerCase() === 'false') continue;
    const fits = fit(properties, context);
    if (fits) {
      fitting.push({
        table,
        ...fits,
        origin: ORIGIN[String(properties.origin || '').toLowerCase()] ?? 0,
        scope: scopeOf(properties, context),
      });
    }
  }
  if (!fitting.length) {
    throw new RulesError(
      `No version of ${name} applies to the context ${JSON.stringify(context)}`,
      'XUFA_RULES_ERR_NO_VERSION'
    );
  }
  const top = Math.max(...fitting.map((item) => item.origin));
  let candidates = fitting.filter((item) => item.origin === top);
  // (The most specific: those that no other is within.)
  candidates = candidates.filter(
    (item) => !candidates.some((other) => other !== item && within(other.scope, item.scope))
  );
  if (candidates.length > 1) {
    const fewest = Math.min(...candidates.map((item) => item.unknown));
    candidates = candidates.filter((item) => item.unknown === fewest);
  }
  if (candidates.length > 1) {
    const most = Math.max(...candidates.map((item) => item.restricts));
    candidates = candidates.filter((item) => item.restricts === most);
  }
  if (candidates.length > 1) {
    throw new RulesError(
      `Ambiguous versions of ${name} for the context ${JSON.stringify(context)}: ${candidates
        .map((item) => describe(item.table))
        .join('; ')}`,
      'XUFA_RULES_ERR_AMBIGUOUS'
    );
  }
  return candidates[0].table;
}

function describe(table) {
  const shown = Object.entries(table.properties || {}).filter(([key]) => isDimension(key) || /Date$/.test(key));
  return shown.length
    ? shown
        .map(([key, value]) => `${key}=${value instanceof Date ? value.toISOString().slice(0, 10) : value}`)
        .join(', ')
    : 'no properties';
}

// Whether a table has properties that make it a version (dimensions or dates).
const isVersion = (table) =>
  Object.keys(table.ownProperties || table.properties || {}).some(
    (key) => isDimension(key) || /Date$/.test(key) || key === 'origin' || key === 'active'
  );

// A runtime context that a version's properties apply to (to try it): the first value of each dimension, by the key
// of the context (state -> usState), and its dates (effectiveDate -> currentDate, startRequestDate -> requestDate).
function contextOf(properties = {}) {
  const context = {};
  const day = (value) => {
    const time = timeOf(value);
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : undefined;
  };
  const date = (from, to, key) => {
    const value = isSet(properties[from])
      ? day(properties[from])
      : isSet(properties[to])
        ? day(properties[to])
        : undefined;
    if (value) context[key] = value;
  };
  date('effectiveDate', 'expirationDate', 'currentDate');
  date('startRequestDate', 'endRequestDate', 'requestDate');
  for (const [name, value] of Object.entries(properties)) {
    if (!isDimension(name) || !isSet(value) || name === 'origin') continue;
    const [first] = listOf(value);
    if (isSet(first)) context[CONTEXT_KEYS[name] ?? name] = String(first);
  }
  return context;
}

export { choose, isVersion, fit, isDimension, contextOf };
