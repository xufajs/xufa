// @xufa/serializer: compiles a JSON schema into a function writing JSON for it, as fast-json-stringify does.
//
//   const serialize = build({ type: 'object', properties: { id: { type: 'integer' } } });
//   serialize({ id: 1, secret: 'x' }); // '{"id":1}'
//
// Only the properties of the schema are written, each with the writer of its type. Objects and arrays are written
// inline in the generated function; schemas reached by $ref get functions of their own (which is how recursive
// schemas are written). The branch of anyOf, oneOf and if/then/else is chosen by predicates compiled from the schemas.
import { RefResolver, resolveURI } from './lib/resolver.js';
import { mergeSchemas } from './lib/merge.js';
import { createMatcher } from './lib/match.js';
import { createRuntime } from './lib/runtime.js';
import { validateSchema } from './lib/meta.js';
import * as writer from './lib/writer.js';

const { bytesOf } = writer;
const ROUNDING = new Set(['floor', 'ceil', 'round', 'trunc']);
const LARGE_ARRAY_MECHANISMS = new Set(['default', 'json-stringify']);
// How the generated code makes the JSON (see Builder#lit()); 'auto' picks by the schema.
const OUTPUTS = new Set(['auto', 'string', 'bytes']);

const OBJECT_KEYWORDS = [
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'maxProperties',
  'minProperties',
  'dependencies',
];
const ARRAY_KEYWORDS = ['items', 'additionalItems', 'maxItems', 'minItems', 'uniqueItems', 'contains', 'prefixItems'];
const STRING_KEYWORDS = ['maxLength', 'minLength', 'pattern'];
const NUMBER_KEYWORDS = ['multipleOf', 'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum'];

let rootCounter = 0;

// The type a schema without "type" is written as, from its keywords.
function inferType(schema) {
  for (const keyword of OBJECT_KEYWORDS) if (keyword in schema) return 'object';
  for (const keyword of ARRAY_KEYWORDS) if (keyword in schema) return 'array';
  for (const keyword of STRING_KEYWORDS) if (keyword in schema) return 'string';
  for (const keyword of NUMBER_KEYWORDS) if (keyword in schema) return 'number';
  return schema.type;
}

const quote = (value) => JSON.stringify(value);
// A string literal of JavaScript code holding the given text.
const literal = (text) => JSON.stringify(text);

function parseLargeArraySize(value) {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  } else if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  } else if (typeof value === 'bigint') {
    return Number(value);
  }
  throw new Error(`Unsupported large array size. Expected integer-like, got ${typeof value} with value ${value}`);
}

class Builder {
  constructor(schema, options) {
    this.options = options;
    this.resolver = new RefResolver();
    this.matcher = createMatcher(this.resolver, { coerceTypes: Boolean(options.ajv && options.ajv.coerceTypes) });
    this.rootId =
      schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#'
        ? schema.$id
        : `__xufa_root_${rootCounter++}`;
    this.uid = 0;
    this.functions = [];
    this.functionNames = new Map();
    this.validators = [];
    this.patterns = [];
    this.mergedCache = new Map();
    // Copies made by absolute() -> the schema they copy, so that a copy is built (and merged) as its original.
    this.origins = new WeakMap();
    // Schemas being written inline: met again inside themselves, they get a function.
    this.stack = new Set();
    this.largeArrayMechanism = options.largeArrayMechanism || 'default';
    this.largeArraySize = options.largeArraySize === undefined ? 2e4 : parseLargeArraySize(options.largeArraySize);
    // The output of the generated code (see lit()), and the literals it writes as bytes.
    this.bytes = options.output === 'bytes';
    this.literals = [];
  }

  name(prefix) {
    const id = this.uid;
    this.uid += 1;
    return `${prefix}${id}`;
  }

  // The code is written for one of two outputs. 'string': the JSON is joined with + in a variable `json` (fastest for
  // small values). 'bytes': it is written as UTF-8 to the buffer of lib/writer.js and read once at the end (fastest
  // for large ones: no tree of strings for V8 to flatten). The helpers below write a statement for either.

  // The name of the constant holding the bytes of a literal, for the 'bytes' output.
  bytesOf(text) {
    let index = this.literals.indexOf(text);
    if (index === -1) {
      index = this.literals.length;
      this.literals.push(text);
    }
    return `B${index}`;
  }

  // Writes text known when compiling.
  lit(text) {
    if (!this.bytes) return `json += ${literal(text)};\n`;
    if (text.length === 1 && text.charCodeAt(0) < 128) return `wc(${text.charCodeAt(0)});\n`;
    return `wb(${this.bytesOf(text)});\n`;
  }

  // Writes one of two texts known when compiling; `whenFalse` may hold code run when the condition is false.
  litChoice(condition, whenTrue, whenFalse, sideEffect = '') {
    const pick = (text) => (this.bytes ? this.bytesOf(text) : literal(text));
    const falseValue = sideEffect ? `(${sideEffect}, ${pick(whenFalse)})` : pick(whenFalse);
    const value = `${condition} ? ${pick(whenTrue)} : ${falseValue}`;
    return this.bytes ? `wb(${value});\n` : `json += ${value};\n`;
  }

  // Writes the JSON text an expression gives (a string, or undefined written as "undefined").
  raw(expression) {
    return this.bytes ? `wr('' + ${expression});\n` : `json += ${expression};\n`;
  }

  // Writes a value with a function of the generated code (for references): it returns its JSON or writes it.
  callFunction(name, input) {
    return this.bytes ? `${name}(${input});\n` : `json += ${name}(${input});\n`;
  }

  // How a location is named in error messages: its JSON pointer, after the id of its schema when not the root one.
  refOf(loc) {
    return loc.base === this.rootId ? loc.pointer : `${loc.base}${loc.pointer}`;
  }

  child(loc, key) {
    const schema = loc.schema[key];
    let { base } = loc;
    if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
      base = resolveURI(base, schema.$id);
    }
    return { schema, base, pointer: `${loc.pointer}/${key}` };
  }

  resolve(loc) {
    let current = loc;
    const seen = new Set();
    while (current.schema && typeof current.schema === 'object' && current.schema.$ref !== undefined) {
      const { $ref } = current.schema;
      const target = this.resolver.resolve($ref, current.base);
      if (target === null) {
        const missing = this.resolver.missingDocument($ref, current.base);
        if (missing !== null) {
          throw new Error(`Cannot resolve ref "${$ref}". Schema with id "${missing}" is not found.`);
        }
        throw new Error(`Cannot find reference "${$ref}"`);
      }
      if (seen.has(target.schema)) throw new Error(`Circular reference "${$ref}"`);
      seen.add(target.schema);
      current = target;
    }
    return current;
  }

  // A copy of a schema whose references are absolute, so that it can be merged with schemas of other documents.
  origin(schema) {
    return this.origins.get(schema) || schema;
  }

  absolute(schema, base) {
    if (schema === null || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map((item) => this.absolute(item, base));
    let current = base;
    if (typeof schema.$id === 'string' && schema.$id[0] !== '#') current = resolveURI(base, schema.$id);
    const out = {};
    for (const key of Object.keys(schema)) {
      const value = schema[key];
      if (key === '$ref' && typeof value === 'string') {
        const hash = value.indexOf('#');
        const uri = hash === -1 ? value : value.slice(0, hash);
        out.$ref = (uri === '' ? current : resolveURI(current, uri)) + (hash === -1 ? '' : value.slice(hash));
      } else if (key === 'enum' || key === 'const' || key === 'default' || key === 'examples') {
        out[key] = value;
      } else {
        out[key] = this.absolute(value, current);
      }
    }
    this.origins.set(out, this.origin(schema));
    return out;
  }

  // The merge of schemas (resolved and made absolute), cached by the schema objects merged.
  merge(locs) {
    let cache = this.mergedCache;
    for (const loc of locs) {
      const key = loc.key || this.origin(loc.schema);
      if (!cache.has(key)) cache.set(key, new Map());
      cache = cache.get(key);
    }
    if (cache.has('merged')) return cache.get('merged');
    const parts = locs.map((loc) => {
      const resolved = this.resolve(loc);
      const copy = this.absolute(resolved.schema, resolved.base);
      if (copy && typeof copy === 'object') delete copy.$id;
      return copy;
    });
    const merged = mergeSchemas(parts);
    if (merged && typeof merged === 'object') this.origins.set(merged, merged);
    cache.set('merged', merged);
    return merged;
  }

  validator(loc) {
    this.validators.push(this.matcher(loc.schema, loc.base));
    return `v[${this.validators.length - 1}]`;
  }

  // Whether the value of a schema can be written inline: no references, combinations, objects or arrays inside.
  isSimple(schema) {
    if (schema === null || typeof schema !== 'object') return true;
    if (schema.$ref || schema.allOf || schema.anyOf || schema.oneOf || schema.if) return false;
    const type = schema.type === undefined ? inferType(schema) : schema.type;
    const types = Array.isArray(type) ? type : [type];
    return !types.includes('object') && !types.includes('array');
  }

  buildValue(loc, input) {
    const { schema } = loc;
    if (schema === undefined || typeof schema === 'boolean') return this.raw(`JSON.stringify(${input})`);
    if (schema.$ref !== undefined) return this.buildRef(loc, input);
    const origin = this.origin(schema);
    if (this.stack.has(origin)) return this.callFunction(this.functionFor(loc), input);
    this.stack.add(origin);
    try {
      return this.buildBody(loc, input);
    } finally {
      this.stack.delete(origin);
    }
  }

  buildBody(loc, input) {
    const { schema } = loc;
    if (schema.allOf) return this.buildAllOf(loc, input);
    if (schema.anyOf || schema.oneOf) return this.buildOneOf(loc, input);
    if (schema.if !== undefined && schema.then !== undefined) return this.buildIfThenElse(loc, input);
    const type = schema.type === undefined ? inferType(schema) : schema.type;
    const nullable = schema.nullable === true;
    let code = nullable ? `if (${input} === null) ${this.lit('null')}else {\n` : '';
    if (schema.const !== undefined) code += this.buildConst(schema, type, input);
    else if (Array.isArray(type)) code += this.buildMultiType(loc, type, input);
    else code += this.buildSingleType(loc, type, input);
    if (nullable) code += '}\n';
    return code;
  }

  buildRef(loc, input) {
    const target = this.resolve(loc);
    if (this.isSimple(target.schema)) return this.buildValue(target, input);
    return this.callFunction(this.functionFor(target), input);
  }

  functionFor(loc) {
    const origin = this.origin(loc.schema);
    const existing = this.functionNames.get(origin);
    if (existing) return existing;
    const name = this.name('f');
    this.functionNames.set(origin, name);
    const wasBuilding = this.stack.has(origin);
    this.stack.add(origin);
    let body;
    try {
      body = this.buildBody(loc, 'input');
    } finally {
      if (!wasBuilding) this.stack.delete(origin);
    }
    this.functions.push(
      this.bytes
        ? `// ${this.refOf(loc)}\nfunction ${name}(input) {\n${body}}\n`
        : `// ${this.refOf(loc)}\nfunction ${name}(input) {\nlet json = '';\n${body}return json;\n}\n`
    );
    return name;
  }

  buildAllOf(loc, input) {
    const { allOf, ...rest } = loc.schema;
    const locs = [{ schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) }];
    allOf.forEach((schema, i) => locs.push(this.child(this.child(loc, 'allOf'), i)));
    const merged = this.merge(locs);
    return this.buildValue({ schema: merged, base: loc.base, pointer: loc.pointer }, input);
  }

  buildOneOf(loc, input) {
    const keyword = loc.schema.anyOf ? 'anyOf' : 'oneOf';
    const { [keyword]: branches, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const branchesLoc = this.child(loc, keyword);
    let code = '';
    branches.forEach((branch, i) => {
      const branchLoc = this.child(branchesLoc, i);
      const check = this.validator(this.resolve(branchLoc));
      const merged = this.merge([restLoc, branchLoc]);
      const body = this.buildValue({ schema: merged, base: loc.base, pointer: branchLoc.pointer }, input);
      code += `${i === 0 ? 'if' : 'else if'} (${check}(${input})) {\n${body}}\n`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});\n`;
    return code;
  }

  buildIfThenElse(loc, input) {
    const { if: ifSchema, then: thenSchema, else: elseSchema, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const check = this.validator(this.resolve(this.child(loc, 'if')));
    const thenMerged = this.merge([restLoc, this.child(loc, 'then')]);
    const thenCode = this.buildValue({ schema: thenMerged, base: loc.base, pointer: loc.pointer }, input);
    let elseCode;
    if (elseSchema === undefined) {
      elseCode = this.buildValue(restLoc, input);
    } else {
      const elseMerged = this.merge([restLoc, this.child(loc, 'else')]);
      elseCode = this.buildValue({ schema: elseMerged, base: loc.base, pointer: loc.pointer }, input);
    }
    return `if (${check}(${input})) {\n${thenCode}} else {\n${elseCode}}\n`;
  }

  buildConst(schema, type, input) {
    const value = this.lit(JSON.stringify(schema.const));
    if (Array.isArray(type) && type.includes('null')) return `if (${input} === null) ${this.lit('null')}else ${value}`;
    return value;
  }

  buildMultiType(loc, types, input) {
    // fast-json-stringify's order of the types, null first
    const sorted = [...types].sort((type) => (type === 'null' ? -1 : 1));
    let code = '';
    sorted.forEach((type, i) => {
      const keyword = i === 0 ? 'if' : 'else if';
      const body = this.buildSingleType({ ...loc, schema: { ...loc.schema, type } }, type, input);
      let condition;
      switch (type) {
        case 'null':
          condition = `${input} === null`;
          break;
        case 'string':
          condition =
            `typeof ${input} === 'string' || ${input} === null || ${input} instanceof Date || ` +
            `${input} instanceof RegExp || (typeof ${input} === 'object' && ` +
            `typeof ${input}.toString === 'function' && ${input}.toString !== Object.prototype.toString)`;
          break;
        case 'array':
          condition = `Array.isArray(${input})`;
          break;
        case 'integer':
          condition = `Number.isInteger(${input}) || ${input} === null`;
          break;
        default:
          condition = `typeof ${input} === ${quote(type)} || ${input} === null`;
      }
      code += `${keyword} (${condition}) {\n${body}}\n`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});\n`;
    return code;
  }

  buildSingleType(loc, type, input) {
    const { schema } = loc;
    switch (type) {
      case 'null':
        return this.lit('null');
      case 'string':
        switch (schema.format) {
          case 'date-time':
            return this.raw(`asDateTime(${input})`);
          case 'date':
            return this.raw(`asDate(${input})`);
          case 'time':
            return this.raw(`asTime(${input})`);
          case 'unsafe':
            return this.raw(`asUnsafeString(${input})`);
          default:
            return this.bytes
              ? `if (typeof ${input} === 'string') ws(${input});\nelse wr(asStringValue(${input}));\n`
              : `json += typeof ${input} === 'string' ? asString(${input}) : asStringValue(${input});\n`;
        }
      case 'integer':
        return this.bytes ? `wi(${input});\n` : `json += asInteger(${input});\n`;
      case 'number':
        return this.bytes ? `wn(${input});\n` : `json += asNumber(${input});\n`;
      case 'boolean':
        return this.litChoice(input, 'true', 'false');
      case 'object':
        return this.buildObject(loc, input);
      case 'array':
        return this.buildArray(loc, input);
      case undefined:
        return this.raw(`JSON.stringify(${input})`);
      default:
        throw new Error(`${type} unsupported`);
    }
  }

  buildObject(loc, input) {
    const obj = this.name('o');
    const empty = loc.schema.nullable === true ? 'null' : '{}';
    return (
      `const ${obj} = ${input} && typeof ${input}.toJSON === 'function' ? ${input}.toJSON() : ${input};\n` +
      `if (${obj} === null) ${this.lit(empty)}else {\n${this.buildInnerObject(loc, obj)}}\n`
    );
  }

  buildInnerObject(loc, obj) {
    const { schema } = loc;
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    // Required properties first, as fast-json-stringify writes them.
    const keys = Object.keys(properties).sort((a, b) => {
      const ra = required.includes(a);
      const rb = required.includes(b);
      return ra === rb ? 0 : ra ? -1 : 1;
    });
    let code = '';
    for (const key of required) {
      if (!keys.includes(key)) {
        code += `if (${obj}[${quote(key)}] === undefined) throw new Error(${literal(`"${key}" is required!`)});\n`;
      }
    }
    const hasExtra = Boolean(schema.patternProperties || schema.additionalProperties);
    const propertiesLoc = keys.length > 0 ? this.child(loc, 'properties') : null;

    // When the first property is required it is always written (or the serializer throws): the commas after it are
    // known. Otherwise a flag tells whether something was written, and picks the whole literal written before a key:
    // ',"key":' or '{"key":' (one string, not a comma added to the key: each concatenation costs a string).
    const firstRequired = keys.length > 0 && required.includes(keys[0]);
    // One property and nothing else: the object is written whole, '{"key":' + value + '}', or '{}'.
    if (keys.length === 1 && !hasExtra && !firstRequired) {
      const [key] = keys;
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === 'object' ? resolved.schema.default : undefined;
      const value = this.name('v');
      const open = `{${quote(key)}:`;
      const valueCode = this.buildValue(propertyLoc, value);
      const single = this.bytes ? null : /^json \+= ([^\n]+);\n$/.exec(valueCode);
      const written = single
        ? `json += ${literal(open)} + (${single[1]}) + '}';\n`
        : `${this.lit(open)}${valueCode}${this.lit('}')}`;
      const missing = this.lit(defaultValue === undefined ? '{}' : `{${quote(key)}:${JSON.stringify(defaultValue)}}`);
      return `${code}const ${value} = ${obj}[${quote(key)}];\nif (${value} !== undefined) {\n${written}}\nelse ${missing}`;
    }
    const flag = this.name('c');
    if (!firstRequired) code += `let ${flag} = false;\n`;

    keys.forEach((key, i) => {
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === 'object' ? resolved.schema.default : undefined;
      const value = this.name('v');
      const keyJson = `${quote(key)}:`;
      // The literal before the value: its key, after a comma or the brace that opens the object.
      const before = (suffix = '') =>
        firstRequired
          ? this.lit((i === 0 ? '{' : ',') + keyJson + suffix)
          : this.litChoice(flag, `,${keyJson}${suffix}`, `{${keyJson}${suffix}`, `${flag} = true`);
      const valueCode = this.buildValue(propertyLoc, value);
      const written = this.bytes ? before() + valueCode : appendAfter(before(), valueCode);
      code += `const ${value} = ${obj}[${quote(key)}];\nif (${value} !== undefined) {\n${written}}\n`;
      if (defaultValue !== undefined) {
        code += `else {\n${before(JSON.stringify(defaultValue))}}\n`;
      } else if (required.includes(key)) {
        code += `else throw new Error(${literal(`"${key}" is required!`)});\n`;
      }
    });

    if (hasExtra) {
      const comma = firstRequired ? this.lit(',') : this.litChoice(flag, ',', '{', `${flag} = true`);
      code += this.buildExtraProperties(loc, obj, keys, comma);
    }
    code += firstRequired ? this.lit('}') : this.litChoice(flag, '}', '{}');
    return code;
  }

  buildExtraProperties(loc, obj, keys, comma) {
    const { schema } = loc;
    let known = 'false';
    if (keys.length > 0 && keys.length <= 8) {
      known = keys.map((key) => `key === ${quote(key)}`).join(' || ');
    } else if (keys.length > 8) {
      this.patterns.push(new Set(keys));
      known = `p[${this.patterns.length - 1}].has(key)`;
    }
    // The key of a property that is not in "properties", and its colon.
    const writeKey = this.bytes ? 'ws(key);\nwc(58);\n' : "json += asString(key) + ':';\n";
    let code =
      `for (const key of Object.keys(${obj})) {\nif (${known}) continue;\nconst value = ${obj}[key];\n` +
      "if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;\n";
    if (schema.patternProperties) {
      const patternsLoc = this.child(loc, 'patternProperties');
      for (const pattern of Object.keys(schema.patternProperties)) {
        this.patterns.push(new RegExp(pattern));
        const regex = `p[${this.patterns.length - 1}]`;
        code +=
          `if (${regex}.test(key)) {\n${comma}${writeKey}` +
          `${this.buildValue(this.child(patternsLoc, pattern), 'value')}continue;\n}\n`;
      }
    }
    const additional = schema.additionalProperties;
    if (additional === true) {
      code += `${comma}${writeKey}${this.raw('JSON.stringify(value)')}`;
    } else if (additional !== undefined && additional !== false) {
      code += `${comma}${writeKey}${this.buildValue(this.child(loc, 'additionalProperties'), 'value')}`;
    }
    return `${code}}\n`;
  }

  buildArray(loc, input) {
    const { schema } = loc;
    const arr = this.name('a');
    const length = this.name('n');
    const empty = schema.nullable === true ? 'null' : '[]';
    const tuple = Array.isArray(schema.prefixItems)
      ? schema.prefixItems
      : Array.isArray(schema.items)
        ? schema.items
        : null;
    const additional = Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems;
    const mismatch = literal(`The value of '${this.refOf(loc)}' does not match schema definition.`);
    let code =
      `const ${arr} = ${input};\nif (${arr} === null) ${this.lit(empty)}` +
      `else if (!Array.isArray(${arr})) throw new TypeError(${mismatch});\nelse {\nconst ${length} = ${arr}.length;\n`;
    let close = '}\n';
    if (tuple && !additional) {
      code += `if (${length} > ${tuple.length}) throw new Error(${literal(`Item at ${tuple.length} does not match schema definition.`)});\n`;
    }
    if (this.largeArrayMechanism === 'json-stringify') {
      code += `if (${length} >= ${this.largeArraySize}) ${this.raw(`JSON.stringify(${arr})`)}else {\n`;
      close += '}\n';
    }
    code += this.lit('[');
    if (tuple) {
      const tupleLoc = this.child(loc, Array.isArray(schema.prefixItems) ? 'prefixItems' : 'items');
      const flag = this.name('c');
      code += `let ${flag} = false;\n`;
      tuple.forEach((item, i) => {
        let itemLoc = this.child(tupleLoc, i);
        if (itemLoc.schema && itemLoc.schema.$ref) itemLoc = this.resolve(itemLoc);
        const value = this.name('v');
        const condition = typeCondition(itemLoc.schema && itemLoc.schema.type, value);
        code +=
          `if (${i} < ${length}) {\nconst ${value} = ${arr}[${i}];\nif (${condition}) {\n` +
          `if (${flag}) ${this.lit(',')}else ${flag} = true;\n${this.buildValue(itemLoc, value)}}\n` +
          `else throw new Error(${literal(`Item at ${i} does not match schema definition.`)});\n}\n`;
      });
      if (additional) {
        const index = this.name('i');
        code +=
          `for (let ${index} = ${tuple.length}; ${index} < ${length}; ${index} += 1) {\n` +
          `if (${flag}) ${this.lit(',')}else ${flag} = true;\n${this.raw(`JSON.stringify(${arr}[${index}])`)}}\n`;
      }
    } else {
      const itemsLoc = this.child(loc, 'items');
      if (itemsLoc.schema === undefined) itemsLoc.schema = {};
      const index = this.name('i');
      const value = this.name('v');
      code +=
        `for (let ${index} = 0; ${index} < ${length}; ${index} += 1) {\nif (${index} !== 0) ${this.lit(',')}` +
        `const ${value} = ${arr}[${index}];\n${this.buildValue(itemsLoc, value)}}\n`;
    }
    code += this.lit(']');
    return code + close;
  }

  compile(schema) {
    const rootLoc = { schema, base: this.rootId, pointer: '#' };
    const body = this.buildValue(rootLoc, 'input');
    let source =
      "'use strict';\n" +
      'const { asString, asStringValue, asUnsafeString, asInteger, asNumber, asDateTime, asDate, asTime } = rt;\n';
    if (this.bytes) {
      source +=
        'const { begin, end, endBuffer, abort, writeBytes: wb, writeByte: wc, writeRaw: wr, writeString: ws } = w;\n' +
        'const { writeInteger: wi, writeNumber: wn } = rt;\n' +
        this.literals.map((text, i) => `const B${i} = lits[${i}]; // ${JSON.stringify(text)}\n`).join('') +
        `${this.functions.join('\n')}\n` +
        `function write(input) {\n${body}}\n` +
        // A serialization that throws gives the buffer back as it was.
        'function serialize(input) {\nconst start = begin();\ntry {\nwrite(input);\n} catch (error) {\n' +
        'abort(start);\nthrow error;\n}\nreturn end(start);\n}\n' +
        // The same JSON as UTF-8 bytes, for a response to send as they are.
        'serialize.toBuffer = function toBuffer(input) {\nconst start = begin();\ntry {\nwrite(input);\n' +
        '} catch (error) {\nabort(start);\nthrow error;\n}\nreturn endBuffer(start);\n};\n' +
        'return serialize;\n';
      return source;
    }
    const direct = body.match(/^json \+= (f\d+)\(input\);\n$/);
    source += `${this.functions.join('\n')}\n`;
    source += direct
      ? `return ${direct[1]};\n`
      : `return function serialize(input) {\nlet json = '';\n${body}return json;\n};\n`;
    return source;
  }
}

function build(schema, options = {}) {
  if (options.rounding !== undefined && !ROUNDING.has(options.rounding)) {
    throw new Error(`Unsupported integer rounding method ${options.rounding}`);
  }
  if (options.largeArrayMechanism !== undefined && !LARGE_ARRAY_MECHANISMS.has(options.largeArrayMechanism)) {
    throw new Error(`Unsupported large array mechanism ${options.largeArrayMechanism}`);
  }
  if (options.output !== undefined && !OUTPUTS.has(options.output)) {
    throw new Error(`Unsupported output ${options.output}`);
  }
  validateSchema(schema);
  const compileFor = (output) => {
    const builder = new Builder(schema, { ...options, output });
    builder.resolver.addSchema(schema, builder.rootId);
    if (options.schema) {
      for (const key of Object.keys(options.schema)) {
        const external = options.schema[key];
        const id = typeof external.$id === 'string' && external.$id[0] !== '#' ? external.$id : key;
        if (!builder.resolver.hasSchema(id)) {
          validateSchema(external, key);
          builder.resolver.addSchema(external, key);
        }
      }
    }
    return { builder, source: builder.compile(schema) };
  };
  // 'auto': values of a size known by the schema (no arrays, maps or recursion: no loop and no function in the code)
  // are joined as strings; the others are written as bytes.
  const output = options.output || 'auto';
  let compiled = compileFor(output === 'bytes' ? 'bytes' : 'string');
  if (output === 'auto' && (compiled.builder.functions.length > 0 || compiled.source.includes('for ('))) {
    compiled = compileFor('bytes');
  }
  const { builder, source } = compiled;
  if (options.mode === 'debug') return { code: source };
  const literals = builder.literals.map(bytesOf);
  // eslint-disable-next-line no-new-func
  const factory = new Function('rt', 'v', 'p', 'w', 'lits', source);
  return factory(createRuntime(options), builder.validators, builder.patterns, writer, literals);
}

// Two pieces of code of the 'string' output, one after the other: one statement when each is one (one + less).
function appendAfter(first, code) {
  const a = /^json \+= ([^\n]+);\n$/.exec(first);
  const b = /^json \+= ([^\n]+);\n$/.exec(code);
  if (a !== null && b !== null) return `json += (${a[1]}) + (${b[1]});\n`;
  return first + code;
}

function typeCondition(type, value) {
  switch (type) {
    case 'null':
      return `${value} === null`;
    case 'string':
      return (
        `typeof ${value} === 'string' || ${value} === null || ${value} instanceof Date || ${value} instanceof RegExp || ` +
        `(typeof ${value} === 'object' && typeof ${value}.toString === 'function' && ` +
        `${value}.toString !== Object.prototype.toString)`
      );
    case 'integer':
      return `Number.isInteger(${value})`;
    case 'number':
      return `Number.isFinite(${value})`;
    case 'boolean':
      return `typeof ${value} === 'boolean'`;
    case 'object':
      return `${value} && typeof ${value} === 'object' && ${value}.constructor === Object`;
    case 'array':
      return `Array.isArray(${value})`;
    default:
      if (Array.isArray(type)) return `(${type.map((t) => typeCondition(t, value)).join(' || ')})`;
      return 'true';
  }
}

export default build;
build.build = build;
build.default = build;
build.validLargeArrayMechanisms = LARGE_ARRAY_MECHANISMS;

export { build as 'module.exports' };

export { build, LARGE_ARRAY_MECHANISMS as validLargeArrayMechanisms };
