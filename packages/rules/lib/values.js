// Values of cells as their types say (Integer, Float, Codes...), texts compared as people read them (without accents
// nor invisible characters), and the conditions of the headers of rules tables (=, <, <=, >, >=, ranges).

class RulesError extends Error {
  constructor(message, code = 'XUFA_RULES_ERR_TABLE') {
    super(message);
    this.name = 'RulesError';
    this.code = code;
  }
}

// Texts compared without their accents (é is e), zero-width spaces nor the spaces around them.
function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

const isNumber = (value) => value !== null && value !== '' && !Number.isNaN(Number(value));
const isInteger = (value) => value !== null && value !== '' && Number.isInteger(Number(value));

// A list in a cell: its lines or what commas separate, trimmed, without the empty ones.
const listOf = (value) =>
  String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

// The value of a cell as a type says (the type names of the tables, any case); other types leave it as it is.
function toValue(type, value) {
  switch (type ? String(type).toLowerCase() : null) {
    case 'integer':
      if (!isInteger(value)) throw new RulesError(`Invalid Integer ${value}`, 'XUFA_RULES_ERR_VALUE');
      return parseInt(value, 10);
    case 'float':
    case 'double':
    case 'number':
      if (!isNumber(value)) throw new RulesError(`Invalid Float/Double ${value}`, 'XUFA_RULES_ERR_VALUE');
      return parseFloat(value);
    case 'boolean':
      return value === true || value === 'true' || value === 'TRUE';
    case 'date':
      return value instanceof Date ? value : new Date(value);
    case 'code':
      return typeof value === 'string' ? value.trim() : value;
    case 'codes':
      if (value === null || value === undefined || value === '') return [];
      return Array.isArray(value) ? value : listOf(value);
    case 'string':
      return value === null || value === undefined ? value : String(value);
    default:
      return value;
  }
}

const RANGE_TYPES = new Set(['IntRange', 'FloatRange', 'DoubleRange', 'NumberRange']);
const NUMBER_TYPES = new Set(['Integer', 'Float', 'Double', 'Number']);
const TEXT_TYPES = new Set(['String', 'Nested', 'Code']);

// The condition of a header cell of a parameter of a type: { type: 'true' } (empty: any value), 'equal', 'lessThan',
// 'lessEqual', 'greaterThan', 'greaterEqual', 'range' (typeLeft, valueLeft, typeRight, valueRight), or 'false' (a
// type of no condition). The same objects as the engine this one follows keeps in its JSON.
function compileCondition(type, header) {
  if (header === null || header === undefined || header === '') return { type: 'true' };
  if (TEXT_TYPES.has(type)) return { type: 'equal', value: normalize(header) };
  const text = typeof header === 'string' ? header.trim() : header;
  if (NUMBER_TYPES.has(type)) return { type: 'equal', value: parseFloat(text) };
  if (RANGE_TYPES.has(type)) {
    if (typeof text !== 'string') return { type: 'equal', value: text };
    if (text.startsWith('<=')) return { type: 'lessEqual', value: parseFloat(text.slice(2)) };
    if (text.startsWith('>=')) return { type: 'greaterEqual', value: parseFloat(text.slice(2)) };
    if (text.startsWith('<')) return { type: 'lessThan', value: parseFloat(text.slice(1)) };
    if (text.startsWith('>')) return { type: 'greaterThan', value: parseFloat(text.slice(1)) };
    if (text.startsWith('[') || text.startsWith('(')) {
      const [left, right] = text
        .slice(1, -1)
        .split('..')
        .map((part) => parseFloat(part));
      return {
        type: 'range',
        typeLeft: text[0] === '(' ? 'greaterThan' : 'greaterEqual',
        valueLeft: left,
        typeRight: text[text.length - 1] === ')' ? 'lessThan' : 'lessEqual',
        valueRight: right,
      };
    }
    return { type: 'equal', value: parseFloat(text) };
  }
  return { type: 'false' };
}

const COMPARE = {
  lessThan: (value, limit) => value < limit,
  lessEqual: (value, limit) => value <= limit,
  greaterThan: (value, limit) => value > limit,
  greaterEqual: (value, limit) => value >= limit,
};

// A function (value) => boolean of a condition. Texts are compared normalized on both sides.
function testOf(condition) {
  switch (condition.type) {
    case 'true':
      return () => true;
    case 'equal': {
      const expected = condition.value;
      if (typeof expected === 'string') {
        return (value) =>
          value === expected || (value !== null && value !== undefined && normalize(value) === expected);
      }
      return (value) => value === expected;
    }
    case 'range': {
      const left = COMPARE[condition.typeLeft];
      const right = COMPARE[condition.typeRight];
      return (value) => left(value, condition.valueLeft) && right(value, condition.valueRight);
    }
    default: {
      const compare = COMPARE[condition.type];
      return compare ? (value) => compare(value, condition.value) : () => false;
    }
  }
}

// The text of a condition in a header cell (the opposite of compileCondition).
function conditionText(condition) {
  switch (condition.type) {
    case 'equal':
      return condition.value;
    case 'lessThan':
      return `<${condition.value}`;
    case 'lessEqual':
      return `<=${condition.value}`;
    case 'greaterThan':
      return `>${condition.value}`;
    case 'greaterEqual':
      return `>=${condition.value}`;
    case 'range':
      return `${condition.typeLeft === 'greaterEqual' ? '[' : '('}${condition.valueLeft}..${condition.valueRight}${
        condition.typeRight === 'lessEqual' ? ']' : ')'
      }`;
    default:
      return null;
  }
}

// A value that meets a condition (for the combinations of the tests that a table is checked with).
function sampleOf(condition) {
  switch (condition.type) {
    case 'equal':
    case 'lessEqual':
    case 'greaterEqual':
      return [condition.value];
    case 'lessThan':
      return [condition.value - 1];
    case 'greaterThan':
      return [condition.value + 1];
    case 'range':
      return [condition.typeLeft === 'greaterEqual' ? condition.valueLeft : condition.valueLeft + 1];
    default:
      return [];
  }
}

// "Integer age", "age" (any) -> { name, type }.
function paramOf(text) {
  const tokens = text.trim().split(/\s+/);
  return tokens.length > 1 ? { name: tokens[tokens.length - 1], type: tokens[0] } : { name: tokens[0], type: 'any' };
}

// The parameters between the parentheses of a title: "Rules String Name(String a, Integer b)".
function paramsOfTitle(title) {
  const open = title.indexOf('(');
  const close = title.lastIndexOf(')');
  if (open === -1 || close < open) return [];
  const inner = title.slice(open + 1, close).trim();
  return inner ? inner.split(',').map(paramOf) : [];
}

export {
  RulesError,
  normalize,
  toValue,
  isNumber,
  isInteger,
  listOf,
  compileCondition,
  testOf,
  conditionText,
  sampleOf,
  paramOf,
  paramsOfTitle,
};
