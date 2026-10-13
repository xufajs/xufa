// The books of rules of a RuleStore of @xufa/rules in the admin: the list, the versions of a book, its sheets to edit
// (and inspected as they change: their tables and the messages of their tests), new versions (edited sheets, or a
// workbook uploaded), tries of tables (and rows of tests written of them), downloads, the active version, and books
// removed. Under api/_rules (_rules.view, _rules.change, _rules.delete). The books are of the tenant chosen in the page
// (with tenants), when the user may use it.
import { message as msg } from './messages.js';

// The largest workbook taken (base64 in JSON: a third more).
const BODY_LIMIT = 30 * 1024 * 1024;
const BENCHMARK_MS = 300;

function registerRules(app, store, { tenantOf = () => null } = {}) {
  if (!store || typeof store.save !== 'function' || typeof store.sheets !== 'function') {
    throw new TypeError('rules of the admin is a RuleStore of @xufa/rules');
  }
  const failure = (reply, err) => {
    const status =
      err.code === 'XUFA_RULES_ERR_NOT_FOUND'
        ? 404
        : err.code === 'XUFA_RULES_ERR_TESTS'
          ? 422
          : err.code === 'XUFA_RULES_ERR_BREAKS'
            ? 409
            : err.name === 'RulesError' || err.code?.startsWith?.('XUFA_RULES_ERR')
              ? 400
              : 500;
    return reply.code(status).send({ error: String(err.message || err), errors: {}, messages: err.errors || [] });
  };
  const route = (handler) => async (request, reply) => {
    try {
      return await handler(request, reply, tenantOf(request) || undefined);
    } catch (err) {
      return failure(reply, err);
    }
  };
  const versionOf = (request) => (request.query?.version ? Number(request.query.version) : undefined);
  const authorOf = (request) => {
    const user = request.adminUser || request.user;
    return user ? String(user.username ?? user.email ?? user.id ?? '') || null : null;
  };
  // The book of a body: { sheets }, or { xlsx } (base64 of a workbook).
  const inputOf = (body) => {
    if (body && Array.isArray(body.sheets)) return { sheets: body.sheets };
    if (body && typeof body.xlsx === 'string') return Buffer.from(body.xlsx, 'base64');
    const error = new Error(msg('rulesBody'));
    error.name = 'RulesError';
    throw error;
  };

  app.get(
    '/api/_rules',
    route(async (request, reply, tenant) => ({ results: await store.list({ tenant: tenant ?? null }) }))
  );

  // A book: its versions, the sheets of one (the active one, or ?version), and what they are (tables, messages).
  app.get(
    '/api/_rules/:name',
    route(async (request, reply, tenant) => {
      const { name } = request.params;
      const versions = await store.versions(name, { tenant });
      if (!versions.length) return reply.code(404).send({ error: msg('noRules', { name }), errors: {} });
      const active = versions.find((entry) => entry.status === 'active');
      const version = versionOf(request) ?? active?.version ?? versions[0].version;
      const { sheets } = await store.sheets(name, { tenant, version });
      const inspected = await store.inspect({ sheets }, { tenant, name });
      // (The books that import it: directly, or through others.)
      const importedBy = (await store.dependents(name, { tenant })).map((entry) => ({
        name: entry.name,
        direct: entry.direct,
      }));
      // (The checks of the store every book is subject to: tdz, a let or const of its Methods used before its
      // declaration an error; checkImporters, a version that breaks the books importing it not made active.)
      return {
        name,
        version,
        active: active ? active.version : null,
        versions,
        sheets,
        ...inspected,
        importedBy,
        tdz: Boolean(store.tdz),
        checkImporters: Boolean(store.checkImporters),
      };
    })
  );

  // What another version of a book would do to the books that import it: their tests run with it ({ version }: one
  // kept; { sheets }: those being saved), on copies. { results: [{ name, version, direct, errors }] }.
  app.post(
    '/api/_rules/:name/impact',
    { bodyLimit: BODY_LIMIT },
    route(async (request, reply, tenant) => {
      const { version, sheets } = request.body || {};
      const results = await store.impact(request.params.name, {
        tenant,
        ...(sheets ? { input: { sheets } } : { version: Number(version) }),
      });
      return { results };
    })
  );

  // What sheets being edited are: their tables and the messages of their tests (nothing kept).
  app.post(
    '/api/_rules/:name/inspect',
    { bodyLimit: BODY_LIMIT },
    route(async (request, reply, tenant) => store.inspect(inputOf(request.body), { tenant, name: request.params.name }))
  );

  // A new version: edited sheets ({ sheets }) or a workbook ({ xlsx: base64, fileName }); comment, activate, force.
  app.post(
    '/api/_rules/:name',
    { bodyLimit: BODY_LIMIT },
    route(async (request, reply, tenant) => {
      const body = request.body || {};
      const saved = await store.save(request.params.name, inputOf(body), {
        tenant,
        activate: body.activate !== false,
        force: body.force === true,
        breaking: body.breaking === true,
        comment: body.comment || null,
        fileName: body.fileName || null,
        author: authorOf(request),
      });
      return reply.code(201).send({ ok: true, version: saved.version, messages: saved.errors });
    })
  );

  // A table tried: { table, args, sheets? (those being edited), context? (the runtime context: currentDate, usState...,
  // for versions) }, of ?version or the active one. With the trace of the call: the tables it called, the cells that
  // gave each result.
  app.post(
    '/api/_rules/:name/try',
    { bodyLimit: BODY_LIMIT },
    route(async (request, reply, tenant) => {
      const { table, args = [], sheets, context, benchmark } = request.body || {};
      // (Sheets being edited: a book of them, linked to the books it imports, of the tenant.)
      const book = sheets
        ? await store.link(store.bookOf({ sheets }), { tenant, chain: [request.params.name] })
        : await store.book(request.params.name, { tenant, version: versionOf(request) });
      const list = Array.isArray(args) ? args : [args];
      const runtime = context && typeof context === 'object' ? context : undefined;
      const runner = runtime ? book.withContext(runtime) : book;
      const started = process.hrtime.bigint();
      const result = runner.call(table, ...list);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (benchmark === true) {
        // (Calls for BENCHMARK_MS at most: the admin's process is busy that long.)
        let runs = 0;
        const from = process.hrtime.bigint();
        const until = from + BigInt(BENCHMARK_MS * 1e6);
        let now = from;
        while (now < until && runs < 1e7) {
          runner.call(table, ...list);
          runs += 1;
          if (runs % 64 === 0 || runs < 64) now = process.hrtime.bigint();
        }
        now = process.hrtime.bigint();
        const perSecond = Math.round(runs / (Number(now - from) / 1e9));
        return { result: result === undefined ? null : result, ms, runs, perSecond };
      }
      return { result: result === undefined ? null : result, ms, trace: book.trace(table, list, runtime) ?? null };
    })
  );

  // A row of a Test table of a call as it goes now (written by the editor into the sheets): { table, args, context?,
  // sheets? }, of ?version or the active one.
  app.post(
    '/api/_rules/:name/test-case',
    { bodyLimit: BODY_LIMIT },
    route(async (request, reply, tenant) => {
      const { table, args = [], sheets, context } = request.body || {};
      // (Sheets being edited: a book of them, linked to the books it imports, of the tenant.)
      const book = sheets
        ? await store.link(store.bookOf({ sheets }), { tenant, chain: [request.params.name] })
        : await store.book(request.params.name, { tenant, version: versionOf(request) });
      const runtime = context && typeof context === 'object' ? context : undefined;
      const found = book.testCase(table, Array.isArray(args) ? args : [args], { context: runtime });
      return { title: found.title, names: found.names, titles: found.titles, cells: found.cells, error: found.error };
    })
  );

  app.get(
    '/api/_rules/:name/xlsx',
    route(async (request, reply, tenant) => {
      const bytes = await store.xlsx(request.params.name, { tenant, version: versionOf(request) });
      return reply
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${encodeURIComponent(request.params.name)}.xlsx"`)
        .send(bytes);
    })
  );

  app.put(
    '/api/_rules/:name/active',
    route(async (request, reply, tenant) => ({
      ok: true,
      version: await store.activate(request.params.name, Number(request.body?.version), {
        tenant,
        breaking: request.body?.breaking === true,
      }),
    }))
  );

  app.delete(
    '/api/_rules/:name',
    route(async (request, reply, tenant) => ({
      ok: true,
      removed: await store.remove(request.params.name, { tenant }),
    }))
  );
}

export { registerRules };
