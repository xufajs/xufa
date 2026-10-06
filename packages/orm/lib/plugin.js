// The plugin of the ORM for @xufa/http (and fastify): it connects a database when the app starts (and applies its
// migrations, when asked), gives it as app.db, and closes it with the app. Validation errors of the models are
// answered with 400 and the messages of each field (errors), UniqueError with 409 and its fields; NotFoundError is 404 by
// its status code.
//
//   app.register(orm.plugin, { database: db, migrate: { dir: 'migrations' } });
//
// With `expire` (true, or { interval: '5m' }), the objects of TTL indexes that expired are deleted while the app runs.
//
// With `tenants` ({ tenants, resolve(request), required, authorize }), each request runs in its tenant (resolve gives its
// id: a header, the user...): the models use the database of the tenant. Requests without a tenant are answered with
// 400 when it is required (the default), and those of a tenant that does not exist with 404. authorize(request, id,
// reply) says whether the request may use the tenant, before it is entered (its database is not even looked up): false
// is answered with 403, and an error it throws as itself (401...). With @xufa/auth:
//   authorize: (request, id, reply) => app.auth.canUseTenant(request, id, reply)
// Without authorize, any request may use any tenant it names: a warning says so, unless authorize is false (a tenant
// taken from the user itself needs no check).
const { ValidationError, UniqueError } = require('./errors');
const { cancellation } = require('./context');

async function ormPlugin(app, options = {}) {
  const {
    database,
    connect = true,
    close = true,
    migrate,
    sync = false,
    errorHandler = true,
    tenants,
    expire,
    cancel = false,
  } = options;
  if (!database && !tenants) throw new TypeError('The orm plugin needs a database (or tenants)');
  if (database) {
    app.decorate('db', database);
    if (connect) await database.connect();
    if (migrate) await database.migrate(migrate);
    if (sync) await database.sync();
    // expire: true (every minute) or { interval }: the objects of TTL indexes that expired are deleted.
    if (expire) {
      database.startExpiry(expire === true ? {} : expire);
      app.addHook('onClose', async () => database.stopExpiry());
    }
    if (close) app.addHook('onClose', () => database.close());
  }
  if (tenants) {
    const { tenants: registry, resolve, required = true, authorize } = tenants;
    if (authorize !== undefined && authorize !== false && typeof authorize !== 'function') {
      throw new TypeError('tenants.authorize is a function (request, id, reply), or false');
    }
    if (authorize === undefined && app.log && typeof app.log.warn === 'function') {
      app.log.warn(
        'The orm plugin resolves tenants without tenants.authorize: any request may use any tenant it names ' +
          '(authorize: false when the tenant comes from the user)'
      );
    }
    app.decorate('tenants', registry);
    app.decorateRequest('tenant', null);
    const enter = (request, reply, done) => {
      // Entered now (before any await of the handler), so the handler and its queries run in the tenant.
      registry.enter(request.tenant).then(
        () => done(),
        () => reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `No tenant ${request.tenant}` })
      );
    };
    app.addHook('onRequest', (request, reply, done) => {
      const id = resolve(request);
      if (id === undefined || id === null || id === '') {
        if (required) reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No tenant' });
        else done();
        return;
      }
      request.tenant = String(id);
      if (!authorize) {
        enter(request, reply, done);
        return;
      }
      Promise.resolve()
        .then(() => authorize(request, request.tenant, reply))
        .then(
          (allowed) => {
            if (allowed) enter(request, reply, done);
            else {
              request.tenant = null;
              reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You cannot use this tenant' });
            }
          },
          (err) => {
            request.tenant = null;
            reply.send(err);
          }
        );
    });
    if (close) app.addHook('onClose', () => registry.close());
  }
  // cancel: the reads of a request stop when its client goes away (request.signal): those that have not started
  // throw, and PostgreSQL cancels the one that runs. Entered now (before any await), so the handler runs with it.
  if (cancel) {
    app.addHook('onRequest', (request, reply, done) => {
      cancellation.enterWith({ request });
      done();
    });
  }
  if (errorHandler) {
    app.setErrorHandler((err, request, reply) => {
      if (err instanceof ValidationError) {
        reply
          .code(400)
          .send({ statusCode: 400, code: err.code, error: 'Bad Request', message: err.message, errors: err.errors });
        return;
      }
      // Duplicates of unique fields: 409, with the fields.
      if (err instanceof UniqueError) {
        reply
          .code(409)
          .send({ statusCode: 409, code: err.code, error: 'Conflict', message: err.message, fields: err.fields });
        return;
      }
      // Other errors are answered as without the plugin.
      reply.send(err);
    });
  }
}

// As fastify-plugin does: the plugin decorates the app it is registered in (not an encapsulated child).
ormPlugin[Symbol.for('skip-override')] = true;
ormPlugin[Symbol.for('fastify.display-name')] = '@xufa/orm';
ormPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/orm' };

module.exports = { ormPlugin };
