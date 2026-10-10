// The messages of the validation of the ORM, by key, in English; a translator (setTranslator(), as @xufa/i18n
// installs) gives them in the language of the request. The messages of rules of your own go through it too: a rule
// whose message is a key of your catalogs (message: 'books.pages.positive') is translated, and any other text stays.
const MESSAGES = {
  required: 'This field is required.',
  choice: 'The value {value} is not a valid choice.',
  invalid: 'The value is not valid.',
  invalidObject: 'The object is not valid.',
  maxLength: 'Ensure this value has at most {max} characters (it has {length}).',
  minLength: 'Ensure this value has at least {min} characters (it has {length}).',
  min: 'Ensure this value is at least {min}.',
  max: 'Ensure this value is at most {max}.',
  decimalPlaces: 'Ensure that there are no more than {scale} decimal places.',
  digits: 'Ensure that there are no more than {precision} digits in total.',
  key: 'The value must be a key (a number or a string).',
  string: 'The value must be a string.',
  integer: 'The value must be an integer.',
  number: 'The value must be a number.',
  decimal: 'The value must be a decimal number.',
  date: 'The value must be a date.',
  buffer: 'The value must be a Buffer.',
  boolean: 'The value must be true or false.',
  stringObject: 'The value must be an object of strings.',
  hstoreValues: 'The values of an hstore must be strings.',
  array: 'The value must be an array.',
  uuid: 'The value must be a UUID.',
  unique: 'There is already one with this value.',
  body: 'The value must be a Buffer, a string, a stream or a blob.',
};

let translator = null;

const fill = (text, params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (params && params[name] !== undefined ? String(params[name]) : whole));

// The message of a key (orm.<key> for the translator), with its parameters.
function message(key, params = {}) {
  const english = fill(MESSAGES[key], params);
  if (!translator) return english;
  const translated = translator(`orm.${key}`, params, english);
  return typeof translated === 'string' ? translated : english;
}

// A message of your own (of a rule): translated when the translator knows it as a key, else as it is.
function custom(text) {
  if (!translator || typeof text !== 'string') return text;
  const translated = translator(text, {}, text);
  return typeof translated === 'string' ? translated : text;
}

// The translator of the messages: fn(key, params, english) giving the text, or null to stop translating.
function setTranslator(fn) {
  if (fn !== null && typeof fn !== 'function') throw new TypeError('setTranslator(fn): a function, or null');
  translator = fn;
}

// A value that is not of its field: an error of validation, its message by key.
class ValueError extends TypeError {
  constructor(key, params) {
    super(message(key, params));
    this.key = key;
  }
}

export { MESSAGES, message, custom, setTranslator, ValueError };
