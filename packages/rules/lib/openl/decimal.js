// BigDecimal of OpenL (Java's): exact decimals, an unscaled BigInt and a scale. Sums, differences and products are
// exact; quotients are to 34 significant digits (MathContext.DECIMAL128, half even), as OpenL divides them.
const DIGITS = 34;
const TEN = 10n;
const pow10 = (n) => TEN ** BigInt(n);

// Rounded division of BigInts by a mode of Java's (HALF_EVEN by default).
function divideRound(numerator, denominator, mode = 'HALF_EVEN') {
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  const away = negative ? quotient - 1n : quotient + 1n;
  switch (mode) {
    case 'UP':
      return away;
    case 'DOWN':
      return quotient;
    case 'CEILING':
      return negative ? quotient : away;
    case 'FLOOR':
      return negative ? away : quotient;
    case 'HALF_UP':
      return twice >= denominator ? away : quotient;
    case 'HALF_DOWN':
      return twice > denominator ? away : quotient;
    case 'UNNECESSARY':
      throw new RangeError('Rounding necessary');
    default:
      if (twice > denominator) return away;
      if (twice < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : away;
  }
}

const digitsOf = (value) => (value < 0n ? -value : value).toString().length;

class Decimal {
  constructor(unscaled, scale = 0) {
    this.unscaled = unscaled;
    this.scale = scale;
  }

  static get javaName() {
    return 'BigDecimal';
  }

  // A decimal of a number (as Java's BigDecimal.valueOf: by its shortest text), a text, a BigInt or a decimal.
  static from(value) {
    if (value instanceof Decimal) return value;
    if (value === null || value === undefined) return new Decimal(0n, 0);
    if (typeof value === 'bigint') return new Decimal(value, 0);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new RangeError(`${value} is no BigDecimal`);
      return Decimal.parse(
        Number.isInteger(value) && Math.abs(value) < 1e21 ? BigInt(value).toString() : String(value)
      );
    }
    return Decimal.parse(String(value));
  }

  static parse(text) {
    // (99.99%: a percent.)
    if (/%\s*$/.test(text)) return Decimal.parse(text.replace(/%\s*$/, '')).divide(100);
    const match = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/.exec(text);
    if (!match || (!match[2] && !match[3])) throw new RangeError(`"${text}" is no BigDecimal`);
    const [, sign, whole = '', fraction = '', exponent = '0'] = match;
    let unscaled = BigInt(`${whole}${fraction}` || '0');
    if (sign === '-') unscaled = -unscaled;
    let scale = fraction.length - Number(exponent);
    if (scale < 0) {
      unscaled *= pow10(-scale);
      scale = 0;
    }
    return new Decimal(unscaled, scale);
  }

  static align(a, b) {
    const scale = Math.max(a.scale, b.scale);
    return [a.unscaled * pow10(scale - a.scale), b.unscaled * pow10(scale - b.scale), scale];
  }

  add(other) {
    const [a, b, scale] = Decimal.align(this, Decimal.from(other));
    return new Decimal(a + b, scale);
  }

  subtract(other) {
    const [a, b, scale] = Decimal.align(this, Decimal.from(other));
    return new Decimal(a - b, scale);
  }

  multiply(other) {
    const that = Decimal.from(other);
    return new Decimal(this.unscaled * that.unscaled, this.scale + that.scale);
  }

  // To 34 significant digits, then without trailing zeros past the preferred scale (as Java's divide with DECIMAL128).
  divide(other, digits = DIGITS) {
    const that = Decimal.from(other);
    if (that.unscaled === 0n) throw new RangeError('Division by zero');
    const preferred = this.scale - that.scale;
    // Enough digits: shift the numerator so the quotient has digits + 3 significant digits.
    const shift = Math.max(0, digits + 3 + digitsOf(that.unscaled) - digitsOf(this.unscaled));
    const numerator = this.unscaled * pow10(shift);
    const exact = numerator % that.unscaled === 0n;
    let unscaled = divideRound(numerator, that.unscaled);
    let scale = preferred + shift;
    // Round to the digits.
    const excess = digitsOf(unscaled) - digits;
    if (excess > 0) {
      unscaled = divideRound(unscaled, pow10(excess));
      scale -= excess;
    }
    let result = new Decimal(unscaled, scale);
    if (exact || excess <= 0) result = result.strip(preferred);
    return result;
  }

  remainder(other) {
    const [a, b, scale] = Decimal.align(this, Decimal.from(other));
    if (b === 0n) throw new RangeError('Division by zero');
    return new Decimal(a % b, scale);
  }

  // Trailing zeros taken off, down to a scale.
  strip(lowest = -Infinity) {
    let { unscaled, scale } = this;
    while (scale > lowest && unscaled !== 0n && unscaled % TEN === 0n) {
      unscaled /= TEN;
      scale -= 1;
    }
    if (unscaled === 0n && scale > Math.max(lowest, 0)) scale = Math.max(lowest, 0);
    return new Decimal(unscaled, scale);
  }

  setScale(scale, mode = 'UNNECESSARY') {
    if (scale >= this.scale) return new Decimal(this.unscaled * pow10(scale - this.scale), scale);
    return new Decimal(divideRound(this.unscaled, pow10(this.scale - scale), mode), scale);
  }

  negate() {
    return new Decimal(-this.unscaled, this.scale);
  }

  abs() {
    return this.unscaled < 0n ? this.negate() : this;
  }

  pow(n) {
    if (n < 0) return new Decimal(1n, 0).divide(this.pow(-n));
    return new Decimal(this.unscaled ** BigInt(n), this.scale * n);
  }

  signum() {
    return this.unscaled > 0n ? 1 : this.unscaled < 0n ? -1 : 0;
  }

  compareTo(other) {
    const [a, b] = Decimal.align(this, Decimal.from(other));
    return a < b ? -1 : a > b ? 1 : 0;
  }

  equals(other) {
    if (other === null || other === undefined) return false;
    try {
      return this.compareTo(other) === 0;
    } catch {
      return false;
    }
  }

  toNumber() {
    return Number(this.toString());
  }

  toBigInt() {
    return this.scale <= 0 ? this.unscaled * pow10(-this.scale) : this.unscaled / pow10(this.scale);
  }

  // Java's toPlainString (and toString without exponents).
  toString() {
    const negative = this.unscaled < 0n;
    let digits = (negative ? -this.unscaled : this.unscaled).toString();
    if (this.scale <= 0) return `${negative ? '-' : ''}${digits}${'0'.repeat(-this.scale)}`;
    digits = digits.padStart(this.scale + 1, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -this.scale)}.${digits.slice(-this.scale)}`;
  }

  toJava() {
    return this.toString();
  }

  toJSON() {
    return this.toNumber();
  }

  // Methods of Java's BigDecimal, for the code of OpenL.
  method(name, args) {
    const [first, second] = args;
    switch (name) {
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'remainder':
        return this[name](first);
      case 'divide':
        if (second !== undefined && typeof second === 'number' && args.length === 3) {
          return this.divide(first).setScale(second, args[2]);
        }
        return this.divide(first);
      case 'setScale':
        return this.setScale(first, typeof second === 'string' ? second : (MODES[second] ?? 'UNNECESSARY'));
      case 'negate':
      case 'abs':
      case 'signum':
      case 'toString':
        return this[name]();
      case 'toPlainString':
        return this.toString();
      case 'doubleValue':
        return this.toNumber();
      case 'intValue':
      case 'longValue':
        return Number(this.toBigInt());
      case 'compareTo':
        return this.compareTo(first);
      case 'equals':
        return this.equals(first) && Decimal.from(first).scale === this.scale;
      case 'scale':
        return this.scale;
      case 'precision':
        return digitsOf(this.unscaled);
      case 'pow':
        return this.pow(first);
      case 'stripTrailingZeros':
        return this.strip();
      case 'toBigInteger':
        return this.toBigInt();
      default:
        throw new RangeError(`No method ${name}() of BigDecimal`);
    }
  }
}

// The rounding modes of Java by their numbers (BigDecimal.ROUND_HALF_UP is 4).
const MODES = ['UP', 'DOWN', 'CEILING', 'FLOOR', 'HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'UNNECESSARY'];

export { Decimal, divideRound, MODES };
