// Resources: the routes of reading and writing the objects of a model (as the ModelViewSets of Django REST framework),
// for @xufa/http (and fastify). Registered with a prefix:
//
//   app.register(orm.resource(Book, { filters: ['author', 'pages__gte'], ordering: ['pages'], search: ['title'] }),
//     { prefix: '/books' });
//
//   GET    /books          list: { count, results } (?limit=&offset=, ?ordering=-pages, ?search=, ?author=1)
//   GET    /books/:id      get one (404 when it is not there)
//   POST   /books          create (201)
//   PUT    /books/:id      update every writable field (those not given are set to their default)
//   PATCH  /books/:id      update the fields given
//   DELETE /books/:id      delete (204)
//
// The objects are those of `queryset(request)` (all by default): an object out of it is not found (404) by any
// route, so it is also how a user sees only theirs. Errors are answered with their status: 400 for the values that
// are not valid (with the messages of each field), 404, and 409 for duplicates of unique fields (UniqueError) and for
// objects that others protect (ProtectedError).
const createError = require('@xufa/errors');
const { Q, or, LOOKUPS } = require('./query');
const { QuerySet } = require('./queryset');
const { QueryError, FieldError, LookupError, NotFoundError } = require('./errors');

const BadRequest = createError('XUFA_ORM_ERR_BAD_REQUEST', '%s', 400);

const ACTIONS = ['list', 'get', 'create', 'update', 'delete'];
const PARAMS = new Set(['limit', 'offset', 'ordering', 'search', 'fields']);

// The filters a list takes: ['author', 'pages__gte'] or { pages: ['gte', 'lte'], title: ['icontains'] } as a map of
// query parameters to the conditions they are.
function filtersOf(model, filters) {
  const map = new Map();
  const add = (name, lookup) => {
    const key = lookup && lookup !== 'exact' ? `${name}__${lookup}` : name;
    map.set(key, key);
  };
  if (Array.isArray(filters)) filters.forEach((name) => add(name));
  else if (filters)
    Object.entries(filters).forEach(([name, lookups]) => [].concat(lookups).forEach((lookup) => add(name, lookup)));
  // Each one must be a path of the model (its lookup is checked by the query of each request).
  for (const key of map.keys()) {
    const parts = key.split('__');
    const path = parts.length > 1 && LOOKUPS.has(parts[parts.length - 1]) ? parts.slice(0, -1).join('__') : key;
    try {
      model.objects.filter({ [`${path}__isnull`]: true });
    } catch (err) {
      throw new TypeError(`The filter ${key} of the resource of ${model.name} is not valid: ${err.message}`);
    }
  }
  return map;
}

// A value of a query parameter as the value of a condition: lists for in (a,b,c), booleans for isnull.
function paramValue(key, value) {
  const text = Array.isArray(value) ? value[value.length - 1] : value;
  if (key.endsWith('__in'))
    return String(text)
      .split(',')
      .filter((item) => item !== '');
  if (key.endsWith('__isnull')) return text === 'true' || text === '1';
  if (key.endsWith('__range')) return String(text).split(',');
  return text;
}

function resource(model, options = {}) {
  const {
    actions = ACTIONS,
    queryset = () => model.objects.all(),
    fields: shown,
    exclude = [],
    readOnly = [],
    writable,
    filters,
    ordering = [],
    search = [],
    related = [],
    pageSize = 50,
    maxPageSize = 500,
    pagination = true,
    lookup = 'pk',
    auth,
    hooks = {},
    serialize,
  } = options;
  const unknownAction = actions.find((action) => !ACTIONS.includes(action));
  if (unknownAction) throw new TypeError(`Unknown action ${unknownAction} (${ACTIONS.join(', ')})`);
  const { meta } = model;
  const filterMap = filtersOf(model, filters);
  const orderings = new Set(ordering.flatMap((name) => [name, `-${name}`]));
  const lookupField = lookup === 'pk' ? meta.pk : meta.field(lookup);
  if (!lookupField) throw new TypeError(`The lookup ${lookup} of the resource of ${model.name} is not a field`);

  // The fields a body can set: every field but the primary key and those set by the ORM (autoNow...), or `writable`,
  // without `readOnly`. Foreign keys by their name or attname (author or authorId).
  const writableFields = meta.fields.filter((field) => {
    if (writable) return writable.includes(field.name) || writable.includes(field.attname);
    return !field.primaryKey && !field.auto && !readOnly.includes(field.name) && !readOnly.includes(field.attname);
  });
  const writableNames = new Map();
  writableFields.forEach((field) => {
    writableNames.set(field.name, field);
    writableNames.set(field.attname, field);
  });

  // The values of a body for the writable fields; other fields of the model (id, createdAt...) are ignored, and keys
  // that are no field are refused.
  function valuesOf(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('The body must be an object');
    const values = {};
    const unknown = [];
    for (const [key, value] of Object.entries(body)) {
      if (writableNames.has(key)) values[key] = value;
      else if (!meta.field(key) && key !== 'pk' && !meta.manyToMany.some((field) => field.name === key))
        unknown.push(key);
    }
    if (unknown.length) throw new BadRequest(`${model.name} has no field ${unknown.join(', ')}`);
    return values;
  }

  // An object as it is answered: toJSON(), with only `fields` (or without `exclude`), or `serialize`.
  const output = (object, request) => {
    if (serialize) return serialize(object, request);
    const json = object.toJSON();
    if (shown) {
      // A foreign key by its name gives its key (author: authorId) and the related object when it is loaded.
      const names = shown.flatMap((name) => {
        const field = meta.field(name);
        return field && field.attname !== name ? [field.attname, name] : [name];
      });
      return Object.fromEntries(names.filter((name) => name in json).map((name) => [name, json[name]]));
    }
    exclude.forEach((name) => {
      delete json[name];
      const field = meta.field(name);
      if (field) delete json[field.attname];
    });
    return json;
  };

  // The QuerySet of a request (not awaited: awaiting a QuerySet runs it).
  function scoped(request) {
    const qs = queryset(request);
    if (!(qs instanceof QuerySet))
      throw new TypeError(`The queryset of the resource of ${model.name} must be a QuerySet`);
    return related.length ? qs.selectRelated(...related) : qs;
  }

  async function find(request) {
    const qs = scoped(request);
    const id = request.params.id;
    let value;
    try {
      value = lookupField.toValue(id);
    } catch {
      throw notFound();
    }
    const object = await qs.filter({ [lookup === 'pk' ? 'pk' : lookupField.name]: value }).first();
    if (!object) throw notFound();
    return object;
  }

  const notFound = () => new NotFoundError(model.name);

  // The query of a list: its filters, search and ordering (400 for the parameters it does not take).
  function listQuery(qs, query) {
    let result = qs;
    const conditions = {};
    for (const [key, value] of Object.entries(query || {})) {
      if (PARAMS.has(key)) continue;
      if (!filterMap.has(key)) throw new BadRequest(`Unknown filter ${key}`);
      conditions[filterMap.get(key)] = paramValue(key, value);
    }
    if (Object.keys(conditions).length) {
      try {
        result = result.filter(conditions);
      } catch (err) {
        if (err instanceof QueryError || err instanceof FieldError || err instanceof LookupError) {
          throw new BadRequest(err.message);
        }
        throw err;
      }
    }
    if (query.search && search.length) {
      result = result.filter(or(...search.map((name) => new Q({ [`${name}__icontains`]: String(query.search) }))));
    }
    if (query.ordering) {
      const names = String(query.ordering).split(',').filter(Boolean);
      const wrong = names.find((name) => !orderings.has(name));
      if (wrong) throw new BadRequest(`Cannot order by ${wrong}`);
      result = result.orderBy(...names);
    }
    return result;
  }

  function integer(value, name, fallback) {
    if (value === undefined || value === '') return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new BadRequest(`${name} must be a non-negative integer`);
    return number;
  }

  // The configuration of the route of an action: { auth } for @xufa/auth (auth: a rule for every action, or a rule
  // by action).
  const configOf = (action) => {
    if (auth === undefined) return {};
    const rule = auth && typeof auth === 'object' && !Array.isArray(auth) ? auth[action] : auth;
    return rule === undefined ? {} : { config: { auth: rule } };
  };

  async function plugin(app) {
    if (actions.includes('list')) {
      app.get('/', configOf('list'), async (request) => {
        const qs = listQuery(scoped(request), request.query || {});
        if (!pagination) return (await qs).map((object) => output(object, request));
        const query = request.query || {};
        const limit = Math.min(integer(query.limit, 'limit', pageSize), maxPageSize);
        const offset = integer(query.offset, 'offset', 0);
        const [count, objects] = await Promise.all([qs.count(), qs.limit(limit).offset(offset)]);
        return { count, limit, offset, results: objects.map((object) => output(object, request)) };
      });
    }
    if (actions.includes('get')) {
      app.get('/:id', configOf('get'), async (request) => output(await find(request), request));
    }
    if (actions.includes('create')) {
      app.post('/', configOf('create'), async (request, reply) => {
        let values = valuesOf(request.body);
        if (hooks.beforeCreate) values = (await hooks.beforeCreate(values, request)) || values;
        const object = new model(values); // eslint-disable-line new-cap
        await object.save();
        // Read again from the queryset, with its related objects.
        const created = related.length ? await scoped(request).filter({ pk: object.pk }).first() : object;
        if (hooks.afterCreate) await hooks.afterCreate(created || object, request);
        reply.code(201);
        return output(created || object, request);
      });
    }
    if (actions.includes('update')) {
      const update = (partial) => async (request) => {
        const object = await find(request);
        let values = valuesOf(request.body);
        if (!partial) {
          // PUT: the writable fields not given take their default (null when they have none).
          for (const field of writableFields) {
            if (field.name in values || field.attname in values) continue;
            values[field.attname] = field.hasDefault() ? field.getDefault() : null;
          }
        }
        if (hooks.beforeUpdate) values = (await hooks.beforeUpdate(object, values, request)) || values;
        Object.entries(values).forEach(([key, value]) => {
          object[key] = value;
        });
        await object.save();
        const updated = related.length ? await find(request) : object;
        if (hooks.afterUpdate) await hooks.afterUpdate(updated, request);
        return output(updated, request);
      };
      app.put('/:id', configOf('update'), update(false));
      app.patch('/:id', configOf('update'), update(true));
    }
    if (actions.includes('delete')) {
      app.delete('/:id', configOf('delete'), async (request, reply) => {
        const object = await find(request);
        if (hooks.beforeDelete) await hooks.beforeDelete(object, request);
        await object.delete();
        reply.code(204).send();
      });
    }
  }

  plugin[Symbol.for('fastify.display-name')] = `@xufa/orm resource ${model.name}`;
  return plugin;
}

module.exports = { resource, BadRequest };
