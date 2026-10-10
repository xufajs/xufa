// The messages of the forms that users read, by key, in English (as Django's); a translator (setTranslator(), as
// i18n.translateForms(forms) of @xufa/i18n installs) gives them in the language of the request, as forms.<key>.
const MESSAGES = {
  required: 'This field is required.',
  invalid: 'Enter a valid value.',
  maxLength: 'Ensure this value has at most {max} characters (it has {length}).',
  minLength: 'Ensure this value has at least {min} characters (it has {length}).',
  email: 'Enter a valid email address.',
  url: 'Enter a valid URL.',
  integer: 'Enter a whole number.',
  number: 'Enter a number.',
  max: 'Ensure this value is less than or equal to {max}.',
  min: 'Ensure this value is greater than or equal to {min}.',
  maxDigits: 'Ensure that there are no more than {max} digits in total.',
  decimalPlaces: 'Ensure that there are no more than {places} decimal places.',
  date: 'Enter a valid date.',
  datetime: 'Enter a valid date/time.',
  choice: 'Select a valid choice. {value} is not one of the available choices.',
  list: 'Enter a list of values.',
  file: 'No file was submitted. Check the encoding type on the form.',
  fileSize: 'Ensure this file has at most {max} bytes (it has {size}).',
  fileType: 'This type of file is not accepted ({type}).',
  unique: '{model} with this {label} already exists.',
  json: 'Enter a valid JSON.',
};

let translator = null;

const fill = (text, params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (params && params[name] !== undefined ? String(params[name]) : whole));

// The message of a key (forms.<key> for the translator), with its parameters.
function message(key, params = {}) {
  if (!Object.hasOwn(MESSAGES, key)) throw new TypeError(`No message of @xufa/forms named ${key}`);
  const english = fill(MESSAGES[key], params);
  if (!translator) return english;
  const translated = translator(`forms.${key}`, params, english);
  return typeof translated === 'string' ? translated : english;
}

// The translator of the messages: fn(key, params, english) giving the text, or null to stop translating.
function setTranslator(fn) {
  if (fn !== null && typeof fn !== 'function') throw new TypeError('setTranslator(fn): a function, or null');
  translator = fn;
}

export { MESSAGES, message, setTranslator };
