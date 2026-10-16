'use strict';

// An OpenAPI document from the comments of source files, as swagger-jsdoc 6 makes it (its options, its output):
//
//   const jsdoc = require('@xufa/openapi/jsdoc');
//   const document = jsdoc({ definition: { openapi: '3.0.1', info: { title: 'Books', version: '1.0.0' } },
//     apis: ['./src/**/*.routes.js', './docs/*.yaml'] });
//
// Each /** */ comment of the files (### ### in CoffeeScript) with a tag @openapi or @swagger holds YAML: paths
// (`/books: get: ...` or under `paths:`), components, tags, definitions... merged into the definition in the order of
// the files (each pattern's matches sorted). YAML files are taken whole. An anchor of one comment (&name) can be used
// in another (*name), as swagger-jsdoc allows. Comments whose YAML is wrong are left out and reported (or thrown, with
// failOnErrors).
//
// Without its dependencies (doctrine, yaml, glob, lodash.mergewith): their rules, ported, on @xufa/yaml with the core
// schema of YAML 1.2 (what the package yaml uses: dates stay strings, no merge keys).
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('@xufa/yaml');

const SCHEMA = yaml.CORE_SCHEMA;

// --- Files: the patterns of glob 7 that documents use (*, ?, **, [...]), with its rules: names starting with a dot
// are not matched by wildcards, symbolic links to folders are not crawled by **, matches sorted per pattern.

function segmentRegExp(segment) {
  let source = '';
  for (let i = 0; i < segment.length; i += 1) {
    const char = segment[i];
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '[') {
      const end = segment.indexOf(']', i + 1);
      if (end === -1) source += '\\[';
      else {
        source += `[${segment
          .slice(i + 1, end)
          .replace(/^!/, '^')
          .replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else source += char.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

const isMagic = (segment) => /[*?[]/.test(segment);

function lstatOf(file) {
  try {
    return fs.lstatSync(file);
  } catch {
    return null;
  }
}

function entriesOf(folder) {
  try {
    return fs.readdirSync(folder);
  } catch {
    return [];
  }
}

function globSync(pattern) {
  const absolute = path.isAbsolute(pattern);
  const parts = pattern.split(/[\\/]+/);
  let start = absolute ? `${parts.shift()}/` : '';
  // The leading parts without wildcards are a folder to start from, written as the pattern writes it.
  while (parts.length > 1 && !isMagic(parts[0])) start += `${parts.shift()}/`;
  const results = [];
  const join = (base, name) => (base ? `${base}${base.endsWith('/') ? '' : '/'}${name}` : name);

  function walk(base, index, inGlobStar) {
    if (index === parts.length) return;
    const segment = parts[index];
    const last = index === parts.length - 1;
    const folder = base || '.';
    if (segment === '**') {
      // Zero folders...
      walk(base, index + 1, false);
      // ...or one more (not a hidden one, not a link to a folder), and ** again.
      for (const name of entriesOf(folder)) {
        if (name.startsWith('.')) continue;
        const file = join(base, name);
        const stat = lstatOf(file);
        if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue;
        walk(file, index, true);
      }
      return;
    }
    if (!isMagic(segment)) {
      const file = join(base, segment);
      const stat = lstatOf(file);
      if (!stat) return;
      if (last) results.push(file);
      else if (stat.isDirectory() || stat.isSymbolicLink()) walk(file, index + 1, false);
      return;
    }
    const regexp = segmentRegExp(segment);
    for (const name of entriesOf(folder)) {
      if (name.startsWith('.') && !segment.startsWith('.')) continue;
      if (!regexp.test(name)) continue;
      const file = join(base, name);
      if (last) {
        results.push(file);
        continue;
      }
      const stat = lstatOf(file);
      if (stat && (stat.isDirectory() || (stat.isSymbolicLink() && !inGlobStar))) walk(file, index + 1, false);
    }
  }

  if (parts.length === 1 && !isMagic(parts[0])) {
    const file = start + parts[0];
    return lstatOf(file) ? [file] : [];
  }
  walk(start.replace(/\/$/, '') || (absolute ? start : ''), 0, false);
  const unique = [...new Set(results.map((file) => (start === '' || file.startsWith(start) ? file : start + file)))];
  return unique.sort((a, b) => a.localeCompare(b, 'en'));
}

// --- Comments: doctrine's reading of a /** */ comment (unwrap: true) and its tags without a type or a name.

const WHITESPACE = '[ \\f\\t\\v\\u00a0\\u1680\\u180e\\u2000-\\u200a\\u202f\\u205f\\u3000\\ufeff]';
const STAR = new RegExp(`(${WHITESPACE}*(?:\\*${WHITESPACE}?)?)(.+|[\\r\\n\\u2028\\u2029])`, 'g');
const isLineTerminator = (ch) => ch === 0x0a || ch === 0x0d || ch === 0x2028 || ch === 0x2029;
const isWhiteSpace = (ch) =>
  ch === 0x20 ||
  ch === 0x09 ||
  ch === 0x0b ||
  ch === 0x0c ||
  ch === 0xa0 ||
  (ch >= 0x1680 &&
    [
      0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f,
      0x3000, 0xfeff,
    ].includes(ch));

function unwrapComment(comment) {
  return comment
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .replace(STAR, '$2')
    .replace(/\s*$/, '');
}

// The texts of the tags @openapi and @swagger of a comment.
function yamlOfComment(comment) {
  const source = unwrapComment(comment);
  const { length } = source;
  const texts = [];
  let index = 0;
  // A tag starts with '@' first on a line (after spaces); the comment's description comes before the first one.
  let atAllowed = true;
  while (index < length) {
    const ch = source.charCodeAt(index);
    if (atAllowed && ch === 0x40) break;
    if (isLineTerminator(ch)) atAllowed = true;
    else if (atAllowed && !isWhiteSpace(ch)) atAllowed = false;
    index += 1;
  }
  while (index < length) {
    // At an '@': the title (letters and digits), then the text up to the next tag.
    index += 1;
    let title = '';
    while (index < length && /[A-Za-z0-9]/.test(source[index])) {
      title += source[index];
      index += 1;
    }
    let last = index;
    let waiting = false;
    while (last < length) {
      const ch = source.charCodeAt(last);
      if (isLineTerminator(ch) && !(ch === 0x0d && source.charCodeAt(last + 1) === 0x0a)) waiting = true;
      else if (waiting) {
        if (ch === 0x40) break;
        if (!isWhiteSpace(ch)) waiting = false;
      }
      last += 1;
    }
    if (title === 'swagger' || title === 'openapi') {
      let text = source.slice(index, last).trim();
      if (/^-\s+/.test(text)) text = text.substring(2);
      if (text) texts.push(text);
    }
    index = last;
  }
  return texts;
}

function annotationsOf(file, encoding) {
  const content = fs.readFileSync(file, { encoding });
  const extension = path.extname(file);
  if (extension === '.yml' || extension === '.yaml') return [content];
  if (extension === '.coffee') {
    return (content.match(/###([\s\S]*?)###/gm) || [])
      .map((block) => {
        const part = block.split('###');
        part[0] = '/**';
        part[part.length - 1] = '*/';
        return part.join('');
      })
      .flatMap(yamlOfComment);
  }
  return (content.match(/\/\*\*([\s\S]*?)\*\//gm) || []).flatMap(yamlOfComment);
}

// --- Merging: lodash's mergeWith({}, a, b, (x, y) => (y === null ? x : undefined)).

const isObjectLike = (value) => value !== null && typeof value === 'object';

function mergeValue(target, source) {
  if (source === null) return target === undefined ? null : target;
  if (Array.isArray(source)) return mergeInto(Array.isArray(target) ? target : [], source);
  if (isObjectLike(source)) return mergeInto(isObjectLike(target) ? target : {}, source);
  return source === undefined ? target : source;
}

function mergeInto(target, source) {
  for (const key of Object.keys(source)) {
    const value = mergeValue(target[key], source[key]);
    if (value !== undefined || !(key in target)) target[key] = value;
  }
  return target;
}

function mergeDeep(first, second) {
  const result = {};
  if (isObjectLike(first)) mergeInto(result, first);
  if (isObjectLike(second)) mergeInto(result, second);
  return result;
}

// --- The document.

const SECTIONS = {
  v2: ['paths', 'definitions', 'responses', 'parameters', 'securityDefinitions'],
  v3: ['paths', 'definitions', 'responses', 'parameters', 'securityDefinitions', 'components'],
  v4: ['components', 'channels'],
};
const COMMON = [
  'components',
  'consumes',
  'produces',
  'paths',
  'schemas',
  'securityDefinitions',
  'responses',
  'parameters',
  'definitions',
  'channels',
];

function prepare(definition) {
  const document = JSON.parse(JSON.stringify(definition));
  let version = 'v2';
  if (document.asyncapi) version = 'v4';
  else if (document.openapi) version = 'v3';
  else if (!document.swagger) document.swagger = '2.0';
  for (const section of SECTIONS[version]) document[section] = document[section] || {};
  document.tags = document.tags || [];
  return document;
}

const hasTag = (tag, tags) => tags.some((other) => tag.name === other.name);

function organize(document, annotation, property) {
  if (property === 'x-webhooks') document[property] = mergeDeep(document[property], annotation[property]);
  if (property.startsWith('x-')) return;
  if (COMMON.includes(property)) {
    for (const name of Object.keys(annotation[property])) {
      document[property][name] = mergeDeep(document[property][name], annotation[property][name]);
    }
  } else if (property === 'tags') {
    const { tags } = annotation;
    for (const tag of Array.isArray(tags) ? tags : [tags]) {
      if (!hasTag(tag, document.tags)) document.tags.push(tag);
    }
  } else {
    // Paths written at the top level (`/books:`).
    document.paths[property] = mergeDeep(document.paths[property], annotation[property]);
  }
}

// swagger-jsdoc's: a section is removed when it is empty, or when all its values are empty objects.
function isEmptySection(section) {
  return Object.keys(section).every((key) => isObjectLike(section[key]) && Object.keys(section[key]).length === 0);
}

const ANCHOR = /(?:^|[\s[{,:-])&([^\s,[\]{}]+)/g;

function anchorsOf(text) {
  return [...text.matchAll(ANCHOR)].map((match) => match[1]);
}

function parse(text) {
  try {
    return { value: yaml.load(text, { schema: SCHEMA }) };
  } catch (error) {
    return { error };
  }
}

const MISSING_ALIAS = /unidentified alias "([^"]+)"/;

function build(options) {
  const document = prepare(options.swaggerDefinition || options.definition);
  const anchors = new Map();
  const failed = [];
  const ready = [];
  for (const file of options.apis.flatMap((pattern) => globSync(pattern))) {
    for (const text of annotationsOf(file, options.encoding || 'utf8')) {
      // (As swagger-jsdoc: a comment that defines anchors is there for the comments that use them.)
      const names = anchorsOf(text);
      if (names.length) {
        for (const name of names) anchors.set(name, text);
        continue;
      }
      const parsed = parse(text);
      if (parsed.error) failed.push({ file, text, error: parsed.error });
      else ready.push(parsed.value);
    }
  }

  const report = [];
  for (const { file, text, error } of failed) {
    // An alias of another comment's anchor: that comment and this one, as one document.
    const alias = MISSING_ALIAS.exec(error.message);
    if (alias && anchors.has(alias[1])) {
      const joined = parse(`${anchors.get(alias[1])}\n${text}`);
      if (!joined.error) {
        ready.push(joined.value);
        continue;
      }
    }
    const message = String(error.message || error);
    report.push(
      `Error in ${file} :\n${
        options.verbose ? `${message}\nImbedded within:\n\`\`\`\n  ${text.replace(/\n/g, '\n  ')}\n\`\`\`` : message
      }`
    );
  }
  if (report.length) {
    if (options.failOnErrors) throw new Error(report.join(','));
    // eslint-disable-next-line no-console
    console.info('Not all input has been taken into account at your final specification.');
    // eslint-disable-next-line no-console
    console.error(`Here's the report: \n\n\n ${report.join(',')}`);
  }

  for (const annotation of ready) {
    if (!isObjectLike(annotation)) continue;
    for (const property in annotation) organize(document, annotation, property);
  }
  if (document.openapi) {
    for (const section of ['definitions', 'responses', 'parameters', 'securityDefinitions']) {
      if (document[section] && isEmptySection(document[section])) delete document[section];
    }
  }
  if (options.format === '.yml' || options.format === '.yaml') {
    return yaml.dump(document, { schema: SCHEMA, noRefs: true, lineWidth: -1 });
  }
  return document;
}

function jsdoc(options) {
  if (!options) throw new Error("Missing or invalid input: 'options' is required");
  if (!options.swaggerDefinition && !options.definition) {
    throw new Error("Missing or invalid input: 'options.swaggerDefinition' or 'options.definition' is required");
  }
  if (!options.apis || !Array.isArray(options.apis)) {
    throw new Error("Missing or invalid input: 'options.apis' is required and it should be an array.");
  }
  return build(options);
}

module.exports = jsdoc;
module.exports.default = jsdoc;
module.exports.globSync = globSync;
module.exports.yamlOfComment = yamlOfComment;
module.exports.mergeDeep = mergeDeep;
