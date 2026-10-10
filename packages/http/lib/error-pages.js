// Error pages, as Django's handler404, handler403, handler400 and handler500 with their templates (404.html...): a
// request of a browser (Accept: text/html) that fails gets the view of its status (of @xufa/template), with the
// status; the others go on to the error handlers under it (those of the app and of plugins, as the ORM's: JSON).
// Added with addErrorHandler: the app may still set its own error handler, which goes first.
//
//   app.register(xufa.errorPages, { views: { 404: '404', 403: '403', 500: '500' } });   // or views: 'errors' (errors/404)
//
// The context of a view: statusCode, message (not for 500s: their messages are for the logs), permission (of a 403
// of @xufa/auth) and error (4xx only). notFound (true): routes that are not there are 404s too. Errors of 500 are
// logged as fastify's handler does. A view that fails gives the error to the handlers under it.
import { STATUS_CODES } from 'node:http';

const wantsHtml = (request) => /text\/html/.test(request.headers.accept || '');

class NotFound extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFound';
    this.statusCode = 404;
    this.code = 'XUFA_ERR_NOT_FOUND';
  }
}

function errorPages(app, options, done) {
  const { views = {}, notFound = true, html = wantsHtml, context = null } = options || {};
  if (typeof app.addErrorHandler !== 'function') {
    done(new Error('errorPages needs @xufa/http (addErrorHandler)'));
    return;
  }
  // The view of a status: of the map, or of a folder (views: 'errors' gives errors/404, for 400, 403, 404 and 500);
  // 5xx without one of their own take that of 500. Statuses without a view go on (as JSON).
  const viewOf = (status) => {
    if (typeof views === 'string') return `${views}/${status >= 500 ? 500 : status}`;
    return views[status] || (status >= 500 && views[500]) || null;
  };
  const known = (status) =>
    typeof views === 'string' ? status >= 500 || [400, 403, 404].includes(status) : Boolean(viewOf(status));

  app.addErrorHandler(async function errorPage(error, request, reply) {
    const status = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    if (!html(request) || typeof reply.viewAsync !== 'function' || !known(status)) throw error;
    if (status >= 500) request.log.error({ req: request, res: reply, err: error }, error && error.message);
    const values = {
      statusCode: status,
      title: STATUS_CODES[status] || 'Error',
      message: status >= 500 ? STATUS_CODES[status] : error.message,
      permission: error.permission,
      error: status >= 500 ? null : error,
      ...(context ? context(error, request) : {}),
    };
    // Rendered first (viewAsync): a view that fails passes the error on, as it was.
    let body;
    try {
      body = await reply.viewAsync(viewOf(status), values);
    } catch {
      throw error;
    }
    return reply.code(status).type('text/html; charset=utf-8').send(body);
  });
  if (notFound) {
    app.setNotFoundHandler((request) => {
      throw new NotFound(`Route ${request.method}:${request.url} not found`);
    });
  }
  done();
}

errorPages[Symbol.for('skip-override')] = true;
errorPages[Symbol.for('fastify.display-name')] = 'errorPages';
errorPages[Symbol.for('plugin-meta')] = { name: 'errorPages' };

export { errorPages, NotFound };
