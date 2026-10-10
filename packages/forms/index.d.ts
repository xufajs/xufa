// Types of @xufa/forms: forms as django.forms, fields, ModelForm.

/** What is wrong with a value: its messages, and a code. */
export declare class ValidationError extends Error {
  constructor(messages: string | string[], code?: string);
  messages: string[];
  code: string;
  /** clean() of a form: the field the error is of (else the form's). */
  field?: string;
}

/** A file of a multipart form (xufa.formBody). */
export interface FormFileValue {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
}

/** Choices: values, [value, label] pairs, an object of labels by value, or a Map. */
export type Choices =
  readonly unknown[] | readonly (readonly [unknown, string])[] | Record<string, string> | Map<unknown, string>;

export interface FieldOptions<T = unknown> {
  /** A value is needed (true). */
  required?: boolean;
  /** Its label (made of its name: dateOfBirth is 'Date of birth'). */
  label?: string | null;
  /** A text that helps to fill it (HTML, as Django's help_text). */
  help?: string | null;
  /** The value shown at first (or a function giving it). */
  initial?: T | (() => T);
  /** Shown, not changed: its value is the initial one. */
  disabled?: boolean;
  /** Functions of the value: a message (or false) when it is not valid, or a ValidationError thrown. */
  validators?: Array<(value: T) => string | boolean | void | undefined>;
  /** More attributes of its input. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** Another input: 'radio' for a choice, 'checkbox' for choices. */
  widget?: 'radio' | 'checkbox' | null;
  /** Its own messages by the code of the error (Django's error_messages): { required, invalid, min, max... }. */
  messages?: Record<string, string>;
}

/** A day: YYYY-MM-DD, 'today', one relative to today ('+4w', '-1d', '+3m', '+1y'), a Date, or a function of one. */
export type DaySpec = string | Date | (() => string | Date);

/** A field of a form: it cleans what a body gives, and writes its input. */
export declare class Field<T = unknown> {
  constructor(options?: FieldOptions<T>);
  required: boolean;
  label: string | null;
  help: string | null;
  initial: T | (() => T) | undefined;
  disabled: boolean;
  /** The value of what a body gave, checked (a ValidationError otherwise). */
  clean(raw: unknown): T | null;
  /** Its input, in HTML. */
  render(name: string, value: unknown, attrs?: Record<string, unknown>): string;
}

export declare class StringField extends Field<string> {}
export declare class TextField extends StringField {}
export declare class EmailField extends StringField {}
export declare class UrlField extends StringField {}
export declare class NumberField extends Field<number | string> {}
export declare class BooleanField extends Field<boolean> {}
export declare class DateField extends Field<string | Date> {}
export declare class ChoiceField<T = unknown> extends Field<T> {
  choices: Array<[T, string]>;
}
export declare class MultipleChoiceField<T = unknown> extends Field<T[]> {
  choices: Array<[T, string]>;
}
export declare class ModelChoiceField<M = any> extends Field<M> {
  /** Its objects, loaded by load() (form.prepare()). */
  objects: M[] | null;
  load(): Promise<void>;
}
export declare class ModelMultipleChoiceField<M = any> extends Field<M[]> {
  objects: M[] | null;
  load(): Promise<void>;
}
export declare class FileField extends Field<FormFileValue> {}
export declare class JsonField extends Field<unknown> {}

export interface StringOptions extends FieldOptions<string> {
  maxLength?: number;
  minLength?: number;
  /** White space taken out of its ends (true). */
  strip?: boolean;
  /** The type of its input: text, email, url, password, hidden, search, tel. */
  type?: string;
}

export interface NumberOptions extends FieldOptions<number> {
  min?: number;
  max?: number;
  step?: number | string;
}

/** The kinds of fields. */
export declare const fields: {
  string(options?: StringOptions): StringField;
  text(options?: StringOptions): TextField;
  email(options?: StringOptions): EmailField;
  url(options?: StringOptions): UrlField;
  password(options?: StringOptions & { renderValue?: boolean }): StringField;
  hidden(options?: StringOptions): StringField;
  integer(options?: NumberOptions): NumberField;
  number(options?: NumberOptions): NumberField;
  decimal(options?: NumberOptions & { maxDigits?: number; decimalPlaces?: number }): NumberField;
  boolean(options?: FieldOptions<boolean>): BooleanField;
  date(options?: FieldOptions<string> & { min?: DaySpec; max?: DaySpec }): DateField;
  datetime(options?: FieldOptions<Date> & { min?: string | Date; max?: string | Date }): DateField;
  choice<T = unknown>(options: FieldOptions<T> & { choices: Choices; emptyLabel?: string | null }): ChoiceField<T>;
  multipleChoice<T = unknown>(options: FieldOptions<T[]> & { choices: Choices }): MultipleChoiceField<T>;
  modelChoice<M = any>(
    options: FieldOptions<M> & {
      queryset: PromiseLike<M[]> & { filter(...args: any[]): any };
      labelOf?: (object: M) => string;
      emptyLabel?: string | null;
    }
  ): ModelChoiceField<M>;
  modelMultipleChoice<M = any>(
    options: FieldOptions<M[]> & {
      queryset: PromiseLike<M[]> & { filter(...args: any[]): any };
      labelOf?: (object: M) => string;
    }
  ): ModelMultipleChoiceField<M>;
  file(options?: FieldOptions<FormFileValue> & { maxSize?: number; accept?: string | string[] }): FileField;
  json(options?: FieldOptions<unknown>): JsonField;
};

/** A field of a form as a template shows it. */
export declare class BoundField {
  readonly name: string;
  readonly field: Field;
  readonly htmlName: string;
  readonly id: string | null;
  readonly label: string;
  readonly help: string | null;
  readonly errors: string[];
  readonly value: unknown;
  readonly isHidden: boolean;
  labelTag(suffix?: string): string;
  widget(attrs?: Record<string, unknown>): string;
  errorsHtml(): string;
  helpHtml(): string;
}

export interface FormOptions {
  /** The values sent (request.body), null for a form not sent. */
  data?: Record<string, unknown> | null;
  /** The values shown at first. */
  initial?: Record<string, unknown>;
  /** Of the names of its inputs (several forms in a page): prefix-name. */
  prefix?: string | null;
  /** The id of each input ('id_%s'), or false for none. */
  autoId?: string | false;
}

/**
 * A form: static fields, cleaned by isValid() (each field, its clean<Name>(), then clean()), errors by field (and
 * __all__), cleanedData, and its HTML (asTable, asP, asUl, asDiv).
 */
export declare class Form<Data extends Record<string, unknown> = Record<string, any>> {
  static fields: Record<string, Field | null>;
  constructor(options?: FormOptions);
  fields: Record<string, Field>;
  readonly isBound: boolean;
  data: Record<string, unknown> | null;
  initial: Record<string, unknown>;
  prefix: string | null;
  /** The messages of each field, and those of the form under __all__. */
  errors: Record<string, string[]>;
  /** The values cleaned (after isValid()). */
  cleanedData: Data | null;
  isValid(): Promise<boolean>;
  fullClean(): Promise<void>;
  /** Checks of the whole form: give the values, or throw a ValidationError. */
  clean(cleanedData: Data): Data | void | Promise<Data | void>;
  addError(name: string | null, error: string | string[] | ValidationError): void;
  hasError(name: string | null): boolean;
  nonFieldErrors(): string[];
  /** Loads the objects of the choices of models (before it renders a form not sent). */
  prepare(): Promise<this>;
  field(name: string): BoundField;
  readonly boundFields: BoundField[];
  readonly hiddenFields: BoundField[];
  readonly visibleFields: BoundField[];
  asTable(): string;
  asP(): string;
  asUl(): string;
  asDiv(): string;
}

/** The Meta of a ModelForm. */
export interface ModelFormMeta {
  /** A model of @xufa/orm. */
  model: any;
  /** The names of its fields in the form, or '__all__'. */
  fields?: string[] | '__all__';
  exclude?: string[];
  labels?: Record<string, string>;
  help?: Record<string, string>;
  widgets?: Record<string, 'radio' | 'checkbox'>;
}

/**
 * A form of a model of @xufa/orm: fields of its fields, checked by the model (validation, rules, unique values and
 * constraints) and saved (save(): the object, and its many-to-many).
 */
export declare class ModelForm<M = any, Data extends Record<string, unknown> = Record<string, any>> extends Form<Data> {
  static meta: ModelFormMeta;
  constructor(options?: FormOptions & { instance?: M | null });
  instance: M | null;
  /** Saves the object (commit: false gives it unsaved; then saveLinks(object) for its many-to-many). */
  save(options?: { commit?: boolean }): Promise<M>;
  saveLinks(object: M): Promise<void>;
  validateUnique(object: M): Promise<void>;
}

/** A ModelForm of a model and its meta (Django's modelform_factory); base: a ModelForm to extend. */
export declare function modelFormOf<M = any>(
  model: any,
  meta?: Omit<ModelFormMeta, 'model'>,
  base?: typeof ModelForm
): typeof ModelForm<M>;

/** The field of a form for a field of a model. */
export declare function formFieldOf(
  field: any,
  overrides?: { label?: string; help?: string; widget?: string }
): Field | null;
/** dateOfBirth is 'Date of birth'. */
export declare function humanize(name: string): string;
/** Today as YYYY-MM-DD, in the time of the machine. */
export declare function today(): string;
/** The day some days after one (today by default). */
export declare function addDays(days: number, from?: string): string;
/** The day some months after one (the last of the month when it has not that day). */
export declare function addMonths(months: number, from?: string): string;
/** The day a DaySpec says. */
export declare function dateOf(spec: DaySpec): string;

/** The messages users read, by key, in English. */
export declare const FORMS_MESSAGES: Readonly<Record<string, string>>;
export declare function formsMessage(key: string, params?: Record<string, unknown>): string;
/** The translator of the messages (as i18n.translateForms(forms) sets), or null. */
export declare function setTranslator(
  fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null
): void;
