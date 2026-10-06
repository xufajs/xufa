// The cache of the objects of a model (its option `cache`: true, or { ttl, indexes }). get() by the primary key, or by a
// field of `indexes` (unique fields), is answered from the cache of its database (db.cache, a MemoryCache when none
// is given). Rows are kept by key ('<db>:<table>:pk:<key>'); an index keeps the key of the row of a value, and is
// checked when it is read (a row whose value changed is not taken). Saving or deleting an object removes it; update()
// and delete() of QuerySets clear the model. Inside transactions the cache is not read nor filled (it would keep what
// may be rolled back).
const { reportCacheError } = require('./cache-errors');
const { MemoryCache } = require('./cache');

function settingsOf(model) {
  const option = model.meta.options.cache;
  if (!option) return null;
  const settings = option === true ? {} : option;
  return { ttl: settings.ttl, indexes: settings.indexes || [] };
}

function storeOf(db) {
  if (!db.cache) db.cache = new MemoryCache();
  return db.cache;
}

function prefixOf(db, model) {
  return `${db.name}:${model.meta.key}:`;
}

function keyOf(db, model, field, value) {
  const name = field.primaryKey ? 'pk' : field.attname;
  return `${prefixOf(db, model)}${name}:${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
}

// The field and value of conditions the cache can answer: one equality on the primary key or an index.
function lookupOf(model, conditions) {
  const settings = settingsOf(model);
  if (!settings || conditions.length !== 1) return null;
  const [condition] = conditions;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) || condition.constructor !== Object) {
    return null;
  }
  const keys = Object.keys(condition);
  if (keys.length !== 1) return null;
  const name = keys[0].endsWith('__exact') ? keys[0].slice(0, -7) : keys[0];
  const field = model.meta.field(name);
  if (!field || (!field.primaryKey && !settings.indexes.includes(field.name))) return null;
  let value = condition[keys[0]];
  if (value === null || value === undefined || typeof value === 'object') return null;
  try {
    value = field.toValue(value);
  } catch {
    return null;
  }
  return { field, value, settings };
}

// The row of a lookup in the cache, or undefined (a cache that fails to read is a miss: the database answers).
async function read(db, model, lookup) {
  try {
    return await readCached(db, model, lookup);
  } catch (err) {
    reportCacheError(db, err, 'get');
    return undefined;
  }
}

async function readCached(db, model, { field, value }) {
  if (db.backend.inTransaction || !model.meta.pk) return undefined;
  const store = storeOf(db);
  const { pk } = model.meta;
  if (field.primaryKey) return store.get(keyOf(db, model, pk, value));
  const indexKey = keyOf(db, model, field, value);
  const key = await store.get(indexKey);
  if (key === undefined) return undefined;
  const row = await store.get(keyOf(db, model, pk, key));
  // An index of a value the row no longer has is not taken.
  if (!row || String(row[field.attname]) !== String(value)) {
    await store.delete(indexKey);
    return undefined;
  }
  return row;
}

// An object kept (a cache that fails to keep it is a miss the next time).
async function write(db, model, instance, settings) {
  try {
    await writeCached(db, model, instance, settings);
  } catch (err) {
    reportCacheError(db, err, 'set');
  }
}

async function writeCached(db, model, instance, settings) {
  if (db.backend.inTransaction || !model.meta.pk) return;
  const store = storeOf(db);
  const { pk } = model.meta;
  const row = instance.toRow();
  const key = instance.pk;
  await store.set(keyOf(db, model, pk, key), row, settings.ttl);
  for (let i = 0; i < settings.indexes.length; i += 1) {
    const field = model.meta.field(settings.indexes[i]);
    const value = row[field.attname];
    if (value !== null && value !== undefined) await store.set(keyOf(db, model, field, value), key, settings.ttl);
  }
}

async function forget(db, model, key) {
  if (!settingsOf(model) || !db || !model.meta.pk) return;
  await storeOf(db).delete(keyOf(db, model, model.meta.pk, key));
}

async function clear(db, model) {
  if (!settingsOf(model) || !db) return;
  await storeOf(db).clear(prefixOf(db, model));
}

module.exports = { lookupOf, read, write, forget, clear, settingsOf };
