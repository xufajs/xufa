// Forms of models (Django's ModelForm): their fields made of those of a model of @xufa/orm (labels, help, choices with
// labels, foreign keys and many-to-many as choices of objects, what is required), cleaned by the form and then by the
// model (its validation and rules, and its unique fields and constraints, asked to the database), and saved.
//
//   class BookForm extends ModelForm {
//     static meta = { model: Book, fields: ['title', 'author', 'summary', 'isbn', 'genre', 'language'] };
//   }
//   const form = new BookForm({ data: request.body, instance: book }); // instance: the object to change, or none
//   if (await form.isValid()) book = await form.save();
//
// meta: model, fields (names, or '__all__'), exclude, labels, help, widgets ({ name: 'radio' }), and fields of the form
// over the model's in static fields.
import { fields as make, ValidationError } from './fields.js';
import { Form, declaredFields, humanize } from './form.js';
import { message } from './messages.js';

// The name of a model in messages: its label with a capital (Django's verbose_name), else its name.
const modelLabel = (model) => {
  const text = (model.meta && model.meta.label) || model.name;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const label = (field, name) => {
  const text = field.label || humanize(name);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// The field of a form for a field of a model.
function formFieldOf(field, overrides = {}) {
  const { name } = field;
  const base = {
    required: !field.blank,
    label: overrides.label || label(field, name),
    help: overrides.help !== undefined ? overrides.help : field.help || null,
    widget: overrides.widget || null,
  };
  if (field.default !== undefined) base.initial = field.default;
  if (field.primaryKey && field.auto) return null;
  if (field.type === 'manyToMany') {
    return make.modelMultipleChoice({
      ...base,
      required: field.blankGiven ? !field.blank : true,
      queryset: field.target.objects.all(),
    });
  }
  if (field.type === 'foreignKey') return make.modelChoice({ ...base, queryset: field.target.objects.all() });
  if (field.choices) {
    const choices = field.choices.map((value) => [
      value,
      field.choiceLabels ? field.choiceLabels.get(value) : String(value),
    ]);
    // A choice with a default has no empty option (as Django's).
    return make.choice({
      ...base,
      choices,
      emptyLabel: field.default !== undefined && !field.null ? null : '---------',
    });
  }
  switch (field.type) {
    case 'text':
      return make.text({ ...base, maxLength: field.maxLength });
    case 'integer':
    case 'bigint':
      return make.integer({ ...base, min: field.options.min, max: field.options.max });
    case 'float':
      return make.number({ ...base, min: field.options.min, max: field.options.max });
    case 'decimal':
      return make.decimal({ ...base, maxDigits: field.options.precision, decimalPlaces: field.options.scale });
    case 'boolean':
      return make.boolean({ ...base, required: false });
    case 'date':
      return make.date(base);
    case 'datetime':
      return make.datetime(base);
    case 'json':
      return make.json(base);
    case 'blob':
      return make.file(base);
    default:
      if (/email/i.test(name)) return make.email({ ...base, maxLength: field.maxLength });
      return make.string({ ...base, maxLength: field.maxLength, minLength: field.options.minLength });
  }
}

// The fields of the model a ModelForm has (meta.fields, or every one that a person writes; without meta.exclude).
function modelFieldsOf(meta) {
  if (!meta || !meta.model || !meta.model.meta) throw new TypeError('A ModelForm has static meta = { model, fields }');
  const modelMeta = meta.model.meta;
  const all = [
    ...modelMeta.fields.filter(
      (field) =>
        !(field.primaryKey && field.auto) && !field.computed && !field.readOnly && !field.autoNow && !field.autoNowAdd
    ),
    ...modelMeta.manyToMany,
  ];
  let chosen;
  if (meta.fields === '__all__' || meta.fields === undefined) chosen = all;
  else {
    chosen = meta.fields.map((name) => {
      const field =
        all.find((item) => item.name === name) ||
        [...modelMeta.fields, ...modelMeta.manyToMany].find((item) => item.name === name);
      if (!field) throw new TypeError(`${meta.model.name} has no field ${name}`);
      return field;
    });
  }
  const exclude = new Set(meta.exclude || []);
  return chosen.filter((field) => !exclude.has(field.name));
}

class ModelForm extends Form {
  // instance: the object to change (its values are those shown), or a new one.
  constructor(options = {}) {
    const { instance = null, ...rest } = options;
    const meta = new.target.meta;
    if (!meta || !meta.model || !meta.model.meta)
      throw new TypeError('A ModelForm has static meta = { model, fields }');
    super(rest);
    this.meta = meta;
    this.model = meta.model;
    this.instance = instance;
    this.modelFields = modelFieldsOf(meta);
    const declared = declaredFields(new.target);
    const fields = {};
    for (const field of this.modelFields) {
      if (Object.hasOwn(declared, field.name)) continue;
      const formField = formFieldOf(field, {
        label: meta.labels && meta.labels[field.name],
        help: meta.help && meta.help[field.name],
        widget: meta.widgets && meta.widgets[field.name],
      });
      if (formField) fields[field.name] = formField;
    }
    // The fields of the model, then those of the form (over them, or new ones).
    this.fields = { ...fields, ...this.fields };
  }

  // The initial values: those of the instance (its objects of relations: their keys), else those given.
  initialOf(name) {
    if (Object.hasOwn(this.initial, name)) return super.initialOf(name);
    if (this.instance) {
      const field = this.modelFields.find((item) => item.name === name);
      if (field && field.type === 'foreignKey') return this.instance[field.attname];
      if (field && field.type === 'manyToMany') return this.loadedLinks ? this.loadedLinks[name] : [];
      if (field) return this.instance[name];
    }
    return super.initialOf(name);
  }

  // Its objects of choices, and the objects of the many-to-many of its instance.
  async prepare() {
    if (this.prepared) return this;
    await super.prepare();
    if (this.instance && this.instance.pk !== undefined && this.instance.pk !== null) {
      this.loadedLinks = {};
      for (const field of this.modelFields) {
        if (field.type === 'manyToMany')
          this.loadedLinks[field.name] = (await this.instance[field.name].all()).map((object) => object.pk);
      }
    }
    return this;
  }

  // The object with the values cleaned (not saved), as Django's construct_instance.
  constructInstance() {
    const object = this.instance || new this.model();
    for (const field of this.modelFields) {
      if (!Object.hasOwn(this.cleanedData, field.name) || field.type === 'manyToMany') continue;
      const value = this.cleanedData[field.name];
      if (field.type === 'foreignKey') object[field.attname] = value && typeof value === 'object' ? value.pk : value;
      else if (value === null && !field.null && typeof field.blank === 'boolean' && field.type === 'string')
        object[field.name] = '';
      else object[field.name] = value;
    }
    return object;
  }

  // The model checks the object (its validation and rules, then its unique fields and constraints).
  async postClean() {
    const object = this.constructInstance();
    this.object = object;
    const names = new Set(Object.keys(this.fields));
    try {
      object.validate();
    } catch (err) {
      if (!err || typeof err.errors !== 'object') throw err;
      for (const [name, messages] of Object.entries(err.errors)) {
        // As Django's: the fields of the model left out of the form are not checked (the view fills them, with
        // save({ commit: false })); the errors of the whole object are of the form.
        if (names.has(name)) this.addError(name, messages);
        else if (!this.model.meta.fields.some((field) => field.name === name || field.attname === name))
          this.addError(null, messages);
      }
    }
    // As Django's, the fields with errors are left out of it.
    await this.validateUnique(object);
  }

  // Django's validate_unique: the unique fields and constraints of the model, asked to the database.
  async validateUnique(object) {
    const { meta } = this.model;
    const pk = object.pk;
    const others = (where) => {
      let queryset = this.model.objects.filter(where);
      if (pk !== undefined && pk !== null) queryset = queryset.exclude({ pk });
      return queryset.exists();
    };
    for (const field of meta.fields) {
      if (!field.unique || field.primaryKey || !Object.hasOwn(this.fields, field.name) || this.hasError(field.name))
        continue;
      const value = field.type === 'foreignKey' ? object[field.attname] : object[field.name];
      if (value === null || value === undefined || value === '') continue;
      if (await others({ [field.attname]: value })) {
        this.addError(
          field.name,
          (field.messages && field.messages.unique) ||
            message('unique', {
              model: modelLabel(this.model),
              label: this.fields[field.name].label || label(field, field.name),
            })
        );
      }
    }
    for (const index of meta.indexes) {
      if (!index.unique || index.condition) continue;
      if (!index.fields.every((name) => Object.hasOwn(this.fields, name) && !this.hasError(name))) continue;
      const lower = new Set(index.lower || []);
      const where = {};
      let skip = false;
      for (const name of index.fields) {
        const field = meta.field(name);
        const value = field.type === 'foreignKey' ? object[field.attname] : object[name];
        if (value === null || value === undefined) skip = true;
        where[lower.has(name) ? `${field.attname}__iexact` : field.attname] = value;
      }
      if (skip || !(await others(where))) continue;
      const text =
        index.message ||
        message('unique', {
          model: modelLabel(this.model),
          label: index.fields
            .map((name) => (this.fields[name] && this.fields[name].label) || humanize(name))
            .join(' and '),
        });
      // The message under the field (one), or of the form (several).
      this.addError(index.fields.length === 1 ? index.fields[0] : null, text);
    }
  }

  // Saves the object (the instance changed, or a new one) and its many-to-many; commit: false gives it unsaved.
  async save({ commit = true } = {}) {
    if (this.cleanedData === null) await this.fullClean();
    if (Object.keys(this.errors).length) throw new ValidationError('The form is not valid: it is not saved');
    const object = this.object || this.constructInstance();
    if (!commit) return object;
    try {
      await object.save({ validate: false });
    } catch (err) {
      // A unique value saved at the same time by another: its message, under its fields.
      if (err && err.code === 'XUFA_ORM_ERR_UNIQUE') {
        for (const name of err.fields && err.fields.length ? err.fields : [null]) {
          this.addError(name && Object.hasOwn(this.fields, name) ? name : null, err.constraintMessage || err.message);
        }
        throw new ValidationError(err.constraintMessage || err.message);
      }
      throw err;
    }
    await this.saveLinks(object);
    this.instance = object;
    return object;
  }

  // The many-to-many of the object (save({ commit: false }) then saveLinks(object)).
  async saveLinks(object) {
    for (const field of this.modelFields) {
      if (field.type !== 'manyToMany' || !Object.hasOwn(this.cleanedData, field.name)) continue;
      await object[field.name].set(this.cleanedData[field.name] || []);
    }
  }
}

// A ModelForm of a model and its meta (Django's modelform_factory): modelFormOf(Book, { fields: ['title'] }); base: a
// ModelForm to extend (its fields and clean methods).
function modelFormOf(model, meta = {}, base = ModelForm) {
  const Made = class extends base {
    static meta = { ...(base.meta || {}), ...meta, model };
  };
  Object.defineProperty(Made, 'name', { value: `${model.name}Form` });
  return Made;
}

export { ModelForm, formFieldOf, modelFieldsOf, modelFormOf };
