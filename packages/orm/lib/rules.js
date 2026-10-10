// Validation rules written as expressions of @xufa/expression (or functions): on a field, `validate` gets the value as
// `value` ('value >= 0'); on a model, `options.rules` get the object (its fields by name: 'end > start'). A rule gives
// true when the value is valid, false when it is not (its message, or a default one), or a string: the message.
//   validate: 'value >= 0'
//   validate: { rule: 'value.length >= 3', message: 'At least 3 characters.' }
//   static options = { rules: [{ rule: 'end > start', message: 'The end comes after the start.', field: 'end' }] }
import { message as defaultMessage, custom } from './messages.js';
import { ModelError } from './errors.js';
import { expressionEngine } from './computed.js';

const FIELD_MESSAGE = 'The value is not valid.';
const OBJECT_MESSAGE = 'The object is not valid.';

// The message of what a rule gave, or null when it is valid.
function messageOf(result, given) {
  // The default messages by key (translated); a message of your own is translated when it is a key of the catalogs.
  const message =
    given === FIELD_MESSAGE
      ? defaultMessage('invalid')
      : given === OBJECT_MESSAGE
        ? defaultMessage('invalidObject')
        : custom(given);
  if (result === false) return message;
  if (typeof result === 'string') return result === '' ? message : custom(result);
  return null;
}

// A rule as a function of what it reads ({ value } for fields, the object for models) giving its message or null.
function compileRule(spec, { where, message: defaultMessage }) {
  let rule = spec;
  let message = defaultMessage;
  if (spec !== null && typeof spec === 'object' && !Array.isArray(spec)) {
    ({ rule } = spec);
    if (spec.message !== undefined) message = String(spec.message);
  }
  if (typeof rule === 'function') return (subject) => messageOf(rule(subject), message);
  if (typeof rule !== 'string')
    throw new TypeError(`${where}: a rule is an expression, a function or { rule, message }`);
  let compiled;
  try {
    compiled = expressionEngine().compile(rule);
  } catch (err) {
    throw new TypeError(`${where}: ${err.message}`);
  }
  return (subject) => messageOf(compiled(subject), message);
}

// The validators of a field (its option validate): functions of the value giving true, false or a message, as before;
// expressions and { rule, message } are compiled to such functions.
function fieldValidators(specs, model, name) {
  return specs.map((spec) => {
    if (typeof spec === 'function') return spec;
    let check;
    try {
      check = compileRule(spec, { where: `the field ${name}`, message: FIELD_MESSAGE });
    } catch (err) {
      throw new ModelError(model.name, err.message);
    }
    return (value) => {
      const failure = check({ value });
      return failure === null ? true : failure;
    };
  });
}

// The rules of a model (options.rules of it and of its parents): [{ check(object), field }]. `field` names the field
// whose errors get the message; without one, the errors of the object (__all__, as in Django).
function modelRules(specs, model, fieldNames) {
  return specs.map((spec, i) => {
    const field = spec !== null && typeof spec === 'object' && spec.field !== undefined ? spec.field : null;
    if (field !== null && !fieldNames.has(field)) {
      throw new ModelError(model.name, `the rule ${i + 1} names the field ${field}, which ${model.name} does not have`);
    }
    let check;
    try {
      check = compileRule(spec, { where: `the rule ${i + 1}`, message: OBJECT_MESSAGE });
    } catch (err) {
      throw new ModelError(model.name, err.message);
    }
    return { check, field: field === null ? '__all__' : field };
  });
}

export { fieldValidators, modelRules, compileRule };
