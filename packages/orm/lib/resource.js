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
//
// Bodies set the writable fields; the others of the model (id, createdAt, computed ones...) are ignored, and keys that
// are no field are refused (400). With strict: true, those that are not writable are refused too, and every key
// refused is in one ValidationError (400, with the errors of each key); in an update, one with the value the object
// has is accepted (a body that is an object as it was read).
import createError from '@xufa/errors';
import { Q, or, LOOKUPS } from './query.js';
import { QuerySet } from './queryset.js';
import { QueryError, FieldError, LookupError, NotFoundError, ValidationError } from './errors.js';
import { resourceDocs } from './resource-openapi.js';

// The objects of resources as components of the document of an app (components/schemas/<name>), by app (its server,
// shared by all its plugins): name -> the JSON of the schema. A name taken by another schema keeps the documentation
// of a resource inline (two resources of a model with other fields: openapi.component names the second).
const components = new WeakMap();
function componentRef(app, component) {
  if (!component || typeof app.addSchema !== 'function') return null;
  const { name, schema } = component;
  const json = JSON.stringify(schema);
  const key = app.server || app;
  let taken = components.get(key);
  if (!taken) {
    taken = new Map();
    components.set(key, taken);
  }
  if (taken.has(name)) return taken.get(name) === json ? `${name}#` : null;
  const existing = typeof app.getSchema === 'function' ? app.getSchema(name) : undefined;
  if (existing !== undefined) {
    const { $id, ...rest } = existing;
    return JSON.stringify(rest) === json ? `${name}#` : null;
  }
  app.addSchema({ $id: name, ...schema });
  taken.set(name, json);
  return `${name}#`;
}

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

// A value of a body equal to one of an object (as JSON: a date is its text).
function sameValue(had, given) {
  return JSON.stringify(had === undefined ? null : had) === JSON.stringify(given === undefined ? null : given);
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
    permissions,
    hooks = {},
    serialize,
    openapi = true,
    strict = false,
  } = options;
  const unknownAction = actions.find((action) => !ACTIONS.includes(action));
  if (unknownAction) throw new TypeError(`Unknown action ${unknownAction} (${ACTIONS.join(', ')})`);
  const { meta } = model;
  const filterMap = filtersOf(model, filters);
  const orderings = new Set(ordering.flatMap((name) => [name, `-${name}`]));
  const lookupField = lookup === 'pk' ? meta.pk : meta.field(lookup);
  if (!lookupField) throw new TypeError(`The lookup ${lookup} of the resource of ${model.name} is not a field`);

  // The fields a body can set: every field but the primary key and those set by the ORM (autoNow, computed...), or
  // `writable`, without `readOnly`. Foreign keys by their name or attname (author or authorId).
  const writableFields = meta.fields.filter((field) => {
    if (field.computed !== null) return false;
    if (writable) return writable.includes(field.name) || writable.includes(field.attname);
    return !field.primaryKey && !field.auto && !readOnly.includes(field.name) && !readOnly.includes(field.attname);
  });
  const writableNames = new Map();
  writableFields.forEach((field) => {
    writableNames.set(field.name, field);
    writableNames.set(field.attname, field);
  });

  // The values of a body for the writable fields; other fields of the model (id, createdAt...) are ignored, and keys
  // that are no field are refused. strict: those that are not writable are refused too (unless, in an update, they
  // have the value of `current`, the object), all in one ValidationError.
  function valuesOf(body, current = null) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('The body must be an object');
    const values = {};
    const unknown = [];
    const readOnlyKeys = [];
    const now = strict && current ? current.toJSON() : null;
    for (const [key, value] of Object.entries(body)) {
      if (writableNames.has(key)) values[key] = value;
      else if (
        !meta.field(key) &&
        !meta.computedField(key) &&
        key !== 'pk' &&
        !meta.manyToMany.some((field) => field.name === key)
      )
        unknown.push(key);
      else if (strict && !(now && sameValue(key === 'pk' ? current.pk : now[key], value))) readOnlyKeys.push(key);
    }
    if (strict && (unknown.length || readOnlyKeys.length)) {
      const errors = {};
      for (const key of unknown) errors[key] = [`${model.name} has no field ${key}.`];
      for (const key of readOnlyKeys) errors[key] = ['This field is read-only.'];
      throw new ValidationError(model.name, errors);
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

  // The objects of an action for the user of the request (the where of the roles of the rbac of @xufa/auth, with
  // permissions): null for all, false for none, or conditions (any of them). Async, apart from its QuerySet (awaiting
  // a QuerySet runs it).
  async function scopeOf(request, action) {
    const auth = request.server && request.server.auth;
    if (!permissionName || !auth || !auth.rbac || typeof auth.scopeOf !== 'function') return null;
    return auth.scopeOf(request, `${permissionName}.${PERMISSIONS[action]}`);
  }

  function within(qs, scope) {
    if (scope === null || scope === undefined) return qs;
    if (scope === false) return qs.filter({ pk__in: [] });
    return qs.filter(Q.from('or', scope));
  }

  async function find(request, action = 'get') {
    const qs = within(scoped(request), await scopeOf(request, action));
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

  // The documentation of the routes for @xufa/openapi (openapi: false leaves it out; { tag } names their tag).
  const docs = openapi
    ? resourceDocs(model, {
        filterMap,
        orderings,
        search,
        pagination,
        pageSize,
        maxPageSize,
        lookupField,
        writableFields,
        shown,
        exclude,
        serialize,
        strict,
        tag: openapi && openapi.tag,
        component: (openapi && openapi.component) || model.name,
      })
    : null;

  // The permissions of the actions (with the rbac of @xufa/auth): permissions true (the name of the model) or a name
  // gives <name>.view (list, get), <name>.add (create), <name>.change (update) and <name>.delete (delete).
  if (permissions !== undefined && permissions !== true && (typeof permissions !== 'string' || !permissions)) {
    throw new TypeError(`permissions of the resource of ${model.name} is true or a name`);
  }
  const permissionName = permissions === true ? model.name : permissions;
  const PERMISSIONS = { list: 'view', get: 'view', create: 'add', update: 'change', delete: 'delete' };
  // The rule of an action with its permission: over the rule given (roles, a check, or a rule object).
  const withPermission = (rule, action) => {
    if (!permissionName || rule === false) return rule;
    const can = `${permissionName}.${PERMISSIONS[action]}`;
    if (rule === undefined || rule === true) return { can };
    if (typeof rule === 'string' || Array.isArray(rule)) return { roles: rule, can };
    if (typeof rule === 'function') return { check: rule, can };
    return { ...rule, can };
  };

  // The configuration of the route of an action: { auth } for @xufa/auth (auth: a rule for every action, or a rule
  // by action; with permissions, its permission too), and { openapi }, its documentation (`partial`: the PATCH of
  // update).
  let ref = null;
  const configOf = (action, partial = false) => {
    const config = {};
    const rule = withPermission(auth && typeof auth === 'object' && !Array.isArray(auth) ? auth[action] : auth, action);
    if (rule !== undefined) config.auth = rule;
    if (docs) config.openapi = docs(action, partial, ref);
    return Object.keys(config).length ? { config } : {};
  };

  async function plugin(app) {
    if (docs) ref = componentRef(app, docs.component);
    if (actions.includes('list')) {
      app.get('/', configOf('list'), async (request) => {
        const qs = listQuery(within(scoped(request), await scopeOf(request, 'list')), request.query || {});
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
        // The rules of the user for adding (the where of its roles): the new object meets them, or it is not kept.
        const scope = await scopeOf(request, 'create');
        if (scope === null) await object.save();
        else {
          const create = async () => {
            await object.save();
            if (!(await within(model.objects.all(), scope).filter({ pk: object.pk }).exists())) {
              throw Object.assign(new Error('You cannot do this'), { statusCode: 403, code: 'XUFA_ORM_ERR_FORBIDDEN' });
            }
          };
          const { db } = model;
          await (db && typeof db.transaction === 'function' ? db.transaction(create) : create());
        }
        // Read again from the queryset, with its related objects.
        const created = related.length ? await scoped(request).filter({ pk: object.pk }).first() : object;
        if (hooks.afterCreate) await hooks.afterCreate(created || object, request);
        reply.code(201);
        return output(created || object, request);
      });
    }
    if (actions.includes('update')) {
      const update = (partial) => async (request) => {
        const object = await find(request, 'update');
        let values = valuesOf(request.body, object);
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
        // Read again (with its related objects) from the queryset, whatever the change made of it.
        const updated = related.length ? await scoped(request).filter({ pk: object.pk }).first() : object;
        if (hooks.afterUpdate) await hooks.afterUpdate(updated, request);
        return output(updated, request);
      };
      app.put('/:id', configOf('update'), update(false));
      app.patch('/:id', configOf('update', true), update(true));
    }
    if (actions.includes('delete')) {
      app.delete('/:id', configOf('delete'), async (request, reply) => {
        const object = await find(request, 'delete');
        if (hooks.beforeDelete) await hooks.beforeDelete(object, request);
        await object.delete();
        reply.code(204).send();
      });
    }
  }

  plugin[Symbol.for('fastify.display-name')] = `@xufa/orm resource ${model.name}`;
  return plugin;
}

export { resource, BadRequest };
