// Fixtures (Django's fixtures and loaddata): data as YAML, JSON or JS, its objects by model in order, made with
// create(). An object's $key names it; relations point to it by that name ($leguin), many-to-many with lists of them.
// Dates take 'today' and days relative to it ('+14d', '-3d', '+2w'); users get their password hashed (setPassword).
// $unless: { Model: conditions } skips the file when such an object is there (seeds that run once).
//
//   # seeds/library.yaml
//   $unless: { User: { username: admin } }
//   Group:
//     - { $key: members, name: Library Members, permissions: ['*.view'] }
//   User:
//     - { username: admin, password: xufa-library, isStaff: true, isSuperuser: true }
//     - { $key: reader, username: reader, password: xufa-library, groups: [$members] }
//   Author:
//     - { $key: leguin, firstName: Ursula, lastName: Le Guin, dateOfBirth: 1929-10-21 }
//   Book:
//     - { $key: earthsea, title: A Wizard of Earthsea, author: $leguin, isbn: '9780547773742' }
//   BookInstance:
//     - { book: $earthsea, status: o, borrower: $reader, dueBack: +14d }
import path from 'node:path';
import * as formsModule from '@xufa/forms';
import * as configModule from '@xufa/config';

const FIXTURE_EXTENSIONS = ['.yaml', '.yml', '.json'];

// A day of a date field: a Date of YAML (midnight UTC) as its day, and 'today', '+14d'... as the day they say.
function dayOf(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && (value === 'today' || /^[+-]\d+[dwmy]$/.test(value))) {
    const { dateOf } = formsModule;
    return dateOf(value);
  }
  return value;
}

// Loads one fixture (its data, already read) in db: the objects made, by model. modelOf(name): the model of a name;
// passwordOptions: of scrypt for the passwords of users; where: the file, for the errors.
async function loadFixture(spec, { modelOf, passwordOptions, where = 'fixture' } = {}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError(`${where}: objects by model ({ Book: [{ title: ... }] })`);
  }
  const { $unless: unless, ...byModel } = spec;
  for (const [name, conditions] of Object.entries(unless || {})) {
    if (
      await modelOf(name)
        .objects.filter(conditions || {})
        .exists()
    )
      return { skipped: true, made: {} };
  }
  const keys = new Map();
  const made = {};
  const refer = (value, at) => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' && value.startsWith('$')) {
      if (!keys.has(value.slice(1))) throw new TypeError(`${where}: ${at}: no object named ${value} before it`);
      return keys.get(value.slice(1));
    }
    return value;
  };
  for (const [name, list] of Object.entries(byModel)) {
    if (name.startsWith('$')) throw new TypeError(`${where}: ${name} is no option of a fixture ($unless)`);
    const Model = modelOf(name);
    if (!Array.isArray(list)) throw new TypeError(`${where}: ${name} is a list of objects`);
    made[name] = [];
    for (let i = 0; i < list.length; i += 1) {
      const at = `${name}[${i}]`;
      const { $key: key, password, ...given } = list[i] || {};
      const values = {};
      const links = {};
      for (const [field, value] of Object.entries(given)) {
        if (Model.meta.manyToManyRelation(field)) {
          links[field] = [].concat(value || []).map((item) => refer(item, `${at}.${field}`));
          continue;
        }
        const definition = Model.meta.field(field);
        if (!definition) throw new TypeError(`${where}: ${at}: ${name} has no field ${field}`);
        if (definition.type === 'foreignKey') values[field] = refer(value, `${at}.${field}`);
        else if (definition.type === 'date') values[field] = dayOf(value);
        else values[field] = value;
      }
      const object = new Model(values);
      if (password !== undefined) {
        if (typeof object.setPassword !== 'function') {
          throw new TypeError(`${where}: ${at}: password is for users (setPassword of AbstractUser)`);
        }
        await object.setPassword(String(password), passwordOptions);
      }
      await object.save();
      for (const [field, items] of Object.entries(links)) await object[field].set(items);
      if (key !== undefined) {
        if (keys.has(String(key))) throw new TypeError(`${where}: ${at}: $key ${key} is taken`);
        keys.set(String(key), object);
      }
      made[name].push(object);
    }
  }
  return { skipped: false, made };
}

// Reads and loads a file of fixtures (.yaml, .yml, .json, or .js giving the data).
async function loadFixtureFile(file, options = {}) {
  const { readConfigFile } = configModule;
  return loadFixture(readConfigFile(file), { ...options, where: options.where || path.basename(file) });
}

export { loadFixture, loadFixtureFile, FIXTURE_EXTENSIONS };
