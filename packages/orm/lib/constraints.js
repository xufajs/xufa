// Constraints of models, as Django's Meta.constraints: unique ones (UniqueConstraint), of fields and of their lower
// case (Lower('name'): unique whatever the case of the text), with a message for those who break them; and checks
// (CheckConstraint), rules of the object checked before it is saved.
//
//   static options = {
//     constraints: [
//       { unique: [Lower('name')], name: 'genre_name_ci', message: 'Genre already exists (case insensitive match)' },
//       { unique: ['author', 'title'], message: 'This author has a book of that title' },
//       { check: 'pages > 0', name: 'positive_pages', message: 'A book has pages' },
//     ],
//   };
//
// A unique constraint is a unique index: SQL backends index LOWER(column) for Lower(), MongoDB makes it of a collation
// without case (strength 2: every text of the index is compared without case), and the memory and fs backends check
// it. Indexes take Lower() too (indexes: [[Lower('email')]]), to find texts without case.

// The lower case of a text field, in a constraint or an index.
function Lower(field) {
  if (typeof field !== 'string' || field === '') throw new TypeError('Lower(field): the name of a field');
  return Object.freeze({ kind: 'lower', field });
}

const isLower = (item) => Boolean(item) && typeof item === 'object' && item.kind === 'lower';

// An index of the options ({ fields, unique, name, condition, expireAfter, message }, or a list of fields): its names
// of fields, and those of them in lower case (lower).
function normalizeIndex(given, modelName) {
  const index = Array.isArray(given) ? { fields: given } : { ...given };
  if (!Array.isArray(index.fields) || index.fields.length === 0) {
    throw new TypeError(`An index of ${modelName} has fields: a list of names (or Lower(name))`);
  }
  const lower = index.fields.filter(isLower).map((item) => item.field);
  index.fields = index.fields.map((item) => (isLower(item) ? item.field : item));
  if (index.fields.some((name) => typeof name !== 'string')) {
    throw new TypeError(`The fields of an index of ${modelName} are names, or Lower(name)`);
  }
  if (lower.length) index.lower = lower;
  return index;
}

// The unique constraints of a model as unique indexes, and its checks as rules ({ rule, message }).
function constraintsOf(constraints, modelName) {
  const indexes = [];
  const rules = [];
  for (const constraint of constraints || []) {
    if (!constraint || typeof constraint !== 'object') {
      throw new TypeError(`A constraint of ${modelName} is { unique: [...] } or { check: rule }`);
    }
    if (constraint.unique !== undefined) {
      const index = normalizeIndex({ fields: constraint.unique, unique: true }, modelName);
      if (constraint.name) index.name = constraint.name;
      if (constraint.message) index.message = constraint.message;
      if (constraint.condition) index.condition = constraint.condition;
      indexes.push(index);
    } else if (constraint.check !== undefined) {
      rules.push({
        rule: constraint.check,
        message: constraint.message || `The constraint ${constraint.name || 'check'} is not met`,
        field: constraint.field,
      });
    } else {
      throw new TypeError(`A constraint of ${modelName} is { unique: [...] } or { check: rule }`);
    }
  }
  return { indexes, rules };
}

export { Lower, normalizeIndex, constraintsOf, isLower };
