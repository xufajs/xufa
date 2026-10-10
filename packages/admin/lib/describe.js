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

// Lists of texts of a JSON field picked from those of the admin (its option widget): permissions (Book.add) and the
// roles of the rbac (AbstractUser and AbstractGroup of @xufa/auth).
const PICKERS = new Set(['permissions', 'roles']);
const pickerOf = (field) =>
  field.type === 'json' && field.options && PICKERS.has(field.options.widget) ? field.options.widget : null;

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function hasOwnToString(model) {
  // Its text in options (display: '{lastName}, {firstName}').
  if (model.meta && model.meta.options && model.meta.options.display) return true;
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
    input: field.choices ? 'choices' : pickerOf(field) || INPUTS[field.type] || 'text',
    required:
      (!field.null && !readOnly && !field.hasDefault() && field.type !== 'boolean') ||
      Boolean(field.blankGiven && !field.blank && !readOnly),
    null: Boolean(field.null),
    readOnly,
    primaryKey: Boolean(field.primaryKey),
    choices: field.choices || null,
    // The labels of the choices, in their order (null: the values are their labels).
    choiceLabels:
      field.choices && field.choiceLabels ? field.choices.map((value) => String(field.choiceLabels.get(value))) : null,
    // Its label and help (verbose_name, help_text): null for none (the page makes one of the name).
    label: field.label || null,
    help: field.help || null,
    maxLength: field.maxLength === undefined ? null : field.maxLength,
    scale: field.scale === undefined ? null : field.scale,
    target: fk ? field.target.name : null,
    default: typeof field.default === 'function' || field.default === undefined ? null : field.default,
  };
}

// A many-to-many field (the genres of a book): its keys, chosen from the objects of its model; required unless it may
// be blank (as Django's).
function describeManyToMany(field) {
  return {
    name: field.name,
    attname: field.name,
    type: 'manyToMany',
    input: 'multiselect',
    required: field.blankGiven ? !field.blank : true,
    null: false,
    readOnly: false,
    primaryKey: false,
    choices: null,
    choiceLabels: null,
    label: field.label || null,
    help: field.help || null,
    maxLength: null,
    scale: null,
    target: field.target.name,
    default: null,
  };
}

// The method or getter of a model by a name (in its class or those it extends), or null.
function memberOf(model, name) {
  for (let proto = model.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    const found = Object.getOwnPropertyDescriptor(proto, name);
    if (found && (typeof found.value === 'function' || typeof found.get === 'function')) return found;
  }
  return null;
}

// A column of a list (Django's list_display): a field; a path across foreign keys (book__title, ordered by it); a
// method or getter of the model (displayGenre, which may be async; its label: the label of the function); a
// many-to-many field (its objects); or { name, label, value(object) }. The server gives the values of those that are
// not fields (row.columns).
function columnOf(model, entry, fields) {
  if (entry && typeof entry === 'object') {
    if (typeof entry.name !== 'string' || (entry.value !== undefined && typeof entry.value !== 'function')) {
      throw new TypeError(`admin: a column of ${model.name} is a name, or { name, label, value(object) }`);
    }
    const member = entry.value ? null : memberOf(model, entry.name);
    if (!entry.value && !member) throw new TypeError(`admin: ${model.name} has no field ${entry.name}`);
    return { name: entry.name, label: entry.label || null, kind: 'computed', value: entry.value || null, member };
  }
  if (typeof entry !== 'string') throw new TypeError(`admin: a column of ${model.name} is a name`);
  const field = fields.find((item) => item.name === entry);
  if (field && field.type === 'manyToMany') return { name: entry, label: field.label, kind: 'many' };
  if (field) return { name: entry, label: null, kind: 'field' };
  if (entry.includes('__')) {
    const parts = entry.split('__');
    let current = model;
    for (const part of parts.slice(0, -1)) {
      const step = current.meta.fields.find((item) => item.name === part && item.type === 'foreignKey');
      if (!step) throw new TypeError(`admin: ${model.name} has no field ${entry} (${part} is not a foreign key)`);
      current = step.target;
    }
    const last = current.meta.fields.find((item) => item.name === parts[parts.length - 1]);
    if (!last) throw new TypeError(`admin: ${model.name} has no field ${entry}`);
    return { name: entry, label: last.label || null, kind: 'path', select: parts.slice(0, -1).join('__') };
  }
  const member = memberOf(model, entry);
  if (member) {
    const fn = member.value || member.get;
    return { name: entry, label: fn.label || null, kind: 'computed', value: null, member };
  }
  throw new TypeError(`admin: ${model.name} has no field ${entry}`);
}

// The fields of a form in groups (Django's fields and fieldsets): [{ title, description, collapse, rows: [[name]] }],
// or null for every field. fields: names, or lists of names on one line; fieldsets: [[title, { fields, description,
// collapse }]].
function layoutOf(model, options, fields) {
  const rowsOf = (list, where) => {
    if (!Array.isArray(list) || !list.length)
      throw new TypeError(`admin: ${where} of ${model.name} is a list of names`);
    return list.map((item) => {
      const row = [].concat(item);
      for (const name of row) {
        if (!fields.some((field) => field.name === name)) {
          throw new TypeError(`admin: ${model.name} has no field ${name}`);
        }
      }
      return row;
    });
  };
  if (options.fieldsets) {
    if (!Array.isArray(options.fieldsets)) throw new TypeError(`admin: fieldsets of ${model.name} is a list`);
    return options.fieldsets.map((set) => {
      const [title, spec] = Array.isArray(set) ? set : [set.title, set];
      return {
        title: title || null,
        description: (spec && spec.description) || null,
        collapse: Boolean(spec && (spec.collapse || (spec.classes || []).includes('collapse'))),
        rows: rowsOf(spec && spec.fields, 'a fieldset'),
      };
    });
  }
  if (options.fields) {
    return [{ title: null, description: null, collapse: false, rows: rowsOf(options.fields, 'fields') }];
  }
  return null;
}

// The columns of descriptions as the server computes them (kept out of what the page gets).
const COLUMNS = new WeakMap();
const columnsOf = (description) => COLUMNS.get(description) || [];

// The description of a model in the admin, with the options given for it (list, search, filters, readOnly, order,
// fields, fieldsets).
function describeModel(model, options = {}) {
  const { meta } = model;
  const fields = [
    ...meta.fields.filter((field) => field.type !== 'blob').map(describeField),
    ...(meta.manyToMany || []).map(describeManyToMany),
  ];
  const readOnly = new Set(options.readOnly || []);
  for (const field of fields) if (readOnly.has(field.name)) field.readOnly = true;
  const shown = fields.filter((field) => !['json', 'text', 'manyToMany'].includes(field.type));
  const columns = (options.list || shown.slice(0, 6).map((field) => field.name)).map((entry) =>
    columnOf(model, entry, fields)
  );
  const list = columns.map((column) => column.name);
  const search =
    options.search || fields.filter((field) => field.type === 'string' && !field.choices).map((field) => field.name);
  const filters =
    options.filters ||
    fields
      .filter(
        (field) => !field.primaryKey && (field.type === 'boolean' || field.choices || field.type === 'foreignKey')
      )
      .map((field) => field.name);
  const known = new Set(fields.filter((field) => field.type !== 'manyToMany').map((field) => field.name));
  for (const name of filters) {
    if (!known.has(name)) throw new TypeError(`admin: ${model.name} has no field ${name}`);
  }
  const layout = layoutOf(model, options, fields);
  // Django's list_editable: fields of the list changed in its rows (booleans and choices), each saved as it changes.
  const editable = options.editable || [];
  for (const name of editable) {
    const field = fields.find((item) => item.name === name);
    if (!field || !list.includes(name))
      throw new TypeError(`admin: ${model.name} cannot edit ${name} in its list (not a column)`);
    if (field.readOnly || !(field.type === 'boolean' || field.choices)) {
      throw new TypeError(`admin: ${model.name} edits booleans and choices in its list, not ${name}`);
    }
    if (layout && !layout.some((set) => set.rows.some((row) => row.includes(name)))) {
      throw new TypeError(`admin: ${model.name} edits ${name} in its list, but its form has not that field`);
    }
  }
  // Searches: fields, or paths across relations (author__name, books__title), with ^ (starts with) or = (exactly).
  for (const name of search) checkSearch(model, name);
  const description = {
    name: model.name,
    // Its names, as Django's admin shows them: the collection (verbose_name_plural, with a capital: 'Book instances')
    // and one object (verbose_name: 'book instance').
    label: options.label || capital(meta.labelPlural || `${model.name}s`),
    singular: options.singular || meta.label || model.name,
    pk: meta.pk && !meta.pk.composite ? meta.pk.name : null,
    fields,
    list,
    // The columns of its list as the page shows them (those that are not fields have their values in row.columns).
    columns: columns.map((column) => ({
      name: column.name,
      label: column.label,
      computed: column.kind !== 'field',
      sortable: column.kind === 'field' || column.kind === 'path',
    })),
    // The groups of the fields of its form (fields, fieldsets), or null.
    layout,
    // The fields changed in the rows of its list.
    editable,
    search,
    filters,
    ordering: options.ordering || meta.ordering || [],
    softDelete: meta.softDelete || null,
    readOnlyModel: Boolean(options.readOnlyModel),
    // The lists of the objects of other models that point to it (made by the admin, which knows its models).
    related: [],
    // Its actions on the objects selected in its list (made by the admin, which runs them).
    actions: [],
  };
  COLUMNS.set(description, columns);
  return description;
}

// A name of search as a lookup: ^name starts with, =name is exactly, name contains (all without case).
function searchLookup(name) {
  if (name.startsWith('^')) return `${name.slice(1)}__istartswith`;
  if (name.startsWith('=')) return `${name.slice(1)}__iexact`;
  return `${name}__icontains`;
}

// A search that is not a field nor a path of the model is an error when the admin starts, not when someone searches.
function checkSearch(model, name) {
  if (typeof name !== 'string' || !/^[\^=]?\w+$/.test(name))
    throw new TypeError(`admin: not a search of ${model.name}: ${name}`);
  try {
    model.objects.filter({ [searchLookup(name)]: '' }).toQuery();
  } catch (err) {
    // A model not registered yet is checked when it is searched.
    if (/resolve|lookup|field/i.test(err.message) && !/registered/i.test(err.message)) {
      throw new TypeError(`admin: ${model.name} cannot search ${name} (${err.message})`);
    }
  }
}

export { describeModel, labelOf, INPUTS, searchLookup, columnsOf };
