/*! @xufa/schema 0.1.0 | MIT license | https://github.com/xufajs/xufa */
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  // Buffer, for the modules that write bytes (the writer of @xufa/serializer): what they use of it, over Uint8Array
  // and TextEncoder, when the browser has none. In this scope only: nothing is added to the page.
  var Buffer = root.Buffer || (function () {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder();
    class BrowserBuffer extends Uint8Array {
      static allocUnsafe(size) { return new BrowserBuffer(size); }
      static allocUnsafeSlow(size) { return new BrowserBuffer(size); }
      static alloc(size) { return new BrowserBuffer(size); }
      static isBuffer(value) { return value instanceof BrowserBuffer; }
      static byteLength(text) { return typeof text === 'string' ? encoder.encode(text).length : text.byteLength; }
      static concat(list) {
        var out = new BrowserBuffer(list.reduce(function (sum, part) { return sum + part.length; }, 0));
        list.reduce(function (offset, part) { out.set(part, offset); return offset + part.length; }, 0);
        return out;
      }
      static from(value) {
        var bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
        var out = new BrowserBuffer(bytes.length);
        out.set(bytes);
        return out;
      }
      utf8Write(text, offset, length) {
        return encoder.encodeInto(text, this.subarray(offset, offset + length)).written;
      }
      utf8Slice(start, end) {
        return decoder.decode(this.subarray(start, end));
      }
      copy(target, targetStart, sourceStart, sourceEnd) {
        var part = this.subarray(sourceStart || 0, sourceEnd === undefined ? this.length : sourceEnd);
        target.set(part, targetStart || 0);
        return part.length;
      }
      toString(encoding, start, end) {
        return decoder.decode(this.subarray(start || 0, end === undefined ? this.length : end));
      }
    }
    return BrowserBuffer;
  })();
  var modules = {
"@xufa/schema/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  AllOf: () => import_types.AllOf,
  AllOfType: () => import_types.AllOfType,
  Any: () => import_types.Any,
  AnyOf: () => import_types.AnyOf,
  AnyOfType: () => import_types.AnyOfType,
  AnyType: () => import_types.AnyType,
  ArrayOf: () => import_types.ArrayOf,
  ArrayOfType: () => import_types.ArrayOfType,
  Boolean: () => import_types.Boolean,
  BooleanType: () => import_types.BooleanType,
  ClosedSchema: () => import_closed_schema.ClosedSchema,
  Conditional: () => import_types.Conditional,
  ConditionalType: () => import_types.ConditionalType,
  Const: () => import_types.Const,
  Enum: () => import_types.Enum,
  EnumType: () => import_types.EnumType,
  Float: () => import_types.Float,
  FloatType: () => import_types.FloatType,
  Integer: () => import_types.Integer,
  IntegerType: () => import_types.IntegerType,
  KeywordType: () => import_types.KeywordType,
  Never: () => import_types.Never,
  NeverType: () => import_types.NeverType,
  Not: () => import_types.Not,
  NotType: () => import_types.NotType,
  OPTIONAL: () => import_builder.OPTIONAL,
  Obj: () => import_types.Obj,
  ObjType: () => import_types.ObjType,
  OneOf: () => import_types.OneOf,
  OneOfType: () => import_types.OneOfType,
  Ref: () => import_types.Ref,
  RefType: () => import_types.RefType,
  Schema: () => import_schema.Schema,
  String: () => import_types.String,
  StringType: () => import_types.StringType,
  ValidateType: () => import_types.ValidateType,
  Values: () => import_types.Values,
  ValuesType: () => import_types.ValuesType,
  When: () => import_types.When,
  WhenType: () => import_types.WhenType,
  ajvKeywords: () => import_ajv_keywords.ajvKeywords,
  allOf: () => import_types.allOf,
  any: () => import_types.any,
  anyOf: () => import_types.anyOf,
  arrOf: () => import_types.arrOf,
  bool: () => import_types.bool,
  builtInFormats: () => import_json_schema.builtInFormats,
  compileErrors: () => import_compile.compileErrors,
  compileFirstError: () => import_compile.compileFirstError,
  compileIsValid: () => import_compile.compileIsValid,
  compileJsonSchema: () => import_json_schema.compileJsonSchema,
  compileJsonSchemaAsync: () => import_json_schema.compileJsonSchemaAsync,
  compileType: () => import_compile.compileType,
  enumt: () => import_types.enumt,
  float: () => import_types.float,
  fromJsonSchema: () => import_json_schema.fromJsonSchema,
  hasErrors: () => import_types.hasErrors,
  inferJsonSchema: () => import_infer.inferJsonSchema,
  inferSchemaCode: () => import_infer.inferSchemaCode,
  int: () => import_types.int,
  isJsonType: () => import_types.isJsonType,
  isOptional: () => import_builder.isOptional,
  loadJsonSchemas: () => import_json_schema.loadJsonSchemas,
  never: () => import_types.never,
  not: () => import_types.not,
  num: () => import_types.num,
  oallOf: () => import_types.oallOf,
  oany: () => import_types.oany,
  oanyOf: () => import_types.oanyOf,
  oarrOf: () => import_types.oarrOf,
  obj: () => import_types.obj,
  obool: () => import_types.obool,
  oenum: () => import_types.oenum,
  oenumt: () => import_types.oenumt,
  ofloat: () => import_types.ofloat,
  oint: () => import_types.oint,
  oneOf: () => import_types.oneOf,
  onot: () => import_types.onot,
  onum: () => import_types.onum,
  oobj: () => import_types.oobj,
  ooneOf: () => import_types.ooneOf,
  ostr: () => import_types.ostr,
  s: () => import_builder.s,
  standaloneCode: () => import_standalone.standaloneCode,
  standaloneJsonSchema: () => import_standalone.standaloneJsonSchema,
  standaloneModule: () => import_standalone.standaloneModule,
  str: () => import_types.str,
  toErrors: () => import_types.toErrors
});
module.exports = __toCommonJS(schema_exports);
var import_closed_schema = require("./lib/closed-schema.js");
var import_compile = require("./lib/compile.js");
var import_json_schema = require("./lib/json-schema.js");
var import_schema = require("./lib/schema.js");
var import_standalone = require("./lib/standalone.js");
var import_ajv_keywords = require("./lib/ajv-keywords.js");
var import_infer = require("./lib/infer.js");
var import_builder = require("./lib/builder.js");
var import_types = require("./lib/types/index.js");

},
"@xufa/schema/lib/ajv-keywords.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ajv_keywords_exports = {};
__export(ajv_keywords_exports, {
  ajvKeywords: () => ajvKeywords
});
module.exports = __toCommonJS(ajv_keywords_exports);
var import_deep_equal = require("./deep-equal.js");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const list = (value) => Array.isArray(value) ? value : [value];
function expect(isValid, keyword, what) {
  if (!isValid) {
    throw new Error(`Unsupported JSON Schema: "${keyword}" must be ${what}`);
  }
}
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const TYPEOF_NAMES = ["undefined", "string", "number", "object", "function", "boolean", "symbol", "bigint"];
const CONSTRUCTORS = Object.fromEntries(
  ["Object", "Array", "Function", "Number", "String", "Boolean", "Date", "RegExp", "Map", "Set", "Promise", "Buffer"].filter((name) => typeof globalThis[name] === "function").map((name) => [name, globalThis[name]])
);
function regExpOf(value) {
  const what = 'a string "/pattern/flags" or { pattern, flags }';
  if (typeof value === "string") {
    const match = /^\/(.*)\/([a-z]*)$/s.exec(value);
    expect(match !== null, "regexp", what);
    return new RegExp(match[1], match[2]);
  }
  expect(isObject(value) && typeof value.pattern === "string", "regexp", what);
  return new RegExp(value.pattern, value.flags);
}
const unescapeToken = (token) => token.replace(/~1/g, "/").replace(/~0/g, "~");
function deepPropertySchema(pointer, schema, draft) {
  const tokens = pointer.split("/").slice(1).map(unescapeToken);
  const root = {};
  let current = root;
  tokens.forEach((token, i) => {
    const next = i === tokens.length - 1 ? schema : {};
    current.properties = { [token]: next };
    if (/^[0-9]+$/.test(token)) {
      current.type = ["object", "array"];
      current[draft === "2020-12" ? "prefixItems" : "items"] = [
        ...Array.from({ length: Number(token) }, () => ({})),
        next
      ];
    } else {
      current.type = "object";
    }
    current = next;
  });
  return root;
}
function isDefinedAt(data, tokens) {
  let current = data;
  for (let i = 0; i < tokens.length && current; i += 1) {
    current = current[tokens[i]];
  }
  return current !== void 0;
}
function hasUniqueProperty(data, key) {
  const isItem = (item) => item !== null && typeof item === "object";
  const same = (a, b) => a === b || Number.isNaN(a) && Number.isNaN(b) || a !== null && b !== null && typeof a === "object" && typeof b === "object" && (0, import_deep_equal.deepEqual)(a, b);
  if (data.length <= 16) {
    for (let i = 1; i < data.length; i += 1) {
      if (isItem(data[i])) {
        const a = data[i][key];
        for (let j = 0; j < i; j += 1) {
          if (isItem(data[j]) && same(a, data[j][key])) {
            return false;
          }
        }
      }
    }
    return true;
  }
  const primitives = /* @__PURE__ */ new Set();
  const objects = [];
  return data.every((item) => {
    if (!isItem(item)) {
      return true;
    }
    const property = item[key];
    if (property !== null && typeof property === "object") {
      if (objects.some((other) => (0, import_deep_equal.deepEqual)(other, property))) {
        return false;
      }
      objects.push(property);
      return true;
    }
    if (primitives.has(property)) {
      return false;
    }
    primitives.add(property);
    return true;
  });
}
const DEFINITIONS = {
  typeof: {
    compile(value) {
      const names = list(value);
      expect(
        names.every((name) => TYPEOF_NAMES.includes(name)),
        "typeof",
        `one of ${TYPEOF_NAMES.join(", ")}`
      );
      return (data) => names.includes(typeof data);
    },
    message: (value) => `must be of typeof ${list(value).join(" or ")}`
  },
  instanceof: {
    compile(value) {
      const names = list(value);
      const known = Object.keys(CONSTRUCTORS);
      expect(
        names.every((name) => known.includes(name)),
        "instanceof",
        `one of ${known.join(", ")}`
      );
      const constructors = names.map((name) => CONSTRUCTORS[name]);
      return (data) => constructors.some((constructor) => data instanceof constructor);
    },
    message: (value) => `must be an instance of ${list(value).join(" or ")}`
  },
  range: {
    type: "number",
    macro(value) {
      expect(Array.isArray(value) && value.length === 2 && value[0] <= value[1], "range", "[minimum, maximum]");
      return { minimum: value[0], maximum: value[1] };
    }
  },
  exclusiveRange: {
    type: "number",
    macro(value, parentSchema, { draft }) {
      expect(Array.isArray(value) && value.length === 2 && value[0] < value[1], "exclusiveRange", "[minimum, maximum]");
      return draft === "draft-04" ? { minimum: value[0], exclusiveMinimum: true, maximum: value[1], exclusiveMaximum: true } : { exclusiveMinimum: value[0], exclusiveMaximum: value[1] };
    }
  },
  regexp: {
    type: "string",
    compile(value) {
      const regExp = regExpOf(value);
      if (!regExp.global && !regExp.sticky) {
        return regExp;
      }
      return (data) => {
        regExp.lastIndex = 0;
        return regExp.test(data);
      };
    },
    message: (value) => `must match ${regExpOf(value)}`
  },
  uniqueItemProperties: {
    type: "array",
    compile(value) {
      expect(isStringList(value), "uniqueItemProperties", "a list of property names");
      return (data) => {
        if (data.length <= 1) {
          return true;
        }
        for (let k = 0; k < value.length; k += 1) {
          if (!hasUniqueProperty(data, value[k])) {
            return false;
          }
        }
        return true;
      };
    },
    message: (value) => `must have elements with unique ${value.join(", ")}`
  },
  allRequired: {
    type: "object",
    macro(value, parentSchema) {
      expect(typeof value === "boolean", "allRequired", "true or false");
      if (!value) {
        return true;
      }
      expect(isObject(parentSchema.properties), "allRequired", 'next to "properties"');
      return { required: Object.keys(parentSchema.properties) };
    }
  },
  anyRequired: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "anyRequired", "a list of property names");
      return { anyOf: value.map((key) => ({ required: [key] })) };
    }
  },
  oneRequired: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "oneRequired", "a list of property names");
      return { oneOf: value.map((key) => ({ required: [key] })) };
    }
  },
  patternRequired: {
    type: "object",
    compile(value) {
      expect(isStringList(value), "patternRequired", "a list of patterns");
      const regExps = value.map((source) => new RegExp(source, "u"));
      return (data) => {
        const keys = Object.keys(data);
        return regExps.every((regExp) => keys.some((key) => regExp.test(key)));
      };
    },
    message: (value) => `must have keys matching ${value.join(", ")}`
  },
  prohibited: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "prohibited", "a list of property names");
      return { properties: Object.fromEntries(value.map((key) => [key, false])) };
    }
  },
  deepProperties: {
    type: "object",
    macro(value, parentSchema, { draft }) {
      expect(isObject(value), "deepProperties", "an object of schemas by JSON pointer");
      return { allOf: Object.entries(value).map(([pointer, schema]) => deepPropertySchema(pointer, schema, draft)) };
    }
  },
  deepRequired: {
    type: "object",
    compile(value) {
      expect(
        isStringList(value) && value.every((pointer) => pointer.startsWith("/")),
        "deepRequired",
        "a list of JSON pointers"
      );
      const paths = value.map((pointer) => pointer.split("/").slice(1).map(unescapeToken));
      return (data) => paths.every((tokens) => isDefinedAt(data, tokens));
    },
    message: (value, data) => {
      const missing = value.filter((pointer) => !isDefinedAt(data, pointer.split("/").slice(1).map(unescapeToken)));
      return `must have ${missing.join(", ")}`;
    }
  }
};
const LEFT_OUT = {
  transform: "it changes the data (the validator only assigns defaults and removes properties, see useDefaults and removeAdditional)",
  dynamicDefaults: "it computes defaults when validating; use useDefaults with fixed defaults",
  select: "it needs $data references",
  selectCases: "it needs $data references",
  selectDefault: "it needs $data references"
};
function ajvKeywords(names = Object.keys(DEFINITIONS)) {
  return list(names).map((name) => {
    if (hasOwn(LEFT_OUT, name)) {
      throw new Error(`ajvKeywords: "${name}" is not supported: ${LEFT_OUT[name]}`);
    }
    if (!hasOwn(DEFINITIONS, name)) {
      throw new Error(
        `ajvKeywords: unknown keyword "${name}"; the keywords are ${Object.keys(DEFINITIONS).join(", ")}`
      );
    }
    return { keyword: name, ...DEFINITIONS[name] };
  });
}

},
"@xufa/schema/lib/builder.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var builder_exports = {};
__export(builder_exports, {
  OPTIONAL: () => OPTIONAL,
  isOptional: () => isOptional,
  s: () => s
});
module.exports = __toCommonJS(builder_exports);
const OPTIONAL = /* @__PURE__ */ Symbol.for("xufa.schema.optional");
const isSchema = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function check(value, what) {
  if (!isSchema(value)) throw new TypeError(`${what} is a schema (an object)`);
  return value;
}
function copyOf(schema, optional = schema[OPTIONAL] === true) {
  const copy = { ...schema };
  if (optional) Object.defineProperty(copy, OPTIONAL, { value: true, enumerable: false });
  return copy;
}
const typeOfValue = (value) => {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string" || typeof value === "boolean") return typeof value;
  return null;
};
function object(properties, options = {}) {
  check(properties, "s.object(properties)");
  const props = {};
  const required = [];
  for (const [name, schema] of Object.entries(properties)) {
    check(schema, `The property ${name}`);
    props[name] = copyOf(schema, false);
    if (schema[OPTIONAL] !== true) required.push(name);
  }
  const out = { type: "object", properties: props, ...options };
  if (required.length) out.required = required;
  return out;
}
function propertiesOf(schema, what) {
  check(schema, what);
  if (schema.type !== "object" || !isSchema(schema.properties))
    throw new TypeError(`${what} is a schema of s.object()`);
  const required = new Set(schema.required || []);
  const out = {};
  for (const [name, property] of Object.entries(schema.properties)) out[name] = copyOf(property, !required.has(name));
  return out;
}
function optionsOf(schema) {
  const { type, properties, required, ...options } = schema;
  return options;
}
function nullable(schema) {
  check(schema, "s.nullable(schema)");
  const optional = schema[OPTIONAL] === true;
  let out;
  if (typeof schema.type === "string")
    out = { ...schema, type: schema.type === "null" ? "null" : [schema.type, "null"] };
  else if (Array.isArray(schema.type))
    out = { ...schema, type: schema.type.includes("null") ? schema.type : [...schema.type, "null"] };
  else out = { anyOf: [copyOf(schema, false), { type: "null" }] };
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return copyOf(out, optional);
}
const s = {
  string: (options = {}) => ({ type: "string", ...options }),
  number: (options = {}) => ({ type: "number", ...options }),
  integer: (options = {}) => ({ type: "integer", ...options }),
  boolean: (options = {}) => ({ type: "boolean", ...options }),
  null: (options = {}) => ({ type: "null", ...options }),
  // Strings of formats (what JSON has: a date is its text).
  dateTime: (options = {}) => ({ type: "string", format: "date-time", ...options }),
  date: (options = {}) => ({ type: "string", format: "date", ...options }),
  email: (options = {}) => ({ type: "string", format: "email", ...options }),
  uuid: (options = {}) => ({ type: "string", format: "uuid", ...options }),
  uri: (options = {}) => ({ type: "string", format: "uri", ...options }),
  // One value; one of some values.
  literal(value, options = {}) {
    const type = typeOfValue(value);
    if (!type) throw new TypeError("s.literal(value): a string, a number, a boolean or null");
    return { type, const: value, ...options };
  },
  enum(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError("s.enum(values): a list of values");
    const types = [...new Set(values.map(typeOfValue))];
    if (types.includes(null)) throw new TypeError("s.enum(values): strings, numbers, booleans or null");
    const merged = [...new Set(types.map((t) => t === "integer" && types.includes("number") ? "number" : t))];
    return { type: merged.length === 1 ? merged[0] : merged, enum: [...values], ...options };
  },
  array: (items, options = {}) => ({ type: "array", items: copyOf(check(items, "s.array(items)"), false), ...options }),
  // An array of a length, of a schema for each item (draft-07: items as a list).
  tuple(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError("s.tuple(items): a list of schemas");
    return {
      type: "array",
      items: items.map((item, i) => copyOf(check(item, `s.tuple item ${i}`), false)),
      minItems: items.length,
      maxItems: items.length,
      additionalItems: false,
      ...options
    };
  },
  object,
  // An object of any keys, with values of a schema.
  record: (values, options = {}) => ({
    type: "object",
    additionalProperties: copyOf(check(values, "s.record(values)"), false),
    ...options
  }),
  // Any of some schemas (anyOf); all of them (allOf).
  union(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError("s.union(schemas): a list of schemas");
    return { anyOf: schemas.map((schema, i) => copyOf(check(schema, `s.union schema ${i}`), false)), ...options };
  },
  intersect(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError("s.intersect(schemas): a list of schemas");
    return { allOf: schemas.map((schema, i) => copyOf(check(schema, `s.intersect schema ${i}`), false)), ...options };
  },
  // A property that is not required (in s.object()); a value that can be null too.
  optional: (schema) => copyOf(check(schema, "s.optional(schema)"), true),
  nullable,
  // Objects from objects: some of their properties, all of them not required (or required), more of them.
  pick(schema, keys) {
    const properties = propertiesOf(schema, "s.pick(schema)");
    const out = {};
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.pick(): the schema has no property ${key}`);
      out[key] = properties[key];
    }
    return object(out, optionsOf(schema));
  },
  omit(schema, keys) {
    const properties = propertiesOf(schema, "s.omit(schema)");
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.omit(): the schema has no property ${key}`);
      delete properties[key];
    }
    return object(properties, optionsOf(schema));
  },
  partial(schema) {
    const properties = propertiesOf(schema, "s.partial(schema)");
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], true);
    return object(properties, optionsOf(schema));
  },
  required(schema) {
    const properties = propertiesOf(schema, "s.required(schema)");
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], false);
    return object(properties, optionsOf(schema));
  },
  extend(schema, more, options = {}) {
    const properties = propertiesOf(schema, "s.extend(schema)");
    check(more, "s.extend(schema, properties)");
    return object({ ...properties, ...more }, { ...optionsOf(schema), ...options });
  },
  // A shared schema (app.addSchema(schema) with its $id): { $ref: 'Book#' }.
  ref: (id, options = {}) => ({ $ref: id, ...options }),
  // Anything; nothing.
  any: (options = {}) => ({ ...options }),
  unknown: (options = {}) => ({ ...options }),
  never: (options = {}) => ({ not: {}, ...options })
};
const isOptional = (schema) => isSchema(schema) && schema[OPTIONAL] === true;

},
"@xufa/schema/lib/closed-schema.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var closed_schema_exports = {};
__export(closed_schema_exports, {
  ClosedSchema: () => ClosedSchema
});
module.exports = __toCommonJS(closed_schema_exports);
var import_schema = require("./schema.js");
class ClosedSchema extends import_schema.Schema {
  constructor(schema = {}, options = {}) {
    super(schema, { ...options, isOpen: false });
  }
}

},
"@xufa/schema/lib/coerce.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var coerce_exports = {};
__export(coerce_exports, {
  COERCIBLE: () => COERCIBLE,
  CoerceType: () => CoerceType,
  TYPE_TESTS: () => TYPE_TESTS,
  coerce: () => coerce,
  coerceSpecOf: () => coerceSpecOf,
  readCoerced: () => readCoerced
});
module.exports = __toCommonJS(coerce_exports);
var import_validate_type = require("./types/validate-type.js");
var indexModule = __toESM(require("./types/index.js"));
const COERCIBLE = ["string", "number", "integer", "boolean", "null"];
const TYPE_TESTS = {
  string: (x) => typeof x === "string",
  number: (x) => typeof x === "number" && Number.isFinite(x),
  integer: (x) => Number.isInteger(x),
  boolean: (x) => typeof x === "boolean",
  null: (x) => x === null,
  object: (x) => x !== null && typeof x === "object" && !Array.isArray(x),
  array: (x) => Array.isArray(x)
};
const isNumeric = (x) => typeof x === "string" && x !== "" && !Number.isNaN(Number(x));
const COERCIONS = {
  string: (x) => {
    if (typeof x === "number" || typeof x === "boolean") {
      return String(x);
    }
    return x === null ? "" : void 0;
  },
  number: (x) => typeof x === "boolean" || x === null || isNumeric(x) ? Number(x) : void 0,
  integer: (x) => typeof x === "boolean" || x === null || isNumeric(x) && Number(x) % 1 === 0 ? Number(x) : void 0,
  boolean: (x) => {
    if (x === "false" || x === 0 || x === null) {
      return false;
    }
    return x === "true" || x === 1 ? true : void 0;
  },
  null: (x) => x === "" || x === 0 || x === false ? null : void 0,
  array: (x) => x === null || ["string", "number", "boolean"].includes(typeof x) ? [x] : void 0
};
function coerce(value, spec) {
  const matches = (x) => spec.types.some((type) => TYPE_TESTS[type](x));
  if (matches(value)) {
    return { value, assign: false };
  }
  let current = value;
  let converted;
  if (spec.array && Array.isArray(current) && current.length === 1) {
    [current] = current;
    if (matches(current)) {
      converted = current;
    }
  }
  for (let i = 0; i < spec.to.length && converted === void 0; i += 1) {
    converted = COERCIONS[spec.to[i]](current);
  }
  return converted === void 0 ? { value: current, assign: false } : { value: converted, assign: true };
}
let TYPES;
function coerceSpecOf(type, seen = []) {
  if (!type) {
    return void 0;
  }
  if (type.coerceSpec) {
    return type.coerceSpec;
  }
  if (TYPES === void 0) TYPES = indexModule;
  const { RefType, AllOfType } = TYPES;
  if (type.constructor === RefType && !seen.includes(type)) {
    return coerceSpecOf(type.getTarget(), [...seen, type]);
  }
  if (type.constructor === AllOfType) {
    for (let i = 0; i < type.types.length; i += 1) {
      const spec = coerceSpecOf(type.types[i], seen);
      if (spec) {
        return spec;
      }
    }
  }
  return void 0;
}
function readCoerced(container, key, type, value) {
  const spec = value === void 0 ? void 0 : coerceSpecOf(type);
  if (!spec) {
    return value;
  }
  const result = coerce(value, spec);
  if (result.assign) {
    container[key] = result.value;
  }
  return result.value;
}
class CoerceType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super({ ...options, isMandatory: false, isNullable: true });
    this.type = options.type;
    this.spec = options.spec;
  }
  converted(value) {
    return value === void 0 ? value : coerce(value, this.spec).value;
  }
  validate(value, fieldName = void 0) {
    return this.type.validate(this.converted(value), fieldName);
  }
  errors(value, fieldName = void 0) {
    return this.type.errors(this.converted(value), fieldName);
  }
  isValid(value) {
    return this.type.isValid(this.converted(value));
  }
}

},
"@xufa/schema/lib/compile.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var compile_exports = {};
__export(compile_exports, {
  compileErrors: () => compileErrors,
  compileFirstError: () => compileFirstError,
  compileIsValid: () => compileIsValid,
  compileType: () => compileType,
  generateSource: () => generateSource
});
module.exports = __toCommonJS(compile_exports);
var import_deep_equal = require("./deep-equal.js");
var import_validate_type = require("./types/validate-type.js");
var import_schema = require("./schema.js");
var import_closed_schema = require("./closed-schema.js");
var import_types = require("./types/index.js");
var import_one_of = require("./types/one-of.js");
var import_keyword = require("./types/keyword.js");
var import_string = require("./types/string.js");
var import_formats = require("./formats.js");
var import_defaults = require("./defaults.js");
var import_coerce = require("./coerce.js");
var import_code_point_length = require("./types/code-point-length.js");
var import_has_duplicates = require("./types/has-duplicates.js");
var import_unevaluated = require("./unevaluated.js");
var import_error_objects = require("./error-objects.js");
const TIME_PREFIXES = /* @__PURE__ */ new Map([
  [import_formats.FORMAT_COMPARES.time, "2020-01-01T"],
  [import_formats.FORMAT_COMPARES["date-time"], ""]
]);
const FORMAT_LIMIT_FAILS = {
  formatMinimum: "< 0",
  formatMaximum: "> 0",
  formatExclusiveMinimum: "<= 0",
  formatExclusiveMaximum: ">= 0"
};
function staticPath(path) {
  if (!path.startsWith("[") || !path.endsWith("]")) {
    return void 0;
  }
  try {
    const value = JSON.parse(path);
    return Array.isArray(value) && value.every((item) => typeof item === "string" || Number.isInteger(item)) ? value : void 0;
  } catch (e) {
    return void 0;
  }
}
function literalOf(code) {
  try {
    const value = JSON.parse(code);
    return typeof value === "string" || Number.isInteger(value) ? value : void 0;
  } catch (e) {
    return void 0;
  }
}
const MAX_INLINE_KEYS = 8;
const MAX_INLINE_CODE = 4e3;
const JSON_TYPE_CHECKS = {
  object: (v) => `typeof ${v} === 'object' && !Array.isArray(${v})`,
  array: (v) => `Array.isArray(${v})`,
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`
};
const KEYWORD_TYPE_CHECKS = {
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
  integer: (v) => `Number.isInteger(${v})`,
  boolean: (v) => `typeof ${v} === 'boolean'`,
  object: (v) => `(typeof ${v} === 'object' && !Array.isArray(${v}))`,
  array: (v) => `Array.isArray(${v})`,
  null: () => "false"
};
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const COERCE_TYPE_TESTS = {
  string: (x) => `typeof ${x} === 'string'`,
  number: (x) => `(typeof ${x} === 'number' && Number.isFinite(${x}))`,
  integer: (x) => `Number.isInteger(${x})`,
  boolean: (x) => `typeof ${x} === 'boolean'`,
  null: (x) => `${x} === null`,
  object: (x) => `(${x} !== null && typeof ${x} === 'object' && !Array.isArray(${x}))`,
  array: (x) => `Array.isArray(${x})`
};
const COERCE_CODE = {
  string: (x, t) => [
    [`${t} === 'number' || ${t} === 'boolean'`, `"" + ${x}`],
    [`${x} === null`, '""']
  ],
  number: (x, t) => [
    [`${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}))`, `+${x}`]
  ],
  integer: (x, t) => [
    [
      `${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}) && +${x} % 1 === 0)`,
      `+${x}`
    ]
  ],
  boolean: (x) => [
    [`${x} === "false" || ${x} === 0 || ${x} === null`, "false"],
    [`${x} === "true" || ${x} === 1`, "true"]
  ],
  null: (x) => [[`${x} === "" || ${x} === 0 || ${x} === false`, "null"]],
  array: (x, t) => [[`${t} === 'string' || ${t} === 'number' || ${t} === 'boolean' || ${x} === null`, `[${x}]`]]
};
const missingCode = (x, { empty }) => empty ? `${x} === undefined || ${x} === null || ${x} === ""` : `${x} === undefined`;
function literalCode(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `(${JSON.stringify(value)})` : void 0;
  }
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    const items = value.map(literalCode);
    return items.every((item) => item !== void 0) ? `[${items.join(", ")}]` : void 0;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value).map((key) => [key, literalCode(value[key])]);
    return entries.every(([, item]) => item !== void 0) ? `{ ${entries.map(([key, item]) => `[${JSON.stringify(key)}]: ${item}`).join(", ")} }` : void 0;
  }
  return void 0;
}
function ownerOf(obj, name) {
  let proto = obj;
  while (proto && !hasOwn(proto, name)) {
    proto = Object.getPrototypeOf(proto);
  }
  return proto;
}
function checksThroughValidate(type) {
  const validateOwner = ownerOf(type, "validate");
  const isValidOwner = ownerOf(type, "isValid");
  return validateOwner !== isValidOwner && Object.prototype.isPrototypeOf.call(isValidOwner, validateOwner);
}
function valuePath(path) {
  if (path === "undefined") {
    return '"Value"';
  }
  return path === "p" ? '(p === undefined ? "Value" : p)' : path;
}
function literalValue(code) {
  const last = code.length - 1;
  if (last < 1 || code.charCodeAt(0) !== 34 || code.charCodeAt(last) !== 34) {
    return void 0;
  }
  const inner = code.slice(1, last);
  return inner.indexOf('"') === -1 && inner.indexOf("\\") === -1 ? inner : void 0;
}
const TEXT_CODES = /* @__PURE__ */ new Map();
function messageCode(name, suffix, fold) {
  let text = TEXT_CODES.get(suffix);
  if (text === void 0) {
    text = JSON.stringify(suffix);
    if (TEXT_CODES.size < 1e4) TEXT_CODES.set(suffix, text);
  }
  if (fold) {
    const known = literalValue(name);
    if (known !== void 0) {
      return `"${known}${text.slice(1)}`;
    }
  }
  return `${name} + ${text}`;
}
function schemaName(path, fold) {
  if (fold) {
    const known = literalValue(path);
    if (known !== void 0) {
      return known ? path : '"Value"';
    }
  }
  return path === "undefined" ? '"Value"' : `(${path} || "Value")`;
}
function keyPath(path, key, fold) {
  if (path === "undefined") {
    return key;
  }
  if (fold) {
    const field = literalValue(path);
    const name = literalValue(key);
    if (field !== void 0 && name !== void 0) {
      return field ? `"${field}.${name}"` : key;
    }
  }
  return `J(${path}, ${key})`;
}
function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
function valuesMessage(values) {
  if (values.length === 1) {
    return ` must be equal to ${formatValue(values[0])}`;
  }
  return ` must be one of: ${values.map(formatValue).join(", ")}`;
}
const OBJECT_METHODS = ["constructor", "valueOf", "toString"];
function isPlainValue(value) {
  if (value === null || typeof value !== "object") {
    return typeof value !== "bigint" && typeof value !== "symbol" && typeof value !== "function";
  }
  if (Array.isArray(value)) {
    return Object.getPrototypeOf(value) === Array.prototype && Object.keys(value).length === value.length && value.every(isPlainValue);
  }
  return Object.getPrototypeOf(value) === Object.prototype && !OBJECT_METHODS.some((key) => hasOwn(value, key)) && Object.values(value).every(isPlainValue);
}
function equalsCode(value, x) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Number.isNaN(value)) {
      return `(typeof ${x} === 'number' && ${x} !== ${x})`;
    }
    if (typeof value === "number") {
      return `${x} === ${Number.isFinite(value) ? `(${value})` : `${value > 0 ? "" : "-"}Infinity`}`;
    }
    return `${x} === ${value === void 0 ? "undefined" : JSON.stringify(value)}`;
  }
  const isObject = `typeof ${x} === 'object' && ${x} !== null`;
  if (Array.isArray(value)) {
    const items = value.map((item, i) => equalsCode(item, `${x}[${i}]`));
    return `(${[isObject, `${x}.constructor === Array`, `${x}.length === ${value.length}`, ...items].join(" && ")})`;
  }
  const keys = Object.keys(value);
  const entries = keys.map((key) => {
    const literal = JSON.stringify(key);
    return `H.call(${x}, ${literal}) && ${equalsCode(value[key], `${x}[${literal}]`)}`;
  });
  return `(${[isObject, `${x}.constructor === Object`, `Object.keys(${x}).length === ${keys.length}`, ...entries].join(
    " && "
  )})`;
}
function firstError(type, value, fieldName) {
  return (0, import_types.toErrors)(type.errors(value, fieldName))[0];
}
function pushErrors(out, type, value, fieldName) {
  const errors = (0, import_types.toErrors)(type.errors(value, fieldName));
  if (errors.length === 0) {
    return out;
  }
  return out === void 0 ? errors : out.concat(errors);
}
function customErrors(type, value, path) {
  const params = { type: type.constructor.name };
  return (0, import_types.toErrors)(type.errors(value, path.length > 0 ? (0, import_error_objects.pathName)(path) : void 0)).map(
    (message) => (0, import_error_objects.errorObject)(path, "custom", params, message)
  );
}
function firstErrorObject(type, value, path) {
  return customErrors(type, value, path)[0];
}
function pushErrorObjects(out, type, value, path) {
  const errors = customErrors(type, value, path);
  if (errors.length === 0) {
    return out;
  }
  return out === void 0 ? errors : out.concat(errors);
}
const NO_MESSAGE = Object.freeze({ text: () => "", path: "undefined", keyword: "", params: "{}" });
function messageAt(path, text, keyword, params = "{}") {
  return { text, path, keyword, params };
}
const HELPER_SOURCE = (structured) => `"use strict";
return [
  Object.prototype.hasOwnProperty,
  Object.prototype,
  function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; },
  function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; },
  ${structured ? "function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }" : "function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }"},
];`;
const HELPERS = new Function(HELPER_SOURCE(false))();
const STRUCTURED_HELPERS = new Function(HELPER_SOURCE(true))();
class Generator {
  // `structured`: errors as objects (see error-objects.js), with the paths of the values as arrays of keys and
  // indexes instead of their names.
  // `fold`: the option foldMessages (see messageCode()).
  constructor(mode, structured = false, fold = false) {
    this.mode = mode;
    this.structured = structured;
    this.fold = fold;
    this.constants = [];
    this.nodes = [];
    this.functions = [];
    this.checkFunctions = /* @__PURE__ */ new Map();
    this.evaluatedFunctions = { properties: /* @__PURE__ */ new Map(), items: /* @__PURE__ */ new Map() };
    this.refFunctions = { check: /* @__PURE__ */ new Map(), first: /* @__PURE__ */ new Map(), all: /* @__PURE__ */ new Map() };
    this.count = 0;
    this.visiting = /* @__PURE__ */ new Set();
    this.fail = "return false;";
    this.scope = 0;
    this.scopes = 0;
    this.sharedMatches = /* @__PURE__ */ new Map();
    this.plainOneOfs = /* @__PURE__ */ new Map();
    this.plainDeclared = /* @__PURE__ */ new Set();
    this.plainUsed = /* @__PURE__ */ new Set();
    this.mayRepeat = false;
  }
  // Runs `generate` as the body of another generated function.
  inScope(generate) {
    const { scope } = this;
    this.scopes += 1;
    this.scope = this.scopes;
    const result = generate();
    this.scope = scope;
    return result;
  }
  name(prefix) {
    this.count += 1;
    return `${prefix}${this.count}`;
  }
  constant(value) {
    this.constants.push(value);
    return `c[${this.constants.length - 1}]`;
  }
  number(value) {
    return typeof value === "number" && Number.isFinite(value) ? `(${value})` : this.constant(value);
  }
  node(type) {
    let index = this.nodes.indexOf(type);
    if (index === -1) {
      this.nodes.push(type);
      index = this.nodes.length - 1;
    }
    return `n[${index}]`;
  }
  // Statement for a failed check; `message` gives the message expression and is only called when needed.
  // The error of a failed check: `message` gives the code of its text, and says the path of the value, the keyword
  // and the code of its params (see messageAt()). Errors are texts, or objects when structured.
  emit(message) {
    if (this.mode === "check") {
      return this.fail;
    }
    let text = message.text();
    let { path } = message;
    const known = this.structured ? staticPath(path) : void 0;
    if (known) {
      const pointer = known.map((key) => `/${`${key}`.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
      const object = `{ path: ${path}, pointer: ${JSON.stringify(pointer)}, keyword: ${JSON.stringify(message.keyword)}, params: ${message.params}, message: ${text} }`;
      return this.mode === "first" ? `return ${object};` : `out = P(out, ${object});`;
    }
    let assign = "";
    if (this.structured && path.length > 3) {
      text = text.split(path).join("q");
      assign = `q = ${path}, `;
      path = "q";
    }
    const error = this.structured ? `(${assign}${this.constant(import_error_objects.errorObject)}(${path}, ${JSON.stringify(message.keyword)}, ${message.params}, ${text}))` : text;
    return this.mode === "first" ? `return ${error};` : `out = P(out, ${error});`;
  }
  // Code of the path of the value itself: undefined (no name), or an empty array when structured.
  rootPath() {
    return this.structured ? "[]" : "undefined";
  }
  // Code of the name of the value at `path`, as messages start with it; a Schema is "Value" at the root.
  nameOf(path, isSchema) {
    if (!this.structured) {
      return isSchema ? schemaName(path, this.fold) : valuePath(path);
    }
    const known = staticPath(path);
    if (known) {
      return JSON.stringify((0, import_error_objects.pathName)(known));
    }
    const name = `${this.constant(import_error_objects.pathName)}(${path})`;
    return isSchema ? `(${name} || "Value")` : name;
  }
  // Code of the path of the key `key` (code) of the object at `path`.
  keyOf(path, key) {
    if (!this.structured) {
      return keyPath(path, key, this.fold);
    }
    const known = staticPath(path);
    if (known && literalOf(key) !== void 0) {
      return JSON.stringify([...known, literalOf(key)]);
    }
    return path === "[]" ? `[${key}]` : `${path}.concat([${key}])`;
  }
  // Code of the path of the element `index` (code) of the array at `path`, whose name is `name`.
  indexOf(path, name, index) {
    if (!this.structured) {
      return `(${name} + "[" + ${index} + "]")`;
    }
    const known = staticPath(path);
    if (known && literalOf(String(index)) !== void 0) {
      return JSON.stringify([...known, literalOf(String(index))]);
    }
    return path === "[]" ? `[${index}]` : `${path}.concat([${index}])`;
  }
  // Code of the path of a key checked by propertyNames, as a value: its name is "Key <name>".
  propertyNameOf(path, key) {
    if (!this.structured) {
      return `("Key " + ${keyPath(path, key, this.fold)})`;
    }
    return path === "[]" ? `[{ key: ${key} }]` : `${path}.concat([{ key: ${key} }])`;
  }
  // Checks [condition, message, pre] run in order until one fails; `rest` runs when none fails. The optional `pre`
  // statements run just before their condition, only when the previous checks passed.
  chain(checks, rest = "") {
    let code = "";
    for (let i = 0; i < checks.length; i += 1) {
      const [condition, message, pre] = checks[i];
      if (pre) {
        const remaining = this.chain([[condition, message], ...checks.slice(i + 1)], rest);
        return `${code}${i ? "else " : ""}{
${pre}${remaining}}
`;
      }
      code += `${i ? "else " : ""}if (${condition}) { ${this.emit(message)} }
`;
    }
    if (!rest) {
      return code;
    }
    return checks.length ? `${code}else {
${rest}}
` : rest;
  }
  // Generates a separate function in 'check' mode, where a failure returns false.
  inFunction(generate) {
    const { mode, fail, visiting } = this;
    this.mode = "check";
    this.fail = "return false;";
    this.visiting = /* @__PURE__ */ new Set();
    const body = this.inScope(generate);
    this.mode = mode;
    this.fail = fail;
    this.visiting = visiting;
    return body;
  }
  // Name of a boolean function checking `type`, shared by every use of the same node.
  checkFunction(type) {
    if (!this.checkFunctions.has(type)) {
      const name = this.name("check");
      this.checkFunctions.set(type, name);
      const body = this.inFunction(() => this.generate(type, "x", "undefined"));
      this.functions.push(`function ${name}(x) {
${body}return true;
}
`);
    }
    return this.checkFunctions.get(type);
  }
  // Code that runs `onPass` when the value in `v` satisfies `type`. The check is inlined in a labelled block that a
  // failure breaks out of, which avoids a function call; a long one goes into a function instead.
  inlineCheck(type, v, onPass) {
    const { mode, fail } = this;
    const label = this.name("L");
    this.mode = "check";
    this.fail = `break ${label};`;
    const written = [...this.sharedMatches.values()].map((shared) => [shared, shared.written]);
    const body = this.generate(type, v, "undefined");
    this.mode = mode;
    this.fail = fail;
    if (body.length > MAX_INLINE_CODE) {
      written.forEach(([shared, wasWritten]) => {
        shared.written = wasWritten;
      });
      return `if (${this.checkFunction(type)}(${v})) { ${onPass} }
`;
    }
    return `${label}: {
${body}${onPass}
}
`;
  }
  // Name of the function validating a reference target in the current mode. It takes the value and, to build
  // messages, the field name (and the error list in 'all' mode), so recursive schemas call it again.
  refFunction(target) {
    const functions = this.refFunctions[this.mode];
    if (!functions.has(target)) {
      const name = this.name(`ref_${this.mode}`);
      functions.set(target, name);
      const params = { check: "x", first: "x, p", all: "x, p, out" }[this.mode];
      const end = {
        check: "return true;",
        first: "return undefined;",
        all: "return out;"
      }[this.mode];
      const { visiting, fail } = this;
      this.visiting = /* @__PURE__ */ new Set();
      this.fail = "return false;";
      let body = this.inScope(() => this.generate(target, "x", this.mode === "check" ? "undefined" : "p"));
      if (this.structured && this.mode !== "check") {
        body = `let q;
${body}`;
      }
      this.visiting = visiting;
      this.fail = fail;
      this.functions.push(`function ${name}(${params}) {
${body}${end}
}
`);
    }
    return functions.get(target);
  }
  // Like RefType: undefined is checked here, any other value by the target.
  ref(type, v, path) {
    const onUndefined = type.isMandatory ? this.emit(messageAt(path, () => messageCode(this.nameOf(path, false), " is mandatory", this.fold), "required")) : "";
    const target = type.getTarget();
    const fn = this.refFunction(target);
    let call = `if (!${fn}(${v})) { ${this.fail} }
`;
    if (this.mode === "first") {
      const e = this.name("e");
      call = `const ${e} = ${fn}(${v}, ${path});
if (${e} !== undefined) { return ${e}; }
`;
    } else if (this.mode === "all") {
      call = `out = ${fn}(${v}, ${path}, out);
`;
    }
    if (this.mode !== "check" && !/^(undefined|p|\[\]|"[^"\\]*")$/.test(path)) {
      const { mode } = this;
      this.mode = "check";
      const check = this.refFunction(target);
      this.mode = mode;
      call = `if (!${check}(${v})) {
${call}}
`;
    }
    return `if (${v} === undefined) { ${onUndefined} } else {
${call}}
`;
  }
  // Code validating the value held in variable `v` against `type`, with `path` giving its field name. When `known`
  // names a JSON type, the value is known to be of that type (so neither undefined nor null): presence and that type
  // are not checked again. Types that accept every value give no code.
  generate(type, v, path, known = void 0) {
    if (type.constructor === import_types.RefType) {
      return this.ref(type, v, path);
    }
    if (type.constructor === import_coerce.CoerceType) {
      return this.coerceCode(type.spec, v) + this.generate(type.type, v, path, known);
    }
    if (this.visiting.has(type)) {
      return this.custom(type, v, path);
    }
    this.visiting.add(type);
    const isSchema = type.constructor === import_schema.Schema || type.constructor === import_closed_schema.ClosedSchema;
    const name = this.nameOf(path, isSchema);
    const body = this.body(type, v, path, name, known);
    this.visiting.delete(type);
    if (body === void 0) {
      return this.custom(type, v, path);
    }
    const checks = this.chain(body.checks, body.rest);
    if (known) {
      return checks;
    }
    const text = (suffix, keyword) => this.mode === "check" ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword);
    const onUndefined = type.isMandatory ? this.emit(text(" is mandatory", "required")) : "";
    const onNull = type.isNullable ? "" : this.emit(text(" cannot be null", "nullable"));
    if (!onUndefined && !onNull) {
      return checks ? `if (${v} !== undefined && ${v} !== null) {
${checks}}
` : "";
    }
    return `if (${v} === undefined) { ${onUndefined} } else if (${v} === null) { ${onNull} } else {
${checks}}
`;
  }
  custom(type, v, path) {
    const node = this.node(type);
    const invalid = checksThroughValidate(type) ? `${this.constant(import_types.hasErrors)}(${node}.validate(${v}))` : `!${node}.isValid(${v})`;
    let onInvalid = this.fail;
    if (this.mode === "first") {
      onInvalid = `return r(${node}, ${v}, ${path});`;
    } else if (this.mode === "all") {
      onInvalid = `out = a(out, ${node}, ${v}, ${path});`;
    }
    return `if (${invalid}) { ${onInvalid} }
`;
  }
  // Checks for a value that is neither undefined nor null, as { checks, rest }; undefined when the type is not a
  // built-in one.
  body(type, v, path, name, known) {
    const text = (suffix, keyword, params) => this.mode === "check" ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword, params);
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema:
        return this.schema(type, v, path, name, text, known);
      case import_types.ObjType:
        return {
          checks: [
            [
              `typeof ${v} !== 'object' || Array.isArray(${v})`,
              text(" must be an object", "type", "{ type: 'object' }")
            ]
          ],
          rest: type.schema ? this.generate(type.schema, v, path) : ""
        };
      case import_types.ArrayOfType:
        return this.arrayOf(type, v, path, name, text, known);
      case import_unevaluated.UnevaluatedType:
        return this.unevaluated(type, v, path, name);
      case import_types.AllOfType:
        return { checks: [], rest: this.allOf(type, v, path, known) };
      case import_types.ConditionalType: {
        if (!type.thenType && !type.elseType) {
          return { checks: [], rest: "" };
        }
        const branch = (branchType) => branchType ? this.generate(branchType, v, path) : "";
        const ok = this.name("ok");
        const rest = `let ${ok} = false;
${this.inlineCheck(type.ifType, v, `${ok} = true;`)}if (${ok}) {
${branch(
          type.thenType
        )}} else {
${branch(type.elseType)}}
`;
        return { checks: [], rest };
      }
      case import_types.AnyOfType:
        return { checks: [], rest: this.anyOf(type, v, path) };
      case import_types.OneOfType:
        return this.oneOf(type, v, path, text);
      case import_keyword.KeywordType:
        return { checks: [this.keyword(type, v, path, name)] };
      case import_types.NotType: {
        const ok = this.name("ok");
        const pre = `let ${ok} = false;
${this.inlineCheck(type.type, v, `${ok} = true;`)}`;
        return {
          checks: [[ok, text(" must not match the excluded schema", "not"), pre]]
        };
      }
      case import_types.StringType:
        return { checks: this.string(type, v, text, known) };
      case import_types.EnumType:
        return {
          checks: [
            ...this.string(type, v, text, known),
            [
              `!${this.constant(new Set(type.options))}.has(${v})`,
              text(
                ` must be one of: ${type.options.join(", ")}`,
                "enum",
                `{ allowedValues: ${JSON.stringify(type.options)} }`
              )
            ]
          ]
        };
      case import_types.FloatType:
        return { checks: this.float(type, v, text) };
      case import_types.IntegerType:
        return {
          checks: [
            ...this.float(type, v, text),
            [`!Number.isInteger(${v})`, text(" must be an integer", "type", "{ type: 'integer' }")]
          ]
        };
      case import_types.BooleanType:
        return {
          checks: [[`typeof ${v} !== 'boolean'`, text(" must be a boolean", "type", "{ type: 'boolean' }")]]
        };
      case import_types.AnyType:
        return { checks: [] };
      case import_types.NeverType:
        return { checks: [["true", text(" is not allowed", "false")]] };
      case import_types.ValuesType:
        return {
          checks: [
            [this.notOneOf(type.values, v), text(valuesMessage(type.values), ...this.valuesKeyword(type.values))]
          ]
        };
      case import_types.WhenType:
        if (known === type.jsonType) {
          return { checks: [], rest: this.generate(type.type, v, path, known) };
        }
        return {
          checks: [],
          rest: `if (${JSON_TYPE_CHECKS[type.jsonType](v)}) {
${this.generate(type.type, v, path, type.jsonType)}}
`
        };
      default:
        return void 0;
    }
  }
  string(type, v, text, known) {
    const checks = known === "string" ? [] : [[`typeof ${v} !== 'string'`, text(" must be a string", "type", "{ type: 'string' }")]];
    const count = () => `${this.constant(import_code_point_length.codePointLength)}(${v})`;
    if (type.min !== void 0) {
      const allowEmpty = type.allowEmpty ?? !type.isMandatory;
      const min = this.number(type.min);
      const tooShort = type.countCodePoints ? `(${v}.length < ${min} || (${v}.length < 2 * ${min} && ${count()} < ${min}))` : `${v}.length < ${min}`;
      checks.push([
        allowEmpty ? `${tooShort} && ${v}.length !== 0` : tooShort,
        text(` must be at least ${type.min} characters long`, "minLength", `{ limit: ${this.number(type.min)} }`)
      ]);
    }
    if (type.max !== void 0) {
      const max = this.number(type.max);
      const tooLong = type.countCodePoints ? `(${v}.length > 2 * ${max} || (${v}.length > ${max} && ${count()} > ${max}))` : `${v}.length > ${max}`;
      checks.push([
        tooLong,
        text(` must be at most ${type.max} characters long`, "maxLength", `{ limit: ${this.number(type.max)} }`)
      ]);
    }
    if (type.pattern) {
      checks.push([
        `!${this.constant(type.pattern)}.test(${v})`,
        text(" does not match the required pattern", "pattern", `{ pattern: ${JSON.stringify(type.pattern.source)} }`)
      ]);
    }
    if (type.formatCheck !== void 0) {
      const check = this.constant(type.formatCheck);
      const matches = type.formatCheck instanceof RegExp ? `${check}.test(${v})` : `${check}(${v})`;
      checks.push([
        `!${matches}`,
        text(` must be a valid ${type.format}`, "format", `{ format: ${JSON.stringify(type.format)} }`)
      ]);
    }
    let ms;
    type.formatLimits.forEach(({ keyword, limit, compare }) => {
      const { text: words, comparison } = import_string.FORMAT_LIMITS[keyword];
      const literal = JSON.stringify(limit);
      const message = text(` must be ${words} ${limit}`, keyword, `{ comparison: "${comparison}", limit: ${literal} }`);
      const operator = FORMAT_LIMIT_FAILS[keyword].slice(0, -2);
      if (compare === import_formats.FORMAT_COMPARES.date) {
        checks.push([`${v} ${operator} ${literal}`, message]);
      } else if (TIME_PREFIXES.has(compare)) {
        const prefix = TIME_PREFIXES.get(compare);
        const limitMs = (/* @__PURE__ */ new Date(`${prefix}${limit}`)).valueOf();
        if (limitMs) {
          let pre;
          if (!ms) {
            ms = this.name("ms");
            pre = `const ${ms} = new Date(${prefix ? `"${prefix}" + ` : ""}${v}).valueOf();
`;
          }
          checks.push([`${ms} && ${ms} ${operator} ${limitMs}`, message, pre]);
        }
      } else {
        checks.push([`${this.constant(compare)}(${v}, ${literal}) ${FORMAT_LIMIT_FAILS[keyword]}`, message]);
      }
    });
    return checks;
  }
  float(type, v, text) {
    const limits = [
      [type.min, "<", "must be at least", "minimum"],
      [type.max, ">", "must be at most", "maximum"],
      [type.exclusiveMin, "<=", "must be greater than", "exclusiveMinimum"],
      [type.exclusiveMax, ">=", "must be less than", "exclusiveMaximum"]
    ];
    const checks = [
      [`!Number.isFinite(${v})`, text(" must be a number", "type", "{ type: 'number' }")],
      ...limits.filter(([limit]) => limit !== void 0).map(([limit, operator, message, keyword]) => [
        `${v} ${operator} ${this.number(limit)}`,
        text(` ${message} ${limit}`, keyword, `{ limit: ${this.number(limit)} }`)
      ])
    ];
    if (type.multipleOf !== void 0) {
      const division = `${v} / ${this.number(type.multipleOf)}`;
      const notMultiple = type.multipleOfPrecision === void 0 ? `!Number.isInteger(${division})` : `Math.abs(Math.round(${division}) - ${division}) > 1e-${type.multipleOfPrecision}`;
      checks.push([
        notMultiple,
        text(
          ` must be a multiple of ${type.multipleOf}`,
          "multipleOf",
          `{ multipleOf: ${this.number(type.multipleOf)} }`
        )
      ]);
    }
    return checks;
  }
  // Like ValuesType: `v` (neither undefined nor null) is deep-equal to none of the values. Plain values are compared
  // with code written for them; others with deepEqual(), only for objects as it is false for anything else.
  // Keyword and params of the message of a ValuesType: const for one value, enum for several.
  valuesKeyword(values) {
    if (values.length === 1) {
      return ["const", this.structured ? `{ allowedValue: ${this.constant(values[0])} }` : "{}"];
    }
    return ["enum", this.structured ? `{ allowedValues: ${this.constant(values)} }` : "{}"];
  }
  notOneOf(values, v) {
    const matches = [];
    values.forEach((value) => {
      if (value === void 0 || value === null) {
      } else if (isPlainValue(value)) {
        matches.push(equalsCode(value, v));
      } else if (typeof value === "object") {
        matches.push(`(typeof ${v} === 'object' && ${this.constant(import_deep_equal.deepEqual)}(${this.constant(value)}, ${v}))`);
      } else {
        matches.push(`${v} === ${this.constant(value)}`);
      }
    });
    return matches.length ? `!(${matches.join(" || ")})` : "true";
  }
  // The parts run in order; in 'all' mode each one adds its errors, like AllOfType.validate(). They get the field
  // name of the allOf as it is (`path`), so a Schema part names its keys as it does on its own.
  allOf(type, v, path, known = void 0) {
    this.mayRepeat = this.mayRepeat || type.types.length > 1;
    const shared = this.shareMatches(type, v);
    let code = shared.map(({ vars }) => `let ${vars.join(" = false, ")} = false;
`).join("");
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    if (declares) this.plainUsed.delete(plain);
    const parts = type.types.map((item) => this.generate(item, v, path, known)).join("");
    if (declares) {
      this.plainDeclared.delete(plain);
      if (this.plainUsed.has(plain)) {
        this.plainUsed.delete(plain);
        code += `const ${v}plain = ${v}.__proto__ === OP;
`;
      }
    }
    code += parts;
    shared.forEach(({ oneOf, previous }) => {
      if (previous === void 0) {
        this.sharedMatches.delete(oneOf);
      } else {
        this.sharedMatches.set(oneOf, previous);
      }
    });
    return code;
  }
  // The oneOf parts of an allOf whose matching alternatives an "unevaluated*" part of the same allOf needs: oneOf()
  // records them in variables that the allOf declares, and evaluatedCondition() reads them instead of checking the
  // alternatives again. They belong to the value in `v` and to the function being written.
  shareMatches(type, v) {
    const oneOfs = /* @__PURE__ */ new Set();
    type.types.filter((item) => item.constructor === import_unevaluated.UnevaluatedType).forEach(
      (unevaluated) => unevaluated.siblings.filter((sibling) => sibling.constructor === import_types.OneOfType && type.types.includes(sibling)).filter((sibling) => (0, import_unevaluated.staticEvaluatedBy)(unevaluated.kind, sibling) === void 0).forEach((sibling) => oneOfs.add(sibling))
    );
    return [...oneOfs].map((oneOf) => {
      const previous = this.sharedMatches.get(oneOf);
      const vars = oneOf.types.map(() => this.name("matched"));
      this.sharedMatches.set(oneOf, {
        vars,
        v,
        scope: this.scope,
        written: false
      });
      return { oneOf, previous, vars };
    });
  }
  // The variables holding which alternatives of `oneOf` match the value in `v`, when oneOf() wrote them in the
  // function being written; undefined otherwise.
  matchesOf(oneOf, v) {
    const shared = this.sharedMatches.get(oneOf);
    return shared && shared.written && shared.v === v && shared.scope === this.scope ? shared.vars : void 0;
  }
  // Code for a value that no alternative accepts: the errors of every alternative, like AnyOfType.validate().
  noneMatches(types, v, path) {
    if (this.mode === "check") {
      return this.fail;
    }
    if (this.mode === "first") {
      return this.generate(types[0], v, path);
    }
    this.mayRepeat = this.mayRepeat || types.length > 1;
    return types.map((item) => this.generate(item, v, path)).join("");
  }
  // The alternatives get the field name as it is, like the parts of an allOf.
  anyOf(type, v, path) {
    if (!type.types || type.types.length === 0) {
      return "";
    }
    const ok = this.name("ok");
    let code = `let ${ok} = false;
`;
    type.types.forEach((item, i) => {
      const check = this.inlineCheck(item, v, `${ok} = true;`);
      code += i ? `if (!${ok}) {
${check}}
` : check;
    });
    return `${code}if (!${ok}) {
${this.noneMatches(type.types, v, path)}}
`;
  }
  // Counts up to two matching alternatives, like OneOfType.countMatches().
  oneOf(type, v, path, text) {
    if (type.types.length === 0) {
      return {
        checks: [["true", text(" must match exactly one schema, but matches none", "oneOf", "{ passing: 0 }")]]
      };
    }
    const shared = this.sharedMatches.get(type);
    const record = shared && shared.v === v && shared.scope === this.scope ? shared : void 0;
    if (type.discriminator) {
      const others = record ? this.countedOneOf(type, v, path, text, record) : void 0;
      return { checks: [], rest: this.discriminated(type, v, path, record, others) };
    }
    return { checks: [], rest: this.countedOneOf(type, v, path, text, record) };
  }
  // Code counting the alternatives the value matches, up to two, recording them in `record` when given.
  countedOneOf(type, v, path, text, record) {
    const m = this.name("m");
    let rest = `let ${m} = 0;
`;
    type.types.forEach((item, i) => {
      const onPass = record ? `${m} += 1; ${record.vars[i]} = true;` : `${m} += 1;`;
      const check = this.inlineCheck(item, v, onPass);
      rest += i > 1 ? `if (${m} < 2) {
${check}}
` : check;
    });
    if (record) {
      record.written = true;
    }
    const more = this.emit(
      text(" must match exactly one schema, but matches more than one", "oneOf", "{ passing: 2 }")
    );
    if (this.mode === "check") {
      rest += `if (${m} !== 1) { ${this.fail} }
`;
    } else {
      rest += `if (${m} === 0) {
${this.noneMatches(type.types, v, path)}} else if (${m} > 1) { ${more} }
`;
    }
    return rest;
  }
  // Code calling the function that validates `type` in the current mode (see refFunction()), for the value in `v`.
  callFunction(type, v, path) {
    const fn = this.refFunction(type);
    if (this.mode === "first") {
      const e = this.name("e");
      return `const ${e} = ${fn}(${v}, ${path});
if (${e} !== undefined) { return ${e}; }
`;
    }
    return this.mode === "all" ? `out = ${fn}(${v}, ${path}, out);
` : `if (!${fn}(${v})) { ${this.fail} }
`;
  }
  // Code setting variable `d` to what the discriminator of `type` picks for the value in `x`, like OneOfType.pick().
  pickCode(type, x, d) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name("t");
    const literal = JSON.stringify(tag);
    const values = [...mapping.keys()];
    const chain = values.map((value) => `${t} === ${JSON.stringify(value)} ? ${mapping.get(value)} : `).join("");
    return `let ${d} = ${import_one_of.EVERY_TYPE};
if (typeof ${x} === 'object' && ${x} !== null && !Array.isArray(${x})) {
const ${t} = H.call(${x}, ${literal}) ? ${x}[${literal}] : undefined;
${d} = ${chain}${auto ? import_one_of.EVERY_TYPE : import_one_of.NO_TYPE};
}
`;
  }
  // Like OneOfType.validate() with a discriminator: an object is checked against the alternative the value of its tag
  // (an own property) picks. An object whose tag picks none gets an error about the tag at its path, or with a
  // discriminator found in a plain oneOf (`auto`) is checked as by oneOf, like other values. Those go to a function
  // of their own (they are rare, and the validator stays small).
  // With `record`, the alternative that matches is recorded there, and `others` checks the other values.
  discriminated(type, v, path, record = void 0, others = void 0) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name("t");
    const tagPath = this.keyOf(path, JSON.stringify(tag));
    const error = (suffix, kind) => this.emit(
      messageAt(
        tagPath,
        () => messageCode(this.nameOf(tagPath, false), suffix, this.fold),
        "discriminator",
        `{ error: "${kind}", tag: ${JSON.stringify(tag)}, tagValue: ${t} }`
      )
    );
    const values = [...mapping.keys()];
    const literal = JSON.stringify(tag);
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    const isPlainOwn = tag in Object.prototype ? "" : `${v}plain || `;
    if (isPlainOwn) this.plainUsed.add(plain);
    let code = declares ? `const ${v}plain = ${v}.__proto__ === OP;
` : "";
    code += `let ${t} = ${v}[${literal}];
`;
    code += `if (${t} !== undefined && !(${isPlainOwn}H.call(${v}, ${literal}))) { ${t} = undefined; }
`;
    type.types.forEach((item, i) => {
      const picks = values.filter((value) => mapping.get(value) === i).map((value) => `${t} === ${JSON.stringify(value)}`);
      let branch = this.generate(item, v, path, "object");
      if (record) {
        const matched = record.vars[i];
        const onFail = this.mode === "check" ? this.fail : this.generate(item, v, path, "object");
        branch = `${this.inlineCheck(item, v, `${matched} = true;`)}if (!${matched}) {
${onFail}}
`;
      }
      code += `${i ? "else " : ""}if (${picks.join(" || ")}) {
${branch}}
`;
    });
    if (declares) {
      this.plainDeclared.delete(plain);
    }
    if (!this.plainOneOfs.has(type)) {
      this.plainOneOfs.set(type, new import_types.OneOfType({ types: type.types, isMandatory: false, isNullable: true }));
    }
    const rest = others || this.callFunction(this.plainOneOfs.get(type), v, path);
    if (auto) {
      const unknown = this.mode === "check" ? this.fail : rest;
      code += `else if (${t} === undefined) {
${rest}} else {
${unknown}}
`;
    } else {
      code += `else if (${t} === undefined) { ${error(" is mandatory", "tag")} }
`;
      code += `else if (typeof ${t} !== 'string') { ${error(" must be a string", "tag")} }
`;
      code += `else { ${error(valuesMessage(values), "mapping")} }
`;
    }
    return `if (typeof ${v} === 'object' && !Array.isArray(${v})) {
${code}} else {
${rest}}
`;
  }
  // Code assigning the defaults ([{ key, value, empty }], see assignDefaults()) missing in the object or array in `v`:
  // each validation assigns a new copy.
  defaultsCode(v, defaults = []) {
    return defaults.map((entry) => {
      const property = `${v}[${JSON.stringify(entry.key)}]`;
      return `if (${missingCode(property, entry)}) { ${property} = ${this.copyCode(entry.value)}; }
`;
    }).join("");
  }
  // Code converting the value in variable `x` for a schema with `spec` (see coerce() in coerce.js) and, with `place`,
  // writing the converted value there (the property or element it was read from).
  coerceCode(spec, x, place = void 0) {
    if (!spec) {
      return "";
    }
    const matches = (value) => spec.types.map((type) => COERCE_TYPE_TESTS[type](value)).join(" || ");
    const c = this.name("c");
    const t = this.name("t");
    let code = `if (${x} !== undefined && !(${matches(x)})) {
let ${c};
`;
    if (spec.array) {
      code += `if (Array.isArray(${x}) && ${x}.length === 1) {
${x} = ${x}[0];
if (${matches(x)}) { ${c} = ${x}; }
}
`;
    }
    const conversions = spec.to.flatMap((type) => COERCE_CODE[type](x, t));
    code += `const ${t} = typeof ${x};
if (${c} === undefined) {
`;
    code += conversions.map(([condition, value], i) => `${i ? "else " : ""}if (${condition}) { ${c} = ${value}; }
`).join("");
    code += `}
if (${c} !== undefined) { ${x} = ${c};${place ? ` ${place} = ${c};` : ""} }
}
`;
    return code;
  }
  // Code of a new copy of a default value.
  copyCode(value) {
    const copy = literalCode(value);
    return copy === void 0 ? `${this.constant(import_defaults.copyDefault)}(${this.constant(value)})` : copy;
  }
  // A keyword of your own, like KeywordType.validate(): its function is called with the value, when the value is of
  // one of its JSON types.
  keyword(type, v, path, name) {
    const applies = type.jsonTypes ? `(${type.jsonTypes.map((jsonType) => KEYWORD_TYPE_CHECKS[jsonType](v)).join(" || ")}) && ` : "";
    const text = typeof type.message === "function" ? () => `${name} + " " + ${this.constant(type.message)}(${v})` : () => `${name} + ${JSON.stringify(` ${type.message}`)}`;
    const passes = type.check instanceof RegExp ? `${this.constant(type.check)}.test(${v})` : `${this.constant(type.check)}(${v})`;
    return [`${applies}!${passes}`, messageAt(path, text, type.keyword)];
  }
  arrayOf(type, v, path, name, text, known) {
    const checks = known === "array" ? [] : [[`!Array.isArray(${v})`, text(" must be an array", "type", "{ type: 'array' }")]];
    if (type.min !== void 0) {
      checks.push([
        `${v}.length < ${this.number(type.min)}`,
        text(` must have at least ${type.min} elements`, "minItems", `{ limit: ${this.number(type.min)} }`)
      ]);
    }
    if (type.max !== void 0) {
      checks.push([
        `${v}.length > ${this.number(type.max)}`,
        text(` must have at most ${type.max} elements`, "maxItems", `{ limit: ${this.number(type.max)} }`)
      ]);
    }
    if (type.unique) {
      checks.push([`${this.constant(import_has_duplicates.hasDuplicates)}(${v})`, text(" must not have duplicate elements", "uniqueItems")]);
    }
    const min = type.minContains === void 0 ? 1 : type.minContains;
    if (type.contains && (min !== 1 || type.maxContains !== void 0)) {
      const count = this.name("count");
      const i = this.name("i");
      const x = this.name("v");
      const stop = type.maxContains === void 0 ? min : type.maxContains + 1;
      const pre = `let ${count} = 0;
for (let ${i} = 0; ${i} < ${v}.length && ${count} < ${this.number(
        stop
      )}; ${i} += 1) {
const ${x} = ${v}[${i}];
${this.inlineCheck(type.contains, x, `${count} += 1;`)}}
`;
      const containsChecks = [];
      if (min > 0) {
        const atLeast = min === 1 ? "one matching element" : `${min} matching elements`;
        containsChecks.push([
          `${count} < ${this.number(min)}`,
          text(` must contain at least ${atLeast}`, "minContains", `{ limit: ${this.number(min)} }`)
        ]);
      }
      if (type.maxContains !== void 0) {
        const atMost = type.maxContains === 1 ? "one matching element" : `${type.maxContains} matching elements`;
        containsChecks.push([
          `${count} > ${this.number(type.maxContains)}`,
          text(` must contain at most ${atMost}`, "maxContains", `{ limit: ${this.number(type.maxContains)} }`)
        ]);
      }
      if (containsChecks.length > 0) {
        containsChecks[0].push(pre);
        checks.push(...containsChecks);
      }
    } else if (type.contains) {
      const found = this.name("found");
      const i = this.name("i");
      const x = this.name("v");
      const pre = `let ${found} = false;
for (let ${i} = 0; ${i} < ${v}.length && !${found}; ${i} += 1) {
const ${x} = ${v}[${i}];
${this.inlineCheck(
        type.contains,
        x,
        `${found} = true;`
      )}}
`;
      checks.push([`!${found}`, text(" must contain at least one matching element", "contains"), pre]);
    }
    let rest = "";
    const defaults = this.defaultsCode(v, type.defaults);
    if (defaults) {
      const first = known === "array" ? 0 : 1;
      if (checks.length > first) {
        const [condition, message, pre = ""] = checks[first];
        checks[first] = [condition, message, defaults + pre];
      } else {
        rest += defaults;
      }
    }
    if (Array.isArray(type.type)) {
      type.type.forEach((item, i) => {
        const x = this.name("v");
        rest += `let ${x} = ${v}[${i}];
${this.coerceCode((0, import_coerce.coerceSpecOf)(item), x, `${v}[${i}]`)}`;
        rest += this.generate(item, x, this.indexOf(path, name, i));
      });
      if (type.additionalType) {
        const i = this.name("i");
        const x = this.name("v");
        rest += `for (let ${i} = ${type.type.length}; ${i} < ${v}.length; ${i} += 1) {
let ${x} = ${v}[${i}];
`;
        rest += this.coerceCode((0, import_coerce.coerceSpecOf)(type.additionalType), x, `${v}[${i}]`);
        rest += `${this.generate(type.additionalType, x, this.indexOf(path, name, i))}}
`;
      }
    } else if (type.type) {
      const i = this.name("i");
      const x = this.name("v");
      rest += `for (let ${i} = 0; ${i} < ${v}.length; ${i} += 1) {
let ${x} = ${v}[${i}];
`;
      rest += this.coerceCode((0, import_coerce.coerceSpecOf)(type.type), x, `${v}[${i}]`);
      rest += `${this.generate(type.type, x, this.indexOf(path, name, i))}}
`;
    }
    return { checks, rest };
  }
  // Name of a function (x, s) that adds to the Set s the keys (kind 'properties') or the indexes ('items') of the
  // value x that `types` evaluate, and returns true when they evaluate all of them, like evaluated() in
  // unevaluated.js. `key` names the function: a type, or an UnevaluatedType for the group of its siblings.
  evaluatedFunction(kind, key, types) {
    const functions = this.evaluatedFunctions[kind];
    if (!functions.has(key)) {
      const name = this.name("evaluated");
      functions.set(key, name);
      const body = this.inScope(() => types.map((item) => this.evaluatedCode(kind, item)).join(""));
      this.functions.push(`function ${name}(x, s) {
${body}return false;
}
`);
    }
    return functions.get(key);
  }
  // Condition on the key in variable `k`: one of the keys or patterns in `known`. Empty when there are none.
  acceptedKey(known, k) {
    const keys = [...known.keys];
    const declared = keys.length <= MAX_INLINE_KEYS ? keys.map((key) => `${k} === ${JSON.stringify(key)}`) : [`${this.constant(known.keys)}.has(${k})`];
    const terms = [...declared, ...known.patterns.map((pattern) => `${this.constant(pattern)}.test(${k})`)];
    return terms.length > 1 ? `(${terms.join(" || ")})` : terms.join("");
  }
  // Statements of an evaluated function (value in x, Set in s) for a part that evaluates the same for every value.
  staticEvaluatedCode(kind, known) {
    if (known.all) {
      return "return true;\n";
    }
    if (kind === "items") {
      const i = this.name("i");
      return known.prefix > 0 ? `for (let ${i} = 0; ${i} < ${known.prefix} && ${i} < x.length; ${i} += 1) { s.add(${i}); }
` : "";
    }
    const k = this.name("k");
    const accepted = this.acceptedKey(known, k);
    return accepted ? `for (const ${k} in x) {
if (H.call(x, ${k}) && (${accepted})) { s.add(${k}); }
}
` : "";
  }
  // Statements of an evaluated function (value in x, Set in s) for what `type` evaluates.
  evaluatedCode(kind, type) {
    const known = (0, import_unevaluated.staticEvaluatedBy)(kind, type);
    if (known !== void 0) {
      return this.staticEvaluatedCode(kind, known);
    }
    const check = (item) => this.checkFunction(item);
    const code = (item) => this.evaluatedCode(kind, item);
    const onMatch = (item) => `if (${check(item)}(x)) {
${code(item)}}
`;
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema: {
        const declared = {
          all: false,
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
          prefix: 0
        };
        let result = this.staticEvaluatedCode(kind, declared);
        type.dependencies.filter((dependency) => dependency.type).forEach((dependency) => {
          result += `if (H.call(x, ${JSON.stringify(dependency.key)})) {
${onMatch(dependency.type)}}
`;
        });
        return result;
      }
      case import_types.ArrayOfType: {
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const i = this.name("i");
        const tuple = this.staticEvaluatedCode(kind, {
          all: false,
          keys: /* @__PURE__ */ new Set(),
          patterns: [],
          prefix
        });
        const contains = `if (${check(type.contains)}(x[${i}])) { s.add(${i}); }
`;
        return `${tuple}for (let ${i} = 0; ${i} < x.length; ${i} += 1) {
${contains}}
`;
      }
      case import_types.AllOfType:
        return type.types.map(code).join("");
      case import_types.AnyOfType:
        return type.types.map(onMatch).join("");
      case import_types.OneOfType: {
        const oks = type.types.map(() => this.name("ok"));
        const d = this.name("d");
        const pick = type.discriminator ? this.pickCode(type, "x", d) : "";
        const picks = (i) => type.discriminator ? `(${d} === ${import_one_of.EVERY_TYPE} || ${d} === ${i}) && ` : "";
        const matches = pick + type.types.map((item, i) => `const ${oks[i]} = ${picks(i)}${check(item)}(x);
`).join("");
        const chosen = type.types.map((item, i) => `if (${oks[i]}) {
${code(item)}}
`).join("");
        return `${matches}if (${oks.join(" + ")} === 1) {
${chosen}}
`;
      }
      case import_types.ConditionalType: {
        const branch = (item) => item ? onMatch(item) : "";
        const ifTrue = `${code(type.ifType)}${branch(type.thenType)}`;
        return `if (${check(type.ifType)}(x)) {
${ifTrue}} else {
${branch(type.elseType)}}
`;
      }
      case import_types.RefType: {
        const target = type.getTarget();
        return `if (${this.evaluatedFunction(kind, target, [target])}(x, s)) { return true; }
`;
      }
      case import_types.WhenType:
        return type.jsonType === import_unevaluated.JSON_TYPES[kind] ? code(type.type) : "";
      case import_unevaluated.UnevaluatedType: {
        const siblings = type.siblings.map(code).join("");
        return type.kind === kind ? `if (${check(type)}(x)) { return true; }
${siblings}` : siblings;
      }
      default:
        return "";
    }
  }
  // Condition that is true when `type` evaluates the key (kind 'properties') or index ('items') in variable `k` of the
  // value in `v`, like evaluated() in unevaluated.js. It adds to `prelude` the statements that compute, once, which
  // subschemas the value satisfies. Undefined when a reference leads to a part that depends on the value, which may
  // be recursive: an evaluated function handles that case.
  evaluatedCondition(kind, type, v, k, prelude) {
    const known = (0, import_unevaluated.staticEvaluatedBy)(kind, type);
    if (known !== void 0) {
      if (known.all) {
        return "true";
      }
      if (kind === "items") {
        return known.prefix > 0 ? `${k} < ${known.prefix}` : "false";
      }
      return this.acceptedKey(known, k) || "false";
    }
    const matches = (item) => {
      const ok = this.name("ok");
      prelude.push(`const ${ok} = ${this.checkFunction(item)}(${v});
`);
      return ok;
    };
    const condition = (item) => this.evaluatedCondition(kind, item, v, k, prelude);
    const any = (parts) => parts.some((part) => part === void 0) ? void 0 : `(${parts.join(" || ")})`;
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema: {
        const declared = {
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern)
        };
        const parts = [this.acceptedKey(declared, k) || "false"];
        type.dependencies.filter((dependency) => dependency.type).forEach((dependency) => {
          const ok = this.name("ok");
          const literal = JSON.stringify(dependency.key);
          prelude.push(`const ${ok} = H.call(${v}, ${literal}) && ${this.checkFunction(dependency.type)}(${v});
`);
          const inner = condition(dependency.type);
          parts.push(inner === void 0 ? void 0 : `(${ok} && ${inner})`);
        });
        return any(parts);
      }
      case import_types.ArrayOfType: {
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const contains = `${this.checkFunction(type.contains)}(${v}[${k}])`;
        return prefix > 0 ? `(${k} < ${prefix} || ${contains})` : contains;
      }
      case import_types.AllOfType:
        return any(type.types.map(condition));
      case import_types.AnyOfType:
        return any(
          type.types.map((item) => {
            const inner = condition(item);
            return inner === void 0 ? void 0 : `(${matches(item)} && ${inner})`;
          })
        );
      case import_types.OneOfType: {
        let oks = this.matchesOf(type, v);
        if (!oks && type.discriminator) {
          const d = this.name("d");
          prelude.push(this.pickCode(type, v, d));
          oks = type.types.map((item, i) => {
            const ok = this.name("ok");
            prelude.push(
              `const ${ok} = (${d} === ${import_one_of.EVERY_TYPE} || ${d} === ${i}) && ${this.checkFunction(item)}(${v});
`
            );
            return ok;
          });
        }
        oks = oks || type.types.map(matches);
        const one = this.name("one");
        prelude.push(`const ${one} = ${oks.join(" + ")} === 1;
`);
        const chosen = any(
          type.types.map((item, i) => {
            const inner = condition(item);
            return inner === void 0 ? void 0 : `(${oks[i]} && ${inner})`;
          })
        );
        return chosen === void 0 ? void 0 : `(${one} && ${chosen})`;
      }
      case import_types.ConditionalType: {
        const okIf = matches(type.ifType);
        const parts = [];
        const ifPart = condition(type.ifType);
        parts.push(ifPart === void 0 ? void 0 : `(${okIf} && ${ifPart})`);
        [
          [type.thenType, okIf],
          [type.elseType, `!${okIf}`]
        ].forEach(([branch, taken]) => {
          if (branch) {
            const ok = this.name("ok");
            prelude.push(`const ${ok} = ${taken} && ${this.checkFunction(branch)}(${v});
`);
            const inner = condition(branch);
            parts.push(inner === void 0 ? void 0 : `(${ok} && ${inner})`);
          }
        });
        return any(parts);
      }
      case import_types.WhenType:
        return type.jsonType === import_unevaluated.JSON_TYPES[kind] ? condition(type.type) : "false";
      case import_unevaluated.UnevaluatedType: {
        const siblings = any(type.siblings.map(condition));
        if (type.kind !== kind || siblings === void 0) {
          return siblings;
        }
        return `(${matches(type)} || ${siblings})`;
      }
      case import_types.RefType:
        return void 0;
      default:
        return "false";
    }
  }
  // "unevaluatedProperties"/"unevaluatedItems": a loop over the keys or elements the other keywords leave. The loop
  // skips directly what the keywords that evaluate the same for every value evaluate, like "additionalProperties",
  // and what the others evaluate for the value through a condition on the subschemas it satisfies (or, when a
  // reference makes that impossible, through a Set that a generated function fills first).
  unevaluated(type, v, path, name) {
    const isFixed = (item) => (0, import_unevaluated.staticEvaluatedBy)(type.kind, item) !== void 0;
    const known = (0, import_unevaluated.staticEvaluatedByAll)(type.kind, type.siblings.filter(isFixed));
    const varying = type.siblings.filter((item) => !isFixed(item));
    if (known.all) {
      return { checks: [], rest: "" };
    }
    const k = this.name(type.kind === "items" ? "i" : "k");
    const prelude = [];
    const conditions = varying.map((item) => this.evaluatedCondition(type.kind, item, v, k, prelude));
    let evaluated = conditions.includes(void 0) ? void 0 : conditions.join(" || ");
    let collect = prelude.join("");
    let close = "";
    if (evaluated === void 0) {
      const done = this.name("done");
      collect = `const ${done} = new Set();
if (!${this.evaluatedFunction(type.kind, type, varying)}(${v}, ${done})) {
`;
      close = "}\n";
      evaluated = `${done}.has(${k})`;
    }
    const x = this.name("v");
    if (type.kind === "items") {
      const code2 = this.generate(type.type, x, this.indexOf(path, name, k));
      if (!code2) {
        return { checks: [], rest: "" };
      }
      const skip2 = evaluated ? `if (${evaluated}) { continue; }
` : "";
      let rest2 = `if (Array.isArray(${v})) {
${collect}for (let ${k} = ${known.prefix}; ${k} < ${v}.length; ${k} += 1) {
`;
      rest2 += `${skip2}const ${x} = ${v}[${k}];
${code2}}
${close}}
`;
      return { checks: [], rest: rest2 };
    }
    const keyName = this.keyOf(path, k);
    let code;
    if (type.type.constructor === import_types.NeverType) {
      const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
      code = this.emit(messageAt(keyName, unexpected, "unevaluatedProperties", `{ property: ${k} }`));
    } else {
      const inner = this.generate(type.type, x, keyName);
      if (!inner) {
        return { checks: [], rest: "" };
      }
      code = `const ${x} = ${v}[${k}];
${inner}`;
    }
    const accepted = [this.acceptedKey(known, k), evaluated].filter(Boolean).join(" || ");
    const skip = accepted ? ` || ${accepted}` : "";
    let rest = `if (typeof ${v} === 'object' && !Array.isArray(${v})) {
${collect}for (const ${k} in ${v}) {
`;
    rest += `if (!H.call(${v}, ${k})${skip}) { continue; }
${code}}
${close}}
`;
    return { checks: [], rest };
  }
  // Same order as Schema.errors(): declared keys, then extra keys, then property counts.
  schema(type, v, path, name, text, known) {
    let keysCode = "";
    const hasDefaults = type.defaults !== void 0 && type.defaults.length > 0;
    const defaultOf = hasDefaults ? new Map(type.defaults.map((entry) => [entry.key, entry])) : void 0;
    type.keys.forEach((key) => {
      const x = this.name("v");
      const literal = JSON.stringify(key);
      const code = this.generate(type.schema[key], x, this.keyOf(path, literal));
      if (code) {
        keysCode += `let ${x} = ${v}[${literal}];
`;
        const isOwn = `(!${v}plain || ${literal} in OP) && !H.call(${v}, ${literal})`;
        this.plainUsed.add(`${this.scope}:${v}`);
        const entry = hasDefaults ? defaultOf.get(key) : void 0;
        if (entry) {
          defaultOf.delete(key);
          const copy = `${x} = ${v}[${literal}] = ${this.copyCode(entry.value)};`;
          keysCode += `if (${missingCode(x, entry)}) { ${copy} } else if (${isOwn}) { ${x} = undefined; }
`;
        } else {
          keysCode += `if (${x} !== undefined && ${isOwn}) { ${x} = undefined; }
`;
        }
        keysCode += this.coerceCode((0, import_coerce.coerceSpecOf)(type.schema[key]), x, `${v}[${literal}]`);
        keysCode += code;
      } else if (hasDefaults && defaultOf.has(key)) {
        keysCode += this.defaultsCode(v, [defaultOf.get(key)]);
        defaultOf.delete(key);
      }
    });
    const isDeclared = this.plainDeclared.has(`${this.scope}:${v}`);
    let rest = keysCode && !isDeclared ? `const ${v}plain = ${v}.__proto__ === OP;
${keysCode}` : keysCode;
    if (hasDefaults) {
      rest = this.defaultsCode(v, [...defaultOf.values()]) + rest;
    }
    const checkExtra = !type.isOpen || type.additionalType || type.removeAdditional;
    const countKeys = type.minProperties !== void 0 || type.maxProperties !== void 0;
    const { patternTypes } = type;
    if (checkExtra || countKeys || patternTypes.length > 0 || type.propertyNameType) {
      const count = this.name("count");
      const k = this.name("k");
      const keyName = this.keyOf(path, k);
      rest += `let ${count} = 0;
for (const ${k} in ${v}) {
`;
      rest += `if (!H.call(${v}, ${k})) { continue; }
${count} += 1;
`;
      if (type.propertyNameType) {
        rest += this.generate(type.propertyNameType, k, this.propertyNameOf(path, k));
      }
      const matched = this.name("matched");
      this.mayRepeat = this.mayRepeat || patternTypes.length > 1;
      if (patternTypes.length > 0) {
        rest += `let ${matched} = false;
`;
        patternTypes.forEach(({ pattern, type: patternType }) => {
          const x = this.name("v");
          rest += `if (${this.constant(pattern)}.test(${k})) {
${matched} = true;
let ${x} = ${v}[${k}];
`;
          rest += this.coerceCode((0, import_coerce.coerceSpecOf)(patternType), x, `${v}[${k}]`);
          rest += `${this.generate(patternType, x, keyName)}}
`;
        });
      }
      if (checkExtra) {
        const keys = type.removeAdditional && type.propertyKeys ? type.propertyKeys : type.keys;
        const declared = keys.length <= MAX_INLINE_KEYS ? keys.map((key) => `${k} === ${JSON.stringify(key)}`).join(" || ") || "false" : `${this.constant(new Set(keys))}.has(${k})`;
        const accepted = patternTypes.length > 0 ? `${declared} || ${matched}` : declared;
        rest += `if (!(${accepted})) {
`;
        const remove = `delete ${v}[${k}];
`;
        if (type.removeAdditional === "delete") {
          rest += remove;
        } else if (type.removeAdditional === "failing") {
          rest += `if (!${this.checkFunction(type.additionalType)}(${v}[${k}])) {
${remove}}
`;
        } else if (!type.isOpen) {
          const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
          rest += this.emit(messageAt(keyName, unexpected, "additionalProperties", `{ property: ${k} }`));
        } else {
          const x = this.name("v");
          rest += `let ${x} = ${v}[${k}];
${this.coerceCode((0, import_coerce.coerceSpecOf)(type.additionalType), x, `${v}[${k}]`)}`;
          rest += this.generate(type.additionalType, x, keyName);
        }
        rest += "}\n";
      }
      rest += "}\n";
      if (type.minProperties !== void 0) {
        const message = text(
          ` must have at least ${type.minProperties} properties`,
          "minProperties",
          `{ limit: ${this.number(type.minProperties)} }`
        );
        rest += `if (${count} < ${this.number(type.minProperties)}) { ${this.emit(message)} }
`;
      }
      if (type.maxProperties !== void 0) {
        const message = text(
          ` must have at most ${type.maxProperties} properties`,
          "maxProperties",
          `{ limit: ${this.number(type.maxProperties)} }`
        );
        rest += `if (${count} > ${this.number(type.maxProperties)}) { ${this.emit(message)} }
`;
      }
    }
    rest += this.dependencies(type, v, path);
    return {
      checks: known === "object" ? [] : [
        [
          `typeof ${v} !== 'object' || Array.isArray(${v})`,
          text(" must be an object", "type", "{ type: 'object' }")
        ]
      ],
      rest
    };
  }
  // Like Schema.errors(): a key is present when it is an own property that is not undefined.
  dependencies(type, v, path) {
    const isPresent = (literal) => `(H.call(${v}, ${literal}) && ${v}[${literal}] !== undefined)`;
    return type.dependencies.map(({ key, required, type: dependentType }) => {
      const literal = JSON.stringify(key);
      let code;
      if (required) {
        code = required.map((property) => {
          const propertyLiteral = JSON.stringify(property);
          const missing = this.keyOf(path, propertyLiteral);
          const present = this.nameOf(this.keyOf(path, literal), false);
          const text = () => `${this.nameOf(missing, false)} + " is mandatory when " + ${present} + " is present"`;
          const params = `{ property: ${literal}, missingProperty: ${propertyLiteral} }`;
          const message = messageAt(missing, text, "dependentRequired", params);
          return `if (!${isPresent(propertyLiteral)}) { ${this.emit(message)} }
`;
        }).join("");
      } else {
        code = this.generate(dependentType, v, path);
      }
      return `if (${isPresent(literal)}) {
${code}}
`;
    }).join("");
  }
  // Source of the body of a function that takes the constants (c), the nodes (n) and the helpers r and a, and returns
  // the validation function. standalone.js writes it out with the constants as code. With `shared`, the helpers of
  // the prologue (H, OP, J, P, U) are not written: build() gives them as parameters, made once (V8 then has less code
  // to parse for every schema compiled).
  source(type, shared = false) {
    const main = this.generate(type, "v0", this.rootPath());
    const results = {
      check: ["", "true"],
      first: ["", "undefined"],
      all: [
        "let out;\n",
        this.mayRepeat ? "(out === undefined ? [] : out.length > 1 ? U(out) : out)" : "(out === undefined ? [] : out)"
      ]
    };
    const [declared, end] = results[this.mode];
    const start = this.structured && this.mode !== "check" ? `${declared}let q;
` : declared;
    if (shared) {
      return `"use strict";
${this.functions.join("")}return function validate(v0) {
${start}${main}return ${end};
};`;
    }
    const prologue = [
      '"use strict";',
      "const H = Object.prototype.hasOwnProperty;",
      "const OP = Object.prototype;",
      'function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; }',
      // Adds an error to the list, which is made with the first one.
      "function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; }",
      // The list itself when no error repeats, which is the usual case: a new list is only built when one does. Error
      // objects repeat when their messages do.
      this.structured ? "function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }" : "function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }",
      ""
    ].join("\n");
    return `${prologue}${this.functions.join("")}return function validate(v0) {
${start}${main}return ${end};
};`;
  }
  build(type) {
    const source = this.source(type, true);
    const [first, push] = this.structured ? [firstErrorObject, pushErrorObjects] : [firstError, pushErrors];
    const helpers = this.structured ? STRUCTURED_HELPERS : HELPERS;
    return new Function("c", "n", "r", "a", "H", "OP", "J", "P", "U", source)(
      this.constants,
      this.nodes,
      first,
      push,
      ...helpers
    );
  }
}
function compileIsValid(type) {
  return new Generator("check").build(type);
}
function compileFirstError(type) {
  return new Generator("first").build(type);
}
function compileErrors(type) {
  return new Generator("all").build(type);
}
function modeOf(options = {}) {
  const { allErrors = true, errors = true, foldMessages = false } = options;
  if (foldMessages !== true && foldMessages !== false) {
    throw new Error(`Unsupported option "foldMessages": ${JSON.stringify(foldMessages)} is not true or false`);
  }
  if (errors !== true && errors !== false && errors !== "objects") {
    throw new Error(`Unsupported option "errors": ${JSON.stringify(errors)} is not true, false or 'objects'`);
  }
  if (errors === false) {
    return { mode: "check", structured: false, fold: false };
  }
  return {
    mode: allErrors ? "all" : "first",
    structured: errors === "objects",
    fold: foldMessages
  };
}
function generateSource(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  const generator = new Generator(mode, structured, fold);
  const source = generator.source(type);
  return {
    mode,
    source,
    constants: generator.constants,
    nodes: generator.nodes
  };
}
function compileType(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  const validate = new Generator(mode, structured, fold).build(type);
  if (mode !== "first") {
    return validate;
  }
  return (value) => {
    const error = validate(value);
    return error === void 0 ? [] : [error];
  };
}
(0, import_validate_type.provide)({ compileType });

},
"@xufa/schema/lib/deep-equal.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var deep_equal_exports = {};
__export(deep_equal_exports, {
  deepEqual: () => deepEqual
});
module.exports = __toCommonJS(deep_equal_exports);
function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      const keys2 = [...a.keys()];
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
        if (!b.has(key)) return false;
      }
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
        if (!deepEqual(a.get(key), b.get(key))) return false;
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const keys2 = [...a.keys()];
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
        if (!b.has(key)) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

},
"@xufa/schema/lib/defaults.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var defaults_exports = {};
__export(defaults_exports, {
  assignDefaults: () => assignDefaults,
  copyDefault: () => copyDefault
});
module.exports = __toCommonJS(defaults_exports);
function copyDefault(value) {
  if (Array.isArray(value)) {
    return value.map(copyDefault);
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(copy, key, {
        value: copyDefault(value[key]),
        enumerable: true,
        writable: true,
        configurable: true
      });
    });
    return copy;
  }
  return value;
}
function assignDefaults(target, defaults) {
  for (let i = 0; i < defaults.length; i += 1) {
    const { key, value, empty } = defaults[i];
    const current = target[key];
    if (current === void 0 || empty && (current === null || current === "")) {
      target[key] = copyDefault(value);
    }
  }
}

},
"@xufa/schema/lib/error-objects.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var error_objects_exports = {};
__export(error_objects_exports, {
  errorObject: () => errorObject,
  pathName: () => pathName
});
module.exports = __toCommonJS(error_objects_exports);
function pathName(path) {
  let name;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (typeof segment === "number") {
      name = `${name === void 0 ? "Value" : name}[${segment}]`;
    } else if (segment !== null && typeof segment === "object") {
      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;
    } else {
      name = name ? `${name}.${segment}` : segment;
    }
  }
  return name === void 0 ? "Value" : name;
}
function errorObject(path, keyword, params, message) {
  const last = path[path.length - 1];
  const isPropertyName = last !== null && typeof last === "object";
  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();
  let pointer = "";
  for (let i = 0; i < keys.length; i += 1) {
    const key = `${keys[i]}`;
    pointer += key.includes("~") || key.includes("/") ? `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}` : `/${key}`;
  }
  const error = { path: keys, pointer, keyword, params, message };
  if (isPropertyName) {
    error.propertyName = true;
  }
  return error;
}

},
"@xufa/schema/lib/formats.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var formats_exports = {};
__export(formats_exports, {
  FORMATS: () => FORMATS,
  FORMAT_COMPARES: () => FORMAT_COMPARES,
  FORMAT_FUNCTIONS: () => FORMAT_FUNCTIONS,
  isRfc1123Hostname: () => isRfc1123Hostname,
  matchesFormat: () => matchesFormat
});
module.exports = __toCommonJS(formats_exports);
function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
function isTime(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([zZ])|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    return false;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  let offset = 0;
  if (!match[4]) {
    const offsetHour = Number(match[6]);
    const offsetMinute = Number(match[7]);
    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }
    offset = (match[5] === "-" ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;
}
function isDateTime(value) {
  const match = /^(.{10})[tT](.+)$/.exec(value);
  return match !== null && isDate(match[1]) && isTime(match[2]);
}
function isDuration(value) {
  return /^P(?:(?:\d+Y(?:\d+M(?:\d+D)?)?|\d+M(?:\d+D)?|\d+D)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/.test(
    value
  );
}
function isIpv4(value) {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value);
}
function isIpv6(value) {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {
    return false;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.map((half) => half === "" ? [] : half.split(":"));
  const all = groups[groups.length - 1];
  let count = 0;
  if (all.length > 0 && all[all.length - 1].includes(".")) {
    if (!isIpv4(all.pop())) {
      return false;
    }
    count = 2;
  }
  const hextets = [].concat(...groups);
  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {
    return false;
  }
  count += hextets.length;
  return halves.length === 2 ? count < 8 : count === 8;
}
function punycodeAdapt(delta, points, isFirst) {
  let result = Math.floor(delta / (isFirst ? 700 : 2));
  result += Math.floor(result / points);
  let k = 0;
  while (result > 455) {
    result = Math.floor(result / 35);
    k += 36;
  }
  return k + Math.floor(36 * result / (result + 38));
}
function punycodeDecode(input) {
  const output = [];
  const delimiter = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {
    if (input.charCodeAt(j) >= 128) {
      return void 0;
    }
    output.push(input.charCodeAt(j));
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length; ) {
    const old = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) {
        return void 0;
      }
      const code = input.charCodeAt(index);
      index += 1;
      let digit = 36;
      if (code >= 48 && code <= 57) {
        digit = code - 22;
      } else if (code >= 65 && code <= 90) {
        digit = code - 65;
      } else if (code >= 97 && code <= 122) {
        digit = code - 97;
      }
      if (digit >= 36 || digit > Math.floor((2147483647 - i) / weight)) {
        return void 0;
      }
      i += digit * weight;
      let t = k - bias;
      if (k <= bias) {
        t = 1;
      } else if (k >= bias + 26) {
        t = 26;
      }
      if (digit < t) {
        break;
      }
      weight *= 36 - t;
    }
    bias = punycodeAdapt(i - old, output.length + 1, old === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 1114111) {
      return void 0;
    }
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}
function punycodeEncode(input) {
  const points = Array.from(input, (char) => char.codePointAt(0));
  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
  let output = points.filter((point) => point < 128).map((point) => String.fromCharCode(point)).join("");
  const basic = output.length;
  let handled = basic;
  if (basic > 0) {
    output += "-";
  }
  let n = 128;
  let delta = 0;
  let bias = 72;
  while (handled < points.length) {
    let m = 1114111;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] >= n && points[i] < m) {
        m = points[i];
      }
    }
    delta += (m - n) * (handled + 1);
    n = m;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] < n) {
        delta += 1;
      }
      if (points[i] === n) {
        let q = delta;
        for (let k = 36; ; k += 36) {
          let t = k - bias;
          if (k <= bias) {
            t = 1;
          } else if (k >= bias + 26) {
            t = 26;
          }
          if (q < t) {
            break;
          }
          output += digit(t + (q - t) % (36 - t));
          q = Math.floor((q - t) / (36 - t));
        }
        output += digit(q);
        bias = punycodeAdapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}
function bidiClass(char) {
  if (/[\u0600-\u0605\u0660-\u0669\u066B\u066C\u06DD\u0890\u0891\u08E2]/u.test(char)) {
    return "AN";
  }
  if (/[0-9\u06F0-\u06F9\u00B2\u00B3\u00B9\u2070-\u2079\u2080-\u2089\uFF10-\uFF19]/u.test(char)) {
    return "EN";
  }
  if (/[\p{Mn}\p{Me}]/u.test(char)) {
    return "NSM";
  }
  if (/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(char)) {
    return "AL";
  }
  if (/[\p{Script=Hebrew}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\u200F]/u.test(char)) {
    return "R";
  }
  if (/[+-]/.test(char)) {
    return "ES";
  }
  if (/[,./:\u00A0]/.test(char)) {
    return "CS";
  }
  if (/[#$%\u00A2-\u00A5\u00B0\u00B1]/u.test(char)) {
    return "ET";
  }
  return /[\p{L}\p{Mc}]/u.test(char) ? "L" : "ON";
}
function hasValidBidi(label) {
  const classes = Array.from(label, bidiClass);
  const first = classes[0];
  const last = classes.filter((type) => type !== "NSM").pop();
  if (first === "R" || first === "AL") {
    return classes.every((type) => ["R", "AL", "AN", "EN", "ES", "CS", "ET", "ON", "NSM"].includes(type)) && ["R", "AL", "EN", "AN"].includes(last) && !(classes.includes("EN") && classes.includes("AN"));
  }
  if (first === "L") {
    return classes.every((type) => ["L", "EN", "ES", "CS", "ET", "ON", "NSM"].includes(type)) && ["L", "EN"].includes(last);
  }
  return false;
}
function isULabel(label) {
  const chars = Array.from(label);
  if (label.length === 0 || label.normalize("NFC") !== label || /^\p{M}/u.test(label)) {
    return false;
  }
  if (label.startsWith("-") || label.endsWith("-") || label.slice(2, 4) === "--") {
    return false;
  }
  const virama = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\u1BF2\u1BF3\u2D7F\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED]/u;
  const joining = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;
  return chars.every((char, i) => {
    const before = chars[i - 1];
    const after = chars[i + 1];
    switch (char) {
      case "\xDF":
      case "\u03C2":
      case "\u06FD":
      case "\u06FE":
      case "\u0F0B":
      case "\u3007":
        return true;
      case "\xB7":
        return before === "l" && after === "l";
      case "\u0375":
        return after !== void 0 && /\p{Script=Greek}/u.test(after);
      case "\u05F3":
      case "\u05F4":
        return before !== void 0 && /\p{Script=Hebrew}/u.test(before);
      case "\u30FB":
        return chars.some(
          (other) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(other) && other !== "\u30FB"
        );
      case "\u200D":
        return before !== void 0 && virama.test(before);
      case "\u200C": {
        if (before !== void 0 && virama.test(before)) {
          return true;
        }
        const left = chars.slice(0, i).reverse().find((other) => !/\p{Mn}/u.test(other));
        const right = chars.slice(i + 1).find((other) => !/\p{Mn}/u.test(other));
        return left !== void 0 && right !== void 0 && joining.test(left) && joining.test(right);
      }
      default:
        break;
    }
    if (/[\u0660-\u0669]/u.test(char)) {
      return !chars.some((other) => /[\u06F0-\u06F9]/u.test(other));
    }
    if (/[\u06F0-\u06F9]/u.test(char)) {
      return !chars.some((other) => /[\u0660-\u0669]/u.test(other));
    }
    if (/[\u0640\u07FA\u302E\u302F\u3031-\u3035\u303B]/u.test(char)) {
      return false;
    }
    return /[\p{Ll}\p{Lo}\p{Lm}\p{Mn}\p{Mc}\p{Nd}-]/u.test(char) && char.normalize("NFKC").toLowerCase() === char;
  });
}
function hasValidLabels(value, isIdn) {
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) && !/(?:^|\.)[A-Za-z0-9-]{2}--/.test(value)) {
    return value.length <= 253;
  }
  const mapped = isIdn ? value.normalize("NFKC").replace(/[\u3002\uFF0E\uFF61]/gu, ".").replace(/[\u00AD\u200B\u2060\uFEFF\u180B-\u180D\uFE00-\uFE0F]/gu, "").toLowerCase() : value;
  if (!isIdn && !/^[\x21-\x7E]*$/.test(mapped)) {
    return false;
  }
  const labels = mapped.split(".");
  const unicode = [];
  const ascii = [];
  const valid = labels.every((label) => {
    if (/^xn--/i.test(label)) {
      const decoded = punycodeDecode(label.slice(4).toLowerCase());
      if (decoded === void 0 || Array.from(decoded).every((char) => char.charCodeAt(0) < 128) || punycodeEncode(decoded) !== label.slice(4).toLowerCase() || !isULabel(decoded)) {
        return false;
      }
      unicode.push(decoded);
      ascii.push(label);
      return label.length <= 63;
    }
    if (Array.from(label).every((char) => char.charCodeAt(0) < 128)) {
      unicode.push(label);
      ascii.push(label);
      return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) && !(label.slice(2, 4) === "--" && !/^xn--/i.test(label));
    }
    if (!isIdn || !isULabel(label)) {
      return false;
    }
    unicode.push(label);
    ascii.push(`xn--${punycodeEncode(label)}`);
    return ascii[ascii.length - 1].length <= 63;
  });
  if (!valid || ascii.join(".").length > 253) {
    return false;
  }
  const isRtl = unicode.some((label) => Array.from(label).some((char) => ["R", "AL", "AN"].includes(bidiClass(char))));
  return !isRtl || unicode.every(hasValidBidi);
}
function isHostname(value) {
  return hasValidLabels(value, false);
}
function isRfc1123Hostname(value) {
  return value.length <= 253 && value.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function isIdnHostname(value) {
  return hasValidLabels(value, true);
}
function isEmailWith(value, isIdn, isHost) {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dotAtom = isIdn ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+)*$/u : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  const quoted = isIdn ? /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E\u0080-\u{10FFFF}]|\\[\x20-\x7E])*"$/u : /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;
  if (!dotAtom.test(local) && !quoted.test(local)) {
    return false;
  }
  const literal = domain.charCodeAt(0) === 91 ? /^\[(?:IPv6:(.+)|(.+))\]$/i.exec(domain) : null;
  if (literal) {
    return literal[1] !== void 0 ? isIpv6(literal[1]) : isIpv4(literal[2]);
  }
  return isHost(domain);
}
function isEmail(value) {
  return isEmailWith(value, false, isHostname);
}
function isIdnEmail(value) {
  return isEmailWith(value, true, isIdnHostname);
}
function isRegex(value) {
  try {
    RegExp(value, "u");
    return true;
  } catch (e) {
    return false;
  }
}
const PCT = "%[0-9A-Fa-f]{2}";
const SUB_DELIMS = "!$&'()*+,;=";
const UCSCHAR = "\\u00A0-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}";
const IPRIVATE = "\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}";
const H16 = "[0-9A-Fa-f]{1,4}";
const DEC_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = `(?:${DEC_OCTET}\\.){3}${DEC_OCTET}`;
const LS32 = `(?:${H16}:${H16}|${IPV4})`;
const IPV6 = [
  `(?:${H16}:){6}${LS32}`,
  `::(?:${H16}:){5}${LS32}`,
  `(?:${H16})?::(?:${H16}:){4}${LS32}`,
  `(?:(?:${H16}:){0,1}${H16})?::(?:${H16}:){3}${LS32}`,
  `(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}`,
  `(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}`,
  `(?:(?:${H16}:){0,4}${H16})?::${LS32}`,
  `(?:(?:${H16}:){0,5}${H16})?::${H16}`,
  `(?:(?:${H16}:){0,6}${H16})?::`
].join("|");
function uriPattern(isIri, isReference) {
  const unreserved = `A-Za-z0-9\\-._~${isIri ? UCSCHAR : ""}`;
  const pchar = `(?:[${unreserved}${SUB_DELIMS}:@]|${PCT})`;
  const segmentNzNc = `(?:[${unreserved}${SUB_DELIMS}@]|${PCT})+`;
  const userinfo = `(?:[${unreserved}${SUB_DELIMS}:]|${PCT})*`;
  const ipLiteral = `\\[(?:${IPV6}|[vV][0-9A-Fa-f]+\\.[A-Za-z0-9\\-._~${SUB_DELIMS}:]+)\\]`;
  const regName = `(?:[${unreserved}${SUB_DELIMS}]|${PCT})*`;
  const authority = `(?:${userinfo}@)?(?:${ipLiteral}|${IPV4}|${regName})(?::\\d*)?`;
  const pathAbempty = `(?:/${pchar}*)*`;
  const pathAbsolute = `/(?:${pchar}+(?:/${pchar}*)*)?`;
  const pathRootless = `${pchar}+(?:/${pchar}*)*`;
  const pathNoscheme = `${segmentNzNc}(?:/${pchar}*)*`;
  const query = `(?:${pchar}|[/?${isIri ? IPRIVATE : ""}])*`;
  const fragment = `(?:${pchar}|[/?])*`;
  const tail = `(?:\\?${query})?(?:#${fragment})?`;
  const uri = `[A-Za-z][A-Za-z0-9+\\-.]*:(?://${authority}${pathAbempty}|${pathAbsolute}|${pathRootless}|)${tail}`;
  const relative = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathNoscheme}|)${tail}`;
  return new RegExp(isReference ? `^(?:${uri}|${relative})$` : `^${uri}$`, "u");
}
function compareDate(d1, d2) {
  if (!(d1 && d2)) {
    return void 0;
  }
  if (d1 > d2) {
    return 1;
  }
  return d1 < d2 ? -1 : 0;
}
function compareTime(t1, t2) {
  if (!(t1 && t2)) {
    return void 0;
  }
  const ms1 = (/* @__PURE__ */ new Date(`2020-01-01T${t1}`)).valueOf();
  const ms2 = (/* @__PURE__ */ new Date(`2020-01-01T${t2}`)).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : void 0;
}
function compareDateTime(dt1, dt2) {
  if (!(dt1 && dt2)) {
    return void 0;
  }
  const ms1 = new Date(dt1).valueOf();
  const ms2 = new Date(dt2).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : void 0;
}
const FORMAT_COMPARES = {
  date: compareDate,
  time: compareTime,
  "date-time": compareDateTime
};
const FORMATS = {
  date: isDate,
  time: isTime,
  "date-time": isDateTime,
  duration: isDuration,
  email: isEmail,
  "idn-email": isIdnEmail,
  hostname: isHostname,
  "idn-hostname": isIdnHostname,
  ipv4: isIpv4,
  ipv6: isIpv6,
  uri: uriPattern(false, false),
  "uri-reference": uriPattern(false, true),
  iri: uriPattern(true, false),
  "iri-reference": uriPattern(true, true),
  uuid: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
  // RFC 6570: literals are any character but controls, space and '"%<>\^`{|}'; variable names may have dots.
  /* eslint-disable no-control-regex -- the literals exclude the control characters */
  "uri-template": /^(?:[^\x00-\x20\x7F"%<>\\^`{|}]|%[0-9A-Fa-f]{2}|\{[+#./;?&=,!@|]?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?)*\})*$/,
  /* eslint-enable no-control-regex */
  "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  regex: isRegex
};
const FORMAT_FUNCTIONS = {
  isRfc1123Hostname,
  compareDate,
  compareTime,
  compareDateTime,
  isDate,
  isTime,
  isDateTime,
  isDuration,
  isIpv4,
  isIpv6,
  punycodeAdapt,
  punycodeDecode,
  punycodeEncode,
  bidiClass,
  hasValidBidi,
  isULabel,
  hasValidLabels,
  isHostname,
  isIdnHostname,
  isEmailWith,
  isEmail,
  isIdnEmail,
  isRegex
};
function matchesFormat(check, value) {
  return typeof check === "function" ? check(value) : check.test(value);
}

},
"@xufa/schema/lib/infer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var infer_exports = {};
__export(infer_exports, {
  inferJsonSchema: () => inferJsonSchema,
  inferSchemaCode: () => inferSchemaCode
});
module.exports = __toCommonJS(infer_exports);
var import_formats = require("./formats.js");
const FORMAT_CANDIDATES = ["date-time", "date", "time", "email", "uuid", "ipv4", "ipv6", "uri"];
const matchesCandidate = (name, text) => name === "uri" ? /^[a-z][a-z0-9+.-]*:\/\//i.test(text) && (0, import_formats.matchesFormat)(import_formats.FORMATS.uri, text) : (0, import_formats.matchesFormat)(import_formats.FORMATS[name], text);
const DRAFT_URIS = {
  "draft-04": "http://json-schema.org/draft-04/schema#",
  "draft-06": "http://json-schema.org/draft-06/schema#",
  "draft-07": "http://json-schema.org/draft-07/schema#",
  "2019-09": "https://json-schema.org/draft/2019-09/schema",
  "2020-12": "https://json-schema.org/draft/2020-12/schema"
};
const isIdentifier = (key) => /^[A-Za-z_$][\w$]*$/.test(key);
const isPlainObject = (value) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const newNode = () => ({
  null: false,
  boolean: false,
  integer: false,
  number: false,
  string: null,
  array: null,
  object: null
});
function add(node, value, path) {
  if (value === null) {
    node.null = true;
  } else if (typeof value === "boolean") {
    node.boolean = true;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot infer a schema: ${value} at ${path || "the value"} is not a JSON value`);
    }
    node[Number.isInteger(value) ? "integer" : "number"] = true;
  } else if (typeof value === "string") {
    node.string = node.string || { formats: FORMAT_CANDIDATES };
    node.string.formats = node.string.formats.filter((name) => matchesCandidate(name, value));
  } else if (Array.isArray(value)) {
    node.array = node.array || { items: null };
    value.forEach((item, index) => {
      node.array.items = node.array.items || newNode();
      add(node.array.items, item, `${path}[${index}]`);
    });
  } else if (isPlainObject(value)) {
    node.object = node.object || { count: 0, keys: /* @__PURE__ */ new Map() };
    node.object.count += 1;
    Object.keys(value).forEach((key) => {
      if (value[key] === void 0) {
        return;
      }
      if (!node.object.keys.has(key)) {
        node.object.keys.set(key, { node: newNode(), count: 0 });
      }
      const entry = node.object.keys.get(key);
      entry.count += 1;
      add(entry.node, value[key], path ? `${path}.${key}` : key);
    });
  } else {
    const what = value instanceof Date ? "a Date (use its ISO string)" : `a ${typeof value}`;
    throw new Error(`Cannot infer a schema: ${path || "the value"} is ${what}, not a JSON value`);
  }
}
function optionsOf(options) {
  const { closed = false, formats = true, draft = "2020-12" } = options;
  if (!Object.prototype.hasOwnProperty.call(DRAFT_URIS, draft)) {
    throw new Error(`Unsupported option "draft": "${draft}" is not one of ${Object.keys(DRAFT_URIS).join(", ")}`);
  }
  return { closed: closed === true, formats: formats !== false, draft };
}
function modelOf(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Cannot infer a schema: expected a non-empty array of sample values");
  }
  const root = newNode();
  samples.forEach((sample) => add(root, sample, ""));
  return root;
}
function typesOf(node) {
  const types = [];
  if (node.object) types.push("object");
  if (node.array) types.push("array");
  if (node.string) types.push("string");
  if (node.number) types.push("number");
  else if (node.integer) types.push("integer");
  if (node.boolean) types.push("boolean");
  return types;
}
const formatOf = (node, options) => options.formats && node.string.formats[0] || void 0;
function toJsonSchema(node, options) {
  const types = typesOf(node);
  if (types.length === 0) {
    return {};
  }
  const allTypes = node.null ? [...types, "null"] : types;
  const schema = { type: allTypes.length === 1 ? allTypes[0] : allTypes };
  if (node.string && formatOf(node, options)) {
    schema.format = formatOf(node, options);
  }
  if (node.array && node.array.items) {
    schema.items = toJsonSchema(node.array.items, options);
  }
  if (node.object) {
    const keys = [...node.object.keys];
    schema.properties = Object.fromEntries(keys.map(([key, entry]) => [key, toJsonSchema(entry.node, options)]));
    const required = keys.filter(([, entry]) => entry.count === node.object.count).map(([key]) => key);
    if (required.length > 0) {
      schema.required = required;
    }
    if (options.closed) {
      schema.additionalProperties = false;
    }
  }
  return schema;
}
function inferJsonSchema(samples, options = {}) {
  const settings = optionsOf(options);
  return { $schema: DRAFT_URIS[settings.draft], ...toJsonSchema(modelOf(samples), settings) };
}
const quote = (text) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
function toCode(node, options, extra, indent, used) {
  const pad = " ".repeat(indent);
  const types = typesOf(node);
  const settings = [...extra];
  const use = (name) => {
    used.add(name);
    return name;
  };
  const call = (name, own = []) => {
    const all = [...own, ...settings];
    return `${use(name)}(${all.length ? `{ ${all.join(", ")} }` : ""})`;
  };
  if (types.length === 0) {
    return call("Any", ["isNullable: true"]);
  }
  if (node.null) {
    settings.push("isNullable: true");
  }
  const codeOf = (type, own) => {
    switch (type) {
      case "string": {
        const format = formatOf(node, options);
        return call("String", [...own, ...format ? [`format: ${quote(format)}`] : []]);
      }
      case "integer":
        return call("Integer", own);
      case "number":
        return call("Float", own);
      case "boolean":
        return call("Boolean", own);
      case "array": {
        const { items } = node.array;
        const typeOption = items ? [`type: ${toCode(items, options, [], indent, used)}`] : [];
        return call("ArrayOf", [...typeOption, ...own]);
      }
      default: {
        const name = use(options.closed ? "ClosedSchema" : "Schema");
        const entries = [...node.object.keys].map(([key, entry]) => {
          const optional = entry.count === node.object.count ? [] : ["isMandatory: false"];
          const value = toCode(entry.node, options, optional, indent + 2, used);
          return `${pad}  ${isIdentifier(key) ? key : quote(key)}: ${value},`;
        });
        const body = entries.length ? `{
${entries.join("\n")}
${pad}}` : "{}";
        const all = [...own, ...settings];
        return `new ${name}(${body}${all.length ? `, { ${all.join(", ")} }` : ""})`;
      }
    }
  };
  if (types.length === 1) {
    return codeOf(types[0], []);
  }
  const inner = types.map((type) => toCode({ ...newNode(), [type]: node[type] }, options, [], indent + 2, used));
  return call("AnyOf", [`types: [${inner.join(", ")}]`]);
}
function inferSchemaCode(samples, options = {}) {
  const settings = optionsOf(options);
  const { name = "schema", module: module2 = "commonjs" } = options;
  if (!isIdentifier(name)) {
    throw new Error(`Unsupported option "name": "${name}" is not a JavaScript identifier`);
  }
  if (!["commonjs", "esm", "none"].includes(module2)) {
    throw new Error(`Unsupported option "module": "${module2}" is not one of commonjs, esm, none`);
  }
  const used = /* @__PURE__ */ new Set();
  const code = toCode(modelOf(samples), settings, [], 0, used);
  const names = [...used].sort().join(", ");
  const header = {
    commonjs: `const { ${names} } = require('@xufa/schema');

`,
    esm: `import { ${names} } from '@xufa/schema';

`,
    none: ""
  }[module2];
  return `${header}const ${name} = ${code};
`;
}

},
"@xufa/schema/lib/json-schema-refs.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var json_schema_refs_exports = {};
__export(json_schema_refs_exports, {
  RefIndex: () => RefIndex,
  documentsOf: () => documentsOf,
  draftOfUri: () => draftOfUri,
  isLegacy: () => isLegacy
});
module.exports = __toCommonJS(json_schema_refs_exports);
const DEFAULT_BASE = "xufa-schema://schema/root.json";
const SCHEMA_KEYWORDS = [
  "additionalItems",
  "additionalProperties",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
  "contentSchema",
  "unevaluatedItems",
  "unevaluatedProperties"
];
const SCHEMA_MAP_KEYWORDS = [
  "definitions",
  "$defs",
  "dependencies",
  "dependentSchemas",
  "patternProperties",
  "properties"
];
const SCHEMA_LIST_KEYWORDS = ["allOf", "anyOf", "items", "oneOf", "prefixItems"];
const CHILD_ORDER = /* @__PURE__ */ Object.create(null);
SCHEMA_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = i;
});
SCHEMA_MAP_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = SCHEMA_KEYWORDS.length + i;
});
const LIST_ORDER = /* @__PURE__ */ Object.create(null);
SCHEMA_LIST_KEYWORDS.forEach((keyword, i) => {
  LIST_ORDER[keyword] = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length + i;
});
const MAP_START = SCHEMA_KEYWORDS.length;
const LIST_START = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length;
const LEGACY_DRAFTS = ["draft-04", "draft-06", "draft-07"];
const isLegacy = (draft) => LEGACY_DRAFTS.includes(draft);
const idKeyword = (draft) => draft === "draft-04" ? "id" : "$id";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function resolveUri(ref, base) {
  try {
    return new URL(ref, base).href;
  } catch (e) {
    return void 0;
  }
}
function splitFragment(uri) {
  const index = uri.indexOf("#");
  return index === -1 ? [uri, ""] : [uri.slice(0, index), uri.slice(index + 1)];
}
function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return void 0;
  }
}
function followPointer(node, pointer) {
  const tokens = pointer.split("/").slice(1).map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = node;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (Array.isArray(current) && /^(0|[1-9][0-9]*)$/.test(token)) {
      current = current[Number(token)];
    } else if (current !== null && typeof current === "object" && !Array.isArray(current) && hasOwn(current, token)) {
      current = current[token];
    } else {
      return void 0;
    }
  }
  return current;
}
function documentsOf(schemas) {
  if (schemas === void 0) {
    return [];
  }
  let entries;
  if (Array.isArray(schemas)) {
    entries = schemas.map((schema) => [schema && (typeof schema.$id === "string" ? schema.$id : schema.id), schema]);
  } else if (isObject(schemas)) {
    entries = Object.entries(schemas);
  } else {
    throw new Error('Unsupported JSON Schema option "schemas": expected an object of schemas by URI or an array');
  }
  return entries.map(([uri, schema]) => {
    const absolute = typeof uri === "string" && uri !== "" ? resolveUri(uri, DEFAULT_BASE) : void 0;
    const [document, fragment] = absolute === void 0 ? [] : splitFragment(absolute);
    if (absolute === void 0 || fragment !== "") {
      throw new Error(`Unsupported JSON Schema option "schemas": "${uri}" is not a URI without fragment`);
    }
    return { uri: document, schema };
  });
}
const DRAFT_URIS = {
  "http://json-schema.org/draft-04/schema": "draft-04",
  "https://json-schema.org/draft-04/schema": "draft-04",
  "http://json-schema.org/draft-06/schema": "draft-06",
  "https://json-schema.org/draft-06/schema": "draft-06",
  "http://json-schema.org/draft-07/schema": "draft-07",
  "https://json-schema.org/draft-07/schema": "draft-07",
  "https://json-schema.org/draft/2019-09/schema": "2019-09",
  "http://json-schema.org/draft/2019-09/schema": "2019-09",
  "https://json-schema.org/draft/2020-12/schema": "2020-12",
  "http://json-schema.org/draft/2020-12/schema": "2020-12"
};
function draftOfUri(uri) {
  return typeof uri === "string" ? DRAFT_URIS[uri.replace(/#$/, "")] : void 0;
}
const VOCABULARY_KEYWORDS = {
  validation: [
    "type",
    "enum",
    "const",
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "maxLength",
    "minLength",
    "pattern",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxContains",
    "minContains",
    "maxProperties",
    "minProperties",
    "required",
    "dependentRequired"
  ],
  applicator: [
    "prefixItems",
    "items",
    "additionalItems",
    "contains",
    "additionalProperties",
    "properties",
    "patternProperties",
    "dependentSchemas",
    "propertyNames",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not"
  ],
  unevaluated: ["unevaluatedItems", "unevaluatedProperties"]
};
const KNOWN_VOCABULARIES = [
  "core",
  "applicator",
  "unevaluated",
  "validation",
  "meta-data",
  "format",
  "format-annotation",
  "format-assertion",
  "content"
];
function ignoredKeywords(vocabulary, draft) {
  const prefix = `https://json-schema.org/draft/${draft}/vocab/`;
  const listed = /* @__PURE__ */ new Set();
  Object.entries(vocabulary).forEach(([uri, isRequired]) => {
    const name = uri.startsWith(prefix) ? uri.slice(prefix.length) : void 0;
    if (name !== void 0 && KNOWN_VOCABULARIES.includes(name)) {
      listed.add(name);
    } else if (isRequired === true) {
      throw new Error(`Unsupported JSON Schema: the meta-schema requires the vocabulary "${uri}"`);
    }
  });
  const ignored = /* @__PURE__ */ new Set();
  Object.entries(VOCABULARY_KEYWORDS).forEach(([name, keywords]) => {
    const owner = draft === "2019-09" && name === "unevaluated" ? "applicator" : name;
    if (!listed.has(owner)) {
      keywords.forEach((keyword) => ignored.add(keyword));
    }
  });
  return ignored;
}
class RefIndex {
  // `draft` is the one of the root (by default the one its "$schema" names), and of the resources that name none and
  // are not inside one that does.
  constructor(root, schemas = void 0, draft = void 0) {
    this.root = root;
    const documents = documentsOf(schemas);
    this.documents = new Map(documents.map(({ uri, schema }) => [uri, schema]));
    this.rootDialect = draft === void 0 ? this.dialectOf(root.$schema) || { draft: "draft-07" } : { draft };
    this.draft = this.rootDialect.draft;
    this.dialects = /* @__PURE__ */ new Map();
    this.resources = /* @__PURE__ */ new Map([[DEFAULT_BASE, root]]);
    this.anchors = /* @__PURE__ */ new Map();
    this.dynamicAnchors = /* @__PURE__ */ new Map();
    this.bases = /* @__PURE__ */ new Map();
    this.nodeDialects = /* @__PURE__ */ new Map();
    this.views = /* @__PURE__ */ new Map();
    this.visit(root, DEFAULT_BASE);
    documents.forEach(({ uri, schema }) => {
      this.addResource(uri, schema);
      this.visit(schema, uri);
    });
  }
  // The dialect "$schema" names: a draft, or a meta-schema of the "schemas" option with the draft its own "$schema"
  // names and the keywords its "$vocabulary" leaves out. Undefined when it names neither.
  dialectOf(schemaUri) {
    const draft = draftOfUri(schemaUri);
    if (draft !== void 0) {
      return { draft };
    }
    const meta = typeof schemaUri === "string" ? this.documents.get(schemaUri.replace(/#$/, "")) : void 0;
    const metaDraft = isObject(meta) ? draftOfUri(meta.$schema) : void 0;
    if (metaDraft === void 0) {
      return void 0;
    }
    const hasVocabulary = !isLegacy(metaDraft) && isObject(meta.$vocabulary);
    return {
      draft: metaDraft,
      ignored: hasVocabulary ? ignoredKeywords(meta.$vocabulary, metaDraft) : void 0
    };
  }
  // The node as its vocabularies see it: a copy without the keywords they leave out, or the node itself.
  viewOf(node) {
    const dialect = this.nodeDialects.get(node);
    const ignored = dialect && dialect.ignored;
    if (!ignored || !Object.keys(node).some((keyword) => ignored.has(keyword))) {
      return node;
    }
    if (!this.views.has(node)) {
      this.views.set(node, Object.fromEntries(Object.entries(node).filter(([keyword]) => !ignored.has(keyword))));
    }
    return this.views.get(node);
  }
  // Whether the vocabularies of the resource of a node leave out keywords (then viewOf() gives a copy without them).
  ignoresKeywords(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect !== void 0 && dialect.ignored !== void 0;
  }
  // The first document registered for a URI keeps it.
  addResource(uri, node) {
    if (!this.resources.has(uri)) {
      this.resources.set(uri, node);
    }
  }
  addDynamicAnchor(uri, name, node) {
    if (!this.dynamicAnchors.has(uri)) {
      this.dynamicAnchors.set(uri, /* @__PURE__ */ new Map());
    }
    const anchors = this.dynamicAnchors.get(uri);
    if (!anchors.has(name)) {
      anchors.set(name, node);
    }
  }
  // Dynamic anchors of a resource, by name.
  dynamicAnchorsOf(uri) {
    return this.dynamicAnchors.get(uri) || /* @__PURE__ */ new Map();
  }
  // URI of the resource a node belongs to, or undefined for a node that is not indexed.
  resourceOf(node) {
    return this.bases.get(node);
  }
  // Draft of the resource a node belongs to, or undefined for a node that is not indexed.
  draftOf(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect && dialect.draft;
  }
  addAnchor(anchor, node) {
    if (!this.anchors.has(anchor)) {
      this.anchors.set(anchor, node);
    }
  }
  // Indexes a node and the schemas inside it. `parentDialect` is the dialect of the resource around it; a resource
  // that names another with "$schema" uses it (the root uses the one it was given).
  visit(node, parentBase, parentDialect = this.dialects.get(parentBase) || this.rootDialect) {
    if (!isObject(node) || this.bases.has(node)) {
      return;
    }
    let dialect = parentDialect;
    if (node === this.root) dialect = this.rootDialect;
    else if (node.$schema !== void 0) dialect = this.dialectOf(node.$schema) || parentDialect;
    const { draft } = dialect;
    let base = parentBase;
    const id = node[idKeyword(draft)];
    if (typeof id === "string" && (node.$ref === void 0 || !isLegacy(draft))) {
      const uri = resolveUri(id, parentBase);
      if (uri !== void 0) {
        const [document, fragment] = splitFragment(uri);
        const anchor = `${document}#${decode(fragment)}`;
        if (fragment === "") {
          base = document;
          this.addResource(document, node);
        } else {
          this.addAnchor(anchor, node);
        }
      }
    }
    if (!this.dialects.has(base)) {
      this.dialects.set(base, dialect);
    }
    if (!isLegacy(draft) && typeof node.$anchor === "string") {
      this.addAnchor(`${base}#${node.$anchor}`, node);
    }
    if (draft === "2020-12" && typeof node.$dynamicAnchor === "string") {
      this.addAnchor(`${base}#${node.$dynamicAnchor}`, node);
      this.addDynamicAnchor(base, node.$dynamicAnchor, node);
    }
    if (draft === "2019-09" && node.$recursiveAnchor === true && this.resources.get(base) === node) {
      this.addDynamicAnchor(base, "", node);
    }
    this.bases.set(node, base);
    this.nodeDialects.set(node, this.dialects.get(base));
    const keys = Object.keys(node);
    let children;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = node[key];
      const order = Array.isArray(value) ? LIST_ORDER[key] : CHILD_ORDER[key];
      if (order !== void 0) {
        if (children === void 0) children = [];
        children.push(order, key);
      }
    }
    if (children === void 0) {
      return;
    }
    if (children.length > 2) {
      const pairs = [];
      for (let i = 0; i < children.length; i += 2) pairs.push([children[i], children[i + 1]]);
      pairs.sort((a, b) => a[0] - b[0]);
      children = pairs.flat();
    }
    for (let i = 0; i < children.length; i += 2) {
      const order = children[i];
      const value = node[children[i + 1]];
      if (order < MAP_START) {
        this.visit(value, base, dialect);
      } else if (order < LIST_START) {
        if (isObject(value)) {
          const mapKeys = Object.keys(value);
          for (let j = 0; j < mapKeys.length; j += 1) {
            this.visit(value[mapKeys[j]], base, dialect);
          }
        }
      } else {
        for (let j = 0; j < value.length; j += 1) {
          this.visit(value[j], base, dialect);
        }
      }
    }
  }
  // The document `ref`, resolved against the base URI of `node`, points to when it is not registered: the one to load
  // for it to resolve. Undefined when it is registered, or relative to a document without "$id".
  missingDocument(node, ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === void 0) {
      return void 0;
    }
    const [document] = splitFragment(uri);
    const isKnown = this.resources.has(document) || new URL(document).protocol === new URL(DEFAULT_BASE).protocol;
    return isKnown ? void 0 : document;
  }
  // Schema node that `ref` (by default the "$ref" of `node`), resolved against the base URI of `node`, points to, or
  // undefined when it is not in this document.
  resolve(node, ref = node.$ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === void 0) {
      return void 0;
    }
    const [document, rawFragment] = splitFragment(uri);
    const fragment = decode(rawFragment);
    if (fragment === void 0) {
      return void 0;
    }
    let target;
    if (fragment === "" || fragment.startsWith("/")) {
      const resource = this.resources.get(document);
      target = resource === void 0 ? void 0 : followPointer(resource, fragment);
      if (target !== void 0) {
        this.visit(target, document);
      }
    } else {
      target = this.anchors.get(`${document}#${fragment}`);
    }
    return target;
  }
}

},
"@xufa/schema/lib/json-schema.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var json_schema_exports = {};
__export(json_schema_exports, {
  builtInFormats: () => builtInFormats,
  compileJsonSchema: () => compileJsonSchema,
  compileJsonSchemaAsync: () => compileJsonSchemaAsync,
  fromJsonSchema: () => fromJsonSchema,
  loadJsonSchemas: () => loadJsonSchemas
});
module.exports = __toCommonJS(json_schema_exports);
var import_schema = require("./schema.js");
var import_compile = require("./compile.js");
var import_json_schema_refs = require("./json-schema-refs.js");
var import_merge_patch = require("./merge-patch.js");
var import_unevaluated = require("./unevaluated.js");
var import_keyword = require("./types/keyword.js");
var import_coerce = require("./coerce.js");
var import_formats = require("./formats.js");
var import_types = require("./types/index.js");
const DRAFTS = ["draft-04", "draft-06", "draft-07", "2019-09", "2020-12"];
const ANNOTATIONS = [
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "format",
  "readOnly",
  "writeOnly",
  "deprecated",
  "nullable",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
  // Only used through "$ref"; "$defs" is also accepted in draft-07.
  "definitions",
  "$defs"
];
const ANNOTATIONS_04 = ["id"];
const ANNOTATIONS_2019 = ["$anchor", "$vocabulary", "$recursiveAnchor"];
const ANNOTATIONS_2020 = ["$dynamicAnchor"];
const NOT_SUPPORTED_YET = [];
const REF_KEYWORDS = {
  "draft-04": ["$ref"],
  "draft-06": ["$ref"],
  "draft-07": ["$ref"],
  "2019-09": ["$ref", "$recursiveRef"],
  "2020-12": ["$ref", "$dynamicRef"]
};
const DRAFT_KEYWORDS = {
  const: ["draft-06", "draft-07", "2019-09", "2020-12"],
  contains: ["draft-06", "draft-07", "2019-09", "2020-12"],
  propertyNames: ["draft-06", "draft-07", "2019-09", "2020-12"],
  if: ["draft-07", "2019-09", "2020-12"],
  then: ["draft-07", "2019-09", "2020-12"],
  else: ["draft-07", "2019-09", "2020-12"],
  additionalItems: ["draft-04", "draft-06", "draft-07", "2019-09"],
  dependentRequired: ["2019-09", "2020-12"],
  dependentSchemas: ["2019-09", "2020-12"],
  minContains: ["2019-09", "2020-12"],
  maxContains: ["2019-09", "2020-12"],
  prefixItems: ["2020-12"],
  unevaluatedProperties: ["2019-09", "2020-12"],
  unevaluatedItems: ["2019-09", "2020-12"]
};
const TYPED_KEYWORDS = {
  properties: "object",
  patternProperties: "object",
  dependencies: "object",
  propertyNames: "object",
  dependentRequired: "object",
  dependentSchemas: "object",
  contains: "array",
  minContains: "array",
  maxContains: "array",
  prefixItems: "array",
  additionalItems: "array",
  unevaluatedItems: "array",
  required: "object",
  additionalProperties: "object",
  unevaluatedProperties: "object",
  minProperties: "object",
  maxProperties: "object",
  items: "array",
  minItems: "array",
  maxItems: "array",
  uniqueItems: "array",
  minLength: "string",
  maxLength: "string",
  pattern: "string",
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "number",
  // Of ajv-formats: limits of the values of a format that can be compared (see formatLimitsOf()).
  formatMinimum: "string",
  formatMaximum: "string",
  formatExclusiveMinimum: "string",
  formatExclusiveMaximum: "string"
};
const FORMAT_LIMIT_KEYWORDS = ["formatMinimum", "formatMaximum", "formatExclusiveMinimum", "formatExclusiveMaximum"];
const UNTYPED_KEYWORDS = [
  "type",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "not",
  "allOf",
  "if",
  "then",
  "else",
  // OpenAPI: which "oneOf" schema applies, by the value of a property (see discriminatorOf()).
  "discriminator"
];
const TYPE_NAMES = ["object", "array", "string", "number", "integer", "boolean", "null"];
let context;
function getTypeNames(json) {
  if (json.type === void 0) {
    return [];
  }
  return Array.isArray(json.type) ? json.type : [json.type];
}
const ANNOTATIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    /* @__PURE__ */ new Set([
      ...ANNOTATIONS,
      ...draft === "draft-04" ? ANNOTATIONS_04 : [],
      ...(0, import_json_schema_refs.isLegacy)(draft) ? [] : ANNOTATIONS_2019,
      ...draft === "2020-12" ? ANNOTATIONS_2020 : []
    ])
  ])
);
const ASSERTIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set(
      [...Object.keys(TYPED_KEYWORDS), ...UNTYPED_KEYWORDS].filter(
        (keyword) => !DRAFT_KEYWORDS[keyword] || DRAFT_KEYWORDS[keyword].includes(draft)
      )
    )
  ])
);
function isAnnotation(keyword, draft) {
  return ANNOTATIONS_OF[draft].has(keyword) || context.annotations.has(keyword);
}
function isAssertion(keyword, draft) {
  return ASSERTIONS_OF[draft].has(keyword) || context.custom.has(keyword);
}
function isIgnored(keyword, draft) {
  return isAnnotation(keyword, draft) || !context.strict && !isAssertion(keyword, draft);
}
function checkKeywords(json, path) {
  const typeNames = getTypeNames(json);
  typeNames.forEach((typeName) => {
    if (!TYPE_NAMES.includes(typeName)) {
      throw new Error(`Unsupported JSON Schema type "${typeName}" at ${path}`);
    }
  });
  if (context.strict && context.knownFormats && typeof json.format === "string" && !context.knownFormats.has(json.format)) {
    throw new Error(
      `Unknown JSON Schema format "${json.format}" at ${path}: name it in the option "formats" ({ "${json.format}": false } leaves it unchecked), or use strict: false`
    );
  }
  const { draft } = context;
  Object.keys(json).forEach((keyword) => {
    if (isIgnored(keyword, draft)) {
      return;
    }
    if (NOT_SUPPORTED_YET.includes(keyword)) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} is not supported yet`);
    }
    if (!isAssertion(keyword, draft)) {
      throw new Error(`Unsupported JSON Schema keyword "${keyword}" at ${path}`);
    }
    const requiredType = TYPED_KEYWORDS[keyword];
    const isDeclared = typeNames.includes(requiredType) || requiredType === "number" && typeNames.includes("integer");
    if (requiredType && context.strict && typeNames.length > 0 && !isDeclared) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} requires "type": "${requiredType}"`);
    }
  });
}
function formatsOf(option) {
  const checks = /* @__PURE__ */ new Map();
  const compares = /* @__PURE__ */ new Map();
  if (option === void 0 || option === false) {
    return { checks, compares, known: void 0 };
  }
  const known = /* @__PURE__ */ new Set();
  const isCheck = (check) => check instanceof RegExp || typeof check === "function";
  const addBuiltIn = (name) => {
    if (!Object.prototype.hasOwnProperty.call(import_formats.FORMATS, name)) {
      throw new Error(
        `Unsupported JSON Schema option "formats": "${name}" is not one of ${Object.keys(import_formats.FORMATS).join(", ")}`
      );
    }
    checks.set(name, import_formats.FORMATS[name]);
    if (import_formats.FORMAT_COMPARES[name]) {
      compares.set(name, import_formats.FORMAT_COMPARES[name]);
    }
  };
  if (option === true) {
    Object.keys(import_formats.FORMATS).forEach(addBuiltIn);
  } else if (Array.isArray(option)) {
    option.forEach(addBuiltIn);
  } else if (option !== null && typeof option === "object") {
    Object.entries(option).forEach(([name, check]) => {
      if (check === true) {
        addBuiltIn(name);
      } else if (isCheck(check)) {
        checks.set(name, check);
      } else if (check !== null && typeof check === "object" && isCheck(check.validate)) {
        if (check.compare !== void 0 && typeof check.compare !== "function") {
          throw new Error(`Unsupported JSON Schema option "formats": the "compare" of "${name}" must be a function`);
        }
        checks.set(name, check.validate);
        if (check.compare) {
          compares.set(name, check.compare);
        }
      } else if (check !== false) {
        throw new Error(
          `Unsupported JSON Schema option "formats": "${name}" must be true, false, a regular expression, a function or { validate, compare }`
        );
      }
      known.add(name);
    });
  } else {
    throw new Error('Unsupported JSON Schema option "formats": expected true, a list of names or an object');
  }
  checks.forEach((check, name) => known.add(name));
  return { checks, compares, known };
}
function builtInFormats() {
  return Object.fromEntries(Object.keys(import_formats.FORMATS).map((name) => [name, true]));
}
function formatLimitsOf(json, check, path) {
  return FORMAT_LIMIT_KEYWORDS.filter((keyword) => json[keyword] !== void 0).flatMap((keyword) => {
    const at = `Unsupported JSON Schema at ${path}: "${keyword}"`;
    if (json.format === void 0) {
      throw new Error(`${at} requires "format"`);
    }
    if (check === void 0) {
      return [];
    }
    const compare = context.formatCompares.get(json.format);
    if (compare === void 0) {
      throw new Error(`${at}: the values of the format "${json.format}" cannot be compared`);
    }
    const limit = json[keyword];
    const isValue = typeof limit === "string" && (check instanceof RegExp ? check.test(limit) : check(limit));
    if (!isValue) {
      throw new Error(`${at} must be a valid ${json.format}`);
    }
    return [{ keyword, limit, compare }];
  });
}
function formatOf(json, path) {
  let check = typeof json.format === "string" ? context.formats.get(json.format) : void 0;
  if (check === import_formats.FORMATS.hostname && (context.draft === "draft-04" || context.draft === "draft-06")) {
    check = import_formats.isRfc1123Hostname;
  }
  const formatLimits = formatLimitsOf(json, check, path);
  return check === void 0 ? {} : { format: json.format, formatCheck: check, formatLimits };
}
function draftOf(options) {
  if (options.draft !== void 0 && !DRAFTS.includes(options.draft)) {
    throw new Error(`Unsupported JSON Schema option "draft": "${options.draft}" is not one of ${DRAFTS.join(", ")}`);
  }
  return options.draft;
}
function useDefaultsOf(options) {
  const { useDefaults = false } = options;
  if (useDefaults !== true && useDefaults !== false && useDefaults !== "empty") {
    throw new Error(`Unsupported JSON Schema option "useDefaults": expected true, false or 'empty'`);
  }
  return useDefaults;
}
function multipleOfPrecisionOf(options) {
  const { multipleOfPrecision } = options;
  if (multipleOfPrecision !== void 0 && !(Number.isInteger(multipleOfPrecision) && multipleOfPrecision > 0)) {
    throw new Error('Unsupported JSON Schema option "multipleOfPrecision": expected a positive integer');
  }
  return multipleOfPrecision;
}
function coerceTypesOf(options) {
  const { coerceTypes = false } = options;
  if (coerceTypes !== true && coerceTypes !== false && coerceTypes !== "array") {
    throw new Error(`Unsupported JSON Schema option "coerceTypes": expected true, false or 'array'`);
  }
  return coerceTypes;
}
function removeAdditionalOf(options) {
  const { removeAdditional = false } = options;
  if (![true, false, "all", "failing"].includes(removeAdditional)) {
    throw new Error(`Unsupported JSON Schema option "removeAdditional": expected true, false, 'all' or 'failing'`);
  }
  return removeAdditional;
}
function strictOf(options) {
  if (options.strict !== void 0 && typeof options.strict !== "boolean") {
    throw new Error('Unsupported JSON Schema option "strict": expected true or false');
  }
  return options.strict !== false;
}
const STANDARD_KEYWORDS = /* @__PURE__ */ new Set([
  ...DRAFTS.flatMap((draft) => [...ANNOTATIONS_OF[draft], ...ASSERTIONS_OF[draft], ...REF_KEYWORDS[draft]])
]);
const MACRO_TYPES = ["object", "array", "string", "number"];
function keywordDefinitionOf(definition) {
  const at = 'Unsupported JSON Schema option "keywords":';
  if (definition === null || typeof definition !== "object" || typeof definition.keyword !== "string") {
    throw new Error(`${at} expected keyword names, or definitions with "keyword"`);
  }
  const { keyword, type, message } = definition;
  if (STANDARD_KEYWORDS.has(keyword)) {
    throw new Error(`${at} "${keyword}" is a keyword of JSON Schema`);
  }
  const ways = ["validate", "compile", "macro"].filter((way) => definition[way] !== void 0);
  if (ways.length !== 1 || typeof definition[ways[0]] !== "function") {
    throw new Error(`${at} "${keyword}" needs one function: "validate", "compile" or "macro"`);
  }
  const types = type === void 0 ? void 0 : [].concat(type);
  const allowed = definition.macro ? MACRO_TYPES : Object.keys(import_keyword.KEYWORD_TYPE_TESTS);
  if (types !== void 0 && (types.length === 0 || !types.every((name) => allowed.includes(name)))) {
    throw new Error(`${at} the "type" of "${keyword}" must be one or more of ${allowed.join(", ")}`);
  }
  if (message !== void 0 && typeof message !== "string" && typeof message !== "function") {
    throw new Error(`${at} the "message" of "${keyword}" must be a string or a function`);
  }
  return { ...definition, types };
}
function keywordsOf(options) {
  const { keywords = [] } = options;
  if (!Array.isArray(keywords)) {
    throw new Error('Unsupported JSON Schema option "keywords": expected a list of keyword names or definitions');
  }
  const annotations = /* @__PURE__ */ new Set();
  const custom = /* @__PURE__ */ new Map();
  keywords.forEach((item) => {
    if (typeof item === "string") {
      annotations.add(item);
    } else {
      const definition = keywordDefinitionOf(item);
      custom.set(definition.keyword, definition);
    }
  });
  return { annotations, custom };
}
const draftOfNode = (json) => context.index.draftOf(json) || context.draft;
const NO_KEYWORDS = [];
const refKeywordsOf = (json) => json.$ref === void 0 && json.$dynamicRef === void 0 && json.$recursiveRef === void 0 ? NO_KEYWORDS : REF_KEYWORDS[draftOfNode(json)].filter((keyword) => json[keyword] !== void 0);
function besideRef(json) {
  const draft = draftOfNode(json);
  const rest = { ...json };
  REF_KEYWORDS[draft].forEach((keyword) => delete rest[keyword]);
  return Object.keys(rest).every((keyword) => isIgnored(keyword, draft)) ? void 0 : rest;
}
function viewOf(node) {
  const view = context.index.viewOf(node);
  if (context.strict) {
    return view;
  }
  const draft = draftOfNode(node);
  const isOther = (keyword) => DRAFT_KEYWORDS[keyword] !== void 0 && !DRAFT_KEYWORDS[keyword].includes(draft);
  if (!Object.keys(view).some(isOther)) {
    return view;
  }
  if (!context.views.has(node)) {
    context.views.set(node, Object.fromEntries(Object.entries(view).filter(([keyword]) => !isOther(keyword))));
  }
  return context.views.get(node);
}
const newScope = (key, anchors) => ({ key, anchors, next: /* @__PURE__ */ new Map() });
function enter(scope, uri) {
  if (uri === void 0) {
    return scope;
  }
  if (!scope.next.has(uri)) {
    const added = [...context.index.dynamicAnchorsOf(uri).keys()].filter((name) => !scope.anchors.has(name));
    if (added.length === 0) {
      scope.next.set(uri, scope);
    } else {
      const anchors = new Map(scope.anchors);
      added.forEach((name) => anchors.set(name, uri));
      const key = [...anchors].map(([name, resource]) => `${name}=${resource}`).join("\n");
      if (!context.scopes.has(key)) {
        context.scopes.set(key, newScope(key, anchors));
      }
      scope.next.set(uri, context.scopes.get(key));
    }
  }
  return scope.next.get(uri);
}
const enterNode = (scope, node) => context.index.dynamicAnchors.size === 0 ? scope : enter(scope, context.index.resourceOf(node));
function anchorName(ref) {
  const index = ref.indexOf("#");
  if (index === -1) {
    return void 0;
  }
  const name = ref.slice(index + 1);
  if (name === "" || name.startsWith("/")) {
    return void 0;
  }
  try {
    return decodeURIComponent(name);
  } catch (e) {
    return void 0;
  }
}
function resolveTarget(json, keyword, scope) {
  const { index } = context;
  if (keyword === "$ref") {
    return index.resolve(json);
  }
  const initial = index.resolve(json, keyword === "$recursiveRef" ? "#" : json[keyword]);
  const isObject2 = initial !== null && typeof initial === "object";
  let name;
  if (keyword === "$dynamicRef") {
    name = anchorName(json.$dynamicRef);
    if (name === void 0 || !isObject2 || initial.$dynamicAnchor !== name) {
      return initial;
    }
  } else {
    name = "";
    if (!isObject2 || initial.$recursiveAnchor !== true) {
      return initial;
    }
  }
  const resource = scope.anchors.get(name);
  return resource === void 0 ? initial : index.dynamicAnchorsOf(resource).get(name);
}
const customKeywordsOf = (json) => context.custom.size === 0 ? NO_KEYWORDS : Object.keys(json).filter((keyword) => context.custom.has(keyword));
function customPartOf(node, json, keyword) {
  if (!context.customParts.has(node)) {
    context.customParts.set(node, /* @__PURE__ */ new Map());
  }
  const parts = context.customParts.get(node);
  if (!parts.has(keyword)) {
    const definition = context.custom.get(keyword);
    const value = json[keyword];
    const it = { draft: context.draft };
    let part;
    if (definition.macro) {
      part = definition.macro(value, json, it);
    } else if (definition.compile) {
      part = definition.compile(value, json, it);
      if (typeof part !== "function" && !(part instanceof RegExp)) {
        throw new Error(
          `Unsupported JSON Schema: the "compile" of keyword "${keyword}" must return a function or a regular expression`
        );
      }
    } else {
      part = (data) => definition.validate(value, data, json);
    }
    parts.set(keyword, part);
  }
  return parts.get(keyword);
}
function acceptsNull(json, seen = void 0, outerScope = context.scope) {
  if (json === true) {
    return true;
  }
  if (json === false || json === null || typeof json !== "object") {
    return false;
  }
  if (typeof json.type === "string" && json.type !== "null" && json.nullable !== true && json.$ref === void 0 && json.$dynamicRef === void 0 && json.$recursiveRef === void 0 && !context.index.ignoresKeywords(json)) {
    return false;
  }
  const scope = enterNode(outerScope, json);
  const view = viewOf(json);
  const refKeywords = refKeywordsOf(json);
  if (refKeywords.length > 0) {
    if (seen === void 0) {
      seen = /* @__PURE__ */ new Set();
    } else if (seen.has(json)) {
      return false;
    }
    seen.add(json);
    const followed = (0, import_json_schema_refs.isLegacy)(draftOfNode(json)) ? ["$ref"] : refKeywords;
    const result = followed.every((keyword) => {
      const target = resolveTarget(json, keyword, scope);
      return target !== void 0 && acceptsNull(target, seen, scope);
    });
    seen.delete(json);
    const rest = (0, import_json_schema_refs.isLegacy)(draftOfNode(json)) ? void 0 : besideRef(view);
    return result && (rest === void 0 || acceptsNull(rest, seen, scope));
  }
  if (view.nullable === true) {
    return true;
  }
  const checks = [];
  if (view.type !== void 0) {
    checks.push(getTypeNames(view).includes("null"));
  }
  if (view.enum) {
    checks.push(view.enum.includes(null));
  }
  if ("const" in view) {
    checks.push(view.const === null);
  }
  if (view.anyOf) {
    checks.push(view.anyOf.some((item) => acceptsNull(item, seen, scope)));
  }
  if (view.oneOf) {
    checks.push(view.oneOf.filter((item) => acceptsNull(item, seen, scope)).length === 1);
  }
  if (view.not !== void 0) {
    checks.push(!acceptsNull(view.not, seen, scope));
  }
  if (view.allOf) {
    checks.push(view.allOf.every((item) => acceptsNull(item, seen, scope)));
  }
  if (view.if !== void 0) {
    const branch = acceptsNull(view.if, seen, scope) ? view.then : view.else;
    checks.push(branch === void 0 || acceptsNull(branch, seen, scope));
  }
  customKeywordsOf(view).forEach((keyword) => {
    const definition = context.custom.get(keyword);
    if (definition.types === void 0 || definition.types.includes("null")) {
      const part = customPartOf(json, view, keyword);
      checks.push(definition.macro ? acceptsNull(part, seen, scope) : Boolean(part(null)));
    }
  });
  return checks.every(Boolean);
}
function asInner(type) {
  type.isMandatory = false;
  type.isNullable = true;
  return type;
}
function combine(types, Type) {
  if (types.length === 0) {
    return new import_types.AnyType();
  }
  if (types.length === 1) {
    return types[0];
  }
  return new Type({ types: types.map(asInner) });
}
let convert;
function requiredDependency(key, dependency, path) {
  if (!Array.isArray(dependency) || !dependency.every((property) => typeof property === "string")) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected property names`);
  }
  return { key, required: dependency };
}
function convertDependencies(json, path) {
  const dependencies = json.dependencies || {};
  const dependentRequired = json.dependentRequired || {};
  const dependentSchemas = json.dependentSchemas || {};
  return [
    ...Object.keys(dependencies).map((key) => {
      const dependency = dependencies[key];
      const at = `${path}.dependencies.${key}`;
      return Array.isArray(dependency) ? requiredDependency(key, dependency, at) : { key, type: asInner(convert(dependency, at)) };
    }),
    ...Object.keys(dependentRequired).map(
      (key) => requiredDependency(key, dependentRequired[key], `${path}.dependentRequired.${key}`)
    ),
    ...Object.keys(dependentSchemas).map((key) => ({
      key,
      type: asInner(convert(dependentSchemas[key], `${path}.dependentSchemas.${key}`))
    }))
  ];
}
function collectDefaults(items, keys, path) {
  if (!context.useDefaults) {
    return [];
  }
  const empty = context.useDefaults === "empty";
  return keys.filter((key) => {
    const item = items[key];
    return item !== null && typeof item === "object" && !Array.isArray(item) && item.default !== void 0;
  }).filter((key) => {
    if (context.composite === 0) {
      return true;
    }
    if (context.strict) {
      throw new Error(
        `Unsupported JSON Schema at ${path}: "default" of "${key}" is ignored inside "anyOf", "oneOf", "not" and "if" (useDefaults); use strict: false to ignore it`
      );
    }
    return false;
  }).map((key) => {
    if (key === "__proto__") {
      throw new Error(`Unsupported JSON Schema at ${path}: "default" of "__proto__" (useDefaults)`);
    }
    return { key, value: items[key].default, empty };
  });
}
function removalOf(json) {
  const mode = context.removeAdditional;
  const { additionalProperties } = json;
  if (mode === "all" && (json.properties !== void 0 || additionalProperties !== void 0)) {
    return "delete";
  }
  if (mode && additionalProperties === false) {
    return "delete";
  }
  const isSchema = additionalProperties !== null && typeof additionalProperties === "object";
  return mode === "failing" && isSchema ? "failing" : void 0;
}
function inComposite(convertIt) {
  context.composite += 1;
  try {
    return convertIt();
  } finally {
    context.composite -= 1;
  }
}
function convertObject(json, path) {
  const properties = json.properties || {};
  const required = json.required || [];
  const { additionalProperties } = json;
  const additionalType = additionalProperties !== void 0 && typeof additionalProperties === "object" ? convert(additionalProperties, `${path}.additionalProperties`) : void 0;
  const definition = /* @__PURE__ */ Object.create(null);
  Object.keys(properties).forEach((key) => {
    definition[key] = convert(properties[key], `${path}.properties.${key}`, required.includes(key));
  });
  const patternProperties = json.patternProperties || {};
  const patternTypes = Object.keys(patternProperties).map((source) => ({
    pattern: new RegExp(source, "u"),
    type: convert(patternProperties[source], `${path}.patternProperties.${source}`)
  }));
  const removal = removalOf(json);
  required.filter((key) => !Object.prototype.hasOwnProperty.call(definition, key)).forEach((key) => {
    const isAdditional = !removal && additionalProperties !== void 0 && !patternTypes.some(({ pattern }) => pattern.test(key));
    definition[key] = isAdditional ? convert(additionalProperties, `${path}.additionalProperties`) : new import_types.AnyType({ isNullable: true });
  });
  const schema = new import_schema.Schema(definition, {
    isOpen: additionalProperties !== false,
    additionalType,
    patternTypes,
    dependencies: convertDependencies(json, path),
    propertyNameType: json.propertyNames === void 0 ? void 0 : convert(json.propertyNames, `${path}.propertyNames`),
    minProperties: json.minProperties,
    maxProperties: json.maxProperties,
    defaults: collectDefaults(properties, Object.keys(properties), `${path}.properties`),
    removeAdditional: removal
  });
  schema.propertyKeys = Object.keys(properties);
  schema.evaluatesAllKeys = additionalProperties !== void 0;
  return schema;
}
const tuple = (items, keyword, path) => items.map((item, i) => convert(item, `${path}.${keyword}[${i}]`, false));
function convertArray(json, path) {
  const { items } = json;
  let type;
  let additionalType;
  if (context.draft === "2020-12") {
    if (Array.isArray(items)) {
      throw new Error(`Unsupported JSON Schema at ${path}: in draft 2020-12 "items" is a schema; use "prefixItems"`);
    }
    const rest = items === void 0 ? void 0 : convert(items, `${path}.items`);
    if (json.prefixItems !== void 0) {
      if (!Array.isArray(json.prefixItems)) {
        throw new Error(`Unsupported JSON Schema at ${path}: "prefixItems" must be an array`);
      }
      type = tuple(json.prefixItems, "prefixItems", path);
      additionalType = rest;
    } else {
      type = rest;
    }
  } else {
    if (Array.isArray(items)) {
      type = tuple(items, "items", path);
    } else if (items !== void 0) {
      type = convert(items, `${path}.items`);
    }
    additionalType = Array.isArray(items) && json.additionalItems !== void 0 ? convert(json.additionalItems, `${path}.additionalItems`) : void 0;
  }
  const contains = json.contains === void 0 ? void 0 : convert(json.contains, `${path}.contains`);
  let tupleItems = Array.isArray(items) && context.draft !== "2020-12" ? items : void 0;
  if (context.draft === "2020-12" && Array.isArray(json.prefixItems)) {
    tupleItems = json.prefixItems;
  }
  const array = new import_types.ArrayOfType({
    defaults: tupleItems ? collectDefaults(
      tupleItems,
      tupleItems.map((item, i) => i),
      path
    ) : [],
    type,
    min: json.minItems,
    max: json.maxItems,
    unique: json.uniqueItems,
    contains,
    minContains: json.minContains,
    maxContains: json.maxContains,
    additionalType
  });
  array.containsEvaluates = context.draft === "2020-12";
  return array;
}
function convertNumber(json, Type, path) {
  if (json.multipleOf !== void 0 && !(typeof json.multipleOf === "number" && json.multipleOf > 0)) {
    throw new Error(`Unsupported JSON Schema at ${path}: "multipleOf" must be a number greater than 0`);
  }
  const isDraft04 = context.draft === "draft-04";
  ["exclusiveMinimum", "exclusiveMaximum"].forEach((keyword) => {
    const expected = isDraft04 ? "boolean" : "number";
    const actual = typeof json[keyword];
    if (json[keyword] !== void 0 && actual !== expected) {
      throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a ${expected} in ${context.draft}`);
    }
  });
  if (isDraft04) {
    return new Type({
      min: json.exclusiveMinimum === true ? void 0 : json.minimum,
      max: json.exclusiveMaximum === true ? void 0 : json.maximum,
      exclusiveMin: json.exclusiveMinimum === true ? json.minimum : void 0,
      exclusiveMax: json.exclusiveMaximum === true ? json.maximum : void 0,
      multipleOf: json.multipleOf,
      multipleOfPrecision: context.multipleOfPrecision
    });
  }
  return new Type({
    min: json.minimum,
    max: json.maximum,
    exclusiveMin: json.exclusiveMinimum,
    exclusiveMax: json.exclusiveMaximum,
    multipleOf: json.multipleOf,
    multipleOfPrecision: context.multipleOfPrecision
  });
}
function convertTypeName(typeName, json, path) {
  switch (typeName) {
    case "object":
      return convertObject(json, path);
    case "array":
      return convertArray(json, path);
    case "string":
      return new import_types.StringType({
        min: json.minLength,
        max: json.maxLength,
        pattern: json.pattern === void 0 ? void 0 : new RegExp(json.pattern, "u"),
        allowEmpty: false,
        countCodePoints: true,
        ...formatOf(json, path)
      });
    case "number":
      return convertNumber(json, import_types.FloatType, path);
    case "integer":
      return convertNumber(json, import_types.IntegerType, path);
    case "boolean":
      return new import_types.BooleanType();
    default:
      return new import_types.ValuesType({ values: [null], isNullable: true });
  }
}
function convertUntyped(json, path) {
  const jsonTypes = [...new Set(Object.keys(json).map((keyword) => TYPED_KEYWORDS[keyword]))].filter(Boolean);
  return jsonTypes.map(
    (jsonType) => new import_types.WhenType({
      jsonType,
      type: asInner(convertTypeName(jsonType, json, path))
    })
  );
}
function addUnevaluated(parts, json, path) {
  if (json.unevaluatedProperties === void 0 && json.unevaluatedItems === void 0) {
    return;
  }
  const siblings = [...parts];
  if (json.unevaluatedProperties !== void 0) {
    const type = convert(json.unevaluatedProperties, `${path}.unevaluatedProperties`);
    parts.push(new import_unevaluated.UnevaluatedType({ kind: "properties", siblings, type }));
  }
  if (json.unevaluatedItems !== void 0) {
    const type = convert(json.unevaluatedItems, `${path}.unevaluatedItems`);
    parts.push(new import_unevaluated.UnevaluatedType({ kind: "items", siblings, type }));
  }
}
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function referencedSchemas(item) {
  const schemas = [];
  let schema = item;
  while (isObject(schema) && !schemas.includes(schema)) {
    schemas.push(schema);
    if (typeof schema.$ref !== "string" || schema.properties !== void 0) {
      break;
    }
    schema = context.index.resolve(schema);
  }
  return schemas;
}
function tagValuesOf(schema, tag) {
  const property = isObject(schema) && isObject(schema.properties) ? schema.properties[tag] : void 0;
  if (!isObject(property)) {
    return void 0;
  }
  if ("const" in property) {
    return [property.const];
  }
  return Array.isArray(property.enum) ? property.enum : void 0;
}
function schemaNameOf(item) {
  if (!isObject(item) || typeof item.$ref !== "string") {
    return void 0;
  }
  const hash = item.$ref.indexOf("#");
  const pointer = hash === -1 ? "" : item.$ref.slice(hash + 1);
  if (!pointer.startsWith("/")) {
    return void 0;
  }
  try {
    const token = decodeURIComponent(pointer.slice(pointer.lastIndexOf("/") + 1));
    return token.replace(/~1/g, "/").replace(/~0/g, "~") || void 0;
  } catch (e) {
    return void 0;
  }
}
function discriminatorOf(json, path) {
  const { discriminator } = json;
  const at = `Unsupported JSON Schema at ${path}: "discriminator"`;
  if (!isObject(discriminator) || typeof discriminator.propertyName !== "string") {
    throw new Error(`${at} requires "propertyName"`);
  }
  const tag = discriminator.propertyName;
  if (discriminator.mapping !== void 0 && !isObject(discriminator.mapping)) {
    throw new Error(`${at}: "mapping" must be an object of references or schema names by value`);
  }
  const branches = json.oneOf.map((item) => ({ schemas: referencedSchemas(item), name: schemaNameOf(item) }));
  const mapping = /* @__PURE__ */ new Map();
  let exact = true;
  const add = (value, i) => {
    if (typeof value !== "string" || mapping.has(value)) {
      throw new Error(`${at}: the values of "${tag}" must be unique strings`);
    }
    mapping.set(value, i);
  };
  Object.entries(discriminator.mapping || {}).forEach(([value, target]) => {
    if (typeof target !== "string") {
      throw new Error(`${at}: "mapping"."${value}" must be a reference or a schema name`);
    }
    const isName = !target.includes("#") && !target.includes("/");
    const node = isName ? void 0 : context.index.resolve(json, target);
    const i = branches.findIndex(({ schemas, name }) => isName ? name === target : schemas.includes(node));
    if (i === -1) {
      throw new Error(`${at}: "mapping"."${value}" ("${target}") is not one of the "oneOf" schemas`);
    }
    add(value, i);
    exact = false;
  });
  let requiredByAll = true;
  branches.forEach(({ schemas, name }, i) => {
    const schema = schemas[schemas.length - 1];
    const values = tagValuesOf(schema, tag);
    if (values !== void 0) {
      values.forEach((value) => add(value, i));
    } else if (![...mapping.values()].includes(i)) {
      if (name === void 0) {
        throw new Error(
          `${at}: every "oneOf" schema needs a value of "${tag}": a "const" or "enum" in "properties"."${tag}", an entry of "mapping", or a "$ref" to a schema named as the value`
        );
      }
      add(name, i);
      exact = false;
    }
    requiredByAll = requiredByAll && Array.isArray(schema.required) && schema.required.includes(tag);
  });
  if (!requiredByAll && !(Array.isArray(json.required) && json.required.includes(tag))) {
    throw new Error(`${at}: "${tag}" must be required`);
  }
  return { tag, mapping, exact };
}
function implicitDiscriminatorOf(json) {
  if (json.oneOf.length < 2) {
    return void 0;
  }
  const schemas = json.oneOf.map((item) => {
    const chain = referencedSchemas(item);
    return chain[chain.length - 1];
  });
  const first = schemas[0];
  const candidates = isObject(first) && isObject(first.properties) ? Object.keys(first.properties) : [];
  for (let c = 0; c < candidates.length; c += 1) {
    const tag = candidates[c];
    const mapping = /* @__PURE__ */ new Map();
    const isTag = schemas.every((schema, i) => {
      const values = tagValuesOf(schema, tag);
      return values !== void 0 && values.length > 0 && values.every((value) => typeof value === "string" && !mapping.has(value) && mapping.set(value, i));
    });
    if (isTag) {
      return { tag, mapping, exact: true, auto: true };
    }
  }
  return void 0;
}
function convertCustom(node, json, path) {
  return customKeywordsOf(json).flatMap((keyword) => {
    const definition = context.custom.get(keyword);
    const part = customPartOf(node, json, keyword);
    if (definition.macro) {
      const type = convert(part, `${path}.${keyword}`);
      if (definition.types === void 0) {
        return [type];
      }
      return definition.types.map((jsonType) => new import_types.WhenType({ jsonType, type: asInner(type) }));
    }
    const value = json[keyword];
    let { message } = definition;
    if (typeof message === "function" && message.length < 2) {
      message = message(value);
    } else if (typeof message === "function") {
      const text = message;
      message = (data) => text(value, data);
    } else if (message === void 0) {
      message = `must pass the "${keyword}" keyword`;
    }
    [part, message].filter((fn) => typeof fn === "function").forEach((fn) => {
      fn.validatorKeyword = keyword;
    });
    return [
      new import_keyword.KeywordType({
        keyword,
        check: part,
        message,
        jsonTypes: definition.types,
        isMandatory: false,
        isNullable: true
      })
    ];
  });
}
let convertNode;
convert = (json, path, isMandatory = true) => {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return convertNode(json, path, isMandatory);
  }
  const { scope, draft } = context;
  context.scope = enterNode(scope, json);
  context.draft = context.index.draftOf(json) || draft;
  try {
    return convertNode(json, path, isMandatory);
  } finally {
    context.scope = scope;
    context.draft = draft;
  }
};
const merged = /* @__PURE__ */ new WeakMap();
function mergedNode(node, path) {
  if (merged.has(node)) return merged.get(node);
  const keyword = node.$merge !== void 0 ? "$merge" : "$patch";
  const spec = node[keyword];
  if (!spec || typeof spec !== "object" || spec.source === void 0 || spec.with === void 0) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${keyword} is { source, with }`);
  }
  const { index } = context;
  let source = spec.source;
  if (source && typeof source === "object" && typeof source.$ref === "string") {
    source = index.resolve(node, source.$ref);
    if (source === void 0) {
      throw new Error(
        `Unsupported JSON Schema at ${path}: the source of ${keyword} (${spec.source.$ref}) is not there`
      );
    }
  }
  if (source && typeof source === "object" && (source.$merge !== void 0 || source.$patch !== void 0)) {
    source = mergedNode(source, path);
  }
  const what = `${keyword} at ${path}`;
  let made;
  try {
    made = keyword === "$merge" ? (0, import_merge_patch.mergePatch)(source, spec.with) : (0, import_merge_patch.applyPatch)(source, spec.with, what);
  } catch (err) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${err.message}`);
  }
  if (made && typeof made === "object" && !Array.isArray(made)) {
    delete made.$id;
    delete made.id;
    index.visit(made, index.bases.get(node) ?? index.bases.get(index.root));
  }
  merged.set(node, made);
  return made;
}
convertNode = (node, path, isMandatory) => {
  if (node === true) {
    return new import_types.AnyType({ isMandatory, isNullable: true });
  }
  if (node === false) {
    return new import_types.NeverType({ isMandatory, isNullable: false });
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected an object or a boolean`);
  }
  if (node.$merge !== void 0 || node.$patch !== void 0) {
    return convertNode(mergedNode(node, path), path, isMandatory);
  }
  const json = viewOf(node);
  let refKeywords = NO_KEYWORDS;
  if (!(0, import_json_schema_refs.isLegacy)(context.draft)) {
    refKeywords = refKeywordsOf(json);
  } else if (json.$ref !== void 0) {
    refKeywords = ["$ref"];
  }
  if (refKeywords.length > 0) {
    const refs = refKeywords.map((keyword) => {
      if (typeof json[keyword] !== "string") {
        throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a string`);
      }
      if (keyword === "$recursiveRef" && json.$recursiveRef !== "#") {
        throw new Error(`Unsupported JSON Schema at ${path}: "$recursiveRef" must be "#"`);
      }
      const ref = new import_types.RefType({
        ref: json[keyword],
        isMandatory,
        isNullable: true
      });
      context.pending.push({
        ref,
        json: node,
        keyword,
        path,
        scope: context.scope,
        composite: context.composite
      });
      return ref;
    });
    const rest = (0, import_json_schema_refs.isLegacy)(context.draft) ? void 0 : besideRef(json);
    if (rest === void 0 && refs.length === 1) {
      return refs[0];
    }
    const { unevaluatedProperties, unevaluatedItems, ...others } = rest || {};
    const parts = [...refs];
    if (rest !== void 0 && besideRef(others) !== void 0) {
      parts.push(convertNode(others, path, true));
    }
    addUnevaluated(parts, json, path);
    const type2 = new import_types.AllOfType({ types: parts.map(asInner) });
    type2.isMandatory = isMandatory;
    type2.isNullable = acceptsNull(node);
    return type2;
  }
  checkKeywords(json, path);
  const typeNames = getTypeNames(json);
  const nonNullNames = typeNames.filter((typeName) => typeName !== "null");
  const namesToConvert = nonNullNames.length > 0 ? nonNullNames : typeNames;
  const constraints = [];
  if (namesToConvert.length === 0) {
    constraints.push(...convertUntyped(json, path));
  } else {
    constraints.push(
      combine(
        namesToConvert.map((typeName) => convertTypeName(typeName, json, path)),
        import_types.AnyOfType
      )
    );
  }
  const hasStringKeyword = () => Object.keys(json).some((keyword) => TYPED_KEYWORDS[keyword] === "string");
  if (namesToConvert.length === 0 && !hasStringKeyword() && formatOf(json, path).format !== void 0) {
    constraints.push(
      new import_types.WhenType({
        jsonType: "string",
        type: asInner(new import_types.StringType(formatOf(json, path)))
      })
    );
  }
  if (json.enum) {
    constraints.push(new import_types.ValuesType({ values: json.enum }));
  }
  if ("const" in json) {
    constraints.push(new import_types.ValuesType({ values: [json.const] }));
  }
  if (json.anyOf) {
    constraints.push(
      combine(
        inComposite(() => json.anyOf.map((item, i) => convert(item, `${path}.anyOf[${i}]`))),
        import_types.AnyOfType
      )
    );
  }
  if (json.oneOf) {
    if (!Array.isArray(json.oneOf) || json.oneOf.length === 0) {
      throw new Error(`Unsupported JSON Schema at ${path}: "oneOf" must be a non-empty array`);
    }
    const types = inComposite(() => json.oneOf.map((item, i) => asInner(convert(item, `${path}.oneOf[${i}]`))));
    const discriminator = json.discriminator === void 0 ? implicitDiscriminatorOf(json) : discriminatorOf(json, path);
    constraints.push(new import_types.OneOfType({ types, discriminator }));
  } else if (json.discriminator !== void 0) {
    throw new Error(`Unsupported JSON Schema at ${path}: "discriminator" requires "oneOf"`);
  }
  if (json.not !== void 0) {
    constraints.push(new import_types.NotType({ type: asInner(inComposite(() => convert(json.not, `${path}.not`))) }));
  }
  if (json.allOf) {
    json.allOf.forEach((item, i) => constraints.push(convert(item, `${path}.allOf[${i}]`)));
  }
  const keepsIf = json.then !== void 0 || json.else !== void 0 || !(0, import_json_schema_refs.isLegacy)(context.draft);
  if (json.if !== void 0 && keepsIf) {
    const branch = (keyword) => json[keyword] === void 0 ? void 0 : asInner(convert(json[keyword], `${path}.${keyword}`));
    constraints.push(
      new import_types.ConditionalType({
        ifType: asInner(inComposite(() => convert(json.if, `${path}.if`))),
        thenType: branch("then"),
        elseType: branch("else")
      })
    );
  }
  constraints.push(...convertCustom(node, json, path));
  addUnevaluated(constraints, json, path);
  const type = combine(constraints, import_types.AllOfType);
  type.isMandatory = isMandatory;
  type.isNullable = acceptsNull(node);
  if (context.coerceTypes) {
    const coerceTypes = json.nullable === true && typeNames.length > 0 && !typeNames.includes("null") ? [...typeNames, "null"] : typeNames;
    const coerceTo = coerceTypes.filter(
      (typeName) => import_coerce.COERCIBLE.includes(typeName) || typeName === "array" && context.coerceTypes === "array"
    );
    if (coerceTo.length > 0) {
      type.coerceSpec = { types: coerceTypes, to: coerceTo, array: context.coerceTypes === "array" };
    }
  }
  return type;
};
function resolveReferences() {
  while (context.pending.length > 0) {
    const { ref, json, keyword, path, scope, composite } = context.pending.shift();
    const target = resolveTarget(json, keyword, scope);
    if (target === void 0) {
      const error = new Error(
        `Unsupported JSON Schema "${keyword}": "${json[keyword]}" at ${path}: only references within the schema or to documents in the "schemas" option are supported`
      );
      error.missingSchema = context.index.missingDocument(json, keyword === "$recursiveRef" ? "#" : json[keyword]);
      throw error;
    }
    const targetScope = enterNode(scope, target);
    if (!context.targets.has(target)) {
      context.targets.set(target, /* @__PURE__ */ new Map());
    }
    const byScope = context.targets.get(target);
    const key = context.useDefaults && composite > 0 ? `${targetScope.key}
(composite)` : targetScope.key;
    if (!byScope.has(key)) {
      context.scope = targetScope;
      context.composite = composite;
      byScope.set(key, convert(target, json[keyword]));
      context.composite = 0;
    }
    ref.target = byScope.get(key);
  }
}
function fromJsonSchema(json, options = {}) {
  const strict = strictOf(options);
  const { annotations, custom } = keywordsOf(options);
  const useDefaults = useDefaultsOf(options);
  const coerceTypes = coerceTypesOf(options);
  const multipleOfPrecision = multipleOfPrecisionOf(options);
  const formats = formatsOf(options.formats);
  const removeAdditional = removeAdditionalOf(options);
  const index = new import_json_schema_refs.RefIndex(json, options.schemas, draftOf(options));
  const emptyScope = newScope("", /* @__PURE__ */ new Map());
  context = {
    draft: index.draft,
    index,
    // Target node to the type converted for it, by the key of the scope it was converted in.
    targets: /* @__PURE__ */ new Map(),
    pending: [],
    // Scopes by key, so the same anchors give the same scope.
    scopes: /* @__PURE__ */ new Map([["", emptyScope]]),
    // The formats checked, by name (see formatsOf()).
    formats: formats.checks,
    // The comparisons of the formats whose values can be compared (see formatLimitsOf()).
    formatCompares: formats.compares,
    // With the option "formats", the names it gives (see checkKeywords()).
    knownFormats: formats.known,
    scope: emptyScope,
    // Options "strict" and "keywords" (see isIgnored()), and the nodes without the keywords of other drafts (viewOf()).
    strict,
    annotations,
    custom,
    views: /* @__PURE__ */ new Map(),
    // What the keywords of your own give for each node, by keyword: the schema of a macro, or the check.
    customParts: /* @__PURE__ */ new Map(),
    // Options "useDefaults" and "removeAdditional", and how many "anyOf", "oneOf", "not" or "if" the node being
    // converted is inside (see collectDefaults()).
    useDefaults,
    removeAdditional,
    composite: 0,
    // Option "coerceTypes" (see coerce.js).
    coerceTypes,
    // Option "multipleOfPrecision" (see FloatType.isMultiple()).
    multipleOfPrecision
  };
  try {
    const type = convert(json, "#");
    const rootScope = enterNode(emptyScope, json);
    context.targets.set(json, /* @__PURE__ */ new Map([[rootScope.key, type]]));
    resolveReferences();
    const spec = coerceTypes ? (0, import_coerce.coerceSpecOf)(type) : void 0;
    return spec ? new import_coerce.CoerceType({ type, spec }) : type;
  } finally {
    context = void 0;
  }
}
function compileJsonSchema(json, options = {}) {
  return (0, import_compile.compileType)(fromJsonSchema(json, options), options);
}
async function loadJsonSchemas(json, options = {}) {
  if (typeof options.loadSchema !== "function") {
    throw new Error('Unsupported JSON Schema option "loadSchema": expected an async function (uri) => schema');
  }
  const schemas = Object.fromEntries((0, import_json_schema_refs.documentsOf)(options.schemas).map(({ uri, schema }) => [uri, schema]));
  const loaded = /* @__PURE__ */ new Set();
  for (; ; ) {
    try {
      fromJsonSchema(json, { ...options, schemas });
      return schemas;
    } catch (e) {
      const uri = e.missingSchema;
      if (uri === void 0 || loaded.has(uri)) {
        throw e;
      }
      loaded.add(uri);
      schemas[uri] = await options.loadSchema(uri);
    }
  }
}
async function compileJsonSchemaAsync(json, options = {}) {
  const schemas = await loadJsonSchemas(json, options);
  return compileJsonSchema(json, { ...options, schemas });
}

},
"@xufa/schema/lib/merge-patch.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var merge_patch_exports = {};
__export(merge_patch_exports, {
  applyPatch: () => applyPatch,
  mergePatch: () => mergePatch
});
module.exports = __toCommonJS(merge_patch_exports);
const isPlain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
function mergePatch(target, patch) {
  if (!isPlain(patch)) return clone(patch);
  const out = isPlain(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}
function locate(document, pointer, what) {
  if (pointer === "") return { parent: null, key: null };
  if (!pointer.startsWith("/")) throw new Error(`${what}: ${pointer} is not a JSON Pointer`);
  const keys = pointer.slice(1).split("/").map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  let parent = document;
  for (const key of keys.slice(0, -1)) {
    parent = parent === null || typeof parent !== "object" ? void 0 : parent[key];
    if (parent === void 0) throw new Error(`${what}: no ${pointer}`);
  }
  return { parent, key: keys[keys.length - 1] };
}
function getAt(document, pointer, what) {
  if (pointer === "") return document;
  const { parent, key } = locate(document, pointer, what);
  if (parent === null || typeof parent !== "object" || !(key in parent)) throw new Error(`${what}: no ${pointer}`);
  return parent[key];
}
function applyPatch(document, operations, what) {
  if (!Array.isArray(operations)) throw new Error(`${what}: "with" is a list of operations (JSON Patch)`);
  let doc = clone(document);
  const put = (pointer, value, replace) => {
    if (pointer === "") {
      doc = value;
      return;
    }
    const { parent, key } = locate(doc, pointer, what);
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`${what}: no ${pointer}`);
      if (replace) parent[index] = value;
      else parent.splice(index, 0, value);
    } else if (parent !== null && typeof parent === "object") {
      if (replace && !(key in parent)) throw new Error(`${what}: no ${pointer} to replace`);
      parent[key] = value;
    } else throw new Error(`${what}: no ${pointer}`);
  };
  const take = (pointer) => {
    const { parent, key } = locate(doc, pointer, what);
    const value = getAt(doc, pointer, what);
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return value;
  };
  for (const operation of operations) {
    const { op, path, from, value } = operation || {};
    if (typeof path !== "string") throw new Error(`${what}: an operation without a path`);
    if (op === "add") put(path, clone(value), false);
    else if (op === "remove") take(path);
    else if (op === "replace") put(path, clone(value), true);
    else if (op === "move") put(path, take(from), false);
    else if (op === "copy") put(path, clone(getAt(doc, from, what)), false);
    else if (op === "test") {
      if (JSON.stringify(getAt(doc, path, what)) !== JSON.stringify(value)) {
        throw new Error(`${what}: the test of ${path} failed`);
      }
    } else throw new Error(`${what}: ${op} is not an operation of JSON Patch`);
  }
  return doc;
}

},
"@xufa/schema/lib/schema.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  Schema: () => Schema
});
module.exports = __toCommonJS(schema_exports);
var import_types = require("./types/index.js");
var import_validate_type = require("./types/validate-type.js");
var import_defaults = require("./defaults.js");
var import_coerce = require("./coerce.js");
var compileModule = __toESM(require("./compile.js"));
function ownValue(obj, key) {
  const value = obj[key];
  if (value === void 0 || obj.__proto__ === Object.prototype && !(key in Object.prototype)) {
    return value;
  }
  return Object.prototype.hasOwnProperty.call(obj, key) ? value : void 0;
}
class Schema {
  constructor(schema = {}, options = {}) {
    this.schema = schema;
    this.options = options;
    this.isOpen = options.isOpen === void 0 ? true : options.isOpen;
    this.isMandatory = options.isMandatory === void 0 ? true : options.isMandatory;
    this.isNullable = options.isNullable === void 0 ? false : options.isNullable;
    this.additionalType = (0, import_types.toType)(options.additionalType, "Schema additionalType");
    this.patternTypes = (options.patternTypes || []).map((item, i) => ({
      ...item,
      type: (0, import_types.toType)(item.type, `Schema patternTypes[${i}].type`)
    }));
    this.minProperties = options.minProperties;
    this.maxProperties = options.maxProperties;
    this.defaults = options.defaults || [];
    this.removeAdditional = options.removeAdditional;
    this.dependencies = (options.dependencies || []).map(
      (item, i) => item.type === void 0 ? item : { ...item, type: (0, import_types.toType)(item.type, `Schema dependencies[${i}].type`) }
    );
    this.propertyNameType = (0, import_types.toType)(options.propertyNameType, "Schema propertyNameType");
    this.visitObjs();
    this.keys = Object.keys(this.schema);
    this.keySet = new Set(this.keys);
  }
  visitObjs() {
    let options;
    const nestedOptions = () => {
      if (options === void 0) {
        options = {
          ...this.options,
          patternTypes: void 0,
          dependencies: void 0,
          propertyNameType: void 0,
          defaults: void 0,
          removeAdditional: void 0
        };
      }
      return options;
    };
    const keys = Object.keys(this.schema);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = this.schema[key];
      if (!(value instanceof Schema)) {
        if (!(value instanceof import_types.ValidateType)) {
          this.schema[key] = new Schema(value, nestedOptions());
        } else if (value instanceof import_types.ObjType && !(value.schema instanceof import_types.ValidateType && !(value.schema instanceof Schema))) {
          this.schema[key] = new Schema(
            value.shape instanceof Schema ? value.shape.schema : value.shape,
            nestedOptions()
          );
        }
      }
    }
  }
  // Fast boolean check equivalent to validate(obj).length === 0 that builds no messages.
  isValid(obj) {
    if (obj === void 0) {
      return !this.isMandatory;
    }
    if (obj === null) {
      return this.isNullable;
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
      return false;
    }
    if (this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(obj, this.defaults);
    }
    const { keys } = this;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!this.schema[key].isValid((0, import_coerce.readCoerced)(obj, key, this.schema[key], ownValue(obj, key)))) {
        return false;
      }
    }
    const objKeys = Object.keys(obj);
    const { patternTypes, propertyNameType, removeAdditional } = this;
    if (!this.hasPropertyCount(objKeys.length)) {
      return false;
    }
    if (!this.isOpen || this.additionalType || patternTypes.length > 0 || propertyNameType || removeAdditional) {
      for (let i = 0; i < objKeys.length; i += 1) {
        const key = objKeys[i];
        if (propertyNameType && !propertyNameType.isValid(key)) {
          return false;
        }
        let matched = false;
        for (let j = 0; j < patternTypes.length; j += 1) {
          if (patternTypes[j].pattern.test(key)) {
            matched = true;
            if (!patternTypes[j].type.isValid((0, import_coerce.readCoerced)(obj, key, patternTypes[j].type, obj[key]))) {
              return false;
            }
          }
        }
        if (!this.isDeclared(key) && !matched) {
          if (this.removes(obj, key)) {
            delete obj[key];
          } else if (!this.isOpen || this.additionalType && !this.additionalType.isValid((0, import_coerce.readCoerced)(obj, key, this.additionalType, obj[key]))) {
            return false;
          }
        }
      }
    }
    return this.dependencies.every(
      ({ key, required, type }) => ownValue(obj, key) === void 0 || (required ? required.every((property) => ownValue(obj, property) !== void 0) : type.isValid(obj))
    );
  }
  validate(obj, fieldName = void 0) {
    return this.isValid(obj) ? [] : this.errors(obj, fieldName);
  }
  // Whether a number of keys satisfies minProperties and maxProperties.
  hasPropertyCount(count) {
    return !(this.minProperties !== void 0 && count < this.minProperties || this.maxProperties !== void 0 && count > this.maxProperties);
  }
  // Whether a key is declared rather than additional. With removeAdditional, a key only "required" names is additional,
  // as in ajv (`propertyKeys` are the keys "properties" names, see convertObject() in json-schema.js).
  isDeclared(key) {
    if (this.removeAdditional && this.propertyKeys) {
      return this.propertyKeys.includes(key);
    }
    return this.keySet.has(key);
  }
  // Whether removeAdditional deletes the additional property `key` of `obj`.
  removes(obj, key) {
    return this.removeAdditional === "delete" || this.removeAdditional === "failing" && !this.additionalType.isValid(obj[key]);
  }
  // Compiles the schema into generated code, several times faster than validate(): see compileType() in compile.js
  // for the options. The compiled function does not see changes made to the schema afterwards.
  compile(options = {}) {
    return compileModule.compileType(this, options);
  }
  // Error messages of a value already known to be invalid.
  errors(obj, fieldName = void 0) {
    const name = fieldName || "Value";
    const { keys: schemaKeys } = this;
    const errors = [];
    if (obj === void 0) {
      if (this.isMandatory) {
        errors.push(`${name} is mandatory`);
      }
      return errors;
    }
    if (obj === null) {
      if (!this.isNullable) {
        errors.push(`${name} cannot be null`);
      }
      return errors;
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
      errors.push(`${name} must be an object`);
      return errors;
    }
    if (this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(obj, this.defaults);
    }
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      const type = this.schema[key];
      const value = (0, import_coerce.readCoerced)(obj, key, type, ownValue(obj, key));
      if (!type.isValid(value)) {
        errors.push(type.errors(value, fieldName ? `${fieldName}.${key}` : key));
      }
    }
    const objKeys = Object.keys(obj);
    for (let i = 0; i < objKeys.length; i += 1) {
      const key = objKeys[i];
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (this.propertyNameType && !this.propertyNameType.isValid(key)) {
        errors.push(this.propertyNameType.errors(key, `Key ${keyName}`));
      }
      let matched = false;
      this.patternTypes.forEach(({ pattern, type }) => {
        if (pattern.test(key)) {
          matched = true;
          const value = (0, import_coerce.readCoerced)(obj, key, type, obj[key]);
          if (!type.isValid(value)) {
            errors.push(type.errors(value, keyName));
          }
        }
      });
      if (!this.isDeclared(key) && !matched) {
        if (this.removes(obj, key)) {
          delete obj[key];
        } else if (!this.isOpen) {
          errors.push(`Unexpected key: ${keyName}`);
        } else if (this.additionalType) {
          const value = (0, import_coerce.readCoerced)(obj, key, this.additionalType, obj[key]);
          if (!this.additionalType.isValid(value)) {
            errors.push(this.additionalType.errors(value, keyName));
          }
        }
      }
    }
    const count = objKeys.length;
    if (this.minProperties !== void 0 && count < this.minProperties) {
      errors.push(`${name} must have at least ${this.minProperties} properties`);
    }
    if (this.maxProperties !== void 0 && count > this.maxProperties) {
      errors.push(`${name} must have at most ${this.maxProperties} properties`);
    }
    this.dependencies.forEach(({ key, required, type }) => {
      if (ownValue(obj, key) === void 0) {
        return;
      }
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (required) {
        required.filter((property) => ownValue(obj, property) === void 0).forEach((property) => {
          const propertyName = fieldName ? `${fieldName}.${property}` : property;
          errors.push(`${propertyName} is mandatory when ${keyName} is present`);
        });
      } else if (!type.isValid(obj)) {
        errors.push(type.errors(obj, fieldName));
      }
    });
    return errors.flat(Infinity);
  }
  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }
  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }
  optional() {
    this.isMandatory = false;
    return this;
  }
  required() {
    this.isMandatory = true;
    return this;
  }
  notNull() {
    this.isNullable = false;
    return this;
  }
}
(0, import_validate_type.provide)({ Schema });

},
"@xufa/schema/lib/standalone-helpers.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var standalone_helpers_exports = {};
__export(standalone_helpers_exports, {
  HELPER_SOURCES: () => HELPER_SOURCES
});
module.exports = __toCommonJS(standalone_helpers_exports);
const HELPER_SOURCES = {
  codePointLength: {
    calls: [],
    source: [
      "function codePointLength(value) {",
      "  let count = 0;",
      "  for (let i = 0; i < value.length; i += 1) {",
      "    const code = value.charCodeAt(i);",
      "    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {",
      "      const next = value.charCodeAt(i + 1);",
      "      if (next >= 0xdc00 && next <= 0xdfff) {",
      "        i += 1;",
      "      }",
      "    }",
      "    count += 1;",
      "  }",
      "  return count;",
      "}"
    ].join("\n")
  },
  deepEqual: {
    calls: [],
    source: [
      "function deepEqual(a, b) {",
      "  if (a === b) return true;",
      "  if (Number.isNaN(a) && Number.isNaN(b)) return true;",
      "  if (a && b && typeof a === 'object' && typeof b === 'object') {",
      "    if (a.constructor !== b.constructor) return false;",
      "    if (Array.isArray(a)) {",
      "      const l = a.length;",
      "      if (l !== b.length) return false;",
      "      for (let i = 0; i < l; i += 1) {",
      "        if (!deepEqual(a[i], b[i])) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a instanceof Map && b instanceof Map) {",
      "      if (a.size !== b.size) return false;",
      "      const keys = [...a.keys()];",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!b.has(key)) return false;",
      "      }",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!deepEqual(a.get(key), b.get(key))) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a instanceof Set && b instanceof Set) {",
      "      if (a.size !== b.size) return false;",
      "      const keys = [...a.keys()];",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!b.has(key)) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (ArrayBuffer.isView(a)) {",
      "      const l = a.length;",
      "      if (l !== b.length) return false;",
      "      for (let i = 0; i < l; i += 1) {",
      "        if (a[i] !== b[i]) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;",
      "    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();",
      "    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();",
      "    const keys = Object.keys(a);",
      "    if (keys.length !== Object.keys(b).length) return false;",
      "    for (let i = 0; i < keys.length; i += 1) {",
      "      const key = keys[i];",
      "      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;",
      "      if (!deepEqual(a[key], b[key])) return false;",
      "    }",
      "    return true;",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  hasDuplicates: {
    calls: ["deepEqual"],
    source: [
      "function hasDuplicates(value) {",
      "  if (value.some((item) => item !== null && typeof item === 'object')) {",
      "    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);",
      "  }",
      "  const seen = new Set();",
      "  for (let i = 0; i < value.length; i += 1) {",
      "    if (i in value && seen.has(value[i])) {",
      "      return true;",
      "    }",
      "    seen.add(value[i]);",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  pathName: {
    calls: [],
    source: [
      "function pathName(path) {",
      "  let name;",
      "  for (let i = 0; i < path.length; i += 1) {",
      "    const segment = path[i];",
      "    if (typeof segment === 'number') {",
      "      name = `${name === undefined ? 'Value' : name}[${segment}]`;",
      "    } else if (segment !== null && typeof segment === 'object') {",
      "      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;",
      "    } else {",
      "      name = name ? `${name}.${segment}` : segment;",
      "    }",
      "  }",
      "  return name === undefined ? 'Value' : name;",
      "}"
    ].join("\n")
  },
  errorObject: {
    calls: [],
    source: [
      "function errorObject(path, keyword, params, message) {",
      "  const last = path[path.length - 1];",
      "  const isPropertyName = last !== null && typeof last === 'object';",
      "  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();",
      "  let pointer = '';",
      "  for (let i = 0; i < keys.length; i += 1) {",
      "    const key = `${keys[i]}`;",
      "    // Escaped only when it has one of the two characters to escape.",
      "    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\\//g, '~1')}` : `/${key}`;",
      "  }",
      "  const error = { path: keys, pointer, keyword, params, message };",
      "  if (isPropertyName) {",
      "    error.propertyName = true;",
      "  }",
      "  return error;",
      "}"
    ].join("\n")
  },
  isRfc1123Hostname: {
    calls: [],
    source: [
      "function isRfc1123Hostname(value) {",
      "  return (",
      "    value.length <= 253 &&",
      "    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))",
      "  );",
      "}"
    ].join("\n")
  },
  compareDate: {
    calls: [],
    source: [
      "function compareDate(d1, d2) {",
      "  if (!(d1 && d2)) {",
      "    return undefined;",
      "  }",
      "  if (d1 > d2) {",
      "    return 1;",
      "  }",
      "  return d1 < d2 ? -1 : 0;",
      "}"
    ].join("\n")
  },
  compareTime: {
    calls: [],
    source: [
      "function compareTime(t1, t2) {",
      "  if (!(t1 && t2)) {",
      "    return undefined;",
      "  }",
      "  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();",
      "  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();",
      "  return ms1 && ms2 ? ms1 - ms2 : undefined;",
      "}"
    ].join("\n")
  },
  compareDateTime: {
    calls: [],
    source: [
      "function compareDateTime(dt1, dt2) {",
      "  if (!(dt1 && dt2)) {",
      "    return undefined;",
      "  }",
      "  const ms1 = new Date(dt1).valueOf();",
      "  const ms2 = new Date(dt2).valueOf();",
      "  return ms1 && ms2 ? ms1 - ms2 : undefined;",
      "}"
    ].join("\n")
  },
  isDate: {
    calls: [],
    source: [
      "function isDate(value) {",
      "  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);",
      "  if (!match) {",
      "    return false;",
      "  }",
      "  const year = Number(match[1]);",
      "  const month = Number(match[2]);",
      "  const day = Number(match[3]);",
      "  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);",
      "  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];",
      "  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];",
      "}"
    ].join("\n")
  },
  isTime: {
    calls: [],
    source: [
      "function isTime(value) {",
      "  const match = /^(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:([zZ])|([+-])(\\d{2}):(\\d{2}))$/.exec(value);",
      "  if (!match) {",
      "    return false;",
      "  }",
      "  const hour = Number(match[1]);",
      "  const minute = Number(match[2]);",
      "  const second = Number(match[3]);",
      "  if (hour > 23 || minute > 59 || second > 60) {",
      "    return false;",
      "  }",
      "  let offset = 0;",
      "  if (!match[4]) {",
      "    const offsetHour = Number(match[6]);",
      "    const offsetMinute = Number(match[7]);",
      "    if (offsetHour > 23 || offsetMinute > 59) {",
      "      return false;",
      "    }",
      "    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);",
      "  }",
      "  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;",
      "}"
    ].join("\n")
  },
  isDateTime: {
    calls: ["isDate", "isTime"],
    source: [
      "function isDateTime(value) {",
      "  const match = /^(.{10})[tT](.+)$/.exec(value);",
      "  return match !== null && isDate(match[1]) && isTime(match[2]);",
      "}"
    ].join("\n")
  },
  isDuration: {
    calls: [],
    source: [
      "function isDuration(value) {",
      "  return /^P(?:(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S)|\\d+W)$/.test(",
      "    value",
      "  );",
      "}"
    ].join("\n")
  },
  isIpv4: {
    calls: [],
    source: [
      "function isIpv4(value) {",
      "  return /^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/.test(value);",
      "}"
    ].join("\n")
  },
  isIpv6: {
    calls: ["isIpv4"],
    source: [
      "function isIpv6(value) {",
      "  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {",
      "    return false;",
      "  }",
      "  const halves = value.split('::');",
      "  if (halves.length > 2) {",
      "    return false;",
      "  }",
      "  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));",
      "  const all = groups[groups.length - 1];",
      "  let count = 0;",
      "  if (all.length > 0 && all[all.length - 1].includes('.')) {",
      "    if (!isIpv4(all.pop())) {",
      "      return false;",
      "    }",
      "    count = 2;",
      "  }",
      "  const hextets = [].concat(...groups);",
      "  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {",
      "    return false;",
      "  }",
      "  count += hextets.length;",
      "  return halves.length === 2 ? count < 8 : count === 8;",
      "}"
    ].join("\n")
  },
  punycodeAdapt: {
    calls: [],
    source: [
      "function punycodeAdapt(delta, points, isFirst) {",
      "  let result = Math.floor(delta / (isFirst ? 700 : 2));",
      "  result += Math.floor(result / points);",
      "  let k = 0;",
      "  while (result > 455) {",
      "    result = Math.floor(result / 35);",
      "    k += 36;",
      "  }",
      "  return k + Math.floor((36 * result) / (result + 38));",
      "}"
    ].join("\n")
  },
  punycodeDecode: {
    calls: ["punycodeAdapt"],
    source: [
      "function punycodeDecode(input) {",
      "  const output = [];",
      "  const delimiter = input.lastIndexOf('-');",
      "  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {",
      "    if (input.charCodeAt(j) >= 0x80) {",
      "      return undefined;",
      "    }",
      "    output.push(input.charCodeAt(j));",
      "  }",
      "  let n = 128;",
      "  let bias = 72;",
      "  let i = 0;",
      "  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {",
      "    const old = i;",
      "    let weight = 1;",
      "    for (let k = 36; ; k += 36) {",
      "      if (index >= input.length) {",
      "        return undefined;",
      "      }",
      "      const code = input.charCodeAt(index);",
      "      index += 1;",
      "      let digit = 36;",
      "      if (code >= 48 && code <= 57) {",
      "        digit = code - 22;",
      "      } else if (code >= 65 && code <= 90) {",
      "        digit = code - 65;",
      "      } else if (code >= 97 && code <= 122) {",
      "        digit = code - 97;",
      "      }",
      "      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {",
      "        return undefined;",
      "      }",
      "      i += digit * weight;",
      "      let t = k - bias;",
      "      if (k <= bias) {",
      "        t = 1;",
      "      } else if (k >= bias + 26) {",
      "        t = 26;",
      "      }",
      "      if (digit < t) {",
      "        break;",
      "      }",
      "      weight *= 36 - t;",
      "    }",
      "    bias = punycodeAdapt(i - old, output.length + 1, old === 0);",
      "    n += Math.floor(i / (output.length + 1));",
      "    i %= output.length + 1;",
      "    if (n > 0x10ffff) {",
      "      return undefined;",
      "    }",
      "    output.splice(i, 0, n);",
      "    i += 1;",
      "  }",
      "  return String.fromCodePoint(...output);",
      "}"
    ].join("\n")
  },
  punycodeEncode: {
    calls: ["punycodeAdapt"],
    source: [
      "function punycodeEncode(input) {",
      "  const points = Array.from(input, (char) => char.codePointAt(0));",
      "  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);",
      "  let output = points",
      "    .filter((point) => point < 128)",
      "    .map((point) => String.fromCharCode(point))",
      "    .join('');",
      "  const basic = output.length;",
      "  let handled = basic;",
      "  if (basic > 0) {",
      "    output += '-';",
      "  }",
      "  let n = 128;",
      "  let delta = 0;",
      "  let bias = 72;",
      "  while (handled < points.length) {",
      "    // The smallest code point not handled yet.",
      "    let m = 0x10ffff;",
      "    for (let i = 0; i < points.length; i += 1) {",
      "      if (points[i] >= n && points[i] < m) {",
      "        m = points[i];",
      "      }",
      "    }",
      "    delta += (m - n) * (handled + 1);",
      "    n = m;",
      "    for (let i = 0; i < points.length; i += 1) {",
      "      if (points[i] < n) {",
      "        delta += 1;",
      "      }",
      "      if (points[i] === n) {",
      "        let q = delta;",
      "        for (let k = 36; ; k += 36) {",
      "          let t = k - bias;",
      "          if (k <= bias) {",
      "            t = 1;",
      "          } else if (k >= bias + 26) {",
      "            t = 26;",
      "          }",
      "          if (q < t) {",
      "            break;",
      "          }",
      "          output += digit(t + ((q - t) % (36 - t)));",
      "          q = Math.floor((q - t) / (36 - t));",
      "        }",
      "        output += digit(q);",
      "        bias = punycodeAdapt(delta, handled + 1, handled === basic);",
      "        delta = 0;",
      "        handled += 1;",
      "      }",
      "    }",
      "    delta += 1;",
      "    n += 1;",
      "  }",
      "  return output;",
      "}"
    ].join("\n")
  },
  bidiClass: {
    calls: [],
    source: [
      "function bidiClass(char) {",
      "  if (/[\\u0600-\\u0605\\u0660-\\u0669\\u066B\\u066C\\u06DD\\u0890\\u0891\\u08E2]/u.test(char)) {",
      "    return 'AN';",
      "  }",
      "  if (/[0-9\\u06F0-\\u06F9\\u00B2\\u00B3\\u00B9\\u2070-\\u2079\\u2080-\\u2089\\uFF10-\\uFF19]/u.test(char)) {",
      "    return 'EN';",
      "  }",
      "  if (/[\\p{Mn}\\p{Me}]/u.test(char)) {",
      "    return 'NSM';",
      "  }",
      "  if (/[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Thaana}]/u.test(char)) {",
      "    return 'AL';",
      "  }",
      "  if (/[\\p{Script=Hebrew}\\p{Script=Nko}\\p{Script=Samaritan}\\p{Script=Mandaic}\\u200F]/u.test(char)) {",
      "    return 'R';",
      "  }",
      "  if (/[+-]/.test(char)) {",
      "    return 'ES';",
      "  }",
      "  if (/[,./:\\u00A0]/.test(char)) {",
      "    return 'CS';",
      "  }",
      "  if (/[#$%\\u00A2-\\u00A5\\u00B0\\u00B1]/u.test(char)) {",
      "    return 'ET';",
      "  }",
      "  return /[\\p{L}\\p{Mc}]/u.test(char) ? 'L' : 'ON';",
      "}"
    ].join("\n")
  },
  hasValidBidi: {
    calls: ["bidiClass"],
    source: [
      "function hasValidBidi(label) {",
      "  const classes = Array.from(label, bidiClass);",
      "  const first = classes[0];",
      "  const last = classes.filter((type) => type !== 'NSM').pop();",
      "  if (first === 'R' || first === 'AL') {",
      "    return (",
      "      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&",
      "      ['R', 'AL', 'EN', 'AN'].includes(last) &&",
      "      !(classes.includes('EN') && classes.includes('AN'))",
      "    );",
      "  }",
      "  if (first === 'L') {",
      "    return (",
      "      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)",
      "    );",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  isULabel: {
    calls: [],
    source: [
      "function isULabel(label) {",
      "  const chars = Array.from(label);",
      "  if (label.length === 0 || label.normalize('NFC') !== label || /^\\p{M}/u.test(label)) {",
      "    return false;",
      "  }",
      "  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {",
      "    return false;",
      "  }",
      "  const virama =",
      "    /[\\u094D\\u09CD\\u0A4D\\u0ACD\\u0B4D\\u0BCD\\u0C4D\\u0CCD\\u0D3B\\u0D3C\\u0D4D\\u0DCA\\u0E3A\\u0F84\\u1039\\u103A\\u1714\\u1734\\u17D2\\u1A60\\u1B44\\u1BAA\\u1BAB\\u1BF2\\u1BF3\\u2D7F\\uA806\\uA8C4\\uA953\\uA9C0\\uAAF6\\uABED]/u;",
      "  const joining = /[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Nko}\\p{Script=Mongolian}]/u;",
      "  return chars.every((char, i) => {",
      "    const before = chars[i - 1];",
      "    const after = chars[i + 1];",
      "    switch (char) {",
      "      case '\\u00DF':",
      "      case '\\u03C2':",
      "      case '\\u06FD':",
      "      case '\\u06FE':",
      "      case '\\u0F0B':",
      "      case '\\u3007':",
      "        return true;",
      "      case '\\u00B7':",
      "        return before === 'l' && after === 'l';",
      "      case '\\u0375':",
      "        return after !== undefined && /\\p{Script=Greek}/u.test(after);",
      "      case '\\u05F3':",
      "      case '\\u05F4':",
      "        return before !== undefined && /\\p{Script=Hebrew}/u.test(before);",
      "      case '\\u30FB':",
      "        return chars.some(",
      "          (other) => /[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]/u.test(other) && other !== '\\u30FB'",
      "        );",
      "      case '\\u200D':",
      "        return before !== undefined && virama.test(before);",
      "      case '\\u200C': {",
      "        if (before !== undefined && virama.test(before)) {",
      "          return true;",
      "        }",
      "        // Joining letters on both sides, marks between them skipped.",
      "        const left = chars",
      "          .slice(0, i)",
      "          .reverse()",
      "          .find((other) => !/\\p{Mn}/u.test(other));",
      "        const right = chars.slice(i + 1).find((other) => !/\\p{Mn}/u.test(other));",
      "        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);",
      "      }",
      "      default:",
      "        break;",
      "    }",
      "    if (/[\\u0660-\\u0669]/u.test(char)) {",
      "      return !chars.some((other) => /[\\u06F0-\\u06F9]/u.test(other));",
      "    }",
      "    if (/[\\u06F0-\\u06F9]/u.test(char)) {",
      "      return !chars.some((other) => /[\\u0660-\\u0669]/u.test(other));",
      "    }",
      "    // The code points RFC 5892 lists as DISALLOWED, marks among them.",
      "    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own",
      "    if (/[\\u0640\\u07FA\\u302E\\u302F\\u3031-\\u3035\\u303B]/u.test(char)) {",
      "      return false;",
      "    }",
      "    return /[\\p{Ll}\\p{Lo}\\p{Lm}\\p{Mn}\\p{Mc}\\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;",
      "  });",
      "}"
    ].join("\n")
  },
  hasValidLabels: {
    calls: ["punycodeDecode", "punycodeEncode", "bidiClass", "hasValidBidi", "isULabel"],
    source: [
      "function hasValidLabels(value, isIdn) {",
      '  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and',
      '  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it',
      "  // only has to be at most 253 characters long.",
      "  if (",
      "    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) &&",
      "    !/(?:^|\\.)[A-Za-z0-9-]{2}--/.test(value)",
      "  ) {",
      "    return value.length <= 253;",
      "  }",
      "  const mapped = isIdn",
      "    ? value",
      "        .normalize('NFKC')",
      "        .replace(/[\\u3002\\uFF0E\\uFF61]/gu, '.')",
      "        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).",
      "        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own",
      "        .replace(/[\\u00AD\\u200B\\u2060\\uFEFF\\u180B-\\u180D\\uFE00-\\uFE0F]/gu, '')",
      "        .toLowerCase()",
      "    : value;",
      "  if (!isIdn && !/^[\\x21-\\x7E]*$/.test(mapped)) {",
      "    return false;",
      "  }",
      "  const labels = mapped.split('.');",
      "  const unicode = [];",
      "  const ascii = [];",
      "  const valid = labels.every((label) => {",
      "    if (/^xn--/i.test(label)) {",
      "      const decoded = punycodeDecode(label.slice(4).toLowerCase());",
      "      if (",
      "        decoded === undefined ||",
      "        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||",
      "        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||",
      "        !isULabel(decoded)",
      "      ) {",
      "        return false;",
      "      }",
      "      unicode.push(decoded);",
      "      ascii.push(label);",
      "      return label.length <= 63;",
      "    }",
      "    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {",
      "      unicode.push(label);",
      "      ascii.push(label);",
      "      return (",
      "        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&",
      "        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))",
      "      );",
      "    }",
      "    if (!isIdn || !isULabel(label)) {",
      "      return false;",
      "    }",
      "    unicode.push(label);",
      "    ascii.push(`xn--${punycodeEncode(label)}`);",
      "    return ascii[ascii.length - 1].length <= 63;",
      "  });",
      "  if (!valid || ascii.join('.').length > 253) {",
      "    return false;",
      "  }",
      "  // With a right-to-left label, every label follows the Bidi rule.",
      "  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));",
      "  return !isRtl || unicode.every(hasValidBidi);",
      "}"
    ].join("\n")
  },
  isHostname: {
    calls: ["hasValidLabels"],
    source: ["function isHostname(value) {", "  return hasValidLabels(value, false);", "}"].join("\n")
  },
  isIdnHostname: {
    calls: ["hasValidLabels"],
    source: ["function isIdnHostname(value) {", "  return hasValidLabels(value, true);", "}"].join("\n")
  },
  isEmailWith: {
    calls: ["isIpv4", "isIpv6"],
    source: [
      "function isEmailWith(value, isIdn, isHost) {",
      "  const at = value.lastIndexOf('@');",
      "  if (at <= 0 || at === value.length - 1) {",
      "    return false;",
      "  }",
      "  const local = value.slice(0, at);",
      "  const domain = value.slice(at + 1);",
      "  // Literals, which are compiled once (a RegExp made here would be compiled on every call).",
      "  const dotAtom = isIdn",
      "    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+)*$/u",
      "    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;",
      `  // A quoted local part: printable ASCII but '"' and '\\', which are escaped, and in idn-email other characters too.`,
      "  const quoted = isIdn",
      '    ? /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E\\u0080-\\u{10FFFF}]|\\\\[\\x20-\\x7E])*"$/u',
      '    : /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E]|\\\\[\\x20-\\x7E])*"$/;',
      "  if (!dotAtom.test(local) && !quoted.test(local)) {",
      "    return false;",
      "  }",
      "  const literal = domain.charCodeAt(0) === 0x5b ? /^\\[(?:IPv6:(.+)|(.+))\\]$/i.exec(domain) : null;",
      "  if (literal) {",
      "    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);",
      "  }",
      "  return isHost(domain);",
      "}"
    ].join("\n")
  },
  isEmail: {
    calls: ["isHostname", "isEmailWith"],
    source: ["function isEmail(value) {", "  return isEmailWith(value, false, isHostname);", "}"].join("\n")
  },
  isIdnEmail: {
    calls: ["isIdnHostname", "isEmailWith"],
    source: ["function isIdnEmail(value) {", "  return isEmailWith(value, true, isIdnHostname);", "}"].join("\n")
  },
  isRegex: {
    calls: [],
    source: [
      "function isRegex(value) {",
      "  try {",
      "    RegExp(value, 'u');",
      "    return true;",
      "  } catch (e) {",
      "    return false;",
      "  }",
      "}"
    ].join("\n")
  }
};

},
"@xufa/schema/lib/standalone.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var standalone_exports = {};
__export(standalone_exports, {
  standaloneCode: () => standaloneCode,
  standaloneJsonSchema: () => standaloneJsonSchema,
  standaloneModule: () => standaloneModule
});
module.exports = __toCommonJS(standalone_exports);
var import_compile = require("./compile.js");
var import_json_schema = require("./json-schema.js");
var import_deep_equal = require("./deep-equal.js");
var import_code_point_length = require("./types/code-point-length.js");
var import_has_duplicates = require("./types/has-duplicates.js");
var import_validate_type = require("./types/validate-type.js");
var import_standalone_helpers = require("./standalone-helpers.js");
var import_formats = require("./formats.js");
var import_error_objects = require("./error-objects.js");
var import_package = __toESM(require("../package.json"));
const { version } = import_package.default;
const HELPERS = new Map([
  [import_code_point_length.codePointLength, "codePointLength"],
  [import_deep_equal.deepEqual, "deepEqual"],
  [import_has_duplicates.hasDuplicates, "hasDuplicates"],
  [import_error_objects.pathName, "pathName"],
  [import_error_objects.errorObject, "errorObject"],
  ...Object.entries(import_formats.FORMAT_FUNCTIONS).map(([name, fn]) => [fn, name])
]);
const RESERVED = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval undefined NaN Infinity module exports require".split(" ")
);
function valueSource(value) {
  if (value === void 0) {
    return "undefined";
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return "NaN";
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? "Infinity" : "-Infinity";
    }
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${Array.from(value, (item, i) => i in value ? valueSource(item) : "").join(", ")}]`;
  }
  if ((0, import_validate_type.isPlainObject)(value)) {
    const entries = Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]: ${valueSource(item)}`);
    return `{ ${entries.join(", ")} }`;
  }
  throw new Error(
    `Standalone code cannot contain the value ${String(value)}: only primitives, arrays and plain objects`
  );
}
function constantSource(value, helpers) {
  if (typeof value === "function") {
    const name = HELPERS.get(value);
    if (name === void 0 && value.validatorKeyword !== void 0) {
      throw new Error(
        `Standalone code cannot contain the functions of the keyword "${value.validatorKeyword}": define it as a macro, or compile the schema with compileJsonSchema() instead`
      );
    }
    if (name === void 0) {
      throw new Error(`Standalone code cannot contain the function ${value.name || "(anonymous)"}`);
    }
    const add = (helper) => {
      helpers.add(helper);
      import_standalone_helpers.HELPER_SOURCES[helper].calls.forEach(add);
    };
    add(name);
    return name;
  }
  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value instanceof Set) {
    return `new Set([${Array.from(value, valueSource).join(", ")}])`;
  }
  return valueSource(value);
}
function validatorSource(type, options, helpers) {
  const { mode, source, constants, nodes } = (0, import_compile.generateSource)((0, import_validate_type.toType)(type, "Standalone type"), options);
  if (nodes.length > 0) {
    const names = [...new Set(nodes.map((node) => node.constructor.name))].join(", ");
    throw new Error(
      `Standalone code cannot contain types of your own (${names}): their validate() runs when validating; compile them with compile() instead`
    );
  }
  const code = `const c = [${constants.map((value) => constantSource(value, helpers)).join(", ")}];
`;
  const factory = `(function () {
${code}${source}
})()`;
  if (mode !== "first") {
    return factory;
  }
  return `(function () {
const first = ${factory};
return function validate(value) {
const error = first(value);
return error === undefined ? [] : [error];
};
})()`;
}
function moduleSource(entries, options) {
  const format = options.format === void 0 ? "commonjs" : options.format;
  if (format !== "commonjs" && format !== "esm") {
    throw new Error(`Unsupported standalone option "format": "${format}" is not "commonjs" or "esm"`);
  }
  const helpers = /* @__PURE__ */ new Set();
  const validators = entries.map(([name, type]) => {
    if (name !== void 0 && (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name) || name === "c")) {
      throw new Error(`Standalone validator name "${name}" is not a valid JavaScript name`);
    }
    return [name, validatorSource(type, options, helpers)];
  });
  const clash = validators.find(([name]) => helpers.has(name));
  if (clash) {
    throw new Error(`Standalone validator name "${clash[0]}" is the name of a helper of the generated code`);
  }
  let code = `// Generated by @xufa/schema ${version}: do not edit, generate it again instead.
`;
  if (format === "commonjs") {
    code += "'use strict';\n";
  }
  code += [...helpers].map((helper) => `${import_standalone_helpers.HELPER_SOURCES[helper].source}
`).join("");
  validators.forEach(([name, source]) => {
    code += `const ${name === void 0 ? "validate" : name} = ${source};
`;
  });
  const names = validators.map(([name]) => name).filter((name) => name !== void 0);
  if (names.length === 0) {
    code += format === "commonjs" ? "module.exports = validate;\nmodule.exports.default = validate;\n" : "export default validate;\n";
  } else {
    code += format === "commonjs" ? `module.exports = { ${names.join(", ")} };
` : `export { ${names.join(", ")} };
`;
  }
  return code;
}
function standaloneCode(type, options = {}) {
  return moduleSource([[void 0, type]], options);
}
function standaloneModule(validators, options = {}) {
  if (!(0, import_validate_type.isPlainObject)(validators) || Object.keys(validators).length === 0) {
    throw new Error("standaloneModule() expects an object of types by the names to export them with");
  }
  return moduleSource(Object.entries(validators), options);
}
function standaloneJsonSchema(json, options = {}) {
  return standaloneCode((0, import_json_schema.fromJsonSchema)(json, options), options);
}

},
"@xufa/schema/lib/types/all-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var all_of_exports = {};
__export(all_of_exports, {
  AllOf: () => AllOf,
  AllOfType: () => AllOfType,
  allOf: () => allOf,
  oallOf: () => oallOf
});
module.exports = __toCommonJS(all_of_exports);
var import_validate_type = require("./validate-type.js");
class AllOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "AllOf types") || [];
  }
  // The errors of every type the value fails. The field name goes to them as received: undefined for the value
  // itself, so a Schema names its keys as it does on its own.
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      const errors = this.types.filter((type) => !type.isValid(value)).map((type) => type.errors(value, fieldName));
      if (errors.length <= 1) {
        return errors[0];
      }
      return errors.flat(Infinity);
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (!this.types[i].isValid(value)) {
        return false;
      }
    }
    return true;
  }
}
function AllOf(options) {
  return new AllOfType(options);
}
function allOf(types, isMandatory = true, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AllOfType(types);
  }
  return new AllOfType({ types, isMandatory, isNullable });
}
function oallOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AllOfType({ isMandatory: false, ...types });
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/any-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var any_of_exports = {};
__export(any_of_exports, {
  AnyOf: () => AnyOf,
  AnyOfType: () => AnyOfType,
  anyOf: () => anyOf,
  oanyOf: () => oanyOf
});
module.exports = __toCommonJS(any_of_exports);
var import_validate_type = require("./validate-type.js");
class AnyOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "AnyOf types");
  }
  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (this.isValid(value)) {
        return void 0;
      }
      return this.types.map((type) => type.errors(value, fieldName));
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (!this.types || this.types.length === 0) {
      return true;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (this.types[i].isValid(value)) {
        return true;
      }
    }
    return false;
  }
}
function AnyOf(options) {
  return new AnyOfType(options);
}
function anyOf(types, isMandatory = true, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AnyOfType(types);
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}
function oanyOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AnyOfType({ isMandatory: false, ...types });
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/any.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var any_exports = {};
__export(any_exports, {
  Any: () => Any,
  AnyType: () => AnyType,
  any: () => any,
  oany: () => oany
});
module.exports = __toCommonJS(any_exports);
var import_validate_type = require("./validate-type.js");
class AnyType extends import_validate_type.ValidateType {
  isValid(value) {
    return this.checkPresence(value) ?? true;
  }
}
function Any(options) {
  return new AnyType(options);
}
function any(isMandatory = true, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new AnyType(isMandatory);
  }
  return new AnyType({ isMandatory, isNullable });
}
function oany(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new AnyType({ isMandatory: false, ...isMandatory });
  }
  return new AnyType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/array-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var array_of_exports = {};
__export(array_of_exports, {
  ArrayOf: () => ArrayOf,
  ArrayOfType: () => ArrayOfType,
  arrOf: () => arrOf,
  oarrOf: () => oarrOf
});
module.exports = __toCommonJS(array_of_exports);
var import_has_duplicates = require("./has-duplicates.js");
var import_defaults = require("../defaults.js");
var import_coerce = require("../coerce.js");
var import_validate_type = require("./validate-type.js");
class ArrayOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = Array.isArray(options.type) ? (0, import_validate_type.toTypes)(options.type, "ArrayOf type") : (0, import_validate_type.toType)(options.type, "ArrayOf type");
    this.min = options.min;
    this.max = options.max;
    this.defaults = options.defaults || [];
    this.unique = options.unique;
    this.contains = (0, import_validate_type.toType)(options.contains, "ArrayOf contains");
    this.minContains = options.minContains;
    this.maxContains = options.maxContains;
    this.additionalType = (0, import_validate_type.toType)(options.additionalType, "ArrayOf additionalType");
  }
  // Number of elements matching contains, counted only as far as the limits need.
  countMatches(value) {
    const min = this.minContains === void 0 ? 1 : this.minContains;
    const stop = this.maxContains === void 0 ? min : this.maxContains + 1;
    let count = 0;
    for (let i = 0; i < value.length && count < stop; i += 1) {
      if (this.contains.isValid(value[i])) {
        count += 1;
      }
    }
    return count;
  }
  hasMatches(value) {
    const count = this.countMatches(value);
    const min = this.minContains === void 0 ? 1 : this.minContains;
    return count >= min && (this.maxContains === void 0 || count <= this.maxContains);
  }
  // Error of the elements matching contains, or undefined.
  containsError(value, fieldName) {
    const min = this.minContains === void 0 ? 1 : this.minContains;
    const max = this.maxContains;
    const count = this.countMatches(value);
    if (count < min) {
      return min === 1 ? `${fieldName} must contain at least one matching element` : `${fieldName} must contain at least ${min} matching elements`;
    }
    if (max !== void 0 && count > max) {
      return max === 1 ? `${fieldName} must contain at most one matching element` : `${fieldName} must contain at most ${max} matching elements`;
    }
    return void 0;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!Array.isArray(value)) {
        return `${fieldName} must be an array`;
      }
      if (this.defaults.length > 0) {
        (0, import_defaults.assignDefaults)(value, this.defaults);
      }
      if (this.min !== void 0 && value.length < this.min) {
        return `${fieldName} must have at least ${this.min} elements`;
      }
      if (this.max !== void 0 && value.length > this.max) {
        return `${fieldName} must have at most ${this.max} elements`;
      }
      if (this.unique && (0, import_has_duplicates.hasDuplicates)(value)) {
        return `${fieldName} must not have duplicate elements`;
      }
      const containsError = this.contains && this.containsError(value, fieldName);
      if (containsError) {
        return containsError;
      }
      if (this.type) {
        const errors = [];
        const check = (type, i) => {
          const item = (0, import_coerce.readCoerced)(value, i, type, value[i]);
          if (!type.isValid(item)) {
            errors.push(type.errors(item, `${fieldName}[${i}]`));
          }
        };
        if (Array.isArray(this.type)) {
          for (let i = 0; i < this.type.length; i += 1) {
            check(this.type[i], i);
          }
          if (this.additionalType) {
            for (let i = this.type.length; i < value.length; i += 1) {
              check(this.additionalType, i);
            }
          }
        } else {
          for (let i = 0; i < value.length; i += 1) {
            check(this.type, i);
          }
        }
        return errors.flat();
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (Array.isArray(value) && this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(value, this.defaults);
    }
    if (!Array.isArray(value) || this.min !== void 0 && value.length < this.min || this.max !== void 0 && value.length > this.max || this.unique && (0, import_has_duplicates.hasDuplicates)(value) || this.contains && !this.hasMatches(value)) {
      return false;
    }
    if (Array.isArray(this.type)) {
      for (let i = 0; i < this.type.length; i += 1) {
        if (!this.type[i].isValid((0, import_coerce.readCoerced)(value, i, this.type[i], value[i]))) {
          return false;
        }
      }
      if (this.additionalType) {
        for (let i = this.type.length; i < value.length; i += 1) {
          if (!this.additionalType.isValid((0, import_coerce.readCoerced)(value, i, this.additionalType, value[i]))) {
            return false;
          }
        }
      }
    } else if (this.type) {
      for (let i = 0; i < value.length; i += 1) {
        if (!this.type.isValid((0, import_coerce.readCoerced)(value, i, this.type, value[i]))) {
          return false;
        }
      }
    }
    return true;
  }
}
function ArrayOf(options) {
  return new ArrayOfType(options);
}
const OPTION_KEYS = [
  "type",
  "min",
  "max",
  "unique",
  "contains",
  "minContains",
  "maxContains",
  "additionalType",
  "isMandatory",
  "isNullable"
];
function isOptions(value) {
  if (!(0, import_validate_type.isPlainObject)(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => OPTION_KEYS.includes(key));
}
function arrOf(type, min, max, isMandatory = true, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType(type);
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}
function oarrOf(type, min, max, isMandatory = false, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType({ isMandatory: false, ...type });
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/boolean.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var boolean_exports = {};
__export(boolean_exports, {
  Boolean: () => Boolean,
  BooleanType: () => BooleanType,
  bool: () => bool,
  obool: () => obool
});
module.exports = __toCommonJS(boolean_exports);
var import_validate_type = require("./validate-type.js");
class BooleanType extends import_validate_type.ValidateType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && typeof value !== "boolean") {
      return `${fieldName} must be a boolean`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? typeof value === "boolean";
  }
}
function Boolean(options) {
  return new BooleanType(options);
}
function bool(isMandatory = true, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new BooleanType(isMandatory);
  }
  return new BooleanType({ isMandatory, isNullable });
}
function obool(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new BooleanType({ isMandatory: false, ...isMandatory });
  }
  return new BooleanType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/code-point-length.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var code_point_length_exports = {};
__export(code_point_length_exports, {
  codePointLength: () => codePointLength,
  hasFewerCodePoints: () => hasFewerCodePoints,
  hasMoreCodePoints: () => hasMoreCodePoints
});
module.exports = __toCommonJS(code_point_length_exports);
function codePointLength(value) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        i += 1;
      }
    }
    count += 1;
  }
  return count;
}
function hasFewerCodePoints(value, min) {
  return value.length < min || value.length < 2 * min && codePointLength(value) < min;
}
function hasMoreCodePoints(value, max) {
  return value.length > 2 * max || value.length > max && codePointLength(value) > max;
}

},
"@xufa/schema/lib/types/conditional.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var conditional_exports = {};
__export(conditional_exports, {
  Conditional: () => Conditional,
  ConditionalType: () => ConditionalType
});
module.exports = __toCommonJS(conditional_exports);
var import_validate_type = require("./validate-type.js");
class ConditionalType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.ifType = (0, import_validate_type.toType)(options.ifType, "Conditional ifType");
    this.thenType = (0, import_validate_type.toType)(options.thenType, "Conditional thenType");
    this.elseType = (0, import_validate_type.toType)(options.elseType, "Conditional elseType");
  }
  branch(value) {
    return this.ifType.isValid(value) ? this.thenType : this.elseType;
  }
  // The field name goes to the branch as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      const branch = this.branch(value);
      if (branch && !branch.isValid(value)) {
        return branch.errors(value, fieldName);
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    const branch = this.branch(value);
    return !branch || branch.isValid(value);
  }
}
function Conditional(options) {
  return new ConditionalType(options);
}

},
"@xufa/schema/lib/types/enum.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var enum_exports = {};
__export(enum_exports, {
  Enum: () => Enum,
  EnumType: () => EnumType,
  enumt: () => enumt,
  oenum: () => oenumt,
  oenumt: () => oenumt
});
module.exports = __toCommonJS(enum_exports);
var import_string = require("./string.js");
class EnumType extends import_string.StringType {
  constructor(options = {}) {
    super(options);
    this.options = options.options;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!this.options.includes(value)) {
        return `${fieldName} must be one of: ${this.options.join(", ")}`;
      }
    }
    return void 0;
  }
  isValid(value) {
    return super.isValid(value) && (value === void 0 || value === null || this.options.includes(value));
  }
}
function Enum(options) {
  return new EnumType(options);
}
function enumt(options, isMandatory = true, isNullable = false) {
  if (options !== void 0 && options !== null && !Array.isArray(options) && typeof options === "object") {
    return new EnumType(options);
  }
  return new EnumType({ options, isMandatory, isNullable });
}
function oenumt(options, isMandatory = false, isNullable = false) {
  if (options !== void 0 && options !== null && !Array.isArray(options) && typeof options === "object") {
    return new EnumType({ isMandatory: false, ...options });
  }
  return new EnumType({ options, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/float.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var float_exports = {};
__export(float_exports, {
  Float: () => Float,
  FloatType: () => FloatType,
  float: () => float,
  num: () => float,
  ofloat: () => ofloat,
  onum: () => ofloat
});
module.exports = __toCommonJS(float_exports);
var import_validate_type = require("./validate-type.js");
class FloatType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.exclusiveMin = options.exclusiveMin;
    this.exclusiveMax = options.exclusiveMax;
    this.multipleOf = options.multipleOf;
    this.multipleOfPrecision = options.multipleOfPrecision;
  }
  isMultiple(value) {
    const division = value / this.multipleOf;
    if (this.multipleOfPrecision === void 0) {
      return Number.isInteger(division);
    }
    return !(Math.abs(Math.round(division) - division) > Number(`1e-${this.multipleOfPrecision}`));
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${fieldName} must be a number`;
      }
      if (this.min !== void 0 && value < this.min) {
        return `${fieldName} must be at least ${this.min}`;
      }
      if (this.max !== void 0 && value > this.max) {
        return `${fieldName} must be at most ${this.max}`;
      }
      if (this.exclusiveMin !== void 0 && value <= this.exclusiveMin) {
        return `${fieldName} must be greater than ${this.exclusiveMin}`;
      }
      if (this.exclusiveMax !== void 0 && value >= this.exclusiveMax) {
        return `${fieldName} must be less than ${this.exclusiveMax}`;
      }
      if (this.multipleOf !== void 0 && !this.isMultiple(value)) {
        return `${fieldName} must be a multiple of ${this.multipleOf}`;
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    return typeof value === "number" && Number.isFinite(value) && (this.min === void 0 || value >= this.min) && (this.max === void 0 || value <= this.max) && (this.exclusiveMin === void 0 || value > this.exclusiveMin) && (this.exclusiveMax === void 0 || value < this.exclusiveMax) && (this.multipleOf === void 0 || this.isMultiple(value));
  }
}
function Float(options) {
  return new FloatType(options);
}
function float(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new FloatType(min);
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}
function ofloat(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new FloatType({ isMandatory: false, ...min });
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/has-duplicates.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var has_duplicates_exports = {};
__export(has_duplicates_exports, {
  hasDuplicates: () => hasDuplicates
});
module.exports = __toCommonJS(has_duplicates_exports);
var import_deep_equal = require("../deep-equal.js");
function hasDuplicates(value) {
  if (value.some((item) => item !== null && typeof item === "object")) {
    return value.some((item, i) => value.findIndex((other) => (0, import_deep_equal.deepEqual)(item, other)) !== i);
  }
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < value.length; i += 1) {
    if (i in value && seen.has(value[i])) {
      return true;
    }
    seen.add(value[i]);
  }
  return false;
}

},
"@xufa/schema/lib/types/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var types_exports = {};
module.exports = __toCommonJS(types_exports);
__reExport(types_exports, require("./all-of.js"), module.exports);
__reExport(types_exports, require("./any.js"), module.exports);
__reExport(types_exports, require("./any-of.js"), module.exports);
__reExport(types_exports, require("./array-of.js"), module.exports);
__reExport(types_exports, require("./boolean.js"), module.exports);
__reExport(types_exports, require("./conditional.js"), module.exports);
__reExport(types_exports, require("./enum.js"), module.exports);
__reExport(types_exports, require("./float.js"), module.exports);
__reExport(types_exports, require("./integer.js"), module.exports);
__reExport(types_exports, require("./keyword.js"), module.exports);
__reExport(types_exports, require("./never.js"), module.exports);
__reExport(types_exports, require("./not.js"), module.exports);
__reExport(types_exports, require("./obj.js"), module.exports);
__reExport(types_exports, require("./one-of.js"), module.exports);
__reExport(types_exports, require("./ref.js"), module.exports);
__reExport(types_exports, require("./string.js"), module.exports);
__reExport(types_exports, require("./validate-type.js"), module.exports);
__reExport(types_exports, require("./values.js"), module.exports);
__reExport(types_exports, require("./when.js"), module.exports);

},
"@xufa/schema/lib/types/integer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var integer_exports = {};
__export(integer_exports, {
  Integer: () => Integer,
  IntegerType: () => IntegerType,
  int: () => int,
  oint: () => oint
});
module.exports = __toCommonJS(integer_exports);
var import_float = require("./float.js");
class IntegerType extends import_float.FloatType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!Number.isInteger(value)) {
        return `${fieldName} must be an integer`;
      }
    }
    return void 0;
  }
  isValid(value) {
    return super.isValid(value) && (value === void 0 || value === null || Number.isInteger(value));
  }
}
function Integer(options) {
  return new IntegerType(options);
}
function int(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new IntegerType(min);
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}
function oint(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new IntegerType({ isMandatory: false, ...min });
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/keyword.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var keyword_exports = {};
__export(keyword_exports, {
  KEYWORD_TYPE_TESTS: () => KEYWORD_TYPE_TESTS,
  KeywordType: () => KeywordType
});
module.exports = __toCommonJS(keyword_exports);
var import_validate_type = require("./validate-type.js");
const KEYWORD_TYPE_TESTS = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === "boolean",
  object: (value) => typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null
};
class KeywordType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    if (typeof options.check !== "function" && !(options.check instanceof RegExp)) {
      throw new Error("KeywordType check must be a function or a regular expression");
    }
    this.keyword = options.keyword;
    this.check = options.check;
    this.message = options.message;
    this.jsonTypes = options.jsonTypes;
  }
  // Whether the keyword checks the value (neither undefined nor null).
  applies(value) {
    return !this.jsonTypes || this.jsonTypes.some((jsonType) => KEYWORD_TYPE_TESTS[jsonType](value));
  }
  passes(value) {
    return this.check instanceof RegExp ? this.check.test(value) : Boolean(this.check(value));
  }
  messageOf(value) {
    return typeof this.message === "function" ? this.message(value) : this.message;
  }
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && this.applies(value) && !this.passes(value)) {
      return `${name} ${this.messageOf(value)}`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? (!this.applies(value) || this.passes(value));
  }
}

},
"@xufa/schema/lib/types/never.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var never_exports = {};
__export(never_exports, {
  Never: () => Never,
  NeverType: () => NeverType,
  never: () => never
});
module.exports = __toCommonJS(never_exports);
var import_validate_type = require("./validate-type.js");
class NeverType extends import_validate_type.ValidateType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      return `${fieldName} is not allowed`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? false;
  }
}
function Never(options) {
  return new NeverType(options);
}
function never(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new NeverType({ isMandatory: false, ...isMandatory });
  }
  return new NeverType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/not.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var not_exports = {};
__export(not_exports, {
  Not: () => Not,
  NotType: () => NotType,
  not: () => not,
  onot: () => onot
});
module.exports = __toCommonJS(not_exports);
var import_validate_type = require("./validate-type.js");
class NotType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = (0, import_validate_type.toType)(options.type, "Not type");
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && this.type.isValid(value)) {
      return `${fieldName} must not match the excluded schema`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? !this.type.isValid(value);
  }
}
function Not(options) {
  return new NotType(options);
}
function not(type, isMandatory = true, isNullable = false) {
  if (type !== void 0 && type !== null && !(type instanceof import_validate_type.ValidateType) && typeof type === "object") {
    return new NotType(type);
  }
  return new NotType({ type, isMandatory, isNullable });
}
function onot(type, isMandatory = false, isNullable = false) {
  if (type !== void 0 && type !== null && !(type instanceof import_validate_type.ValidateType) && typeof type === "object") {
    return new NotType({ isMandatory: false, ...type });
  }
  return new NotType({ type, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/obj.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var obj_exports = {};
__export(obj_exports, {
  Obj: () => Obj,
  ObjType: () => ObjType,
  obj: () => obj,
  oobj: () => oobj
});
module.exports = __toCommonJS(obj_exports);
var import_validate_type = require("./validate-type.js");
class ObjType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.shape = options.schema;
    this.schema = (0, import_validate_type.toType)(options.schema, "Obj schema");
  }
  // The field name goes to the schema as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "object" || Array.isArray(value)) {
        return `${name} must be an object`;
      }
      if (this.schema) return this.schema.validate(value, fieldName);
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return !this.schema || this.schema.isValid(value);
  }
}
function Obj(options) {
  return new ObjType(options);
}
const OPTION_KEYS = ["schema", "isMandatory", "isNullable"];
const isOptions = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof import_validate_type.ValidateType) && (Object.keys(value).length === 0 || Object.keys(value).some((key) => OPTION_KEYS.includes(key)));
function obj(schema, isMandatory = true, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType(schema);
  }
  return new ObjType({ schema, isMandatory, isNullable });
}
function oobj(schema, isMandatory = false, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType({ isMandatory: false, ...schema });
  }
  return new ObjType({ schema, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/one-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var one_of_exports = {};
__export(one_of_exports, {
  EVERY_TYPE: () => EVERY_TYPE,
  NO_TYPE: () => NO_TYPE,
  OneOf: () => OneOf,
  OneOfType: () => OneOfType,
  oneOf: () => oneOf,
  ooneOf: () => ooneOf
});
module.exports = __toCommonJS(one_of_exports);
var import_validate_type = require("./validate-type.js");
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const NO_TYPE = -1;
const EVERY_TYPE = -2;
class OneOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "OneOf types") || [];
    this.discriminator = options.discriminator;
  }
  // The index of the type a discriminator picks for the value: the one the value of its tag (an own property) names;
  // NO_TYPE for an object whose tag names none; EVERY_TYPE without a discriminator, for other values, and for an
  // object whose tag names none when the discriminator was found in a plain oneOf (`auto`), which checks it as oneOf.
  pick(value) {
    if (!this.discriminator || !isObject(value)) {
      return EVERY_TYPE;
    }
    const { tag, mapping, auto } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : void 0;
    if (typeof tagValue === "string" && mapping.has(tagValue)) {
      return mapping.get(tagValue);
    }
    return auto ? EVERY_TYPE : NO_TYPE;
  }
  // The error about the tag of an object whose tag names no type, after the name of the tag.
  tagError(value) {
    const { tag, mapping } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : void 0;
    if (tagValue === void 0) {
      return " is mandatory";
    }
    if (typeof tagValue !== "string") {
      return " must be a string";
    }
    const values = [...mapping.keys()];
    return values.length === 1 ? ` must be equal to ${values[0]}` : ` must be one of: ${values.join(", ")}`;
  }
  // Number of types the value satisfies, counting up to 2.
  countMatches(value) {
    let matches = 0;
    for (let i = 0; i < this.types.length && matches < 2; i += 1) {
      if (this.types[i].isValid(value)) {
        matches += 1;
      }
    }
    return matches;
  }
  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    const picked = this.pick(value);
    if (picked === NO_TYPE) {
      const { tag } = this.discriminator;
      return `${fieldName ? `${fieldName}.${tag}` : tag}${this.tagError(value)}`;
    }
    if (picked !== EVERY_TYPE) {
      return this.types[picked].validate(value, fieldName);
    }
    if (value !== void 0 && value !== null) {
      const matches = this.countMatches(value);
      if (this.types.length === 0) {
        return `${name} must match exactly one schema, but matches none`;
      }
      if (matches === 0) {
        return this.types.map((type) => type.errors(value, fieldName));
      }
      if (matches > 1) {
        return `${name} must match exactly one schema, but matches more than one`;
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    const picked = this.pick(value);
    if (picked === EVERY_TYPE) {
      return this.countMatches(value) === 1;
    }
    return picked !== NO_TYPE && this.types[picked].isValid(value);
  }
}
function OneOf(options) {
  return new OneOfType(options);
}
function oneOf(types, isMandatory = true, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new OneOfType(types);
  }
  return new OneOfType({ types, isMandatory, isNullable });
}
function ooneOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new OneOfType({ isMandatory: false, ...types });
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/ref.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ref_exports = {};
__export(ref_exports, {
  Ref: () => Ref,
  RefType: () => RefType
});
module.exports = __toCommonJS(ref_exports);
var import_validate_type = require("./validate-type.js");
class RefType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.ref = options.ref;
    this.target = (0, import_validate_type.toType)(options.target, "Ref target");
  }
  getTarget() {
    if (!this.target) {
      throw new Error(`Reference "${this.ref}" is not resolved`);
    }
    return this.target;
  }
  validate(value, fieldName) {
    if (value === void 0) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().validate(value, fieldName);
  }
  errors(value, fieldName) {
    if (value === void 0) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().errors(value, fieldName);
  }
  isValid(value) {
    if (value === void 0) {
      return !this.isMandatory;
    }
    return this.getTarget().isValid(value);
  }
}
function Ref(options) {
  return new RefType(options);
}

},
"@xufa/schema/lib/types/string.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var string_exports = {};
__export(string_exports, {
  FORMAT_LIMITS: () => FORMAT_LIMITS,
  String: () => String,
  StringType: () => StringType,
  ostr: () => ostr,
  str: () => str
});
module.exports = __toCommonJS(string_exports);
var import_code_point_length = require("./code-point-length.js");
var import_validate_type = require("./validate-type.js");
var import_formats = require("../formats.js");
const FORMAT_LIMITS = {
  formatMinimum: { fails: (result) => result < 0, text: "at least", comparison: ">=" },
  formatMaximum: { fails: (result) => result > 0, text: "at most", comparison: "<=" },
  formatExclusiveMinimum: { fails: (result) => result <= 0, text: "greater than", comparison: ">" },
  formatExclusiveMaximum: { fails: (result) => result >= 0, text: "less than", comparison: "<" }
};
class StringType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.pattern = options.pattern;
    this.allowEmpty = options.allowEmpty;
    this.countCodePoints = options.countCodePoints;
    this.format = options.format;
    this.formatCheck = options.formatCheck;
    if (this.format !== void 0 && this.formatCheck === void 0) {
      if (!Object.prototype.hasOwnProperty.call(import_formats.FORMATS, this.format)) {
        throw new Error(`Unknown String format "${this.format}": use one of ${Object.keys(import_formats.FORMATS).join(", ")}`);
      }
      this.formatCheck = import_formats.FORMATS[this.format];
    }
    this.formatLimits = options.formatLimits || [];
  }
  // The first limit of the format the value does not satisfy, or undefined.
  failedLimit(value) {
    return this.formatLimits.find(({ keyword, limit, compare }) => FORMAT_LIMITS[keyword].fails(compare(value, limit)));
  }
  hasFormat(value) {
    return this.formatCheck === void 0 || (0, import_formats.matchesFormat)(this.formatCheck, value);
  }
  isTooShort(value) {
    return this.countCodePoints ? (0, import_code_point_length.hasFewerCodePoints)(value, this.min) : value.length < this.min;
  }
  isTooLong(value) {
    return this.countCodePoints ? (0, import_code_point_length.hasMoreCodePoints)(value, this.max) : value.length > this.max;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "string") {
        return `${fieldName} must be a string`;
      }
      const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
      if (this.min !== void 0 && !skipMin && this.isTooShort(value)) {
        return `${fieldName} must be at least ${this.min} characters long`;
      }
      if (this.max !== void 0 && this.isTooLong(value)) {
        return `${fieldName} must be at most ${this.max} characters long`;
      }
      if (this.pattern && !this.pattern.test(value)) {
        return `${fieldName} does not match the required pattern`;
      }
      if (!this.hasFormat(value)) {
        return `${fieldName} must be a valid ${this.format}`;
      }
      const failed = this.failedLimit(value);
      if (failed) {
        return `${fieldName} must be ${FORMAT_LIMITS[failed.keyword].text} ${failed.limit}`;
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (typeof value !== "string") {
      return false;
    }
    const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
    return (this.min === void 0 || skipMin || !this.isTooShort(value)) && (this.max === void 0 || !this.isTooLong(value)) && (!this.pattern || this.pattern.test(value)) && this.hasFormat(value) && this.failedLimit(value) === void 0;
  }
}
function String(options) {
  return new StringType(options);
}
function str(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new StringType(min);
  }
  return new StringType({ min, max, isMandatory, isNullable });
}
function ostr(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new StringType({ isMandatory: false, ...min });
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/validate-type.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var validate_type_exports = {};
__export(validate_type_exports, {
  ValidateType: () => ValidateType,
  hasErrors: () => hasErrors,
  isPlainObject: () => isPlainObject,
  provide: () => provide,
  toErrors: () => toErrors,
  toType: () => toType,
  toTypes: () => toTypes
});
module.exports = __toCommonJS(validate_type_exports);
const late = { compileType: null, Schema: null };
function provide(parts) {
  Object.assign(late, parts);
}
function hasErrors(result) {
  if (!Array.isArray(result)) {
    return Boolean(result);
  }
  for (let i = 0; i < result.length; i += 1) {
    const item = result[i];
    if (!Array.isArray(item) || hasErrors(item)) {
      return true;
    }
  }
  return false;
}
class ValidateType {
  constructor(options = {}) {
    this.isMandatory = options.isMandatory !== void 0 ? options.isMandatory : true;
    this.isNullable = options.isNullable !== void 0 ? options.isNullable : false;
  }
  validate(value, fieldName = "Value") {
    if (this.isMandatory && value === void 0) {
      return `${fieldName} is mandatory`;
    }
    if (!this.isNullable && value === null) {
      return `${fieldName} cannot be null`;
    }
    return void 0;
  }
  // Fast boolean check equivalent to !hasErrors(this.validate(value)) that builds no messages.
  // Built-in types override it; custom subclasses that only override validate() fall back to it.
  isValid(value) {
    return !hasErrors(this.validate(value));
  }
  // Error messages of a value already known to be invalid; containers call it on their failing children
  // so types whose validate() starts with an isValid() fast path can skip it. The field name goes to validate() as
  // received, which names the value "Value" when there is none.
  errors(value, fieldName = void 0) {
    return this.validate(value, fieldName);
  }
  // Compiles the type into generated code, several times faster than validate(): see compileType() in compile.js for
  // the options. The compiled function does not see changes made to the type afterwards.
  compile(options = {}) {
    return late.compileType(this, options);
  }
  // Presence part of isValid: a boolean when undefined/null decide the result, undefined otherwise.
  checkPresence(value) {
    if (value === void 0) {
      return !this.isMandatory;
    }
    if (value === null) {
      return this.isNullable;
    }
    return void 0;
  }
  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }
  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }
  optional() {
    this.isMandatory = false;
    return this;
  }
  required() {
    this.isMandatory = true;
    return this;
  }
  notNull() {
    this.isNullable = false;
    return this;
  }
}
function toErrors(result) {
  if (Array.isArray(result)) {
    return Array.from(new Set(result.flat(Infinity)));
  }
  return result ? [result] : [];
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function toType(value, name) {
  if (value === void 0 || value instanceof ValidateType) {
    return value;
  }
  if (isPlainObject(value)) {
    return new late.Schema(value);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a type or an object of types`);
  }
  return value;
}
function toTypes(values, name) {
  if (values === void 0) {
    return values;
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array of types`);
  }
  return values.map((value, i) => toType(value, `${name}[${i}]`));
}

},
"@xufa/schema/lib/types/values.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var values_exports = {};
__export(values_exports, {
  Const: () => Const,
  Values: () => Values,
  ValuesType: () => ValuesType
});
module.exports = __toCommonJS(values_exports);
var import_deep_equal = require("../deep-equal.js");
var import_validate_type = require("./validate-type.js");
function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
class ValuesType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.values = options.values || [];
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && !this.values.some((item) => (0, import_deep_equal.deepEqual)(item, value))) {
      if (this.values.length === 1) {
        return `${fieldName} must be equal to ${formatValue(this.values[0])}`;
      }
      return `${fieldName} must be one of: ${this.values.map(formatValue).join(", ")}`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? this.values.some((item) => (0, import_deep_equal.deepEqual)(item, value));
  }
}
function Values(options) {
  return new ValuesType(options);
}
function Const(value, options = {}) {
  return new ValuesType({ ...options, values: [value] });
}

},
"@xufa/schema/lib/types/when.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var when_exports = {};
__export(when_exports, {
  When: () => When,
  WhenType: () => WhenType,
  isJsonType: () => isJsonType
});
module.exports = __toCommonJS(when_exports);
var import_validate_type = require("./validate-type.js");
const JSON_TYPES = ["object", "array", "string", "number"];
function isJsonType(value, jsonType) {
  switch (jsonType) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    default:
      return typeof value === "number";
  }
}
class WhenType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    if (!JSON_TYPES.includes(options.jsonType)) {
      throw new Error(`WhenType jsonType must be one of: ${JSON_TYPES.join(", ")}`);
    }
    this.jsonType = options.jsonType;
    this.type = (0, import_validate_type.toType)(options.type, "When type");
  }
  validate(value, fieldName) {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && isJsonType(value, this.jsonType)) {
      return this.type.validate(value, fieldName);
    }
    return void 0;
  }
  errors(value, fieldName) {
    return this.validate(value, fieldName);
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    return !isJsonType(value, this.jsonType) || this.type.isValid(value);
  }
}
function When(options) {
  return new WhenType(options);
}

},
"@xufa/schema/lib/unevaluated.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var unevaluated_exports = {};
__export(unevaluated_exports, {
  JSON_TYPES: () => JSON_TYPES,
  UnevaluatedType: () => UnevaluatedType,
  staticEvaluatedBy: () => staticEvaluatedBy,
  staticEvaluatedByAll: () => staticEvaluatedByAll
});
module.exports = __toCommonJS(unevaluated_exports);
var import_schema = require("./schema.js");
var import_closed_schema = require("./closed-schema.js");
var import_types = require("./types/index.js");
var import_one_of = require("./types/one-of.js");
const ALL = true;
const JSON_TYPES = { properties: "object", items: "array" };
function merge(target, result) {
  if (result === ALL || target === ALL) {
    return ALL;
  }
  result.forEach((item) => target.add(item));
  return target;
}
let evaluated;
const evaluatedByAll = (kind, types, value, seen) => types.reduce((result, item) => merge(result, evaluated(kind, item, value, seen)), /* @__PURE__ */ new Set());
function schemaKeys(type, value, seen) {
  if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
    return ALL;
  }
  const declared = type.propertyKeys ? new Set(type.propertyKeys) : type.keySet;
  let keys = /* @__PURE__ */ new Set();
  Object.keys(value).forEach((key) => {
    if (declared.has(key) || type.patternTypes.some(({ pattern }) => pattern.test(key))) {
      keys.add(key);
    }
  });
  type.dependencies.forEach((dependency) => {
    const isPresent = Object.prototype.hasOwnProperty.call(value, dependency.key);
    if (dependency.type && isPresent && dependency.type.isValid(value)) {
      keys = merge(keys, evaluated("properties", dependency.type, value, seen));
    }
  });
  return keys;
}
function arrayItems(type, value) {
  if (type.type && !Array.isArray(type.type) || type.additionalType) {
    return ALL;
  }
  const items = /* @__PURE__ */ new Set();
  if (Array.isArray(type.type)) {
    for (let i = 0; i < Math.min(type.type.length, value.length); i += 1) {
      items.add(i);
    }
  }
  if (type.contains && type.containsEvaluates) {
    value.forEach((item, i) => {
      if (type.contains.isValid(item)) {
        items.add(i);
      }
    });
  }
  return items;
}
class UnevaluatedType extends import_types.ValidateType {
  constructor(options = {}) {
    super(options);
    this.kind = options.kind;
    this.jsonType = JSON_TYPES[options.kind];
    this.siblings = options.siblings || [];
    this.type = options.type;
  }
  // Keys or indexes that the siblings do not evaluate. What the siblings evaluate counts even from the ones that fail,
  // so an invalid property is reported once, by the keyword that checks it.
  unevaluated(value) {
    const done = evaluatedByAll(this.kind, this.siblings, value, []);
    if (done === ALL) {
      return [];
    }
    const elements = this.kind === "properties" ? Object.keys(value) : value.map((item, i) => i);
    return elements.filter((element) => !done.has(element));
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (!(0, import_types.isJsonType)(value, this.jsonType)) {
      return true;
    }
    return this.unevaluated(value).every((element) => this.type.isValid(value[element]));
  }
  // Keys are named like the keys of a Schema, and a key no schema allows like its "additionalProperties": false.
  errors(value, fieldName) {
    const presence = super.validate(value, fieldName || "Value");
    if (presence !== void 0) {
      return presence;
    }
    if (!(0, import_types.isJsonType)(value, this.jsonType)) {
      return [];
    }
    return this.unevaluated(value).filter((element) => !this.type.isValid(value[element])).map((element) => {
      if (this.kind === "items") {
        return this.type.errors(value[element], `${fieldName || "Value"}[${element}]`);
      }
      const keyName = fieldName ? `${fieldName}.${element}` : element;
      return this.type instanceof import_types.NeverType ? `Unexpected key: ${keyName}` : this.type.errors(value[element], keyName);
    });
  }
  validate(value, fieldName) {
    return this.isValid(value) ? void 0 : this.errors(value, fieldName);
  }
}
evaluated = (kind, type, value, seen = []) => {
  switch (type.constructor) {
    case import_schema.Schema:
    case import_closed_schema.ClosedSchema:
      return kind === "properties" ? schemaKeys(type, value, seen) : /* @__PURE__ */ new Set();
    case import_types.ArrayOfType:
      return kind === "items" ? arrayItems(type, value) : /* @__PURE__ */ new Set();
    case import_types.AllOfType:
      return evaluatedByAll(kind, type.types, value, seen);
    case import_types.AnyOfType:
      return evaluatedByAll(
        kind,
        type.types.filter((item) => item.isValid(value)),
        value,
        seen
      );
    case import_types.OneOfType: {
      const picked = type.pick(value);
      if (picked !== import_one_of.EVERY_TYPE) {
        const isPicked = picked !== import_one_of.NO_TYPE && type.types[picked].isValid(value);
        return isPicked ? evaluated(kind, type.types[picked], value, seen) : /* @__PURE__ */ new Set();
      }
      const valid = type.types.filter((item) => item.isValid(value));
      return valid.length === 1 ? evaluated(kind, valid[0], value, seen) : /* @__PURE__ */ new Set();
    }
    case import_types.ConditionalType: {
      if (type.ifType.isValid(value)) {
        const result = evaluated(kind, type.ifType, value, seen);
        return type.thenType && type.thenType.isValid(value) ? merge(result, evaluated(kind, type.thenType, value, seen)) : result;
      }
      return type.elseType && type.elseType.isValid(value) ? evaluated(kind, type.elseType, value, seen) : /* @__PURE__ */ new Set();
    }
    case import_types.RefType:
      if (seen.some(([ref, seenValue]) => ref === type && seenValue === value)) {
        return /* @__PURE__ */ new Set();
      }
      return evaluated(kind, type.getTarget(), value, [...seen, [type, value]]);
    case import_types.WhenType:
      return (0, import_types.isJsonType)(value, type.jsonType) ? evaluated(kind, type.type, value, seen) : /* @__PURE__ */ new Set();
    case UnevaluatedType:
      if (type.kind === kind && type.isValid(value)) {
        return ALL;
      }
      return evaluatedByAll(kind, type.siblings, value, seen);
    default:
      return /* @__PURE__ */ new Set();
  }
};
const NONE = { all: false, keys: [], patterns: [], prefix: 0 };
const EVERYTHING = { ...NONE, all: true };
function union(a, b) {
  if (a === void 0 || b === void 0) {
    return void 0;
  }
  return {
    all: a.all || b.all,
    keys: [...a.keys, ...b.keys],
    patterns: [...a.patterns, ...b.patterns],
    prefix: Math.max(a.prefix, b.prefix)
  };
}
const isNone = (result) => result !== void 0 && !result.all && result.keys.length === 0 && result.patterns.length === 0 && result.prefix === 0;
let staticOf;
const staticOfAll = (kind, types, seen) => types.reduce((result, item) => union(result, staticOf(kind, item, seen)), NONE);
const staticOfAlternatives = (kind, types, seen) => types.every((item) => item === void 0 || isNone(staticOf(kind, item, seen))) ? NONE : void 0;
staticOf = (kind, type, seen = []) => {
  switch (type.constructor) {
    case import_schema.Schema:
    case import_closed_schema.ClosedSchema:
      if (kind !== "properties") {
        return NONE;
      }
      if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
        return EVERYTHING;
      }
      if (type.dependencies.some((dependency) => dependency.type && !isNone(staticOf(kind, dependency.type, seen)))) {
        return void 0;
      }
      return {
        ...NONE,
        keys: type.propertyKeys || type.keys,
        patterns: type.patternTypes.map(({ pattern }) => pattern)
      };
    case import_types.ArrayOfType:
      if (kind !== "items") {
        return NONE;
      }
      if (type.type && !Array.isArray(type.type) || type.additionalType) {
        return EVERYTHING;
      }
      if (type.contains && type.containsEvaluates) {
        return void 0;
      }
      return { ...NONE, prefix: Array.isArray(type.type) ? type.type.length : 0 };
    case import_types.AllOfType:
      return staticOfAll(kind, type.types, seen);
    case import_types.AnyOfType:
    case import_types.OneOfType:
      return staticOfAlternatives(kind, type.types, seen);
    case import_types.ConditionalType:
      return staticOfAlternatives(kind, [type.ifType, type.thenType, type.elseType], seen);
    case import_types.RefType:
      return seen.includes(type) ? void 0 : staticOf(kind, type.getTarget(), [...seen, type]);
    case import_types.WhenType:
      return type.jsonType === JSON_TYPES[kind] ? staticOf(kind, type.type, seen) : NONE;
    case UnevaluatedType:
      return type.kind === kind ? EVERYTHING : staticOfAll(kind, type.siblings, seen);
    default:
      return NONE;
  }
};
const withKeySet = (result) => result && { ...result, keys: new Set(result.keys) };
function staticEvaluatedByAll(kind, types) {
  return withKeySet(staticOfAll(kind, types, []));
}
function staticEvaluatedBy(kind, type) {
  return withKeySet(staticOf(kind, type, []));
}

},
"@xufa/schema/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/schema","version":"0.1.0"};
},
"node:crypto": function (module, exports, require) {

var refuse = function () { throw new Error('node:crypto is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:diagnostics_channel": function (module, exports, require) {

var channel = function () { return { hasSubscribers: false, publish: function () {}, subscribe: function () {}, unsubscribe: function () {} }; };
module.exports = { channel: channel, subscribe: function () {}, unsubscribe: function () {}, hasSubscribers: function () { return false; } };
},
"node:fs": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:fs/promises": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs/promises is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:http": function (module, exports, require) {

module.exports = {
  METHODS: ['ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE',
    'MKACTIVITY', 'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE',
    'PUT', 'QUERY', 'REBIND', 'REPORT', 'SEARCH', 'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK',
    'UNSUBSCRIBE'],
  STATUS_CODES: {},
};
},
"node:module": function (module, exports, require) {

module.exports = {
  createRequire: function (from) {
    return function (request) { return required(resolve(from, request)); };
  },
};
},
"node:path": function (module, exports, require) {

var refuse = function () { throw new Error('node:path is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:stream": function (module, exports, require) {

var refuse = function () { throw new Error('node:stream is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:util": function (module, exports, require) {

var tag = function (value) { return Object.prototype.toString.call(value).slice(8, -1); };
var is = function (name) { return function (value) { return tag(value) === name; }; };
module.exports = {
  types: {
    isDate: is('Date'), isRegExp: is('RegExp'), isMap: is('Map'), isSet: is('Set'), isWeakMap: is('WeakMap'),
    isWeakSet: is('WeakSet'), isPromise: is('Promise'), isDataView: is('DataView'), isArrayBuffer: is('ArrayBuffer'),
    isNativeError: function (value) { return value instanceof Error; },
    isBoxedPrimitive: function (value) {
      return value !== null && typeof value === 'object' && ['Number', 'String', 'Boolean', 'BigInt', 'Symbol'].indexOf(tag(value)) >= 0;
    },
  },
  inspect: Object.assign(function (value) { try { return JSON.stringify(value); } catch (e) { return String(value); } }, { custom: Symbol.for('nodejs.util.inspect.custom') }),
  format: function () { return Array.prototype.join.call(arguments, ' '); },
};
}
  };
  var mains = {"@xufa/schema":"@xufa/schema/index.js"};
  var cache = {};
  function resolve(from, request) {
    if (modules[request] && request.indexOf('node:') === 0) return request;
    if (mains[request]) return mains[request];
    if (request.charAt(0) !== '.') throw new Error('Not in the browser bundle: ' + request + ' (from ' + from + ')');
    var parts = from.split('/').slice(0, -1).concat(request.split('/'));
    var stack = [];
    parts.forEach(function (part) {
      if (part === '..') stack.pop();
      else if (part !== '.' && part !== '') stack.push(part);
    });
    var id = stack.join('/');
    var found = [id, id + '.js', id + '.json', id + '/index.js'].filter(function (c) { return modules[c]; })[0];
    if (!found) throw new Error('Cannot find module ' + request + ' from ' + from);
    return found;
  }
  function load(id) {
    if (!cache[id]) {
      var module = { exports: {} };
      cache[id] = module;
      modules[id].call(module.exports, module, module.exports, function (request) {
        return load(resolve(id, request));
      });
    }
    return cache[id].exports;
  }
  // What require() gives: of an ES module, its 'module.exports' export when it has one.
  function required(id) {
    var value = load(id);
    return value && value.__esModule && Object.prototype.hasOwnProperty.call(value, 'module.exports')
      ? value['module.exports']
      : value;
  }
  function main(name) {
    return required(mains[name]);
  }
  root.xufaSchema = main('@xufa/schema');
})(typeof globalThis !== 'undefined' ? globalThis : this);
