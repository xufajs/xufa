// The admin as a plugin of @xufa/http: the page (GET /, a single page of its own) and its API (GET /api/models; GET,
// POST /api/:model; GET, PATCH, DELETE /api/:model/:pk; GET /api/:model/choices; the runs of pipelines under
// /api/_runs and the health of the app at /api/_health), all asked to authorize(); or, with login, its own login page
// (GET /login, POST /login, POST /logout: @xufa/auth and @xufa/session), every other route for the user logged in.
//
//   app.register(admin, { prefix: '/admin', models: [Author, Book], authorize: (request) => request.user?.isStaff });
//   app.register(admin, { prefix: '/admin', models, login: { findUser: (name) => User.objects.filter({ email: name }).first() } });
//
// Permissions: with rbac (an Rbac of @xufa/auth, or its options), the user (that of the login, or request.user) sees
// the models it may view (<Model>.view) and adds, changes and deletes them with <Model>.add, .change and .delete; the
// jobs, runs and health with _jobs.*, _runs.* and _health.view (in every tenant: they are not of one). With tenants
// ({ tenants, list, label }: the Tenants of @xufa/orm and the ids of its tenants), the page has a tenant to choose
// among those of the user (header x-xufa-tenant), the models are those of the tenant chosen, and the permissions those
// of the user in it. The data model (GET /api/_schema): its models as a diagram of entities and relations, for
// _schema.view (schema: false hides it; appOf(model) names the app of each).
import { describeModel, labelOf, searchLookup, columnsOf } from './describe.js';
import { page, loginPage, sendAsset } from './page.js';
import { uiOf } from './ui-locale.js';
import { configureLogin } from './login.js';
import { registerRuns, registerHealth } from './runs.js';
import { registerJobs } from './jobs.js';
import { registerWork } from './work.js';
import { registerSessions } from './sessions.js';
import { registerAccount } from './account.js';
import { registerSchedules } from './schedules.js';
import { registerSchema } from './schema.js';
import { message as msg } from './messages.js';
import * as ormModule from '@xufa/orm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PAGE_SIZES = [10, 25, 50, 100];
// The header the page sends with its writes: a form of another site cannot (CORS asks first), so no CSRF.
const HEADER = 'x-xufa-admin';
// The tenant the page has chosen (with tenants).
const TENANT_HEADER = 'x-xufa-tenant';
// The permission of a method on the jobs, runs and health (those under /api/_<area>).
const AREA_ACTIONS = { GET: 'view', HEAD: 'view', DELETE: 'delete' };

// The most objects an action runs on at once (those selected in a page: its largest size is 100).
const ACTION_LIMIT = 1000;

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
    queue = null,
    scheduler = null,
    rbac: rbacOption = null,
    tenants: tenantsOption = null,
    // The data model page (its diagram): true, false, or { models: () => [...] } (models it draws besides those of the
    // admin: all those of a project); and the app of each model there (a function of the model: its label).
    schema = true,
    appOf = null,
    // The models of the data model page edited there (xufa's designer, in development): see lib/schema.js.
    designer = null,
    // The language of its page (else that of each request) and texts of the page of the app's own, by language.
    language = null,
    uiMessages = {},
  } = options;
  if (uiMessages === null || typeof uiMessages !== 'object' || Array.isArray(uiMessages)) {
    throw new AdminError('uiMessages of the admin is { language: { English text: translation } }');
  }
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
  const rbac = rbacOf(rbacOption);
  if (tenantsOption) {
    const { tenants: registry, list } = tenantsOption;
    if (!registry || typeof registry.enter !== 'function') {
      throw new AdminError('tenants of the admin is { tenants, list }: tenants is the Tenants of @xufa/orm');
    }
    if (typeof list !== 'function') throw new AdminError('tenants of the admin needs list(): the ids of the tenants');
  }
  const logins = login ? configureLogin(login, rbac) : null;
  const check = given;
  const entries = models.map((item) => (Array.isArray(item) ? item : [item, modelOptions[item.name] || {}]));
  const byName = new Map();
  for (const [model, own] of entries) {
    if (!model || !model.meta) throw new AdminError('The models of the admin are models of @xufa/orm');
    const description = describeModel(model, own);
    const actions = actionsOf(model, own.actions);
    description.actions = [...actions.values()].map(({ name, label, permission, confirm, danger }) => ({
      name,
      label,
      permission,
      confirm,
      danger,
    }));
    byName.set(model.name, { model, description, own, actions });
  }
  // The objects of other models of the admin that point to each one (an author's books): its related lists, all of
  // them or those of its option inlines (by the names of their relations: bookSet), none with inlines: false.
  for (const entry of byName.values()) {
    const related = [];
    for (const other of byName.values()) {
      for (const field of other.model.meta.fields) {
        if (field.type !== 'foreignKey' || field.target !== entry.model) continue;
        related.push({
          name: field.relatedName || `${other.model.name.charAt(0).toLowerCase()}${other.model.name.slice(1)}Set`,
          model: other.model.name,
          label: other.description.label,
          field: field.name,
          attname: field.attname,
        });
      }
    }
    const { inlines } = entry.own;
    if (inlines !== undefined && inlines !== false && !Array.isArray(inlines)) {
      throw new AdminError(`inlines of ${entry.model.name} is a list of the names of its relations, or false`);
    }
    // An inline is the name of a relation (its objects listed), or { relation, fields, extra } (Django's
    // TabularInline: its objects edited in rows, fields: those of the rows, extra: the empty rows to add).
    const nameOf = (inline) => (inline && typeof inline === 'object' ? inline.relation : inline);
    if (Array.isArray(inlines)) {
      const unknown = inlines.map(nameOf).find((name) => !related.some((item) => item.name === name));
      if (unknown) {
        throw new AdminError(
          `${entry.model.name} has no relation ${unknown} of a model of the admin (${related.map((item) => item.name).join(', ') || 'none'})`
        );
      }
    }
    entry.description.related =
      inlines === false
        ? []
        : Array.isArray(inlines)
          ? inlines.map((inline) => {
              const item = related.find((candidate) => candidate.name === nameOf(inline));
              if (!inline || typeof inline !== 'object') return item;
              const other = byName.get(item.model);
              const editable = other.description.fields.filter(
                (field) => !field.readOnly && field.name !== item.field && field.type !== 'manyToMany'
              );
              const fieldNames = inline.fields || editable.map((field) => field.name);
              for (const name of fieldNames) {
                if (!editable.some((field) => field.name === name)) {
                  throw new AdminError(`The inline ${item.name} of ${entry.model.name} cannot edit ${name}`);
                }
              }
              return {
                ...item,
                editable: true,
                fields: fieldNames,
                extra: Number.isInteger(inline.extra) && inline.extra >= 0 ? inline.extra : 1,
              };
            })
          : related;
  }
  return {
    byName,
    check,
    title,
    pageSize,
    pipelines,
    health,
    logins,
    queue,
    scheduler,
    rbac,
    tenants: tenantsOption,
    schema: schema !== false,
    schemaModels: schema && typeof schema === 'object' && typeof schema.models === 'function' ? schema.models : null,
    appOf: typeof appOf === 'function' ? appOf : null,
    designer: designer && typeof designer.preview === 'function' ? designer : null,
    ui: { language, uiMessages },
  };
}

// The rbac of the admin: an Rbac of @xufa/auth (anything with access and allows), or its options.
function rbacOf(given) {
  if (!given) return null;
  if (typeof given.allows === 'function' && typeof given.access === 'function') return given;
  let auth;
  try {
    auth = require('@xufa/auth');
  } catch (err) {
    throw new AdminError(`rbac of the admin needs @xufa/auth (${err.message})`);
  }
  return new auth.Rbac(given);
}

function convert(field, value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return field.null ? null : value === '' && field.type === 'string' ? '' : null;
  return value;
}

// The values of a body that the model takes: its editable fields (foreign keys by their attname too).
function valuesOf(description, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(msg('body'));
  const values = {};
  for (const field of description.fields) {
    if (field.readOnly || field.type === 'manyToMany' || !inForm(description, field)) continue;
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

// Whether a field is in the form: every field, or those of its layout (fields, fieldsets), as Django's.
function inForm(description, field) {
  if (!description.layout) return true;
  return description.layout.some((set) => set.rows.some((row) => row.includes(field.name)));
}

// The audit log of a model (that of its database, of the tenant of the request), when it has one and audits it.
function auditOf(model) {
  let db;
  try {
    db = model.db;
  } catch {
    return null;
  }
  const audit = db && db.audit;
  return audit && audit.audits(model.meta) ? audit : null;
}

// Who acts in the admin, for its audit log: the user of its login, or the user of the request.
function actorOf(request) {
  if (request.adminUser) return request.adminUser.name;
  const user = request.user;
  if (!user) return null;
  return user.email || user.username || user.name || (user.id === undefined ? user.sub || null : user.id);
}

// The writes of a request of the admin, with who makes them in the audit log (via: admin, and the tenant).
function audited(request, model, fn) {
  const audit = auditOf(model);
  if (!audit) return fn();
  const context = { via: 'admin', ...(request.adminTenant ? { tenant: request.adminTenant } : {}) };
  return audit.with({ actor: actorOf(request), context }, fn);
}

// An entry of the audit log as the page shows it: its fields by their labels, newest first.
function historyEntry(entry, description) {
  const labelOfField = (name) => {
    const field = description && description.fields.find((item) => item.name === name || item.attname === name);
    return field ? field.label || null : null;
  };
  return {
    id: entry.pk,
    at: entry.at,
    action: entry.action,
    model: entry.model,
    key: entry.key,
    actor: entry.actor,
    via: entry.context && entry.context.via ? entry.context.via : null,
    changes: (entry.changes || []).map((change) => ({
      field: change.field,
      label: labelOfField(change.field),
      path: change.path || null,
      from: change.redacted ? null : change.from === undefined ? null : change.from,
      to: change.redacted ? null : change.to === undefined ? null : change.to,
      redacted: Boolean(change.redacted),
    })),
  };
}

// The message of a value required (that of the ORM, translated as its others).
const required = () => ormModule.validationMessage('required');

// The keys of the many-to-many of a body: { name: [keys] } of those it has (checked: keys of their models), and the
// errors of those required and empty.
function linksOf(model, description, body, { creating }) {
  const links = {};
  const errors = {};
  for (const field of description.fields) {
    if (field.type !== 'manyToMany' || field.readOnly || !inForm(description, field)) continue;
    if (!Object.hasOwn(body, field.name)) {
      if (creating && field.required) errors[field.name] = [required()];
      continue;
    }
    const given = [].concat(body[field.name] === null ? [] : body[field.name]);
    const target = model.meta.manyToMany.find((item) => item.name === field.name).target;
    const keys = given.map((raw) => keyOf(target, raw));
    if (keys.some((key) => key === null)) throw new AdminError(msg('badKey', { model: field.target, value: given }));
    if (field.required && !keys.length) errors[field.name] = [required()];
    links[field.name] = keys;
  }
  if (Object.keys(errors).length) throw Object.assign(new AdminError(msg('validation')), { errors });
  return links;
}

async function setLinks(object, links) {
  for (const [name, keys] of Object.entries(links)) await object[name].set(keys);
}

// A value of a column that is not a field, as the page shows it: texts, numbers, booleans and dates; objects by
// their labels.
function shown(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(shown).join(', ');
  if (typeof value === 'object') return String(value);
  if (typeof value === 'bigint') return String(value);
  return value;
}

// An object as the page gets it: its values, the labels of its foreign keys, and (detail) its many-to-many with
// their labels, or (rows) the values of the columns that are not fields.
async function serialize(model, description, object, { detail = false, rows = false } = {}) {
  const values = {};
  for (const field of description.fields) {
    if (field.type === 'manyToMany') continue;
    values[field.attname] = object[field.attname] === undefined ? null : object[field.attname];
  }
  const related = {};
  for (const field of description.fields) {
    if (field.type !== 'foreignKey') continue;
    // The object of the foreign key, when it was loaded (selectRelated).
    const value = object[field.name];
    if (value) related[field.name] = labelOf(model.meta.field(field.name).target, value);
  }
  const answer = { pk: object.pk, label: labelOf(model, object), values, related };
  if (detail) {
    for (const field of description.fields) {
      if (field.type !== 'manyToMany') continue;
      const target = model.meta.manyToMany.find((item) => item.name === field.name).target;
      const linked = await object[field.name].all();
      values[field.name] = linked.map((item) => item.pk);
      related[field.name] = linked.map((item) => labelOf(target, item));
    }
  }
  if (rows) {
    const columns = {};
    for (const column of columnsOf(description)) {
      if (column.kind === 'field') continue;
      columns[column.name] = shown(await columnValue(model, column, object));
    }
    answer.columns = columns;
  }
  return answer;
}

async function columnValue(model, column, object) {
  if (column.kind === 'path') {
    let current = object;
    for (const part of column.name.split('__'))
      current = current === null || current === undefined ? null : current[part];
    return current;
  }
  if (column.kind === 'many') {
    const target = model.meta.manyToMany.find((item) => item.name === column.name).target;
    return (await object[column.name].all()).map((item) => labelOf(target, item));
  }
  if (column.value) return column.value(object);
  const member = column.member;
  return member.get ? member.get.call(object) : member.value.call(object);
}

// The relations to load for the rows of a list: its foreign keys among its columns, and those of its paths.
function selectsOf(description) {
  const names = new Set(
    description.fields
      .filter((field) => field.type === 'foreignKey' && description.list.includes(field.name))
      .map((field) => field.name)
  );
  for (const column of columnsOf(description)) if (column.kind === 'path') names.add(column.select);
  return [...names];
}

// The actions of a model on the objects selected in its list (as Django's): { name: run } or { name: { run, label,
// permission, confirm, danger } }. run(objects, context) gets a QuerySet of them, and answers a message, a number (of
// objects changed) or nothing.
function actionsOf(model, given) {
  const actions = new Map();
  if (given === undefined) return actions;
  if (!given || typeof given !== 'object' || Array.isArray(given)) {
    throw new AdminError(`actions of ${model.name} is { name: run } or { name: { run, label, permission, confirm } }`);
  }
  for (const [name, value] of Object.entries(given)) {
    if (!/^[A-Za-z][\w-]*$/.test(name)) throw new AdminError(`Not a name of an action of ${model.name}: ${name}`);
    const action = typeof value === 'function' ? { run: value } : value;
    if (!action || typeof action.run !== 'function') {
      throw new AdminError(`The action ${name} of ${model.name} needs run(objects, context)`);
    }
    const words = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .toLowerCase();
    actions.set(name, {
      name,
      label: action.label || words.charAt(0).toUpperCase() + words.slice(1),
      permission: action.permission || `${model.name}.change`,
      // true, or the question to ask before it runs.
      confirm: action.confirm === undefined || action.confirm === false ? null : action.confirm,
      danger: Boolean(action.danger),
      run: action.run,
    });
  }
  return actions;
}

// A key of a model from an address or a body, as its field makes it; null when it cannot be one (not found: it never
// reaches the database, where "nope" for an integer key is an error of Postgres). Automatic keys are integers in SQL
// databases and ObjectIds in MongoDB.
function keyOf(model, value) {
  const field = model.meta.pk;
  if (!field || field.composite) return value;
  if (field.type === 'id') {
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    return typeof value === 'string' && (/^-?\d+$/.test(value) || /^[0-9a-f]{24}$/i.test(value)) ? value : null;
  }
  try {
    return field.clean(value);
  } catch {
    return null;
  }
}

// Answers the errors of the ORM as the page shows them: errors by field.
function answerError(err, reply) {
  if (err && err.code === 'XUFA_ORM_ERR_VALIDATION') {
    return reply.code(400).send({ error: msg('validation'), errors: err.errors || {} });
  }
  if (err && err.code === 'XUFA_ORM_ERR_UNIQUE') {
    const errors = {};
    const taken = ormModule.validationMessage('unique');
    for (const name of err.fields || []) errors[name] = [taken];
    return reply.code(409).send({ error: err.message, errors });
  }
  if (err && err.code === 'XUFA_ORM_ERR_PROTECTED') return reply.code(409).send({ error: err.message, errors: {} });
  if (err && err.code === 'XUFA_ORM_ERR_NOT_FOUND') return reply.code(404).send({ error: msg('notFound'), errors: {} });
  if (err instanceof AdminError)
    return reply.code(err.statusCode).send({ error: err.message, errors: err.errors || {} });
  throw err;
}

async function adminPlugin(app, options) {
  const {
    byName,
    check,
    title,
    pageSize,
    pipelines,
    health,
    logins,
    queue,
    scheduler,
    rbac,
    tenants,
    schema,
    schemaModels,
    appOf,
    designer,
    ui,
  } = configure(options || {});
  app.decorateRequest('adminUser', null);
  app.decorateRequest('adminAccess', null);
  app.decorateRequest('adminTenant', null);
  // With tenants, the admin enters the tenant of each request itself: the plugin of the ORM leaves its routes alone.
  if (tenants) {
    app.addHook('onRoute', (route) => {
      route.config = { ...route.config, tenant: false };
    });
  }

  // Whether the user of a request has a permission: in the tenant chosen (models), or in every tenant (the jobs, runs
  // and health: tenant null). Without rbac, every user of the admin may do everything.
  const can = (request, permission, tenant = request.adminTenant) =>
    !rbac || rbac.allows(request.adminAccess, permission, tenant);
  const need = (request, permission) => {
    if (!can(request, permission)) throw new AdminError(msg('forbidden', { permission }), 403);
  };
  // The objects of a permission for the user of a request (the where of the roles of its rbac, as Django's
  // get_queryset and has_change_permission(obj)): a QuerySet with them only.
  const within = (request, qs, permission) => {
    if (!rbac) return qs;
    const scope = rbac.scopeOf(
      request.adminAccess,
      request.adminUser || request.user || null,
      permission,
      request.adminTenant
    );
    if (scope === null || scope === undefined) return qs;
    if (scope === false) return qs.filter({ pk__in: [] });
    const { Q } = ormModule;
    return qs.filter(Q.from('or', scope));
  };
  // The tenants a user may choose: [{ id, label }].
  const tenantsFor = async (request) => {
    const allowed = rbac ? rbac.tenantsIn(request.adminAccess) : ['*'];
    const ids = allowed.includes('*') ? (await tenants.list(request)).map(String) : allowed;
    return Promise.all(
      ids.map(async (id) => ({ id, label: tenants.label ? String((await tenants.label(id, request)) || id) : id }))
    );
  };

  app.addHook('onRequest', async (request, reply) => {
    const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
    // The files of the page (its code and style, no data): for everyone, so the login page has them too.
    if (request.routeOptions && request.routeOptions.config && request.routeOptions.config.adminAsset) return undefined;
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
        user = await logins.current(request);
      } catch (err) {
        return reply.code(err.statusCode || 500).send({ error: err.message, errors: {} });
      }
      if (!user) {
        // The page goes to the login page; the API answers 401 (the page then goes there).
        // (By its path: from /admin, without the slash, 'login' would be /login.)
        if (config.adminPage) return reply.redirect(`${app.prefix}/login`);
        return reply.code(401).send({ error: msg('logInAdmin'), errors: {}, login: true });
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
    const config = (request.routeOptions && request.routeOptions.config) || {};
    if (rbac) {
      // The roles of the database (groups) read again when they may have changed.
      if (typeof rbac.fresh === 'function') await rbac.fresh();
      // What the user may: kept at the login, or that of request.user (of @xufa/auth).
      request.adminAccess = logins ? request.adminUser.access : await rbac.access(request.user || null);
      if (!request.adminAccess.superuser && rbac.tenantsIn(request.adminAccess).length === 0) {
        if (config.adminPage) {
          return reply.code(403).type('text/plain; charset=utf-8').send('The admin is not for you (no roles).');
        }
        return reply.code(403).send({ error: msg('noRoles'), errors: {} });
      }
    }
    const url = (request.routeOptions && request.routeOptions.url) || '';
    const matched = /\/api\/(_[a-z]+)/.exec(url);
    // The recent actions are of the models (in the tenant), each asked by its own permission: not an area.
    const area = matched && matched[1] !== '_activity' ? matched : null;
    // The work (jobs and runs together): each kind for those who may view it (its route says).
    if (area && area[1] === '_work') return undefined;
    // The sessions of the user logged in: its own (every user).
    if (area && area[1] === '_account') return undefined;
    // What the pickers of permissions and roles offer (names and labels): for every user of the admin, as the forms of
    // users and groups need them (those forms ask their own permissions).
    if (area && area[1] === '_permissions') return undefined;
    if (area) {
      // The jobs, runs and health: in every tenant.
      const permission = `${area[1]}.${AREA_ACTIONS[request.method] || 'change'}`;
      if (!can(request, permission, null)) {
        return reply.code(403).send({ error: msg('forbidden', { permission }), errors: {} });
      }
      return undefined;
    }
    if (tenants && url.includes('/api/')) {
      // The tenant chosen (or the first the user may use), if the user may use it.
      const asked = request.headers[TENANT_HEADER];
      if (asked) {
        if (rbac && !rbac.inTenant(request.adminAccess, asked)) {
          return reply.code(403).send({ error: msg('tenantForbidden', { tenant: asked }), errors: {} });
        }
        request.adminTenant = String(asked);
      } else {
        const [first] = await tenantsFor(request);
        if (!first) return reply.code(403).send({ error: msg('noTenantForYou'), errors: {} });
        request.adminTenant = first.id;
      }
    }
    return undefined;
  });
  if (tenants) {
    // Entered now (before any await of the handler), so the handler and its queries run in the tenant.
    app.addHook('onRequest', (request, reply, done) => {
      if (!request.adminTenant) {
        done();
        return;
      }
      tenants.tenants.enter(request.adminTenant).then(
        () => done(),
        () => reply.code(404).send({ error: msg('noTenant', { tenant: request.adminTenant }), errors: {} })
      );
    });
  }

  const entryOf = (name) => {
    const entry = byName.get(name);
    if (!entry) throw new AdminError(msg('noModel', { model: name }), 404);
    return entry;
  };
  // The objects of a model (with soft deletes, those not deleted).
  const objectsOf = ({ model }) => model.objects;
  // The key of an address, or 404.
  const pkOf = ({ model }, value) => {
    const key = keyOf(model, value);
    if (key === null) throw new AdminError(msg('notFound'), 404);
    return key;
  };

  app.get('/assets/:file', { config: { adminAsset: true } }, async (request, reply) =>
    sendAsset(request, reply, request.params.file)
  );

  app.get('/', { config: { adminPage: true } }, async (request, reply) => {
    // The page asks for its API at api/: the address with its slash.
    if (!request.url.split('?')[0].endsWith('/')) return reply.redirect(`${request.url.split('?')[0]}/`);
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(page(title, uiOf(request, ui)));
  });

  if (logins) {
    const config = { adminLogin: true };
    // The login page: its form, with the CSRF token of the session (for apps whose sessions ask for it).
    app.get('/login', { config }, async (request, reply) => {
      if (await logins.current(request)) return reply.redirect('./');
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(loginPage(title, request.session.csrfToken(), uiOf(request, ui)));
    });
    app.post('/login', { config }, async (request, reply) => {
      try {
        const user = await logins.check(request, request.body || {});
        // A new session id once logged in: an id known before is worth nothing.
        // A new session id once logged in, tied to the user (so it can be logged out everywhere).
        if (typeof request.session.login === 'function') await request.session.login(user.id);
        else request.session.regenerate();
        request.session.set(logins.SESSION_KEY, user);
        return { ok: true, user: { name: user.name } };
      } catch (err) {
        if (!err.statusCode) throw err;
        if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
        return reply.code(err.statusCode).send({
          error: err.message,
          errors: {},
          ...(err.code ? { code: true } : {}),
          ...(err.recovery ? { recovery: true } : {}),
        });
      }
    });
    // Logging out: of this session; of every session of the user ({ everywhere: true }: every browser, process and
    // machine with the store of the sessions); or of the others ({ others: true }: this one goes on, with a new id and
    // CSRF token, which the answer gives).
    app.post('/logout', { config }, async (request, reply) => {
      const { session } = request;
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      if (!session || typeof session.destroy !== 'function') return { ok: true };
      if (body.everywhere || body.others) {
        if (typeof session.logoutEverywhere !== 'function') {
          return reply.code(501).send({ error: 'Logging out everywhere needs a newer @xufa/session', errors: {} });
        }
        if (!logins.userOf(request)) return reply.code(401).send({ error: msg('logInFirst'), errors: {}, login: true });
        if (body.others) {
          await session.logoutOthers();
          return { ok: true, csrf: session.csrfToken() };
        }
        await session.logoutEverywhere();
        return { ok: true };
      }
      session.destroy();
      return { ok: true };
    });
  }

  // The runs of pipelines (pipelines: a Pipelines of @xufa/queue), and the health of the app (xufa.health).
  if (pipelines) registerRuns(app, pipelines);
  // The schedules of a Scheduler of @xufa/scheduler (those that start runs of the pipelines too).
  if (scheduler) registerSchedules(app, scheduler, pipelines);
  // The jobs of a queue (queue: a Queue of @xufa/queue).
  if (queue) registerJobs(app, queue);
  // The jobs and runs together.
  if (queue || pipelines)
    registerWork(app, { queue, pipelines, can: (request, permission) => can(request, permission, null) });
  if (health) registerHealth(app);
  // The data model: the models as entities and relations.
  if (schema)
    registerSchema(app, {
      byName,
      schemaModels,
      tenants,
      appOf,
      designer,
      can: (request, permission) => can(request, permission, null),
    });
  // The sessions of the users (@xufa/session, with the login of the admin).
  const sessions = Boolean(logins && app.sessions && typeof app.sessions.list === 'function');
  if (sessions) registerSessions(app);
  // The account of the user (its password, authenticator app and recovery codes), with the login and its reload.
  const accountPage = Boolean(logins && logins.reloads);
  if (accountPage) registerAccount(app, logins, { issuer: title });

  app.get('/api/models', async (request) => {
    const anywhere = (permission) => can(request, permission, null);
    return {
      title,
      pageSizes: PAGE_SIZES,
      // The user logged in (with login), and the CSRF token of the session for the writes of the page.
      user: request.adminUser ? { name: request.adminUser.name } : null,
      csrf: request.session && typeof request.session.csrfToken === 'function' ? request.session.csrfToken() : null,
      // The tenants the user may choose, and the one of these models.
      tenants: tenants ? await tenantsFor(request) : null,
      tenant: request.adminTenant,
      // What the page shows besides the models: runs of pipelines, and the health of the app; and what it may do.
      runs: Boolean(pipelines) && anywhere('_runs.view'),
      schedules: Boolean(scheduler) && anywhere('_runs.view'),
      jobs: Boolean(queue) && anywhere('_jobs.view'),
      health: Boolean(health && app.health && typeof app.health.check === 'function') && anywhere('_health.view'),
      schema: schema && anywhere('_schema.view'),
      // The account of the user, and the sessions of the user (its own), and of others.
      account: accountPage && Boolean(request.adminUser),
      sessions:
        sessions && request.adminUser
          ? { others: anywhere('_sessions.view'), end: anywhere('_sessions.change') }
          : null,
      actions: {
        runs: { change: anywhere('_runs.change') },
        jobs: { change: anywhere('_jobs.change'), delete: anywhere('_jobs.delete') },
      },
      models: await Promise.all(
        [...byName.values()]
          .filter(({ model }) => can(request, `${model.name}.view`))
          .map(async ({ model, description }) => ({
            ...description,
            related: description.related.filter((relation) => can(request, `${relation.model}.view`)),
            actions: description.actions.filter((action) => can(request, action.permission)),
            can: {
              add: !description.readOnlyModel && can(request, `${model.name}.add`),
              change: !description.readOnlyModel && can(request, `${model.name}.change`),
              delete: !description.readOnlyModel && can(request, `${model.name}.delete`),
            },
            count: await within(request, model.objects.all(), `${model.name}.view`).count(),
            // Its history (the audit log of its database).
            history: Boolean(auditOf(model)),
          }))
      ),
    };
  });

  // What the pickers of permissions and roles offer (the fields of widget permissions or roles: those of users and
  // groups of @xufa/auth): every permission of the models (Django's, Meta.permissions), a model's all (Book.*), all
  // (*, *.view), those of the jobs, runs, health and sessions the admin has; and the roles of the rbac (code and groups).
  app.get('/api/_permissions', async () => {
    const permissions = [
      { name: '*', kind: 'all' },
      { name: '*.view', kind: 'viewAll' },
    ];
    for (const { model, description } of byName.values()) {
      permissions.push({ name: `${model.name}.*`, kind: 'model', model: description.label });
      for (const permission of model.meta.permissions) {
        permissions.push({ name: permission.name, kind: 'one', model: description.label, label: permission.label });
      }
    }
    const areas = [
      [Boolean(pipelines || scheduler), ['_runs.view', '_runs.change']],
      [Boolean(queue), ['_jobs.view', '_jobs.change', '_jobs.delete']],
      [Boolean(health && app.health && typeof app.health.check === 'function'), ['_health.view']],
      [schema, ['_schema.view']],
      [schema && Boolean(designer), ['_schema.change']],
      [sessions, ['_sessions.view', '_sessions.change']],
    ];
    for (const [shown, names] of areas) if (shown) names.forEach((name) => permissions.push({ name, kind: 'area' }));
    if (rbac && typeof rbac.fresh === 'function') await rbac.fresh();
    const roles = rbac && rbac.roles instanceof Map ? [...rbac.roles.keys()].sort() : [];
    return { permissions, roles };
  });

  app.get('/api/:model', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      need(request, `${model.name}.view`);
      const query = request.query || {};
      let qs = within(request, objectsOf(entry), `${model.name}.view`);
      const search = typeof query.search === 'string' ? query.search.trim() : '';
      if (search && description.search.length) {
        const { Q } = ormModule;
        // Each word in one of the fields (as Django's admin): "ada notes" finds the notes of Ada; "quoted words" are
        // one.
        const words = [...search.matchAll(/"([^"]+)"|(\S+)/g)].map((match) => match[1] || match[2]).filter(Boolean);
        for (const word of words.slice(0, 10)) {
          qs = qs.filter(
            Q.from(
              'or',
              description.search.map((name) => ({ [searchLookup(name)]: word }))
            )
          );
        }
      }
      for (const name of description.filters) {
        const raw = query[`filter.${name}`];
        if (raw === undefined || raw === '') continue;
        const field = description.fields.find((item) => item.name === name);
        if (raw === 'null') qs = qs.filter({ [`${field.attname}__isnull`]: true });
        else if (field.type === 'boolean') qs = qs.filter({ [field.attname]: raw === 'true' });
        else if (field.type === 'foreignKey') {
          const key = keyOf(model.meta.field(name).target, raw);
          if (key === null) throw new AdminError(msg('badKey', { model: field.target, value: raw }));
          qs = qs.filter({ [field.attname]: key });
        } else qs = qs.filter({ [field.attname]: raw });
      }
      if (query.order) {
        const name = String(query.order).replace(/^-/, '');
        const sortable =
          description.fields.some((field) => field.name === name && field.type !== 'manyToMany') ||
          description.columns.some((column) => column.name === name && column.sortable);
        if (!sortable) throw new AdminError(msg('badOrder', { field: name }));
        qs = qs.orderBy(String(query.order), ...(description.pk && name !== description.pk ? [description.pk] : []));
      }
      const size = PAGE_SIZES.includes(Number(query.size)) ? Number(query.size) : pageSize;
      const pageNumber = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const count = await qs.count();
      const related = selectsOf(description);
      let rows = qs.slice((pageNumber - 1) * size, pageNumber * size);
      if (related.length) rows = rows.selectRelated(...related);
      const objects = await rows;
      const results = [];
      for (const object of objects) results.push(await serialize(model, description, object, { rows: true }));
      return { count, page: pageNumber, size, results };
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
          .flatMap(({ model }) => [
            ...model.meta.fields.filter((field) => field.type === 'foreignKey').map((field) => field.target),
            ...(model.meta.manyToMany || []).map((field) => field.target),
          ])
          .find((model) => model.name === request.params.model);
      if (!target) throw new AdminError(msg('noModel', { model: request.params.model }), 404);
      // The choices of a foreign key: for those who may view its model, or add or change a model that points to it.
      const pointing = [...byName.values()].filter(
        ({ model }) =>
          model.meta.fields.some((field) => field.type === 'foreignKey' && field.target === target) ||
          (model.meta.manyToMany || []).some((field) => field.target === target)
      );
      const allowed =
        can(request, `${target.name}.view`) ||
        pointing.some(({ model }) => can(request, `${model.name}.add`) || can(request, `${model.name}.change`));
      if (!allowed) throw new AdminError(msg('forbidden', { permission: `${target.name}.view` }), 403);
      // The objects one may view (its rules), for those who may view the model; all of them for those who choose one
      // for a model they add or change.
      let qs = can(request, `${target.name}.view`)
        ? within(request, target.objects.all(), `${target.name}.view`)
        : target.objects;
      const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
      const text = target.meta.fields.find((field) => field.type === 'string' && !field.primaryKey);
      if (search && text) qs = qs.filter({ [`${text.attname}__icontains`]: search });
      // ?pk=: the label of one (a value given without it, as Add Book from an author gives).
      if (request.query.pk !== undefined) {
        const key = keyOf(target, request.query.pk);
        if (key === null) return [];
        qs = qs.filter({ pk: key });
      }
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
      need(request, `${model.name}.view`);
      const fks = description.fields.filter((field) => field.type === 'foreignKey').map((field) => field.name);
      let qs = within(request, objectsOf(entry), `${model.name}.view`).filter({ pk: pkOf(entry, request.params.pk) });
      if (fks.length) qs = qs.selectRelated(...fks);
      const object = await qs.get();
      const answer = await serialize(model, description, object, { detail: true });
      // What the user may do with this object (its rules: an editor changes its own books only).
      const mayOn = async (action) =>
        !description.readOnlyModel &&
        can(request, `${model.name}.${action}`) &&
        (await within(request, objectsOf(entry), `${model.name}.${action}`).filter({ pk: object.pk }).exists());
      answer.can = { change: await mayOn('change'), delete: await mayOn('delete') };
      return answer;
    } catch (err) {
      return answerError(err, reply);
    }
  });

  // The objects of a relation of an object (the books of an author), in pages: those of the related model of the admin
  // that point to it.
  app.get('/api/:model/:pk/related/:relation', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      need(request, `${entry.model.name}.view`);
      const relation = entry.description.related.find((item) => item.name === request.params.relation);
      if (!relation)
        throw new AdminError(msg('noRelation', { model: entry.model.name, relation: request.params.relation }), 404);
      const other = entryOf(relation.model);
      need(request, `${other.model.name}.view`);
      const key = pkOf(entry, request.params.pk);
      await within(request, objectsOf(entry), `${entry.model.name}.view`).get({ pk: key });
      const query = request.query || {};
      const size = PAGE_SIZES.includes(Number(query.size)) ? Number(query.size) : 10;
      const pageNumber = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const qs = within(request, objectsOf(other), `${other.model.name}.view`).filter({ [relation.attname]: key });
      const count = await qs.count();
      const fks = selectsOf(other.description);
      let rows = qs.orderBy(...(other.description.ordering.length ? other.description.ordering : ['-pk']));
      rows = rows.slice((pageNumber - 1) * size, pageNumber * size);
      if (fks.length) rows = rows.selectRelated(...fks);
      const objects = await rows;
      return {
        count,
        page: pageNumber,
        size,
        model: other.model.name,
        field: relation.field,
        results: await Promise.all(
          objects.map((object) => serialize(other.model, other.description, object, { rows: true }))
        ),
      };
    } catch (err) {
      return answerError(err, reply);
    }
  });

  // The history of an object (Django's history of the admin): the entries of the audit log, newest first.
  app.get('/api/:model/:pk/history', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      need(request, `${model.name}.view`);
      const audit = auditOf(model);
      if (!audit) throw new AdminError(msg('noHistory', { model: model.name }), 404);
      const object = await within(request, objectsOf(entry), `${model.name}.view`).get({
        pk: pkOf(entry, request.params.pk),
      });
      const entries = await audit.history(object);
      return {
        results: entries
          .reverse()
          .slice(0, 200)
          .map((item) => historyEntry(item, description)),
      };
    } catch (err) {
      return answerError(err, reply);
    }
  });

  // The recent actions (Django's of the dashboard): the last entries of the audit logs of the models the user may
  // view, newest first, with the label of each object still there.
  app.get('/api/_activity', async (request) => {
    const size = Math.min(Math.max(Number.parseInt(request.query.size, 10) || 15, 1), 100);
    const { AuditEntry } = ormModule;
    const byAudit = new Map();
    for (const { model } of byName.values()) {
      if (!can(request, `${model.name}.view`)) continue;
      const audit = auditOf(model);
      if (!audit) continue;
      if (!byAudit.has(audit)) byAudit.set(audit, []);
      byAudit.get(audit).push(model.name);
    }
    const found = [];
    for (const [audit, names] of byAudit) {
      const rows = await AuditEntry.objects
        .using(audit.db)
        .filter({ model__in: names })
        .orderBy('-at', '-id')
        .limit(size);
      found.push(...rows);
    }
    found.sort((a, b) => new Date(b.at) - new Date(a.at));
    const results = [];
    for (const item of found) {
      if (results.length >= size) break;
      const known = byName.get(item.model);
      const shown = historyEntry(item, known && known.description);
      shown.label = null;
      // With object rules, only the entries of the objects one may view (deleted ones cannot be asked: left out).
      const scope =
        rbac && known
          ? rbac.scopeOf(
              request.adminAccess,
              request.adminUser || request.user || null,
              `${known.model.name}.view`,
              request.adminTenant
            )
          : null;
      if (known && item.key !== null && (item.action !== 'delete' || scope !== null)) {
        let object = null;
        try {
          object = await within(request, objectsOf(known), `${known.model.name}.view`)
            .filter({ pk: pkOf(known, item.key) })
            .first();
        } catch {
          // A key the model cannot take: no label.
        }
        if (object) shown.label = labelOf(known.model, object);
        else if (scope !== null) continue;
      }
      results.push(shown);
    }
    return { results };
  });

  // The plans of the rows of an editable inline: [{ kind: save | delete, object }], and the errors by row (each checked
  // by the model). key: the object they are of (null for one being created: the field that points to it is not
  // checked, it is set when it is saved).
  async function planInline(request, relation, other, key, rows) {
    if (!Array.isArray(rows) || rows.length > ACTION_LIMIT) throw new AdminError(msg('body'));
    const allowed = new Set(relation.fields);
    const description = {
      ...other.description,
      layout: null,
      fields: other.description.fields.filter((field) => allowed.has(field.name)),
    };
    const plans = [];
    const errors = {};
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      let object;
      if (row.pk !== undefined && row.pk !== null) {
        if (key === null) throw new AdminError(msg('body'));
        const permission = `${other.model.name}.${row.delete ? 'delete' : 'change'}`;
        object = await within(request, objectsOf(other), permission).get({
          pk: pkOf(other, row.pk),
          [relation.attname]: key,
        });
        if (row.delete) {
          need(request, `${other.model.name}.delete`);
          plans.push({ kind: 'delete', object });
          continue;
        }
        need(request, `${other.model.name}.change`);
        Object.assign(object, valuesOf(description, row.values || {}));
      } else {
        if (row.delete) continue;
        need(request, `${other.model.name}.add`);
        object = new other.model({ ...valuesOf(description, row.values || {}), [relation.attname]: key });
      }
      try {
        object.validate();
        plans.push({ kind: 'save', object });
      } catch (err) {
        if (err.code !== 'XUFA_ORM_ERR_VALIDATION') throw err;
        const found = { ...(err.errors || {}) };
        // The object being created has no key yet: the field that points to it is set when it is saved.
        if (key === null) {
          delete found[relation.field];
          delete found[relation.attname];
        }
        if (Object.keys(found).length) errors[index] = found;
        else plans.push({ kind: 'save', object });
      }
    }
    return { plans, errors };
  }

  async function runPlans(plans, key) {
    for (const plan of plans) {
      if (plan.kind === 'delete') await plan.object.delete();
      else {
        if (key !== undefined) plan.object[plan.attname] = key;
        await plan.object.save();
      }
    }
  }

  // The rows of an editable inline (Django's TabularInline), saved at once: POST { rows: [{ pk, values, delete }] }.
  // Every row is checked first (400 with errors by row: { errors: { [index]: { field: [messages] } } }), then they are
  // created, changed and deleted in a transaction.
  app.post('/api/:model/:pk/related/:relation', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const relation = entry.description.related.find((item) => item.name === request.params.relation);
      if (!relation || !relation.editable) {
        throw new AdminError(msg('noRelation', { model: entry.model.name, relation: request.params.relation }), 404);
      }
      const other = entryOf(relation.model);
      need(request, `${entry.model.name}.view`);
      const key = pkOf(entry, request.params.pk);
      await within(request, objectsOf(entry), `${entry.model.name}.view`).get({ pk: key });
      const rows = request.body && request.body.rows;
      const { plans, errors } = await planInline(request, relation, other, key, rows);
      if (Object.keys(errors).length) return reply.code(400).send({ error: msg('validation'), errors });
      const db = other.model.db;
      await audited(request, other.model, () =>
        db && typeof db.transaction === 'function' ? db.transaction(() => runPlans(plans)) : runPlans(plans)
      );
      return {
        saved: plans.filter((plan) => plan.kind === 'save').length,
        deleted: plans.length - plans.filter((plan) => plan.kind === 'save').length,
      };
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.post('/api/:model', async (request, reply) => {
    try {
      const { model, description } = entryOf(request.params.model);
      if (description.readOnlyModel) throw new AdminError(msg('readOnly', { model: model.name }), 405);
      need(request, `${model.name}.add`);
      const values = valuesOf(description, request.body);
      const links = linksOf(model, description, request.body, { creating: true });
      // Its inlines, given as { relation: rows }: every row is checked before anything is saved.
      const given = request.body.inlines || {};
      if (typeof given !== 'object' || Array.isArray(given)) throw new AdminError(msg('body'));
      const inlines = [];
      const inlineErrors = {};
      for (const [name, rows] of Object.entries(given)) {
        const relation = description.related.find((item) => item.name === name && item.editable);
        if (!relation) throw new AdminError(msg('noRelation', { model: model.name, relation: name }), 404);
        const other = entryOf(relation.model);
        const { plans, errors } = await planInline(request, relation, other, null, rows);
        for (const plan of plans) plan.attname = relation.attname;
        if (Object.keys(errors).length) inlineErrors[name] = errors;
        inlines.push(plans);
      }
      if (Object.keys(inlineErrors).length) {
        // The errors of the object too, when it has them.
        let own = {};
        try {
          new model(values).validate(); // eslint-disable-line new-cap
        } catch (err) {
          if (err.code !== 'XUFA_ORM_ERR_VALIDATION') throw err;
          own = err.errors || {};
        }
        return reply.code(400).send({ error: msg('validation'), errors: own, inlines: inlineErrors });
      }
      // The rules of the user for adding (the where of its roles for Model.add): the new object meets them, or it is
      // not kept (Django's has_add_permission, of the values).
      const permission = `${model.name}.add`;
      const ruled =
        Boolean(rbac) &&
        rbac.scopeOf(
          request.adminAccess,
          request.adminUser || request.user || null,
          permission,
          request.adminTenant
        ) !== null;
      const create = async () => {
        const made = await model.objects.create(values);
        await setLinks(made, links);
        for (const plans of inlines) await runPlans(plans, made.pk);
        if (
          ruled &&
          !(await within(request, objectsOf(entryOf(model.name)), permission)
            .filter({ pk: made.pk })
            .exists())
        ) {
          throw new AdminError(msg('forbidden', { permission }), 403);
        }
        return made;
      };
      const db = model.db;
      const object = await audited(request, model, () =>
        (inlines.length || ruled) && db && typeof db.transaction === 'function' ? db.transaction(create) : create()
      );
      reply.code(201);
      return serialize(model, description, object, { detail: true });
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.patch('/api/:model/:pk', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      if (description.readOnlyModel) throw new AdminError(msg('readOnly', { model: model.name }), 405);
      need(request, `${model.name}.change`);
      const object = await within(request, objectsOf(entry), `${model.name}.change`).get({
        pk: pkOf(entry, request.params.pk),
      });
      Object.assign(object, valuesOf(description, request.body));
      const links = linksOf(model, description, request.body, { creating: false });
      await audited(request, model, async () => {
        await object.save();
        await setLinks(object, links);
      });
      return serialize(model, description, object, { detail: true });
    } catch (err) {
      return answerError(err, reply);
    }
  });

  // An action of a model on the objects selected: POST { pks }; answers { message, count }.
  app.post('/api/:model/actions/:action', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model } = entry;
      const action = entry.actions.get(request.params.action);
      if (!action) throw new AdminError(msg('noAction', { model: model.name, action: request.params.action }), 404);
      need(request, action.permission);
      const pks = request.body && request.body.pks;
      if (!Array.isArray(pks) || !pks.length || pks.some((pk) => typeof pk !== 'string' && typeof pk !== 'number')) {
        throw new AdminError(msg('actionPks'));
      }
      if (pks.length > ACTION_LIMIT) throw new AdminError(msg('actionLimit', { limit: ACTION_LIMIT }));
      // Keys that cannot be ones are of no object.
      const keys = pks.map((pk) => keyOf(model, pk)).filter((key) => key !== null);
      const objects = within(request, objectsOf(entry), action.permission).filter({ pk__in: keys });
      const count = await objects.count();
      const answer = await audited(request, model, () =>
        action.run(objects, {
          request,
          user: request.adminUser || request.user || null,
          tenant: request.adminTenant,
          pks,
          model,
        })
      );
      const changed = typeof answer === 'number' ? answer : count;
      const message =
        typeof answer === 'string'
          ? answer
          : answer && typeof answer.message === 'string'
            ? answer.message
            : `${action.label}: ${changed} ${changed === 1 ? 'object' : 'objects'}`;
      return { message, count: changed };
    } catch (err) {
      return answerError(err, reply);
    }
  });

  app.delete('/api/:model/:pk', async (request, reply) => {
    try {
      const entry = entryOf(request.params.model);
      const { model, description } = entry;
      if (description.readOnlyModel) throw new AdminError(msg('readOnly', { model: model.name }), 405);
      need(request, `${model.name}.delete`);
      const object = await within(request, objectsOf(entry), `${model.name}.delete`).get({
        pk: pkOf(entry, request.params.pk),
      });
      await audited(request, model, () => object.delete());
      return reply.code(204).send();
    } catch (err) {
      return answerError(err, reply);
    }
  });
}

adminPlugin[Symbol.for('fastify.display-name')] = '@xufa/admin';
adminPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/admin' };

export { adminPlugin, AdminError, configure, HEADER, TENANT_HEADER };
