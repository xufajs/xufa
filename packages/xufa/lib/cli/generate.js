// xufa generate: files of an app from a name and fields, as the generators of Rails and Laravel's make:.
//
//   xufa generate model Book title:string pages:integer:null author:references isbn:string:unique
//   xufa generate resource Book title:string    # the model, and its routes (routes/books.js: orm.resource)
//
// A field is name:type[:modifier...]: types string, text, integer, bigint, float, decimal, boolean, date, datetime,
// json, uuid, email, references (a foreign key: author:references is to Author, author:references:Person to Person);
// modifiers null, unique, index. Models get createdAt and updatedAt (--no-timestamps leaves them out).

const TYPES = {
  string: 'fields.string({ maxLength: 200OPTIONS })',
  text: 'fields.text(OPTIONS)',
  integer: 'fields.integer(OPTIONS)',
  bigint: 'fields.bigint(OPTIONS)',
  float: 'fields.float(OPTIONS)',
  decimal: 'fields.decimal({ precision: 12, scale: 2OPTIONS })',
  boolean: 'fields.boolean({ default: falseOPTIONS })',
  date: 'fields.date(OPTIONS)',
  datetime: 'fields.datetime(OPTIONS)',
  json: 'fields.json(OPTIONS)',
  uuid: 'fields.uuid(OPTIONS)',
  email:
    "fields.string({ maxLength: 254, validate: [{ rule: \"value.includes('@')\", message: 'Enter a valid email address.' }]OPTIONS })",
};
const MODIFIERS = { null: 'null: true', unique: 'unique: true', index: 'index: true' };

const pascal = (text) => text.replace(/(^|[-_\s]+)([a-z0-9])/gi, (all, sep, c) => c.toUpperCase());
const camel = (text) => pascal(text).replace(/^./, (c) => c.toLowerCase());
const kebab = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();

// English plurals, enough for the names of routes (book: books, category: categories, box: boxes).
function plural(word) {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function parseField(spec) {
  const [rawName, type = 'string', ...rest] = spec.split(':');
  const name = camel(rawName);
  if (!/^[a-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Not a name of a field: ${rawName}`);
  if (type === 'references' || type === 'fk') {
    const target = rest.find((item) => !MODIFIERS[item]) || pascal(rawName);
    return { name, type, target, modifiers: rest.filter((item) => MODIFIERS[item]) };
  }
  if (!TYPES[type]) throw new Error(`Not a type of field: ${type} (${Object.keys(TYPES).join(', ')}, references)`);
  for (const item of rest)
    if (!MODIFIERS[item]) throw new Error(`Not a modifier of a field: ${item} (null, unique, index)`);
  return { name, type, modifiers: rest };
}

function fieldCode(field) {
  const options = field.modifiers.map((item) => MODIFIERS[item]);
  if (field.type === 'references' || field.type === 'fk') {
    const all = ["onDelete: 'cascade'", ...options];
    return `fields.foreignKey(() => ${field.target}, { ${all.join(', ')} })`;
  }
  const template = TYPES[field.type];
  if (template.includes('({') || template.includes('{ ')) {
    return template.replace('OPTIONS', options.length ? `, ${options.join(', ')}` : '');
  }
  return template.replace('OPTIONS', options.length ? `{ ${options.join(', ')} }` : '');
}

function modelFile(name, fieldSpecs, { timestamps = true } = {}) {
  const fields = fieldSpecs.map(parseField);
  const requires = [...new Set(fields.filter((field) => field.target).map((field) => field.target))]
    .filter((target) => target !== name)
    .map((target) => `import { ${target} } from './${kebab(target)}.js';`);
  const lines = fields.map((field) => `    ${field.name}: ${fieldCode(field).replace(`() => ${name}`, "'self'")},`);
  if (timestamps) {
    lines.push(
      '    createdAt: fields.datetime({ autoNowAdd: true }),',
      '    updatedAt: fields.datetime({ autoNow: true }),'
    );
  }
  const ordering = timestamps ? "\n\n  static options = { ordering: ['-createdAt'] };" : '';
  return `import { Model, fields } from 'xufa/orm';
${requires.length ? `${requires.join('\n')}\n` : ''}
export class ${name} extends Model {
  static fields = {
${lines.join('\n')}
  };${ordering}
}
`;
}

function resourceFile(name, fieldSpecs) {
  const fields = fieldSpecs.map(parseField);
  const text = fields
    .filter((field) => ['string', 'text', 'email'].includes(field.type))
    .map((field) => `'${field.name}'`);
  const filters = fields
    .filter((field) => !['text', 'json'].includes(field.type))
    .map((field) => `'${field.type === 'references' || field.type === 'fk' ? `${field.name}Id` : field.name}'`);
  const options = [];
  if (filters.length) options.push(`  filters: [${filters.join(', ')}],`);
  if (text.length) options.push(`  search: [${text.join(', ')}],`);
  options.push(
    `  ordering: [${[...fields.filter((field) => !['text', 'json'].includes(field.type)).map((field) => `'${field.name}'`), "'createdAt'"].join(', ')}],`
  );
  return `// The routes of ${plural(name)} (at /${plural(kebab(name))}): GET / (list: filters, search, ordering, pages), GET /:id,
// POST /, PUT and PATCH /:id, DELETE /:id. Options: the guide of the ORM (Resources).
import * as orm from 'xufa/orm';
import { ${name} } from '../models/index.js';

export default orm.resource(${name}, {
${options.join('\n')}
});
`;
}

export { modelFile, resourceFile, parseField, plural, kebab, pascal, camel };
