// Names as Sequelize makes them: plural table names (User -> Users), camelCase keys (authorId) and snake_case columns
// (author_id) for underscored models.

const IRREGULAR = {
  person: 'people',
  man: 'men',
  woman: 'women',
  child: 'children',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  leaf: 'leaves',
  life: 'lives',
  knife: 'knives',
  wife: 'wives',
  half: 'halves',
  datum: 'data',
  medium: 'media',
  index: 'indices',
  matrix: 'matrices',
  vertex: 'vertices',
  status: 'statuses',
  quiz: 'quizzes',
};
const UNCOUNTABLE = new Set([
  'equipment',
  'information',
  'rice',
  'money',
  'species',
  'series',
  'fish',
  'sheep',
  'deer',
  'news',
  'data',
  'metadata',
]);

// The word changed by a rule applied to its lower case, keeping the case of what does not change (UserXYZ ->
// UserXYZs, Category -> Categories); a word in upper case stays in upper case.
function withCase(word, result) {
  const lower = word.toLowerCase();
  let common = 0;
  while (common < lower.length && common < result.length && lower[common] === result[common]) common += 1;
  const changed = word.slice(0, common) + result.slice(common);
  return word.length > 1 && word === word.toUpperCase() ? changed.toUpperCase() : changed;
}

// The rules of the inflection library (which Sequelize uses), in order: the first that matches.
const PLURALS = [
  [/(quiz)$/i, '$1zes'],
  [/^(ox)$/i, '$1en'],
  [/([m|l])ouse$/i, '$1ice'],
  [/(matr|vert|ind)(?:ix|ex)$/i, '$1ices'],
  [/(x|ch|ss|sh)$/i, '$1es'],
  [/([^aeiouy]|qu)y$/i, '$1ies'],
  [/(hive)$/i, '$1s'],
  [/(?:([^f])fe|([lr])f)$/i, '$1$2ves'],
  [/sis$/i, 'ses'],
  [/([ti])um$/i, '$1a'],
  [/(buffal|tomat|potat)o$/i, '$1oes'],
  [/(bu)s$/i, '$1ses'],
  [/(alias|status)$/i, '$1es'],
  [/(octop|vir)us$/i, '$1i'],
  [/(ax|test)is$/i, '$1es'],
  [/s$/i, 's'],
  [/$/, 's'],
];

const SINGULARS = [
  [/(quiz)zes$/i, '$1'],
  [/(matr)ices$/i, '$1ix'],
  [/(vert|ind)ices$/i, '$1ex'],
  [/^(ox)en/i, '$1'],
  [/(alias|status)es$/i, '$1'],
  [/(octop|vir)i$/i, '$1us'],
  [/(cris|ax|test)es$/i, '$1is'],
  [/(shoe)s$/i, '$1'],
  [/(o)es$/i, '$1'],
  [/(bus)es$/i, '$1'],
  [/([m|l])ice$/i, '$1ouse'],
  [/(x|ch|ss|sh)es$/i, '$1'],
  [/(m)ovies$/i, '$1ovie'],
  [/(s)eries$/i, '$1eries'],
  [/([^aeiouy]|qu)ies$/i, '$1y'],
  [/([lr])ves$/i, '$1f'],
  [/(tive)s$/i, '$1'],
  [/(hive)s$/i, '$1'],
  [/([^f])ves$/i, '$1fe'],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, '$1sis'],
  [/([ti])a$/i, '$1um'],
  [/(n)ews$/i, '$1ews'],
  [/(ss)$/i, '$1'],
  [/s$/i, ''],
];

function inflect(name, rules, irregular) {
  const match = /^(.*?)([A-Za-z]+)$/.exec(name);
  if (!match) return name;
  const [, head, word] = match;
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return name;
  if (irregular(lower)) return head + withCase(word, irregular(lower));
  const rule = rules.find(([pattern]) => pattern.test(word));
  return head + (rule ? word.replace(rule[0], rule[1]) : word);
}

// The plural of the last word of a name (User -> Users, Category -> Categories, UserXYZ -> UserXYZs).
function pluralize(name) {
  return inflect(name, PLURALS, (lower) => IRREGULAR[lower] || (Object.values(IRREGULAR).includes(lower) && lower));
}

function singularize(name) {
  return inflect(
    name,
    SINGULARS,
    (lower) => Object.keys(IRREGULAR).find((key) => IRREGULAR[key] === lower) || (IRREGULAR[lower] && lower)
  );
}

function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function upperFirst(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// camelize('author_id') -> 'authorId'.
function camelize(name) {
  return name.replace(/[_-]+(.)/g, (_, char) => char.toUpperCase());
}

// underscore('authorId') -> 'author_id'.
function underscore(name) {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1_$2')
    .toLowerCase();
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

module.exports = { pluralize, singularize, lowerFirst, upperFirst, camelize, underscore, isPlainObject };
