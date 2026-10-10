// The fields of forms (django.forms.fields and their widgets): each takes what a body gives (texts, lists of texts,
// files of xufa.formBody), makes it a value (clean), says what is wrong with it (a ValidationError), and writes its
// input in HTML.
//
//   fields.string({ maxLength: 100, label: 'Name', help: 'As on the cover' })
//   fields.date({ required: false }), fields.choice({ choices: [['a', 'Available'], ['o', 'On loan']] })
//   fields.modelChoice({ queryset: Author.objects.all() })   // its objects are loaded by form.prepare()
import { message } from './messages.js';
import { dateOf } from './dates.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

// What is wrong with a value: a message (or several), with a code.
class ValidationError extends Error {
  constructor(messages, code = 'invalid') {
    const list = [].concat(messages).map(String);
    super(list.join(' '));
    this.name = 'ValidationError';
    this.messages = list;
    this.code = code;
  }
}

// The attributes of an element as HTML: { type: 'text', required: true } is ' type="text" required'.
function attributes(attrs) {
  let html = '';
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    html += value === true ? ` ${name}` : ` ${name}="${escape(value)}"`;
  }
  return html;
}

// Choices as [[value, label]]: from a list of values, a list of [value, label], an object of labels, or a Map.
function choicesOf(given) {
  if (!given) return [];
  if (given instanceof Map) return [...given].map(([value, label]) => [value, String(label)]);
  if (Array.isArray(given)) {
    return given.map((item) => (Array.isArray(item) ? [item[0], String(item[1])] : [item, String(item)]));
  }
  if (typeof given === 'object') return Object.entries(given).map(([value, label]) => [value, String(label)]);
  throw new TypeError('choices are a list of values, a list of [value, label], or an object of labels by value');
}

const isEmpty = (value) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

class Field {
  constructor(options = {}) {
    const {
      required = true,
      label = null,
      help = null,
      initial = undefined,
      disabled = false,
      validators = [],
      attrs = {},
      widget = null,
      messages = {},
    } = options;
    this.options = options;
    // Its own messages by the code of the error (Django's error_messages): { required, invalid, min, max... }.
    this.messages = messages || {};
    this.required = required;
    this.label = label;
    this.help = help;
    this.initial = initial;
    this.disabled = disabled;
    this.validators = [].concat(validators);
    this.attrs = attrs;
    this.widget = widget;
  }

  // The value of what a body gave (a text), or a ValidationError; empty values are null.
  toValue(raw) {
    if (Array.isArray(raw)) raw = raw[raw.length - 1];
    if (isEmpty(raw)) return null;
    return typeof raw === 'string' ? raw : String(raw);
  }

  // Its checks of a value made: required, and the validators (functions that throw or give a message).
  validate(value) {
    if (this.required && isEmpty(value)) throw new ValidationError(message('required'), 'required');
  }

  runValidators(value) {
    if (isEmpty(value)) return;
    const messages = [];
    for (const validator of this.validators) {
      try {
        const result = validator(value);
        if (typeof result === 'string') messages.push(result);
        else if (result === false) messages.push(message('invalid'));
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        messages.push(...err.messages);
      }
    }
    if (messages.length) throw new ValidationError(messages);
  }

  // clean(), with the messages of the field in place of those of the codes it has.
  cleanWithMessages(raw) {
    try {
      return this.clean(raw);
    } catch (err) {
      if (err instanceof ValidationError && Object.hasOwn(this.messages, err.code)) {
        throw new ValidationError(this.messages[err.code], err.code);
      }
      throw err;
    }
  }

  // The value of what a body gave, checked (a ValidationError otherwise).
  clean(raw) {
    const value = this.toValue(raw);
    this.validate(value);
    this.runValidators(value);
    return value;
  }

  // The text of a value in its input.
  formatValue(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  // The attributes of its input: those of the field, and required, disabled.
  inputAttrs(extra = {}) {
    return { ...extra, ...this.attrs, required: this.required && !this.disabled, disabled: this.disabled };
  }

  // Its input, in HTML.
  render(name, value, attrs = {}) {
    const type = this.inputType || 'text';
    const shown = type === 'password' && !this.options.renderValue ? '' : this.formatValue(value);
    return `<input${attributes({ type, name, value: shown, ...this.inputAttrs(attrs) })}>`;
  }
}

// A text (CharField): maxLength, minLength, strip (true); type: the type of its input (text, email, url, password,
// hidden, search, tel).
class StringField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.minLength = options.minLength;
    this.strip = options.strip !== false;
    this.inputType = options.type || 'text';
  }

  toValue(raw) {
    let value = super.toValue(raw);
    if (value !== null && this.strip) value = value.trim();
    return value === '' ? null : value;
  }

  validate(value) {
    super.validate(value);
    if (value === null) return;
    if (this.maxLength !== undefined && value.length > this.maxLength) {
      throw new ValidationError(message('maxLength', { max: this.maxLength, length: value.length }), 'maxLength');
    }
    if (this.minLength !== undefined && value.length < this.minLength) {
      throw new ValidationError(message('minLength', { min: this.minLength, length: value.length }), 'minLength');
    }
  }

  inputAttrs(extra) {
    return super.inputAttrs({ maxlength: this.maxLength, minlength: this.minLength, ...extra });
  }
}

class TextField extends StringField {
  render(name, value, attrs = {}) {
    const all = { name, cols: 40, rows: 10, ...this.inputAttrs(attrs) };
    return `<textarea${attributes(all)}>\n${escape(this.formatValue(value))}</textarea>`;
  }
}

class EmailField extends StringField {
  constructor(options = {}) {
    super({ maxLength: 254, ...options, type: 'email' });
  }

  validate(value) {
    super.validate(value);
    if (value !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new ValidationError(message('email'), 'email');
  }
}

class UrlField extends StringField {
  constructor(options = {}) {
    super({ maxLength: 2048, ...options, type: 'url' });
  }

  validate(value) {
    super.validate(value);
    if (value === null) return;
    let ok = false;
    try {
      ok = ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      ok = false;
    }
    if (!ok) throw new ValidationError(message('url'), 'url');
  }
}

// A number: integer (whole), number (float), decimal (a text of its digits: maxDigits, decimalPlaces); min, max, step.
class NumberField extends Field {
  constructor(options = {}, kind = 'number') {
    super(options);
    this.kind = kind;
    this.min = options.min;
    this.max = options.max;
    this.step = options.step;
    this.inputType = 'number';
  }

  toValue(raw) {
    const text = super.toValue(raw);
    if (text === null) return null;
    const trimmed = text.trim();
    if (this.kind === 'integer') {
      if (!/^[+-]?\d+$/.test(trimmed)) throw new ValidationError(message('integer'), 'invalid');
      return Number(trimmed);
    }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) throw new ValidationError(message('number'), 'invalid');
    return this.kind === 'decimal' ? trimmed : Number(trimmed);
  }

  validate(value) {
    super.validate(value);
    if (value === null) return;
    const number = Number(value);
    if (this.max !== undefined && number > this.max)
      throw new ValidationError(message('max', { max: this.max }), 'max');
    if (this.min !== undefined && number < this.min)
      throw new ValidationError(message('min', { min: this.min }), 'min');
    if (this.kind === 'decimal') {
      const digits = String(value)
        .replace(/^[+-]/, '')
        .replace(/^0+(?=\d)/, '');
      const [whole, fraction = ''] = digits.split('.');
      if (this.options.decimalPlaces !== undefined && fraction.length > this.options.decimalPlaces) {
        throw new ValidationError(message('decimalPlaces', { places: this.options.decimalPlaces }), 'decimalPlaces');
      }
      if (
        this.options.maxDigits !== undefined &&
        whole.replace(/^0$/, '').length + fraction.length > this.options.maxDigits
      ) {
        throw new ValidationError(message('maxDigits', { max: this.options.maxDigits }), 'maxDigits');
      }
    }
  }

  inputAttrs(extra) {
    const step = this.step !== undefined ? this.step : this.kind === 'integer' ? undefined : 'any';
    return super.inputAttrs({ min: this.min, max: this.max, step, ...extra });
  }
}

// A checkbox: true when it is checked (required: it must be, as Django's; ModelForm makes it false).
class BooleanField extends Field {
  toValue(raw) {
    if (Array.isArray(raw)) raw = raw[raw.length - 1];
    return !(
      raw === undefined ||
      raw === null ||
      raw === '' ||
      raw === false ||
      raw === 'false' ||
      raw === '0' ||
      raw === 'off'
    );
  }

  validate(value) {
    if (this.required && !value) throw new ValidationError(message('required'), 'required');
  }

  render(name, value, attrs = {}) {
    return `<input${attributes({ type: 'checkbox', name, checked: Boolean(value), ...this.inputAttrs(attrs) })}>`;
  }
}

// A date (YYYY-MM-DD, as its input gives it), or a date and time (datetime-local: a Date).
class DateField extends Field {
  constructor(options = {}, kind = 'date') {
    super(options);
    this.kind = kind;
    this.inputType = kind === 'date' ? 'date' : 'datetime-local';
  }

  toValue(raw) {
    if (raw instanceof Date) return this.kind === 'date' ? raw.toISOString().slice(0, 10) : raw;
    const text = super.toValue(raw);
    if (text === null) return null;
    const trimmed = text.trim();
    if (this.kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
        throw new ValidationError(message('date'), 'invalid');
      }
      // A day that is not there (2026-02-30) is not one.
      if (new Date(`${trimmed}T00:00:00Z`).toISOString().slice(0, 10) !== trimmed) {
        throw new ValidationError(message('date'), 'invalid');
      }
      return trimmed;
    }
    const date = new Date(trimmed);
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed) || Number.isNaN(date.getTime())) {
      throw new ValidationError(message('datetime'), 'invalid');
    }
    return date;
  }

  formatValue(value) {
    if (value === undefined || value === null || value === '') return '';
    if (this.kind === 'date')
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 16);
  }

  // A limit of the field (min, max) when it is asked: of dates, a day, 'today', '+4w' or a function (dateOf()).
  limit(name) {
    const given = this.options[name];
    if (given === undefined || given === null) return undefined;
    return this.kind === 'date' ? dateOf(given) : given;
  }

  // min and max: dates (YYYY-MM-DD, 'today', '+4w'...) or dates and times, compared as such.
  validate(value) {
    super.validate(value);
    if (value === null) return;
    const keyOf = (date) => (this.kind === 'date' ? String(date).slice(0, 10) : new Date(date).toISOString());
    const key = keyOf(value);
    const min = this.limit('min');
    const max = this.limit('max');
    if (min !== undefined && key < keyOf(min)) throw new ValidationError(message('min', { min }), 'min');
    if (max !== undefined && key > keyOf(max)) throw new ValidationError(message('max', { max }), 'max');
  }

  inputAttrs(extra) {
    return super.inputAttrs({ min: this.limit('min'), max: this.limit('max'), ...extra });
  }
}

// One of some choices (a select; radios with widget: 'radio'): the value as the choices have it.
class ChoiceField extends Field {
  constructor(options = {}) {
    super(options);
    this.choices = choicesOf(options.choices);
    this.emptyLabel = options.emptyLabel === undefined ? '---------' : options.emptyLabel;
  }

  // The choice of a text (texts and the values compared as texts).
  find(text) {
    return this.choices.find(([value]) => String(value) === String(text));
  }

  toValue(raw) {
    const text = super.toValue(raw);
    if (text === null) return null;
    const found = this.find(text);
    if (!found) throw new ValidationError(message('choice', { value: text }), 'invalidChoice');
    return found[0];
  }

  optionsHtml(selected) {
    const chosen = new Set([].concat(selected === undefined || selected === null ? [] : selected).map(String));
    return this.choices
      .map(
        ([value, label]) =>
          `<option${attributes({ value: String(value), selected: chosen.has(String(value)) })}>${escape(label)}</option>`
      )
      .join('');
  }

  render(name, value, attrs = {}) {
    if (this.widget === 'radio') {
      const id = attrs.id || name;
      return `<div${attributes({ id })}>${this.choices
        .map(
          ([choice, label], index) =>
            `<label for="${escape(`${id}_${index}`)}"><input${attributes({
              type: 'radio',
              name,
              value: String(choice),
              id: `${id}_${index}`,
              checked: value !== null && value !== undefined && String(value) === String(choice),
              required: this.required && !this.disabled,
              disabled: this.disabled,
            })}> ${escape(label)}</label>`
        )
        .join('')}</div>`;
    }
    // The empty option (emptyLabel: null for none, as a choice of a model with a default).
    const empty = this.emptyLabel === null ? '' : `<option value="">${escape(this.emptyLabel)}</option>`;
    return `<select${attributes({ name, ...this.inputAttrs(attrs) })}>${empty}${this.optionsHtml(value)}</select>`;
  }
}

// Some of some choices (a select multiple; checkboxes with widget: 'checkbox'): a list of values.
class MultipleChoiceField extends ChoiceField {
  toValue(raw) {
    if (isEmpty(raw)) return [];
    const texts = []
      .concat(raw)
      .map(String)
      .filter((text) => text !== '');
    return texts.map((text) => {
      const found = this.find(text);
      if (!found) throw new ValidationError(message('choice', { value: text }), 'invalidChoice');
      return found[0];
    });
  }

  render(name, value, attrs = {}) {
    if (this.widget === 'checkbox') {
      const id = attrs.id || name;
      const chosen = new Set([].concat(value || []).map(String));
      return `<div${attributes({ id })}>${this.choices
        .map(
          ([choice, label], index) =>
            `<label for="${escape(`${id}_${index}`)}"><input${attributes({
              type: 'checkbox',
              name,
              value: String(choice),
              id: `${id}_${index}`,
              checked: chosen.has(String(choice)),
              disabled: this.disabled,
            })}> ${escape(label)}</label>`
        )
        .join('')}</div>`;
    }
    return `<select${attributes({ name, multiple: true, ...this.inputAttrs(attrs) })}>${this.optionsHtml(value)}</select>`;
  }
}

// An object of a QuerySet (a foreign key): its options are the objects of the queryset (loaded by load(), which
// form.prepare() and form.isValid() call), as [key, its text]; the value is the object.
class ModelChoiceField extends ChoiceField {
  constructor(options = {}) {
    super({ ...options, choices: [] });
    if (!options.queryset || typeof options.queryset.filter !== 'function') {
      throw new TypeError('modelChoice({ queryset }): a QuerySet of @xufa/orm');
    }
    this.queryset = options.queryset;
    this.labelOf = options.labelOf || ((object) => String(object));
    this.objects = null;
  }

  async load() {
    if (this.objects) return;
    this.objects = await this.queryset;
    this.choices = this.objects.map((object) => [object.pk, this.labelOf(object)]);
  }

  // The object of a key (an object given is its own).
  objectOf(text) {
    if (!this.objects) throw new Error('The objects of a modelChoice are loaded first (await form.prepare())');
    return this.objects.find((object) => String(object.pk) === String(text));
  }

  toValue(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.pk !== undefined) raw = raw.pk;
    const text = Field.prototype.toValue.call(this, raw);
    if (text === null) return null;
    const object = this.objectOf(text);
    if (!object) throw new ValidationError(message('choice', { value: text }), 'invalidChoice');
    return object;
  }

  formatValue(value) {
    return value && typeof value === 'object' ? String(value.pk) : super.formatValue(value);
  }

  render(name, value, attrs = {}) {
    return super.render(name, value && typeof value === 'object' ? value.pk : value, attrs);
  }
}

// Objects of a QuerySet (many-to-many): a list of objects.
class ModelMultipleChoiceField extends ModelChoiceField {
  toValue(raw) {
    if (isEmpty(raw)) return [];
    return [].concat(raw).map((item) => {
      const text = item && typeof item === 'object' && item.pk !== undefined ? item.pk : item;
      const object = this.objectOf(text);
      if (!object) throw new ValidationError(message('choice', { value: text }), 'invalidChoice');
      return object;
    });
  }

  validate(value) {
    if (this.required && (!value || value.length === 0)) throw new ValidationError(message('required'), 'required');
  }

  render(name, value, attrs = {}) {
    const keys = [].concat(value || []).map((item) => (item && typeof item === 'object' ? item.pk : item));
    return MultipleChoiceField.prototype.render.call(this, name, keys, attrs);
  }
}

// A file of a multipart form (xufa.formBody): { filename, contentType, size, data }; maxSize, accept (types).
class FileField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxSize = options.maxSize;
    this.accept = options.accept ? [].concat(options.accept) : null;
  }

  toValue(raw) {
    if (Array.isArray(raw)) raw = raw[raw.length - 1];
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'object' || !Buffer.isBuffer(raw.data)) throw new ValidationError(message('file'), 'invalid');
    return raw;
  }

  validate(value) {
    super.validate(value);
    if (value === null) return;
    if (this.maxSize !== undefined && value.size > this.maxSize) {
      throw new ValidationError(message('fileSize', { max: this.maxSize, size: value.size }), 'maxSize');
    }
    if (
      this.accept &&
      !this.accept.some((type) =>
        type.endsWith('/*') ? value.contentType.startsWith(type.slice(0, -1)) : value.contentType === type
      )
    ) {
      throw new ValidationError(message('fileType', { type: value.contentType }), 'fileType');
    }
  }

  render(name, value, attrs = {}) {
    return `<input${attributes({ type: 'file', name, accept: this.accept ? this.accept.join(',') : undefined, ...this.inputAttrs(attrs) })}>`;
  }
}

// JSON in a textarea: the value parsed.
class JsonField extends TextField {
  toValue(raw) {
    const text = Field.prototype.toValue.call(this, raw);
    if (text === null || text.trim() === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ValidationError(message('json'), 'invalid');
    }
  }

  validate(value) {
    if (this.required && (value === null || value === undefined))
      throw new ValidationError(message('required'), 'required');
  }

  formatValue(value) {
    return value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
  }
}

const fields = {
  string: (options) => new StringField(options),
  text: (options) => new TextField(options),
  email: (options) => new EmailField(options),
  url: (options) => new UrlField(options),
  password: (options) => new StringField({ ...options, type: 'password', strip: false }),
  hidden: (options) => new StringField({ ...options, type: 'hidden' }),
  integer: (options) => new NumberField(options, 'integer'),
  number: (options) => new NumberField(options, 'number'),
  decimal: (options) => new NumberField(options, 'decimal'),
  boolean: (options) => new BooleanField(options),
  date: (options) => new DateField(options, 'date'),
  datetime: (options) => new DateField(options, 'datetime'),
  choice: (options) => new ChoiceField(options),
  multipleChoice: (options) => new MultipleChoiceField(options),
  modelChoice: (options) => new ModelChoiceField(options),
  modelMultipleChoice: (options) => new ModelMultipleChoiceField(options),
  file: (options) => new FileField(options),
  json: (options) => new JsonField(options),
};

export {
  fields,
  Field,
  StringField,
  TextField,
  EmailField,
  UrlField,
  NumberField,
  BooleanField,
  DateField,
  ChoiceField,
  MultipleChoiceField,
  ModelChoiceField,
  ModelMultipleChoiceField,
  FileField,
  JsonField,
  ValidationError,
  escape,
  attributes,
  choicesOf,
  isEmpty,
};
