'use strict';

// What the admin knows of a model: its fields as the forms show them, the columns of its list, what it searches and
// filters by, and the label of each object (its toString(), as Django's __str__, or its first text field).

// The kinds of inputs of the fields, by their types.
const INPUTS = {
  id: 'number',
  string: 'text',
  text: 'textarea',
  integer: 'number',
  bigint: 'text',
  float: 'number',
  decimal: 'decimal',
  boolean: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  json: 'json',
  uuid: 'text',
  foreignKey: 'select',
};

function hasOwnToString(model) {
  for (
    let current = model.prototype;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    if (Object.hasOwn(current, 'toString') && current.constructor.name !== 'Model') return true;
  }
  return false;
}

function labelOf(model, object) {
  if (!object) return '';
  if (hasOwnToString(model)) return String(object);
  const text = model.meta.fields.find((field) => field.type === 'string' && !field.primaryKey);
  const value = text ? object[text.attname] : null;
  return value !== null && value !== undefined && value !== '' ? String(value) : `${model.name} ${object.pk}`;
}

function describeField(field) {
  const fk = field.type === 'foreignKey';
  const readOnly = Boolean(field.primaryKey || field.auto || field.readOnly || field.blobInfo || field.mailInfo);
  return {
    name: field.name,
    attname: field.attname,
    type: field.type,
    input: field.choices ? 'choices' : INPUTS[field.type] || 'text',
    required: !field.null && !readOnly && !field.hasDefault() && field.type !== 'boolean',
    null: Boolean(field.null),
    readOnly,
    primaryKey: Boolean(field.primaryKey),
    choices: field.choices || null,
    maxLength: field.maxLength === undefined ? null : field.maxLength,
    scale: field.scale === undefined ? null : field.scale,
    target: fk ? field.target.name : null,
    default: typeof field.default === 'function' || field.default === undefined ? null : field.default,
  };
}

// The description of a model in the admin, with the options given for it (list, search, filters, readOnly, order).
function describeModel(model, options = {}) {
  const { meta } = model;
  const fields = meta.fields.filter((field) => field.type !== 'blob').map(describeField);
  const readOnly = new Set(options.readOnly || []);
  for (const field of fields) if (readOnly.has(field.name)) field.readOnly = true;
  const shown = fields.filter((field) => field.type !== 'json' && field.type !== 'text');
  const list = options.list || shown.slice(0, 6).map((field) => field.name);
  const search =
    options.search || fields.filter((field) => field.type === 'string' && !field.choices).map((field) => field.name);
  const filters =
    options.filters ||
    fields
      .filter(
        (field) => !field.primaryKey && (field.type === 'boolean' || field.choices || field.type === 'foreignKey')
      )
      .map((field) => field.name);
  const known = new Set(fields.map((field) => field.name));
  for (const name of [...list, ...search, ...filters]) {
    if (!known.has(name)) throw new TypeError(`admin: ${model.name} has no field ${name}`);
  }
  return {
    name: model.name,
    label: options.label || model.name,
    pk: meta.pk && !meta.pk.composite ? meta.pk.name : null,
    fields,
    list,
    search,
    filters,
    ordering: options.ordering || meta.ordering || [],
    softDelete: meta.softDelete || null,
    readOnlyModel: Boolean(options.readOnlyModel),
  };
}

module.exports = { describeModel, labelOf, INPUTS };
