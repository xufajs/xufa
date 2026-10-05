// Computed fields: a field with `computed` (an expression of @xufa/expression, or a function of the object) has the
// value it computes from the other fields of its object. Virtual by default: no column, computed when it is read.
// With `stored: true` it is a column like any other, set when its object is saved and when an update changes a field
// it reads, so it can be filtered, ordered and aggregated.
const { ModelError } = require('./errors');

let engine = null;

// The expression engine, loaded the first time a model has a computed field of an expression.
function expressionEngine() {
  if (engine === null) {
    // eslint-disable-next-line global-require
    const { Engine } = require('@xufa/expression');
    engine = new Engine();
  }
  return engine;
}

const GLOBAL_NAMES = new Set([
  'Math',
  'JSON',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'Date',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
  'Infinity',
  'NaN',
  'undefined',
]);

// A number rounded to `scale` decimal places, half away from zero, on its decimal digits (2.675 gives 2.68, which
// toFixed does not: it rounds the binary value), as the text of a decimal.
function roundDecimal(value, scale) {
  const text = String(Math.abs(value));
  if (text.includes('e')) return value.toFixed(scale);
  const rounded = Number(`${Math.round(Number(`${text}e${scale}`))}e-${scale}`);
  return (value < 0 && rounded !== 0 ? -rounded : rounded).toFixed(scale);
}

// What a computation gives, as the field keeps it: numbers of decimal fields rounded to their scale.
function finisher(field) {
  if (field.dbType !== 'decimal' || !Number.isInteger(field.scale)) return null;
  return (value) => (typeof value === 'number' && Number.isFinite(value) ? roundDecimal(value, field.scale) : value);
}

// The names an expression reads from its context: its free names, but the parameters of its arrow functions and the
// globals.
function namesOf(node, bound = new Set(), names = new Set()) {
  if (node === null || typeof node !== 'object') return names;
  if (Array.isArray(node)) {
    node.forEach((item) => namesOf(item, bound, names));
    return names;
  }
  switch (node.type) {
    case 'Identifier':
      if (!bound.has(node.name) && !GLOBAL_NAMES.has(node.name)) names.add(node.name);
      return names;
    case 'MemberExpression':
      namesOf(node.object, bound, names);
      if (node.computed) namesOf(node.property, bound, names);
      return names;
    case 'Property':
      if (node.computed) namesOf(node.key, bound, names);
      namesOf(node.value, bound, names);
      return names;
    case 'ArrowFunctionExpression':
      namesOf(node.body, new Set([...bound, ...node.params]), names);
      return names;
    default:
      Object.keys(node).forEach((key) => {
        if (key !== 'type' && key !== 'start' && key !== 'end') namesOf(node[key], bound, names);
      });
      return names;
  }
}

// Prepares the computed fields of a model (Meta): each gets `compute(object)` and `uses`, the fields it reads (null
// when it is a function without `uses`: any field). Stored ones are given in the order to compute them, those a
// stored field reads first.
function prepareComputed(meta, model, all) {
  const computed = all.filter((field) => field.computed !== null);
  for (const field of computed) {
    const finish = finisher(field);
    if (typeof field.computed === 'function') {
      const fn = field.computed;
      field.compute = finish ? (object) => finish(fn(object)) : (object) => fn(object);
      field.uses = field.options.uses ? new Set(field.options.uses) : null;
    } else if (typeof field.computed === 'string') {
      let compiled;
      let names;
      try {
        compiled = expressionEngine().compile(field.computed);
        names = namesOf(expressionEngine().parse(field.computed));
      } catch (err) {
        throw new ModelError(model.name, `the computed field ${field.name}: ${err.message}`);
      }
      field.compute = finish ? (object) => finish(compiled(object)) : (object) => compiled(object);
      field.uses = names;
    } else {
      throw new ModelError(model.name, `the computed field ${field.name} needs an expression or a function`);
    }
  }
  // The fields read, by their names: a computed field read by another counts as the fields it reads.
  const byName = new Map();
  all.forEach((field) => {
    byName.set(field.name, field);
    byName.set(field.attname, field);
  });
  const resolving = new Set();
  const resolveUses = (field) => {
    if (field.usesFields !== undefined) return field.usesFields;
    if (resolving.has(field)) throw new ModelError(model.name, `the computed field ${field.name} reads itself`);
    resolving.add(field);
    let usesFields = null;
    if (field.uses !== null) {
      usesFields = new Set();
      for (const name of field.uses) {
        const used = byName.get(name);
        if (!used) continue; // a relation loaded, or another name of the object
        if (used.computed !== null) {
          const inner = resolveUses(used);
          if (inner === null) {
            usesFields = null;
            break;
          }
          inner.forEach((item) => usesFields.add(item));
        } else usesFields.add(used);
      }
    }
    resolving.delete(field);
    // eslint-disable-next-line no-param-reassign
    field.usesFields = usesFields;
    return usesFields;
  };
  computed.forEach(resolveUses);
  // Stored fields in an order where a stored field read by another is computed before it.
  const stored = computed.filter((field) => field.stored);
  const ordered = [];
  const visit = (field) => {
    if (ordered.includes(field)) return;
    if (field.uses) {
      for (const name of field.uses) {
        const used = byName.get(name);
        if (used && used !== field && used.stored && used.computed !== null) visit(used);
      }
    }
    ordered.push(field);
  };
  stored.forEach(visit);
  // eslint-disable-next-line no-param-reassign
  meta.storedComputed = ordered;
  // eslint-disable-next-line no-param-reassign
  meta.virtualComputed = computed.filter((field) => !field.stored);
}

// Whether changing these fields changes the value of a stored computed field.
function affects(field, changed) {
  if (field.usesFields === null) return true;
  for (const used of changed) if (field.usesFields.has(used)) return true;
  return false;
}

module.exports = { prepareComputed, affects, namesOf, roundDecimal, expressionEngine };
