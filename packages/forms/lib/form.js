// Forms (django.forms.Form and ModelForm): their fields, the values of a body (bound) or initial ones, cleaning
// (each field, then clean<Name>() of the form, then clean()), errors by field (and those of the whole form under
// __all__), and their HTML.
//
//   class RenewBookForm extends Form {
//     static fields = { renewalDate: fields.date({ help: 'Enter a date between now and 4 weeks (default 3).' }) };
//     cleanRenewalDate(value) { if (value < today()) throw new ValidationError('Invalid date - renewal in past'); return value; }
//   }
//   const form = new RenewBookForm({ data: request.body });
//   if (await form.isValid()) { ...form.cleanedData.renewalDate... } else reply.view('renew', { form });
//
// In templates: {{{ form.asTable() }}} (or asP, asUl, asDiv), or each field: {{#each form.boundFields as field}}
// {{{ field.labelTag() }}} {{{ field.widget() }}} {{ field.errors }}{{/each}}.
import { Field, ValidationError, escape, attributes, ModelChoiceField, isEmpty } from './fields.js';

const ALL = '__all__';

// The label of a name of a field: dateOfBirth is 'Date of birth'.
function humanize(name) {
  const text = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);

// The fields of a form class: those of its parents, then its own (static fields).
function declaredFields(FormClass) {
  const chain = [];
  for (
    let current = FormClass;
    current && current !== Form && current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    chain.unshift(current);
  }
  const fields = {};
  for (const current of chain) {
    if (Object.hasOwn(current, 'fields') && current.fields && !Array.isArray(current.fields)) {
      for (const [name, field] of Object.entries(current.fields)) {
        if (field !== null && !(field instanceof Field))
          throw new TypeError(`The field ${name} of ${current.name} is not a field of @xufa/forms`);
        if (field === null) delete fields[name];
        else fields[name] = field;
      }
    }
  }
  return fields;
}

// A field of a form, as a template shows it: its name, label, errors, value and input.
class BoundField {
  constructor(form, name, field) {
    this.form = form;
    this.name = name;
    this.field = field;
  }

  get htmlName() {
    return this.form.prefix ? `${this.form.prefix}-${this.name}` : this.name;
  }

  get id() {
    return this.form.autoId ? this.form.autoId.replace('%s', this.htmlName) : null;
  }

  get label() {
    return this.field.label || humanize(this.name);
  }

  get help() {
    return this.field.help;
  }

  get errors() {
    return this.form.errors[this.name] || [];
  }

  get isHidden() {
    return this.field.inputType === 'hidden';
  }

  // The value its input shows: what was sent (bound), else the initial one.
  get value() {
    if (this.form.isBound && !this.field.disabled) {
      if (Object.hasOwn(this.form.cleanedValues, this.name)) return this.form.cleanedValues[this.name];
      return this.form.rawValue(this.name);
    }
    return this.form.initialOf(this.name);
  }

  labelTag(suffix = ':') {
    const label = `${escape(this.label)}${suffix}`;
    return this.id ? `<label for="${escape(this.id)}">${label}</label>` : `<label>${label}</label>`;
  }

  widget(attrs = {}) {
    const extra = { ...attrs };
    if (this.id) extra.id = this.id;
    if (this.errors.length) extra['aria-invalid'] = 'true';
    if (this.help && this.id) extra['aria-describedby'] = `${this.id}_helptext`;
    return this.field.render(this.htmlName, this.value, extra);
  }

  errorsHtml() {
    return this.errors.length
      ? `<ul class="errorlist">${this.errors.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>`
      : '';
  }

  // Its help text: HTML, as Django's help_text in its forms.
  helpHtml() {
    return this.help
      ? `<span class="helptext"${this.id ? ` id="${escape(`${this.id}_helptext`)}"` : ''}>${this.help}</span>`
      : '';
  }

  toString() {
    return this.widget();
  }
}

class Form {
  // data: the values sent (request.body: texts, lists, files of xufa.formBody), null for a form not sent; initial:
  // values to show at first; prefix: of the names of its inputs (several forms in a page); autoId: 'id_%s'.
  constructor({ data = null, initial = {}, prefix = null, autoId = 'id_%s' } = {}) {
    this.data = data;
    this.initial = initial || {};
    this.prefix = prefix;
    this.autoId = autoId;
    this.fields = {};
    for (const [name, field] of Object.entries(declaredFields(this.constructor))) {
      // Each form has its fields (a copy): a modelChoice loads its objects for it.
      this.fields[name] = Object.assign(Object.create(Object.getPrototypeOf(field)), field);
    }
    this.errors = {};
    this.cleanedData = null;
    this.cleanedValues = {};
    this.prepared = false;
  }

  get isBound() {
    return this.data !== null && this.data !== undefined;
  }

  // The value sent of a field (with the prefix).
  rawValue(name) {
    if (!this.isBound) return undefined;
    const key = this.prefix ? `${this.prefix}-${name}` : name;
    return this.data[key];
  }

  initialOf(name) {
    if (Object.hasOwn(this.initial, name)) {
      const value = this.initial[name];
      return typeof value === 'function' ? value() : value;
    }
    const value = this.fields[name] ? this.fields[name].initial : undefined;
    return typeof value === 'function' ? value() : value;
  }

  // Loads what its fields need from the database (the objects of modelChoice fields): before it renders or cleans.
  async prepare() {
    if (this.prepared) return this;
    for (const field of Object.values(this.fields)) {
      if (field instanceof ModelChoiceField) await field.load();
    }
    this.prepared = true;
    return this;
  }

  addError(name, error) {
    const key = name === null || name === undefined ? ALL : name;
    const messages = error instanceof ValidationError ? error.messages : [].concat(error).map(String);
    this.errors[key] = [...(this.errors[key] || []), ...messages];
    if (key !== ALL && this.cleanedData) delete this.cleanedData[key];
  }

  hasError(name) {
    return Boolean(this.errors[name === null ? ALL : name] && this.errors[name === null ? ALL : name].length);
  }

  nonFieldErrors() {
    return this.errors[ALL] || [];
  }

  // Cleans the values sent: each field, its clean<Name>() (sync or async, giving the value), then clean().
  async fullClean() {
    this.errors = {};
    this.cleanedData = {};
    this.cleanedValues = {};
    if (!this.isBound) return;
    await this.prepare();
    for (const [name, field] of Object.entries(this.fields)) {
      const raw = field.disabled ? this.initialOf(name) : this.rawValue(name);
      try {
        let value = field.disabled ? raw : field.cleanWithMessages(raw);
        const own = this[`clean${pascal(name)}`];
        if (typeof own === 'function') value = await own.call(this, value);
        this.cleanedData[name] = value;
        this.cleanedValues[name] = value;
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        this.addError(name, err);
      }
    }
    try {
      const cleaned = await this.clean(this.cleanedData);
      if (cleaned && typeof cleaned === 'object') this.cleanedData = cleaned;
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      this.addError(err.field || null, err);
    }
    await this.postClean();
  }

  // Checks of the whole form (several fields): throw a ValidationError, or addError(name, message).
  // eslint-disable-next-line class-methods-use-this
  clean(cleanedData) {
    return cleanedData;
  }

  // After clean() (a ModelForm checks its model here).
  // eslint-disable-next-line class-methods-use-this
  async postClean() {}

  // Whether the values sent are valid (cleaned once).
  async isValid() {
    if (!this.isBound) return false;
    if (this.cleanedData === null) await this.fullClean();
    return Object.keys(this.errors).length === 0;
  }

  // Its fields, in order, as templates show them.
  get boundFields() {
    return Object.entries(this.fields).map(([name, field]) => new BoundField(this, name, field));
  }

  field(name) {
    if (!this.fields[name]) throw new TypeError(`${this.constructor.name} has no field ${name}`);
    return new BoundField(this, name, this.fields[name]);
  }

  get hiddenFields() {
    return this.boundFields.filter((field) => field.isHidden);
  }

  get visibleFields() {
    return this.boundFields.filter((field) => !field.isHidden);
  }

  nonFieldErrorsHtml() {
    const errors = this.nonFieldErrors();
    return errors.length
      ? `<ul class="errorlist nonfield">${errors.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>`
      : '';
  }

  // The form as HTML: rows of a table (asTable), paragraphs (asP), items (asUl) or divs (asDiv, Django's default).
  asTable() {
    const hidden = this.hiddenFields.map((field) => field.widget()).join('');
    const rows = this.visibleFields.map(
      (field) =>
        `<tr><th>${field.labelTag()}</th><td>${field.errorsHtml()}${field.widget()}${field.help ? `<br>${field.helpHtml()}` : ''}</td></tr>`
    );
    const top = this.nonFieldErrors().length ? [`<tr><td colspan="2">${this.nonFieldErrorsHtml()}</td></tr>`] : [];
    return [...top, ...rows].join('\n') + hidden;
  }

  asP() {
    const hidden = this.hiddenFields.map((field) => field.widget()).join('');
    const rows = this.visibleFields.map(
      (field) =>
        `${field.errorsHtml()}<p>${field.labelTag()} ${field.widget()}${field.help ? ` ${field.helpHtml()}` : ''}</p>`
    );
    return this.nonFieldErrorsHtml() + rows.join('\n') + hidden;
  }

  asUl() {
    const hidden = this.hiddenFields.map((field) => field.widget()).join('');
    const rows = this.visibleFields.map(
      (field) =>
        `<li>${field.errorsHtml()}${field.labelTag()} ${field.widget()}${field.help ? ` ${field.helpHtml()}` : ''}</li>`
    );
    const top = this.nonFieldErrors().length ? [`<li>${this.nonFieldErrorsHtml()}</li>`] : [];
    return [...top, ...rows].join('\n') + hidden;
  }

  asDiv() {
    const hidden = this.hiddenFields.map((field) => field.widget()).join('');
    const rows = this.visibleFields.map(
      (field) =>
        `<div>${field.labelTag()}${field.helpHtml() ? `<div class="helptext">${field.help}</div>` : ''}${field.errorsHtml()}${field.widget()}</div>`
    );
    return this.nonFieldErrorsHtml() + rows.join('\n') + hidden;
  }

  toString() {
    return this.asDiv();
  }
}

export { Form, BoundField, declaredFields, humanize, ALL, attributes, isEmpty };
