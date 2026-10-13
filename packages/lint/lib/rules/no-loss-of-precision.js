// Number literals that lose precision at runtime: the digits written (in base 2, 8 or 16, or the significant digits
// of a decimal) are not the ones of the number stored.

const PREFIXED = /^0[box]/iu;
const LEGACY_OCTAL = /^0[0-7]+$/u;

/** A string of digits without its leading zeros (unchanged when all zeros). */
const trimLeadingZeros = (digits) => digits.replace(/^0+(?=[^0])/u, '');

/** A string of digits without its trailing zeros (unchanged when all zeros). */
const trimTrailingZeros = (digits) => digits.replace(/(?<=[^0])0+$/u, '');

/**
 * A decimal number (lower case, no separators) in scientific notation: the significant digits (a point implied
 * after the first one) and the order of magnitude. Without a point and not `asFloat`, trailing zeros of the integer
 * are not significant.
 */
function toScientific(number, asFloat) {
  const [digits, exponent] = number.split('e');
  const trimmed = trimLeadingZeros(digits);
  let coefficient;
  let magnitude;
  if (!asFloat && !number.includes('.')) {
    coefficient = trimTrailingZeros(trimmed);
    magnitude = trimmed.length - 1;
  } else {
    const point = trimmed.indexOf('.');
    if (point === 0) {
      coefficient = trimLeadingZeros(trimmed.slice(1));
      magnitude = coefficient.length - trimmed.length;
    } else if (point === -1) {
      coefficient = trimmed;
      magnitude = trimmed.length - 1;
    } else {
      coefficient = trimmed.replace('.', '');
      magnitude = point - 1;
    }
  }
  if (exponent !== undefined) magnitude += parseInt(exponent, 10);
  return { coefficient, magnitude };
}

/** Whether a decimal literal's significant digits differ from the stored number's (more than 100 always do). */
function decimalLosesPrecision(node) {
  const raw = toScientific(node.raw.replace(/_/gu, '').toLowerCase(), false);
  const precision = raw.coefficient.length;
  if (precision > 100) return true;
  const stored = toScientific(node.value.toPrecision(precision), true);
  return raw.magnitude !== stored.magnitude || raw.coefficient !== stored.coefficient;
}

/** Whether a binary, octal or hexadecimal literal's digits differ from the stored number's. */
function nonDecimalLosesPrecision(node) {
  const raw = node.raw.replace(/_/gu, '').toUpperCase();
  let base = 8;
  if (raw.startsWith('0B')) base = 2;
  else if (raw.startsWith('0X')) base = 16;
  return !raw.endsWith(node.value.toString(base).toUpperCase());
}

export const meta = {
  type: 'problem',
  dialects: ['typescript', 'javascript'],
  language: 'javascript',
  docs: {
    description: 'Disallow literal numbers that lose precision',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-loss-of-precision',
  },
  schema: [],
  messages: {
    noLossOfPrecision: 'This number literal will lose precision at runtime.',
  },
};

export function create(context) {
  return {
    Literal(node) {
      if (!node.value || typeof node.value !== 'number') return;
      const isDecimal = !PREFIXED.test(node.raw) && !LEGACY_OCTAL.test(node.raw);
      if (isDecimal ? decimalLosesPrecision(node) : nonDecimalLosesPrecision(node)) {
        context.report({ messageId: 'noLossOfPrecision', node });
      }
    },
  };
}
