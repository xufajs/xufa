const fs = require('node:fs');
const path = require('node:path');

// What tools/port-types/port.js ports: for every package of xufa, the upstream package it replaces, its files of
// declarations and type tests, and the renames (applied in order, to every file of the package).

// What @xufa/router has that find-my-way has not: match(), its constants and helpers, the QUERY method.
function patchRouter(code) {
  let out = code;
  out = out.replace("    | 'PUT'\n", "    | 'PUT'\n    | 'QUERY'\n");
  out = out.replace(
    '    ignoreTrailingSlash?: boolean;\n',
    '    ignoreTrailingSlash?: boolean;\n\n' +
      '    /** Whether ";" starts the query string too, as "?" does. */\n' +
      '    useSemicolonDelimiter?: boolean;\n\n' +
      '    /** The metadata prettyPrint() shows for a route, from its store. */\n' +
      '    buildPrettyMeta?(route: { method: HTTPMethod; path: string; opts: RouteOptions; handler: Handler<V>; store: any }): object;\n'
  );
  out = out.replace(
    '  interface FindRouteResult<V extends HTTPVersion> {',
    '  /** The status of a MatchResult: the route was found, the path is malformed, a parameter is too long. */\n' +
      '  type MatchStatus = typeof FOUND | typeof BAD_URL | typeof MAX_PARAM_LENGTH;\n\n' +
      '  const FOUND: 0;\n  const BAD_URL: 1;\n  const MAX_PARAM_LENGTH: 2;\n\n' +
      '  /**\n   * What match() finds. The router reuses this object for every call: read it before the next one.\n   */\n' +
      '  interface MatchResult<V extends HTTPVersion> {\n' +
      '    status: MatchStatus;\n    handler: Handler<V> | null;\n    store: any;\n' +
      '    params: { [k: string]: string | undefined } | null;\n' +
      '    /** The query string of the URL, not parsed. */\n    querystring: string;\n    path: string;\n  }\n\n' +
      '  interface FindRouteResult<V extends HTTPVersion> {'
  );
  out = out.replace(
    '    find(\n',
    '    /**\n     * Finds the route of a method and URL (with its query string), without calling its handler: null when\n' +
      '     * there is none. The result is reused by the next call.\n     */\n' +
      '    match(\n      method: HTTPMethod,\n      url: string,\n      constraints?: { [key: string]: any }\n' +
      '    ): MatchResult<V> | null;\n\n    find(\n'
  );
  out = out.replace('    put: ShortHandRoute<V>;\n', '    put: ShortHandRoute<V>;\n    query: ShortHandRoute<V>;\n');
  out = out.replace(
    '  function trimLastSlash(path: string): string;\n',
    '  function trimLastSlash(path: string): string;\n' +
      '  function safeDecodeURI(\n    url: string,\n    useSemicolonDelimiter?: boolean\n' +
      '  ): { path: string; querystring: string; shouldDecodeParam: boolean };\n' +
      '  function safeDecodeURIComponent(value: string): string;\n' +
      '  function isSafeRegex(pattern: string | RegExp): boolean;\n' +
      '  const httpMethods: HTTPMethod[];\n' +
      '  /** A constructor of objects without a prototype, faster to create than Object.create(null). */\n' +
      '  const NullObject: { new (): { [key: string]: any } };\n' +
      '  /** The class of the routers (the default export creates one). */\n' +
      '  const Router: { new <V extends HTTPVersion = HTTPVersion.V1>(config?: Config<V>): Instance<V> };\n'
  );
  return out;
}

const BOOT_ERRORS = [
  'EXPOSE_ALREADY_DEFINED',
  'ATTRIBUTE_ALREADY_DEFINED',
  'CALLBACK_NOT_FN',
  'PLUGIN_NOT_VALID',
  'ROOT_PLG_BOOTED',
  'PARENT_PLG_LOADED',
  'READY_TIMEOUT',
  'PLUGIN_EXEC_TIMEOUT',
];

// What @xufa/boot exports besides the function: the class, its errors and its symbols.
function patchBoot(code) {
  return code
    .replace(
      "import { EventEmitter } from 'node:events'\n",
      "import { EventEmitter } from 'node:events'\nimport { XufaErrorConstructor } from '@xufa/errors'\n"
    )
    .replace(
      'declare namespace boot {\n',
      'declare namespace boot {\n' +
        '  /** The function itself, by name. */\n  const Boot: typeof boot\n' +
        '  /** The errors of loading plugins. */\n' +
        `  const errors: {\n${BOOT_ERRORS.map((code) => `    BOOT_ERR_${code}: XufaErrorConstructor<{ code: 'BOOT_ERR_${code}' }>\n`).join('')}  }\n` +
        '  /** The key of the instance of Boot on the object it was given. */\n  const kBoot: unique symbol\n' +
        '  /** The key of the metadata of a plugin (its name, dependencies...). */\n  const kPluginMeta: unique symbol\n\n'
    );
}

// @xufa/serializer has no ajv (the branches of anyOf and if are chosen by its own matcher, which reads coerceTypes),
// no standalone mode nor restore(), and two outputs (see its index.js); its serializers of bytes have toBuffer().
function patchSerializer(code) {
  return (
    code
      .replace(
        "import Ajv, { Options as AjvOptions } from 'ajv'\n",
        '/** The options of ajv that @xufa/serializer reads: coerceTypes, to choose the branches of anyOf and if. */\n' +
          "type AjvOptions = { coerceTypes?: boolean | 'array', [option: string]: unknown }\n\n" +
          '/** What serializers that write bytes (output "bytes", or "auto" for values of unknown size) have. */\n' +
          'interface ToBuffer {\n  /** The JSON as UTF-8 bytes, in a buffer of their own. */\n  toBuffer?: (doc: any) => Buffer\n}\n'
      )
      .replace(
        "    mode?: 'debug' | 'standalone'\n",
        "    mode?: 'debug'\n" +
          '    /**\n     * How the JSON is made: joined as a string (fastest for values of a size the schema knows), or written as\n' +
          "     * bytes (fastest for arrays and maps). 'auto' picks by the schema.\n     *\n     * @default 'auto'\n     */\n" +
          "    output?: 'auto' | 'string' | 'bytes'\n"
      )
      .replace(/ {2}export function restore \(value: [^\n]*\n/, '')
      .replace(/interface StandaloneOption extends build\.Options \{\n {2}mode: 'standalone'\n\}\n\n/, '')
      .replace('): { code: string, ajv: Ajv }\n', '): { code: string }\n')
      .replace(/declare function build \(schema: build\.AnySchema, options: StandaloneOption\): string\n/, '')
      // The serializers: (<TDoc>(doc: TDoc) => string) & ToBuffer.
      .replace(
        /(declare function build \(schema: build\.[^\n]*?\): )(<TDoc[^\n]*=> (?:string|'null'|any))\n/g,
        '$1($2) & ToBuffer\n'
      )
      .replace(/^/, '/// <reference types="node" />\n')
  );
}

// The type tests of what @xufa/serializer has not (ajv, restore) are left out.
function patchSerializerTest(code) {
  return code
    .replace("import Ajv from 'ajv'\n", '')
    .replace(
      'import build, { restore, Schema, validLargeArrayMechanisms }',
      'import build, { Schema, validLargeArrayMechanisms }'
    )
    .replace(
      /\nconst debugCompiled = build\([\s\S]*?\n(?:expect\((?:build\.)?restore\(debugCompiled\)\)[^\n]*\n)+/,
      '\n'
    );
}

// @xufa/logger has no transports (it throws when given one: logs go to a stream), its destination() is its own
// Destination (not sonic-boom), its symbols are its own, and its standard serializers are err, errWithCause, req and
// res (in std-serializers.d.ts, ported from pino-std-serializers).
const LOGGER_SYMBOLS = [
  'configSym',
  'chindingsSym',
  'serializersSym',
  'redactSym',
  'levelValSym',
  'msgPrefixSym',
  'streamSym',
  'writeSym',
  'needsMetadataGsym',
];

function patchLogger(code) {
  return (
    code
      // Destination extends it.
      .replace('import type { EventEmitter } from "events";\n', 'import { EventEmitter } from "events";\n')
      .replace(
        'import * as pinoStdSerializers from "pino-std-serializers";\n',
        'import * as pinoStdSerializers from "./std-serializers";\n'
      )
      .replace('import type { SonicBoom, SonicBoomOpts } from "sonic-boom";\n', '')
      .replace('import ThreadStream from "thread-stream";\n', '')
      .replace('import type { WorkerOptions } from "worker_threads";\n', '')
      .replace(
        /\n {4}export interface TransportTargetOptions[\s\S]*?\n {4}export interface MultiStreamOptions/,
        '\n    export interface MultiStreamOptions'
      )
      .replace(/ {8}transport\?: TransportSingleOptions \| TransportMultiOptions \| TransportPipelineOptions\n/, '')
      .replace(/\n {4}export function transport<[\s\S]*?\): ThreadStream\n/, '\n')
      .replace(
        /( {4}export const symbols: \{\n)[\s\S]*?\n( {4}\};)/,
        `$1${LOGGER_SYMBOLS.map((name) => `        readonly ${name}: unique symbol;`).join('\n')}\n$2`
      )
      .replace(
        / {8}dest\?: number \| object \| string \| DestinationStream \| NodeJS\.WritableStream \| SonicBoomOpts,\n {4}\): SonicBoom;/,
        '        dest?: number | string | DestinationOptions,\n    ): Destination;\n\n' +
          '    /** The options of destination(). */\n' +
          '    export interface DestinationOptions {\n' +
          '        /** A file descriptor or a file path. Default: 1 (stdout). */\n        dest?: number | string;\n' +
          '        fd?: number;\n' +
          '        /** Write each line when it is logged (true) or buffer them (false). Default: true. */\n        sync?: boolean;\n' +
          '        /** Bytes buffered before writing, when not sync. */\n        minLength?: number;\n' +
          '        /** Lines that would make the buffer longer are dropped (with a "drop" event). */\n        maxLength?: number;\n' +
          '        append?: boolean;\n        /** Creates the directory of the file. */\n        mkdir?: boolean;\n' +
          '        /** fsync after each write. */\n        fsync?: boolean;\n    }\n\n' +
          '    /** What destination() gives: a stream writing to a file descriptor or a file (sonic-boom for pino). */\n' +
          '    export class Destination extends EventEmitter implements DestinationStream {\n' +
          '        constructor(options?: DestinationOptions);\n' +
          '        readonly fd: number;\n        readonly file: string | null;\n' +
          '        write(data: string): boolean;\n' +
          '        flush(cb?: (err?: Error) => void): void;\n        flushSync(): void;\n' +
          '        /** Opens the file again (after a log rotation), or another one. */\n        reopen(file?: string): void;\n' +
          '        end(): void;\n        destroy(): void;\n    }'
      )
  );
}

// The type tests of transports and sonic-boom are left out.
function patchLoggerTest(code) {
  return code
    .replace(/\n\s*transport: \{\n\s*target: 'pino-pretty',\n\s*options: \{\n\s*colorize: true,\n\s*\},\n\s*\},/g, '')
    .replace("import type { SonicBoom } from 'sonic-boom'\n", '')
    .replace('  transport,\n', '  Destination,\n')
    .replace("expectType<SonicBoom>(destination(''))", "expectType<Destination>(destination(''))")
    .replace('symbols.endSym', 'symbols.streamSym')
    .replace(/\n\/\/ TODO: currently returns \(aliased\) `any`[\s\S]*$/, '\n');
}

const LOGGER_TEST_RENAMES = [[/(['"])\.\.\/\.\.\/pino\1/g, "'../..'"]];

// The framework: fastify's declarations, with its packages replaced by the ones of xufa. The compilers of ajv and
// fast-json-stringify are declared by types/compilers.d.ts (written for xufa, not ported).
const XUFA_RENAMES = [
  // fastify.d.ts is index.d.ts.
  [/(['"])\.\.\/fastify\1/g, "'../index'"],
  [/'@fastify\/error'/g, "'@xufa/errors'"],
  [/'find-my-way'/g, "'@xufa/router'"],
  [/'light-my-request'/g, "'@xufa/inject'"],
  [/'pino'/g, "'@xufa/logger'"],
  [/FST_ERR_/g, 'XUFA_ERR_'],
  [/FSTDEP/g, 'XUFADEP'],
  [/FSTWRN/g, 'XUFAWRN'],
  [/FSTSEC/g, 'XUFASEC'],
  [/Fastify/g, 'Xufa'],
  [/(?<!@)\bfastify\b/g, 'xufa'],
];

// The imports of the compilers, from the root (index.d.ts) or from types/.
const compilerImports = (dir) => [
  [
    /import \{ Options as FJSOptions, SerializerFactory \} from '@fastify\/fast-json-stringify-compiler'/,
    `import { SerializerOptions as FJSOptions, SerializerFactory } from '${dir}compilers'`,
  ],
  [/'@fastify\/ajv-compiler'/g, `'${dir}compilers'`],
  [/'@fastify\/fast-json-stringify-compiler'/g, `'${dir}compilers'`],
];

// The top-level statements of a test file (a statement starts at a line that is not indented and does not close
// one) without the ones `drop` matches.
function dropStatements(code, drop) {
  const statements = [];
  for (const line of code.split('\n')) {
    const starts = line.length > 0 && !/^[\s})\]]/.test(line);
    if (starts || statements.length === 0) statements.push(line);
    else statements[statements.length - 1] += `\n${line}`;
  }
  return statements.filter((statement) => !drop(statement)).join('\n');
}

// Type tests of what xufa has not: ajv's plugins and instance (it validates with schiva), standalone compilers.
const XUFA_TEST_PATCHES = {
  'fastify.tst.ts': (code) => dropStatements(code, (s) => /\bajv: \{[\s\S]*\b(plugins|onCreate)\b/.test(s)),
  'schema.tst.ts': (code) =>
    dropStatements(code, (s) => /Standalone(Validator|Serializer)|ajv-compiler\/issues\/95/.test(s)),
};

function xufaFiles(source) {
  const files = [
    {
      from: 'fastify.d.ts',
      to: 'index.d.ts',
      renames: compilerImports('./types/'),
      // xufa.plugin(): what fastify-plugin is for fastify.
      patch: (code) =>
        code
          .replace(
            "import * as http from 'node:http'\n",
            "import * as http from 'node:http'\nimport pluginFunction = require('./types/plugin-function')\n"
          )
          .replace(
            '  export const errorCodes: XufaErrorCodes\n',
            '  export const errorCodes: XufaErrorCodes\n' +
              '  /** Wraps a plugin so that it is not encapsulated, with its metadata (what fastify-plugin does for fastify). */\n' +
              '  export const plugin: typeof pluginFunction\n' +
              '  export type PluginMetadata = pluginFunction.PluginMetadata\n'
          ),
    },
  ];
  for (const name of fs.readdirSync(path.join(source, 'types'))) {
    if (name.endsWith('.d.ts'))
      files.push({ from: `types/${name}`, to: `types/${name}`, renames: compilerImports('./') });
  }
  for (const name of fs.readdirSync(path.join(source, 'test', 'types'))) {
    if (name === 'tsconfig.json') continue;
    files.push({
      from: `test/types/${name}`,
      to: `test/types/${name}`,
      renames: [[/(['"])\.\.\/\.\.\/fastify(?:\.js)?\1/g, "'../..'"], ...compilerImports('../../types/')],
      patch: XUFA_TEST_PATCHES[name],
    });
  }
  return files;
}

// xufa.plugin() is fastify-plugin. The metadata keys of fastify are accepted too: decorators.fastify is checked as
// decorators.xufa, and the range of fastify versions is not checked (it is not a range of xufa versions).
function patchPluginFunction(code) {
  return code
    .replace('/// <reference types="xufa" />\n\n', '')
    .replace(
      '    xufa?: string,\n',
      '    xufa?: string,\n    /** The range of fastify versions of a plugin written for fastify: accepted, not checked. */\n    fastify?: string,\n'
    )
    .replace(
      '      xufa?: (string | symbol)[],\n',
      '      xufa?: (string | symbol)[],\n      /** The same as `xufa`, for plugins written for fastify. */\n      fastify?: (string | symbol)[],\n'
    );
}

const SEQUELIZE_INTERNALS = [
  'types/dialects/abstract/index.d.ts',
  'types/dialects/sqlite/sqlite-utils.d.ts',
  'types/generic/falsy.d.ts',
  'types/generic/sql-fragment.d.ts',
  'types/sql-string.d.ts',
  'types/utils/class-to-invokable.d.ts',
  'types/utils/deprecations.d.ts',
  'types/utils/join-sql-fragments.d.ts',
  'types/utils/logger.d.ts',
  'types/utils/sql.d.ts',
];

// The text replaced, which must be there (a new version of the declarations that changes it fails the port).
function replaceOnce(code, from, to) {
  if (!code.includes(from)) throw new Error(`Not found in the declarations of Sequelize: ${from.slice(0, 80)}`);
  return code.replace(from, () => to);
}

// The text from `start` to `end` (both included) left out.
function cut(code, start, end) {
  const from = code.indexOf(start);
  const to = code.indexOf(end, from);
  if (from === -1 || to === -1) throw new Error(`Not found in the declarations of Sequelize: ${start.slice(0, 80)}`);
  return code.slice(0, from) + code.slice(to + end.length);
}

// The validators of validator.js that @xufa/sequelize has (its Validator), instead of the types of validator.js (the
// ones Sequelize adds are declared by it: isIPv4, len, notEmpty...).
const VALIDATORS = [
  'isEmail',
  'isURL',
  'isJSON',
  'isBoolean',
  'isIP',
  'isAlpha',
  'isAlphanumeric',
  'isNumeric',
  'isInt',
  'isFloat',
  'isDecimal',
  'isHexadecimal',
  'isLowercase',
  'isUppercase',
  'isUUID',
  'isDate',
  'isCreditCard',
];

// What @xufa/sequelize has not of Sequelize 6, and what it has more: by file of types/. Sequelize's declarations
// use three packages of types (validator, retry-as-promised, debug): what they are is written here instead.
const SEQUELIZE_PATCHES = {
  'types/sequelize.d.ts': (code) =>
    replaceOnce(
      replaceOnce(code, "import type { Options as RetryAsPromisedOptions } from 'retry-as-promised';\n", ''),
      'export type RetryOptions = RetryAsPromisedOptions;',
      '/**\n * Queries run again when they fail (retry-as-promised in Sequelize). @xufa/sequelize reads `max` and `match`; the\n' +
        ' * other options are accepted and not used.\n */\n' +
        'export interface RetryOptions {\n' +
        '  /** How many times the query is run at most. */\n  max: number;\n' +
        '  /** The errors it is run again on: texts their message (or name) includes, patterns, or classes. */\n' +
        '  match?: (string | RegExp | (new (...args: any[]) => Error))[];\n' +
        '  timeout?: number;\n  backoffBase?: number;\n  backoffExponent?: number;\n' +
        '  report?: (message: string, info: object, error?: Error) => void;\n  name?: string;\n}'
    ),
  'types/utils/validator-extras.d.ts': (code) =>
    replaceOnce(
      code,
      "// tslint:disable-next-line:no-implicit-dependencies\nimport * as val from 'validator';\n\ntype OrigValidator = typeof val;\n",
      '/** The validators of validator.js that @xufa/sequelize has: (value, ...arguments) => whether it is valid. */\n' +
        'interface OrigValidator {\n' +
        VALIDATORS.map((name) => `  ${name}(str: string, ...args: any[]): boolean;\n`).join('') +
        '  isIn(str: string, values: unknown[]): boolean;\n' +
        '  isAfter(str: string, date?: string | Date): boolean;\n' +
        '  isBefore(str: string, date?: string | Date): boolean;\n' +
        '  equals(str: string, comparison: string): boolean;\n' +
        '  isNull(value: unknown): boolean;\n  notNull(value: unknown): boolean;\n  isArray(value: unknown): boolean;\n' +
        '  /** Adds a validator (by its name, to the validate options of attributes too). */\n' +
        '  extend(name: string, fn: (str: string, ...args: any[]) => boolean): this;\n' +
        '}\n'
    ) +
    // Sequelize.Validator is the validator (a value), which the declarations of Sequelize only give as a type.
    '\n/** The validators of the attributes (Sequelize.Validator). */\nexport const Validator: Validator;\n',
  // Sequelize's helpers of its own SQL writer are not in @xufa/sequelize.
  'types/utils.d.ts': (code) => {
    let out = cut(code, 'export function format(', '}, dialect: string): string;\n');
    out = cut(
      out,
      'export interface OptionsForMapping<',
      'export function mapValueFieldNames(dataValues: object, fields: string[], model: ModelType): object;\n'
    );
    return out;
  },
  'types/dialects/abstract/query-interface.d.ts': (code) => {
    // increment and decrement as Sequelize runs them (its declaration has other arguments).
    let out = replaceOnce(
      code,
      '  public increment<M extends Model>(\n    instance: Model,\n    tableName: TableName,\n    values: object,\n' +
        '    identifier: WhereOptions<Attributes<M>>,\n    options?: QueryOptions\n  ): Promise<object>;\n',
      '  public increment<M extends Model>(\n    model: ModelType | null,\n    tableName: TableName,\n' +
        '    where: WhereOptions<Attributes<M>>,\n    incrementAmountsByField: { [column: string]: number },\n' +
        '    extraAttributesToBeUpdated?: object,\n    options?: QueryOptions\n  ): Promise<object>;\n\n' +
        '  /**\n   * Decrements a row value\n   */\n' +
        '  public decrement<M extends Model>(\n    model: ModelType | null,\n    tableName: TableName,\n' +
        '    where: WhereOptions<Attributes<M>>,\n    decrementAmountsByField: { [column: string]: number },\n' +
        '    extraAttributesToBeUpdated?: object,\n    options?: QueryOptions\n  ): Promise<object>;\n'
    );
    // Transactions are begun, committed and rolled back by Transaction (of @xufa/orm), not by the QueryInterface.
    out = cut(
      out,
      '  /**\n   * Set option for autocommit of a transaction',
      'public rollbackTransaction(transaction: Transaction, options?: QueryOptions): Promise<void>;\n\n'
    );
    return out;
  },
  // The error of what @xufa/sequelize does not do of Sequelize 6.
  'types/errors/index.d.ts': (code) =>
    `${code}\n/**\n * What Sequelize 6 does that @xufa/sequelize does not (see its README): thrown instead of doing something else.\n */\n` +
    "export { default as NotSupportedError } from './not-supported-error';\n",
};

function patchSequelize(code, file) {
  const patch = SEQUELIZE_PATCHES[file];
  return patch ? patch(code) : code;
}

// The type tests of what @xufa/sequelize has not are left out of their files.
const SEQUELIZE_TEST_PATCHES = {};

function patchSequelizeTest(code, file) {
  const patch = SEQUELIZE_TEST_PATCHES[file];
  return patch ? patch(code) : code;
}

// Every file under a directory of an upstream package, as { from, to } (the same relative path under `to`).
function tree(source, from, to, extension, options = {}) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(source, dir), { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(extension)) {
        files.push({ from: relative, to: path.posix.join(to, path.posix.relative(from, relative)), ...options });
      }
    }
  };
  walk(from);
  return files.sort((a, b) => a.from.localeCompare(b.from));
}

module.exports = [
  {
    target: 'http',
    upstream: 'fastify-plugin',
    renames: [
      [/from 'fastify'/g, "from '../index'"],
      [/fastifyPlugin/g, 'plugin'],
      [/FastifyPlugin\b/g, 'PluginFunction'],
      [/Fastify/g, 'Xufa'],
      [/\bfastify\b/g, 'xufa'],
    ],
    files: [{ from: 'types/plugin.d.ts', to: 'types/plugin-function.d.ts', patch: patchPluginFunction }],
  },
  {
    target: 'http',
    upstream: 'fastify',
    dir: '../fastify',
    renames: XUFA_RENAMES,
    files: xufaFiles,
  },
  {
    target: 'logger',
    upstream: 'pino',
    files: [
      { from: 'pino.d.ts', to: 'index.d.ts', patch: patchLogger },
      ...[
        'pino.test-d.ts',
        'pino-import.test-d.cts',
        'pino-multistream.test-d.ts',
        'pino-top-export.test-d.ts',
        'pino-type-only.test-d.ts',
      ].map((name) => ({
        from: `test/types/${name}`,
        to: `test/types/${name}`,
        renames: LOGGER_TEST_RENAMES,
        patch: patchLoggerTest,
      })),
    ],
  },
  {
    target: 'logger',
    upstream: 'pino-std-serializers',
    files: [{ from: 'index.d.ts', to: 'std-serializers.d.ts' }],
  },
  {
    target: 'serializer',
    upstream: 'fast-json-stringify',
    files: [
      { from: 'types/index.d.ts', to: 'index.d.ts', patch: patchSerializer },
      {
        from: 'types/index.tst.ts',
        to: 'test/types/index.tst.ts',
        renames: [[/from '\.\.'/g, "from '../..'"]],
        patch: patchSerializerTest,
      },
    ],
  },
  {
    target: 'inject',
    upstream: 'light-my-request',
    files: [
      { from: 'types/index.d.ts', to: 'index.d.ts' },
      { from: 'types/index.test-d.ts', to: 'test/types/index.test-d.ts', renames: [[/from '\.\.'/g, "from '../..'"]] },
    ],
  },
  {
    target: 'boot',
    upstream: 'avvio',
    renames: [
      [/\bavvio\b/g, 'boot'],
      [/\bAvvio\b/g, 'Boot'],
    ],
    files: [
      { from: 'index.d.ts', to: 'index.d.ts', patch: patchBoot },
      { from: 'test/types/index.ts', to: 'test/types/index.ts' },
      {
        from: 'test/types/tsconfig.json',
        to: 'test/types/tsconfig.json',
        // With the type tests of xufa (test/types/xufa.ts).
        patch: (code) => code.replace('"files": ["./index.ts"]', '"files": ["./index.ts", "./xufa.ts"]'),
      },
    ],
  },
  {
    target: 'router',
    upstream: 'find-my-way',
    files: [
      { from: 'index.d.ts', to: 'index.d.ts', patch: patchRouter },
      { from: 'test/types/router.tst.ts', to: 'test/types/router.tst.ts' },
    ],
  },
  {
    target: 'errors',
    upstream: '@fastify/error',
    renames: [
      [/FastifyErrorConstructor/g, 'XufaErrorConstructor'],
      [/FastifyError/g, 'XufaError'],
    ],
    files: [
      {
        from: 'types/index.d.ts',
        to: 'index.d.ts',
        // xufa has a switch for the stack traces of every error created after it is set.
        patch: (code) =>
          code.replace(
            '  export const createError: CreateError\n',
            '  export const createError: CreateError\n\n' +
              '  /** Whether the errors created after this is set capture a stack trace (the default of the fifth argument). */\n' +
              '  export let captureStackTrace: boolean\n'
          ),
      },
      { from: 'types/index.test-d.ts', to: 'test/types/index.test-d.ts', renames: [[/from '\.\.'/g, "from '../..'"]] },
    ],
  },
  // Sequelize 6 is installed by tools/sequelize-compat (npm install there), and its type tests are in the tests that
  // its fetch-tests.js gets (the v6 branch at the commit it pins).
  {
    target: 'sequelize',
    upstream: 'sequelize',
    dir: 'tools/sequelize-compat/node_modules/real-sequelize',
    // Without the declarations of internals the public ones do not use.
    files: (source) =>
      tree(source, 'types', 'types', '.d.ts', { patch: patchSequelize }).filter(
        (file) => !SEQUELIZE_INTERNALS.includes(file.from)
      ),
  },
  {
    target: 'sequelize',
    upstream: 'sequelize',
    dir: 'tools/sequelize-compat',
    files: (source) => tree(source, 'test/types', 'test/types', '.ts', { patch: patchSequelizeTest }),
  },
];
