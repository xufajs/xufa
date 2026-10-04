// The validation of instances as in Sequelize: allowNull (notNull Violation), strings that are not strings (string
// violation), the validators of attributes (validate: { isEmail: true, len: [2, 10], custom(value) {...} }) with the
// names of validator.js, and the validators of the model (options.validate). Errors are ValidationErrorItems.
const { ValidationError, ValidationErrorItem } = require('./errors');

const EMAIL = /^[^\s@"(),:;<>[\\\]]+@[^\s@"(),:;<>[\\\]]+\.[^\s@"(),:;<>[\\\]]{2,}$/;
const URL_PATTERN = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IPV4 = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 =
  /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(([0-9a-f]{1,4}:){0,7}[0-9a-f]{0,4})?::(([0-9a-f]{1,4}:){0,7}[0-9a-f]{1,4})?)$/i;

const text = (value) => String(value);

// The validators of validator.js (and of Sequelize) that this layer has: (value, ...args) => boolean.
const VALIDATORS = {
  isEmail: (value) => EMAIL.test(text(value)),
  isUrl: (value) => URL_PATTERN.test(text(value)),
  isURL: (value) => URL_PATTERN.test(text(value)),
  isJSON: (value) => {
    try {
      return typeof JSON.parse(text(value)) === 'object';
    } catch {
      return false;
    }
  },
  isBoolean: (value) => ['true', 'false', '1', '0'].includes(text(value).toLowerCase()),
  isIP: (value) => IPV4.test(text(value)) || IPV6.test(text(value)),
  isIPv4: (value) => IPV4.test(text(value)),
  isIPv6: (value) => IPV6.test(text(value)),
  isAlpha: (value) => /^[A-Za-z]+$/.test(text(value)),
  isAlphanumeric: (value) => /^[A-Za-z0-9]+$/.test(text(value)),
  isNumeric: (value) => /^[-+]?\d+$/.test(text(value)),
  isInt: (value) => /^[-+]?(0|[1-9]\d*)$/.test(text(value)),
  isFloat: (value) => text(value) !== '' && !Number.isNaN(Number(value)),
  isDecimal: (value) => /^[-+]?(\d+\.?\d*|\.\d+)$/.test(text(value)),
  isHexadecimal: (value) => /^(0x|0h)?[0-9a-f]+$/i.test(text(value)),
  isLowercase: (value) => text(value) === text(value).toLowerCase(),
  isUppercase: (value) => text(value) === text(value).toUpperCase(),
  notEmpty: (value) => !/^\s*$/.test(text(value)),
  equals: (value, other) => text(value) === text(other),
  contains: (value, part) => text(value).includes(part),
  notContains: (value, part) => !text(value).includes(part),
  isIn: (value, list) => list.map(text).includes(text(value)),
  notIn: (value, list) => !list.map(text).includes(text(value)),
  len: (value, min = 0, max) => {
    const { length } = text(value);
    return length >= min && (max === undefined || length <= max);
  },
  isUUID: (value) => UUID.test(text(value)),
  isDate: (value) => !Number.isNaN(new Date(value).getTime()),
  isAfter: (value, date) => new Date(value) > new Date(date),
  isBefore: (value, date) => new Date(value) < new Date(date),
  max: (value, limit) => Number(value) <= limit,
  min: (value, limit) => Number(value) >= limit,
  is: (value, pattern, flags) => toRegExp(pattern, flags).test(text(value)),
  not: (value, pattern, flags) => !toRegExp(pattern, flags).test(text(value)),
  regex: (value, pattern, flags) => toRegExp(pattern, flags).test(text(value)),
  notRegex: (value, pattern, flags) => !toRegExp(pattern, flags).test(text(value)),
  isNull: (value) => value === null || value === undefined,
  notNull: (value) => value !== null && value !== undefined,
  isArray: (value) => Array.isArray(value),
  isCreditCard: (value) => luhn(text(value).replace(/[- ]/g, '')),
};

function toRegExp(pattern, flags) {
  if (pattern instanceof RegExp) return pattern;
  return new RegExp(pattern, flags);
}

function luhn(digits) {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// The arguments of a validator as Sequelize takes them: true (none), a value, an array, or { args, msg }.
function argumentsOf(name, option) {
  const args =
    option && typeof option === 'object' && !Array.isArray(option) && 'args' in option ? option.args : option;
  if (args === true || args === undefined) return [];
  if (name === 'isIn' || name === 'notIn') return Array.isArray(args) && Array.isArray(args[0]) ? args : [args];
  if (name === 'len' || name === 'is' || name === 'not') {
    if (Array.isArray(args) && (name === 'len' || typeof args[0] === 'string')) return args;
    return [args];
  }
  return [args];
}

function messageOf(name, option, path) {
  if (option && typeof option === 'object' && !Array.isArray(option) && option.msg) return option.msg;
  return `Validation ${name} on ${path} failed`;
}

// The errors of one attribute: its validators, those of validator.js and custom functions (this is the instance).
async function validateAttribute(instance, path, value, rules, errors) {
  const names = Object.keys(rules);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const option = rules[name];
    if (typeof option === 'function') {
      try {
        // Validators of two arguments (value, next) call next with the error (or with nothing).
        if (option.length > 1) {
          await new Promise((resolve, reject) => {
            option.call(instance, value, (err) =>
              err ? reject(err instanceof Error ? err : new Error(err)) : resolve()
            );
          });
        } else await option.call(instance, value);
      } catch (err) {
        errors.push(
          new ValidationErrorItem(err.message, 'Validation error', path, value, instance, name, name, [value])
        );
      }
      continue;
    }
    if (option === false) continue;
    // A value that cannot change once saved.
    if (name === 'isImmutable') {
      if (!instance.isNewRecord && instance._previousDataValues[path] !== value) {
        errors.push(
          new ValidationErrorItem(
            messageOf(name, option, path),
            'Validation error',
            path,
            value,
            instance,
            name,
            name,
            []
          )
        );
      }
      continue;
    }
    const validator = VALIDATORS[name];
    if (!validator) throw new Error(`Invalid validator function: ${name}`);
    const args = argumentsOf(name, option);
    // notEmpty and the like check strings: the other types pass them as their text.
    if (!validator(value, ...args)) {
      errors.push(
        new ValidationErrorItem(
          messageOf(name, option, path),
          'Validation error',
          path,
          value,
          instance,
          name,
          name,
          args
        )
      );
    }
  }
}

// Validates an instance: the attributes in `fields` (all when not given), skipping those in `skip`. Throws a
// ValidationError with every error found.
// The checks of the values are made at once; the validators of attributes and of the model (that can be async) after,
// in a promise. Without validators it gives nothing (it throws a ValidationError at once): creates without validators
// do not wait. The errors keep the order of the attributes (`parts`: errors, and lists of those of validators).
function validateInstance(instance, options = {}) {
  const model = instance.constructor;
  const errors = [];
  let pending = null;
  const { fields, skip } = options;
  const attributes = model.rawAttributes;
  const names = Object.keys(attributes);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    if ((fields && !fields.includes(name)) || (skip && skip.includes(name))) continue;
    const attribute = attributes[name];
    if (attribute.type.kind === 'virtual' && !attribute.validate) continue;
    const value = instance.dataValues[name];
    // Expressions of SQL (fn, col, literal) are not validated.
    if (
      value &&
      (value.xufaFn !== undefined || value.xufaCol !== undefined || value.xufaLiteral !== undefined || value.xufaCast)
    )
      continue;
    if (value === null || value === undefined) {
      const generated = attribute.autoIncrement || attribute.xufaGenerated;
      if (attribute.allowNull === false && !generated) {
        errors.push(
          new ValidationErrorItem(
            `${model.name}.${name} cannot be null`,
            'notNull Violation',
            name,
            value,
            instance,
            'is_null'
          )
        );
      }
      continue;
    }
    const { kind } = attribute.type;
    // Text search vectors are written as strings only (as Sequelize checks).
    if (attribute.type.key === 'TSVECTOR' && typeof value !== 'string') {
      errors.push(
        new ValidationErrorItem(
          `${value} is not a valid string`,
          'string violation',
          name,
          value,
          instance,
          'not_a_string'
        )
      );
      continue;
    }
    const bytes = Buffer.isBuffer(value) && attribute.type.options.binary;
    if (
      (kind === 'string' || kind === 'text') &&
      typeof value === 'object' &&
      !bytes &&
      !(value && value.xufaFn !== undefined)
    ) {
      errors.push(
        new ValidationErrorItem(
          `${name} cannot be an array or an object`,
          'string violation',
          name,
          value,
          instance,
          'not_a_string'
        )
      );
      continue;
    }
    if (attribute.validate) {
      const slot = [];
      errors.push(slot);
      if (!pending) pending = [];
      pending.push({ name, value, rules: attribute.validate, slot });
    }
  }
  // The validators of the model, unless only some fields are validated.
  const modelValidators = model.options.validate;
  const keys = !options.skipModel && modelValidators ? Object.keys(modelValidators) : [];
  if (!pending && keys.length === 0) {
    if (errors.length) throw new ValidationError(null, errors);
    return undefined;
  }
  return runValidators(instance, pending || [], modelValidators, keys, errors);
}

async function runValidators(instance, pending, modelValidators, keys, errors) {
  for (let i = 0; i < pending.length; i += 1) {
    const { name, value, rules, slot } = pending[i];
    await validateAttribute(instance, name, value, rules, slot);
  }
  for (let i = 0; i < keys.length; i += 1) {
    try {
      await modelValidators[keys[i]].call(instance);
    } catch (err) {
      errors.push(new ValidationErrorItem(err.message, 'Validation error', keys[i], undefined, instance, keys[i]));
    }
  }
  const found = errors.flat();
  if (found.length) throw new ValidationError(null, found);
}

// As Sequelize: values not of their enums fail when they are written (after the validations and the hooks), with the
// message of the value.
function checkEnums(model, values, instance) {
  const names = Object.keys(values);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const attribute = model.rawAttributes[name];
    const value = values[name];
    if (!attribute || !attribute.values || value === null || value === undefined) continue;
    if (attribute.values.includes(value) || (value && typeof value === 'object')) continue;
    const message = `${JSON.stringify(value)} is not a valid choice in ${JSON.stringify(attribute.values)}`;
    throw new ValidationError(message, [
      new ValidationErrorItem(message, 'Validation error', name, value, instance, 'isIn'),
    ]);
  }
}

// validator.js as Sequelize gives it: its validators, and extend() to add more.
const Validator = {
  ...VALIDATORS,
  extend(name, fn) {
    VALIDATORS[name] = fn;
    Validator[name] = fn;
    return Validator;
  },
};

module.exports = { validateInstance, checkEnums, VALIDATORS, Validator };
