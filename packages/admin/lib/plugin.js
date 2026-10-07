'use strict';

// The admin as a plugin of @xufa/http: the page (GET /, a single page of its own) and its API (GET /api/models; GET,
// POST /api/:model; GET, PATCH, DELETE /api/:model/:pk; GET /api/:model/choices; the runs of pipelines under
// /api/_runs and the health of the app at /api/_health), all asked to authorize(); or, with login, its own login page
// (GET /login, POST /login, POST /logout: @xufa/auth and @xufa/session), every other route for the user logged in.
//
//   app.register(admin, { prefix: '/admin', models: [Author, Book], authorize: (request) => request.user?.isStaff });
//   app.register(admin, { prefix: '/admin', models, login: { findUser: (name) => User.objects.filter({ email: name }).first() } });
const { describeModel, labelOf } = require('./describe');
const { page, loginPage } = require('./page');
const { configureLogin } = require('./login');
const { registerRuns, registerHealth } = require('./runs');

const PAGE_SIZES = [10, 25, 50, 100];
// The header the page sends with its writes: a form of another site cannot (CORS asks first), so no CSRF.
const HEADER = 'x-xufa-admin';

class AdminError extends Error {
  constructor(message, statusCode = 400, extra = {}) {
    super(message);
    this.name = 'AdminError';
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

function configure(options) {
  const {
    models = [],
    authorize,
    title = 'Admin',
    modelOptions = {},
    pageSize = 25,
    pipelines = null,
    health = true,
    login = null,
  } = options;
  if (authorize === undefined && !login) {
    throw new AdminError(
      "The admin needs login (its own login page, with @xufa/auth and @xufa/session) or authorize: (request, reply) => boolean (or 'development': every request while NODE_ENV is not production)"
    );
  }
  // With login, authorize is optional: asked after the login, with request.adminUser.
  const given =
    authorize === undefined
      ? () => true
      : authorize === 'development'
        ? () => process.env.NODE_ENV !== 'production'
        : typeof authorize === 'function'
          ? authorize
          : null;
  if (!given) throw new AdminError("authorize of the admin is a function, or 'development'");
  const logins = login ? configureLogin(login) : null;
  const check = given;
  const entries = models.map((item) => (Array.isArray(item) ? item : [item, modelOptions[item.name] || {}]));
  const byName = new Map();
  for (const [model, own] of entries) {
    if (!model || !model.meta) throw new AdminError('The models of the admin are models of @xufa/orm');
    byName.set(model.name, { model, description: describeModel(model, own) });
  }
  return { byName, check, title, pageSize, pipelines, health, logins };
}

function convert(field, value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return field.null ? null : value === '' && field.type === 'string' ? '' : null;
  return value;
}

// The values of a body that the model takes: its editable fields (foreign keys by their attname too).
function valuesOf(description, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError('The body is an object of values');
  const values = {};
  for (const field of description.fields) {
    if (field.readOnly) continue;
    const key = Object.hasOwn(body, field.attname)
      ? field.attname
      : Object.hasOwn(body, field.name)
        ? field.name
        : null;
    if (key === null) continue;
    const value = convert(field, body[key]);
    if (value !== undefined) values[field.attname] = value;
  }
  return values;
}

function serialize(model, description, object) {
  const values = {};
  for (const field of description.fields)
    values[field.attname] = object[field.attname] === undefined ? null : object[field.attname];
  const related = {};
  for (const field of description.fields) {
    if (field.type !== 'foreignKey') continue;
    // The object of the foreign key, when it was loaded (selectRelated).
    const value = object[field.name];
    if (value) related[field.name] = labelOf(model.meta.field(field.name).target, value);
  }
  return { pk: object.pk, label: labelOf(model, object), values, related };
}

// Answers the errors of the ORM as the page shows them: errors by field.
function answerError(err, reply) {
  if (err && err.code === 'XUFA_ORM_ERR_VALIDATION') {
    return reply.code(400).send({ error: 'Validation failed', errors: err.errors || {} });
  }
  if (err && err.code === 'XUFA_ORM_ERR_UNIQUE') {
    const errors = {};
    for (const name of err.fields || []) errors[name] = ['There is already one with this value.'];
    return reply.code(409).send({ error: err.message, errors });
  }
  if (err && err.code === 'XUFA_ORM_ERR_PROTECTED') return reply.code(409).send({ error: err.message, errors: {} });
  if (err && err.code === 'XUFA_ORM_ERR_NOT_FOUND') return reply.code(404).send({ error: 'Not found', errors: {} });
  if (err instanceof AdminError)
    return reply.code(err.statusCode).send({ error: err.message, errors: err.errors || {} });
  throw err;
}

async function adminPlugin(app, options) {
  const { byName, check, title, pageSize, pipelines, health, logins } = configure(options || {});
  app.decorateRequest('adminUser', null);

  app.addHook('onRequest', async (request, reply) => {
    const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
    if (logins) {
      const config = (request.routeOptions && request.routeOptions.config) || {};
      if (config.adminLogin) {
        // The page and routes of the login: for everyone (writes with the header of the admin).
        if (isWrite && request.headers[HEADER] !== '1') {
          return reply.code(403).send({ error: `Writes of the admin need the header ${HEADER}: 1`, errors: {} });
        }
        return undefined;
      }
      let user;
      try {
        user = logins.userOf(request);
      } catch (err) {
        return reply.code(err.statusCode || 500).send({ error: err.message, errors: {} });
      }
      if (!user) {
        // The page goes to the login page; the API answers 401 (the page then goes there).
        if (config.adminPage) return reply.redirect('login');
        return reply.code(401).send({ error: 'Log in to the admin first', errors: {}, login: true });
      }
      request.adminUser = user;
    }
    const allowed = await check(request, reply);
    if (reply.sent) return reply;
    if (!allowed) {
      return reply.code(403).type('text/plain; charset=utf-8').send('The admin is not for you (authorize said no).');
    }
    if (isWrite && request.headers[HEADER] !== '1') {
      return reply.code(403).send({ error: `Writes of the admin need the header ${HEADER}: 1`, errors: {} });
    }
    return undefined;
  });

  const entryOf = (name) => {
    const entry = byName.get(name);
    if (!entry) throw new AdminError(`The admin has no model ${name}`, 404);
    return entry;
  };
  // The objects of a model (with soft deletes, those not deleted).
  const objectsOf = ({ model }) => model.objects;

  app.get('/', { config: { adminPage: true } }, async (request, reply) => {
    // The page asks for its API at api/: the address with its slash.
    if (!request.url.split('?')[0].endsWith('/')) return reply.redirect(`${request.url.split('?')[0]}/`);
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(page(title));
  });

  if (logins) {
    const config = { adminLogin: true };
    // The login page: its form, with the CSRF token of the session (for apps whose sessions ask for it).
    app.get('/login', { config }, async (request, reply) => {
      if (logins.userOf(request)) return reply.redirect('./');
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(loginPage(title, request.session.csrfToken()));
    });
    app.post('/login', { config }, async (request, reply) => {
      try {
        const user = await logins.check(request, request.body || {});
        // A new session id once logged in: an id known before is worth nothing.
        request.session.regenerate().set(logins.SESSION_KEY, user);
        return { ok: true, user: { name: user.name } };
      } catch (err) {
        if (!err.statusCode) throw err;
        if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
        return reply.code(err.statusCode).send({ error: err.message, errors: {}, ...(err.code ? { code: true } : {}) });
      }
    });
    app.post('/logout', { config }, async (request) => {
      if (request.session && typeof request.session.destroy === 'function') request.session.destroy();
      return { ok: true };
    });
  }

  // The runs of pipelines (pipelines: a Pipelines of @xufa/queue), and the health of the app (xufa.health).
  if (pipelines) registerRuns(app, pipelines);
  if (health) registerHealth(app);

  app.get('/api/models', async (request) => ({
    title,
    pageSizes: PAGE_SIZES,
    // The user logged in (with login), and the CSRF token of the session for the writes of the page.
    user: request.adminUser ? { name: request.adminUser.name } : null,
    csrf: request.session && typeof request.session.csrfToken === 'function' ? request.session.csrfToken() : null,
    // What the page shows besides the models: runs of pipelines, and the health of the app.
    runs: Boolean(pipelines),
    health: Boolean(health && app.health && typeof app.health.check === 'function'),
    models: await Promise.all(
      [...byName.values()].map(async ({ model, description }) => ({
        ...description,
        count: await model.objects.count(),
      }))
    ),
  }));

  app.get('/api/:model', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      const query = request.query || {};
      let qs = objectsOf(entry);
      const search = typeof query.search === 'string' ? query.search.trim() : '';
      if (search && description.search.length) {
        const { Q } = require('@xufa/orm'); // eslint-disable-line global-require
        qs = qs.filter(
          Q.from(
            'or',
            description.search.map((name) => ({ [`${name}__icontains`]: search }))
          )
        );
      }
      for (const name of description.filters) {
        const raw = query[`filter.${name}`];
        if (raw === undefined || raw === '') continue;
        const field = description.fields.find((item) => item.name === name);
        if (raw === 'null') qs = qs.filter({ [`${field.attname}__isnull`]: true });
        else if (field.type === 'boolean') qs = qs.filter({ [field.attname]: raw === 'true' });
        else qs = qs.filter({ [field.attname]: raw });
      }
      if (query.order) {
        const name = String(query.order).replace(/^-/, '');
        if (!description.fields.some((field) => field.name === name))
          throw new AdminError(`Not a field to order by: ${name}`);
        qs = qs.orderBy(String(query.order), ...(description.pk && name !== description.pk ? [description.pk] : []));
      }
      const size = PAGE_SIZES.includes(Number(query.size)) ? Number(query.size) : pageSize;
      const pageNumber = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const count = await qs.count();
      const related = description.fields
        .filter((field) => field.type === 'foreignKey' && description.list.includes(field.name))
        .map((field) => field.name);
      let rows = qs.slice((pageNumber - 1) * size, pageNumber * size);
      if (related.length) rows = rows.selectRelated(...related);
      const objects = await rows;
      return { count, page: pageNumber, size, results: objects.map((object) => serialize(model, description, object)) };
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.get('/api/:model/choices', async (request, reply) => {
    try {
      const entry = byName.get(request.params.model);
      // The objects of a model a foreign key points to (it need not be in the admin): their keys and labels.
      const target =
        (entry && entry.model) ||
        [...byName.values()]
          .flatMap(({ model }) =>
            model.meta.fields.filter((field) => field.type === 'foreignKey').map((field) => field.target)
          )
          .find((model) => model.name === request.params.model);
      if (!target) throw new AdminError(`The admin has no model ${request.params.model}`, 404);
      let qs = target.objects;
      const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
      const text = target.meta.fields.find((field) => field.type === 'string' && !field.primaryKey);
      if (search && text) qs = qs.filter({ [`${text.attname}__icontains`]: search });
      const objects = await qs.limit(200);
      return objects.map((object) => ({ pk: object.pk, label: labelOf(target, object) }));
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.get('/api/:model/:pk', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      const fks = description.fields.filter((field) => field.type === 'foreignKey').map((field) => field.name);
      let qs = objectsOf(entry).filter({ pk: request.params.pk });
      if (fks.length) qs = qs.selectRelated(...fks);
      const object = await qs.get();
      return serialize(model, description, object);
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.post('/api/:model', async (request, reply) => {
    try {
      const { model, description } = entryOf(request.params.model);
      if (description.readOnlyModel) throw new AdminError(`${model.name} is read only in the admin`, 405);
      const object = await model.objects.create(valuesOf(description, request.body));
      reply.code(201);
      return serialize(model, description, object);
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.patch('/api/:model/:pk', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      if (description.readOnlyModel) throw new AdminError(`${model.name} is read only in the admin`, 405);
      const object = await objectsOf(entry).get({ pk: request.params.pk });
      Object.assign(object, valuesOf(description, request.body));
      await object.save();
      return serialize(model, description, object);
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.delete('/api/:model/:pk', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      if (description.readOnlyModel) throw new AdminError(`${model.name} is read only in the admin`, 405);
      const object = await objectsOf(entry).get({ pk: request.params.pk });
      await object.delete();
      return reply.code(204).send();
    } catch (err) {
      return answerError(err, reply);
    }
  });
}

adminPlugin[Symbol.for('fastify.display-name')] = '@xufa/admin';
adminPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/admin' };

module.exports = { adminPlugin, AdminError, configure, HEADER };
