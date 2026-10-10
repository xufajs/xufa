// Names as Sequelize makes them: plural table names (User -> Users), camelCase keys (authorId) and snake_case columns
// (author_id) for underscored models.

// The rules of Sequelize (those of the inflection package), so the names of tables and accessors are the same.
import * as inflection from './inflection.js';

// The inflector of Sequelize.useInflection(), when one is given: { pluralize, singularize } (as the inflection package).
let inflector = null;

function useInflection(given) {
  inflector = given || null;
}

// The plural of a name, as Sequelize makes it (User -> Users, Category -> Categories, UserXYZ -> UserXYZs).
function pluralize(name) {
  if (inflector) return inflector.pluralize(name);
  return inflection.pluralize(name);
}

function singularize(name) {
  if (inflector) return inflector.singularize(name);
  return inflection.singularize(name);
}

function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function upperFirst(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// camelize('author_id') -> 'authorId'.
// As Sequelize: dashes, underscores and spaces out, the letter after them in upper case.
function camelize(name) {
  return name.trim().replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''));
}

// As Sequelize (inflection's underscore): an underscore before every capital letter, in lower case (authorId ->
// author_id, HTTPServer -> h_t_t_p_server), so the names of columns and indexes are those of Sequelize.
function underscore(name) {
  return name
    .split('::')
    .map((part) => part.replace(/([A-Z])/g, '_$1').replace(/^_/, ''))
    .join('/')
    .toLowerCase();
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export { useInflection, pluralize, singularize, lowerFirst, upperFirst, camelize, underscore, isPlainObject };
