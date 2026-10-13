// The routes of the books of a RuleStore, for @xufa/http (and fastify): list, versions, download (.xlsx, JSON), upload
// of a new version (tested first), tests, runs of tables and the active version. app.rules is the store.
//
//   app.register(rulesPlugin, { store, prefix: '/api/rules', onRequest: app.auth.guard('rules.change') });
//
// Uploads are the bytes of a .xlsx (Content-Type of xlsx or application/octet-stream) or the JSON of a book
// (application/json: an array of tables). tenantOf(request) gives the tenant of a request's books.
import { RulesError } from './values.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STATUS = { XUFA_RULES_ERR_NOT_FOUND: 404, XUFA_RULES_ERR_TESTS: 422, XUFA_RULES_ERR_BREAKS: 409 };
const flag = (value) => value === true || value === 'true' || value === '1';

function rulesPlugin(app, options, done) {
  const {
    store,
    prefix = '/rules',
    onRequest,
    tenantOf = () => undefined,
    bodyLimit = 20 * 1024 * 1024,
  } = options || {};
  if (!store || typeof store.save !== 'function') {
    done(new RulesError('The plugin of @xufa/rules takes { store }: a RuleStore'));
    return;
  }
  app.decorate('rules', store);

  const answer = (reply, err) => {
    if (!(err instanceof RulesError)) throw err;
    const status = STATUS[err.code] ?? 400;
    return reply
      .code(status)
      .send({ error: err.code, message: err.message, ...(err.errors ? { errors: err.errors } : {}) });
  };
  const route = (handler) => async (request, reply) => {
    try {
      return await handler(request, reply, tenantOf(request) ?? undefined);
    } catch (err) {
      return answer(reply, err);
    }
  };
  const version = (request) => (request.query?.version === undefined ? undefined : Number(request.query.version));

  app.register(
    async (scope) => {
      scope.addContentTypeParser(
        [XLSX, 'application/octet-stream'],
        { parseAs: 'buffer', bodyLimit },
        (request, body, next) => next(null, body)
      );
      const opts = { ...(onRequest ? { onRequest } : {}), bodyLimit };

      scope.get(
        '/',
        opts,
        route((request, reply, tenant) => store.list({ tenant }))
      );

      // The versions of a book, and its tables (name, kind, parameters) of the active one (or ?version).
      scope.get(
        '/:name',
        opts,
        route(async (request, reply, tenant) => {
          const { name } = request.params;
          const versions = await store.versions(name, { tenant });
          if (!versions.length) throw new RulesError(`No book ${name}`, 'XUFA_RULES_ERR_NOT_FOUND');
          const active = versions.find((item) => item.status === 'active');
          const number = version(request) ?? active?.version ?? versions[0].version;
          const book = await store.book(name, { tenant, version: number });
          const tables = book.tables
            .filter((table) => table && !Array.isArray(table))
            .map((table) => ({
              name: table.name ?? null,
              kind: table.className.replace(/Table$/, ''),
              params: Array.isArray(table.params)
                ? table.params.map((param) =>
                    typeof param === 'string' ? { name: param } : { name: param.name, type: param.type }
                  )
                : undefined,
              position: table.position ?? null,
            }));
          return { name, tenant: tenant ?? null, version: number, active: active?.version ?? null, versions, tables };
        })
      );

      scope.get(
        '/:name/xlsx',
        opts,
        route(async (request, reply, tenant) => {
          const bytes = await store.xlsx(request.params.name, { tenant, version: version(request) });
          return reply
            .type(XLSX)
            .header('content-disposition', `attachment; filename="${encodeURIComponent(request.params.name)}.xlsx"`)
            .send(bytes);
        })
      );

      scope.get(
        '/:name/json',
        opts,
        route(async (request, reply, tenant) =>
          (await store.book(request.params.name, { tenant, version: version(request) })).toJSON()
        )
      );

      // A new version: ?activate=false keeps the active one, ?force=true keeps it even if its tests fail (or those of
      // the books that import it, with checkImporters; ?breaking=true: those only), ?comment.
      scope.post(
        '/:name',
        opts,
        route(async (request, reply, tenant) => {
          const { name } = request.params;
          const query = request.query || {};
          const user = request.user;
          const saved = await store.save(name, request.body, {
            tenant,
            activate: query.activate === undefined ? true : flag(query.activate),
            force: flag(query.force),
            breaking: flag(query.breaking),
            comment: query.comment,
            fileName: query.fileName,
            author: user ? String(user.username ?? user.email ?? user.id ?? '') || null : null,
          });
          return reply.code(201).send({ name, version: saved.version, errors: saved.errors });
        })
      );

      // The messages of the tests of a book sent (not kept), or of the active one.
      scope.post(
        '/:name/test',
        opts,
        route(async (request, reply, tenant) => {
          const book =
            request.body && (Buffer.isBuffer(request.body) || Array.isArray(request.body))
              ? store.bookOf(request.body)
              : await store.book(request.params.name, { tenant, version: version(request) });
          return { errors: await book.test({ checks: store.checks }) };
        })
      );

      // A table run: { args: [...] } in the body.
      scope.post(
        '/:name/run/:table',
        opts,
        route(async (request, reply, tenant) => {
          const args = Array.isArray(request.body?.args) ? request.body.args : [];
          const book = await store.book(request.params.name, { tenant, version: version(request) });
          return { result: book.call(request.params.table, ...args) };
        })
      );

      scope.put(
        '/:name/active',
        opts,
        route(async (request, reply, tenant) => ({
          version: await store.activate(request.params.name, Number(request.body?.version), {
            tenant,
            force: request.body?.force === true,
            breaking: request.body?.breaking === true,
          }),
        }))
      );

      scope.delete(
        '/:name',
        opts,
        route(async (request, reply, tenant) => ({ removed: await store.remove(request.params.name, { tenant }) }))
      );
    },
    { prefix }
  );
  done();
}

rulesPlugin[Symbol.for('skip-override')] = true;
rulesPlugin[Symbol.for('fastify.display-name')] = '@xufa/rules';
rulesPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/rules' };

export { rulesPlugin };
