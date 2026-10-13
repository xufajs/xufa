// Formatting as prettier 3.9.9 does: its own code (ported to ./src), driven as its core does it, without its plugins
// and configs: the options normalized here, the text parsed, comments attached, the tree printed into a doc, and the
// doc printed into text.
//
// - JavaScript: by prettier's typescript parser, as prettier's Babel parser would have it (Babel's parentheses);
// - TypeScript: by prettier's typescript parser (typescript-estree);
// - JSON: its value printed by the printer of JavaScript (prettier's json parser); package.json, package-lock.json
//   and composer.json as JSON.stringify writes them (its json-stringify parser);
// - Markdown: by prettier's markdown parser (micromark) and printer; code blocks of JavaScript, TypeScript and JSON are
//   formatted too (./embedded.js).
//
// Embedded languages of JavaScript (css`...`, html`...`) are left as they are.

import path from 'node:path';
import { typescript } from './src/language-js/parse/typescript.js';
import { estree } from './src/language-js/printers.js';
import { printAstToDoc } from './src/main/ast-to-doc.js';
import { normalizePrinter } from './src/main/parser-and-printer.js';
import { printDocToString } from './src/document/printer/printer.js';
import { normalizeEndOfLine, guessEndOfLine, convertEndOfLineOptionToCharacter } from './src/common/end-of-line.js';
import { parseJson } from './parse/json.js';
import inferParser from './src/utilities/infer-parser.js';

const BOM = String.fromCharCode(0xfeff);

// Files prettier writes with its json-stringify parser.
const JSON_STRINGIFY = new Set(['package.json', 'package-lock.json', 'composer.json']);

// prettier's defaults (of its core, common, JavaScript and markdown options).
const DEFAULTS = {
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  cursorOffset: -1,
  embeddedLanguageFormatting: 'auto',
  endOfLine: 'lf',
  experimentalOperatorPosition: 'end',
  experimentalTernaries: false,
  insertPragma: false,
  jsxSingleQuote: false,
  objectWrap: 'preserve',
  printWidth: 80,
  proseWrap: 'preserve',
  quoteProps: 'as-needed',
  rangeEnd: Number.POSITIVE_INFINITY,
  rangeStart: 0,
  requirePragma: false,
  semi: true,
  singleAttributePerLine: false,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
};

// Markdown: its printer and parser, loaded for the first markdown file.
let markdown = null;
async function loadMarkdown() {
  if (!markdown) {
    const [printers, parse, loc] = await Promise.all([
      import('./src/language-markdown/printers.js'),
      import('./src/language-markdown/parse/parse-markdown.js'),
      import('./src/language-markdown/loc.js'),
    ]);
    markdown = { printer: normalizePrinter(printers.mdast), parse: parse.parseMarkdown, ...loc };
  }
  return markdown;
}

// The parser prettier has for a file: babel, typescript, json, json5, jsonc, json-stringify or markdown (null: not
// formatted). The JSON ones by prettier's table of languages (.json5, .jsonc, .babelrc, tsconfig.json...).
function parserOf(filepath = '') {
  const name = path.basename(filepath).toLowerCase();
  if (JSON_STRINGIFY.has(name)) return 'json-stringify';
  if (/\.(?:[cm]?js|jsx)$/.test(name)) return 'babel';
  if (/\.(?:[cm]?ts|tsx)$/.test(name)) return 'typescript';
  if (/\.(?:md|markdown)$/.test(name)) return 'markdown';
  const inferred = inferParser({}, { physicalFile: name });
  if (inferred === 'json' || inferred === 'json5' || inferred === 'jsonc' || inferred === 'json-stringify') {
    return inferred;
  }
  return null;
}

// The options of a parser: those given over prettier's defaults, and what prettier adds (printer, locations...).
function optionsFor(parser, given) {
  const options = {
    ...DEFAULTS,
    ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)),
    parser,
    plugins: [],
  };
  if (parser === 'markdown') {
    Object.assign(options, {
      astFormat: 'mdast',
      printer: markdown.printer,
      locStart: markdown.locStart,
      locEnd: markdown.locEnd,
    });
  } else {
    Object.assign(options, {
      astFormat: 'estree',
      printer: normalizePrinter(estree),
      locStart: typescript.locStart,
      locEnd: typescript.locEnd,
    });
  }
  // (As prettier's normalizeFormatOptions: the printer's visitor keys.)
  options.getVisitorKeys = options.printer.getVisitorKeys;
  // (As prettier's normalizeFormatOptions: the json parser never prints trailing commas. Quotes are the printer's.)
  if (parser === 'json') {
    options.trailingComma = 'none';
  }
  return options;
}

// The tree of a text for its options' parser.
function parseWith(text, options) {
  switch (options.parser) {
    case 'babel':
    case 'typescript':
      return typescript.parse(text, options);
    case 'json':
    case 'json5':
    case 'jsonc': {
      // (As prettier's json parsers: Babel's tree of the value; jsonc may be comments only.)
      return parseJson(text, { allowEmpty: options.parser === 'jsonc' });
    }
    case 'markdown':
      return markdown.parse(text);
    default:
      throw new Error(`Not formatted: ${options.parser}`);
  }
}

// A value of JSON as prettier's json-stringify parser writes it, in JSON.stringify's layout: strings in double quotes
// and numbers as written, keys and other strings as JSON.stringify writes them, a unary + dropped, every key kept.
function stringifyJson(node, indent = '') {
  const inner = `${indent}  `;
  const list = (open, items, close) =>
    items.length ? `${open}\n${items.map((item) => inner + item).join(',\n')}\n${indent}${close}` : open + close;
  switch (node.type) {
    case 'ObjectExpression':
      return list(
        '{',
        node.properties.map((property) => `${keyOf(property.key)}: ${stringifyJson(property.value, inner)}`),
        '}'
      );
    case 'ArrayExpression':
      return list(
        '[',
        node.elements.map((element) => stringifyJson(element, inner)),
        ']'
      );
    case 'StringLiteral':
      return node.extra.raw.startsWith('"') ? node.extra.raw : JSON.stringify(node.value);
    case 'NumericLiteral':
    case 'BigIntLiteral':
      return node.extra.raw;
    case 'UnaryExpression':
      return (node.operator === '+' ? '' : node.operator) + stringifyJson(node.argument, indent);
    case 'TemplateLiteral':
      return JSON.stringify(node.quasis[0].value.cooked);
    case 'BooleanLiteral':
      return String(node.value);
    case 'NullLiteral':
      return 'null';
    default:
      // An identifier (Infinity, NaN, undefined), as written.
      return node.name;
  }
}

const keyOf = (key) =>
  key.type === 'StringLiteral'
    ? stringifyJson(key)
    : JSON.stringify(key.type === 'Identifier' ? key.name : key.extra.raw);

/**
 * `text` formatted: options as prettier's (printWidth, singleQuote, trailingComma...), and filepath (its
 * extension tells the language: JavaScript, TypeScript, JSX, JSON or markdown).
 */
async function format(originalText, given = {}) {
  let text = originalText;
  const hasBOM = text.charAt(0) === BOM;
  if (hasBOM) text = text.slice(1);
  const parser = given.parser ?? parserOf(given.filepath);
  if (!parser) throw new Error(`No formatter for ${given.filepath ?? 'a text without a file name'}`);
  if (parser === 'markdown') await loadMarkdown();
  const options = optionsFor(parser, given);
  if (options.endOfLine === 'auto') options.endOfLine = guessEndOfLine(text);
  if (text.includes('\r')) text = normalizeEndOfLine(text);
  if (!text || text.trim().length === 0) return hasBOM ? BOM : '';
  let formatted;
  if (parser === 'json-stringify') {
    formatted = `${stringifyJson(parseJson(text, { allowComments: false }).node)}\n`;
  } else {
    options.originalText = text;
    const ast = parseWith(text, options);
    const doc = await printAstToDoc(ast, options);
    ({ formatted } = printDocToString(doc, options));
  }
  // (The doc printer writes the line ends of endOfLine; stringifyJson writes \n.)
  if (parser === 'json-stringify' && options.endOfLine !== 'lf') {
    formatted = formatted.replace(/\n/g, convertEndOfLineOptionToCharacter(options.endOfLine));
  }
  return hasBOM ? BOM + formatted : formatted;
}

export { format, parserOf, optionsFor, parseWith, DEFAULTS };
