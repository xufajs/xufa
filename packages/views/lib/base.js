// The base of the views of classes, as Django's django.views.generic.base: a View answers each method of HTTP with
// its method (get, post...), made once per request by the handler asView() gives; its settings are static fields of
// its class (Django's class attributes), and asView(options) changes them for one route.
//
//   class About extends TemplateView {
//     static templateName = 'about';
//   }
//   app.get('/about/', { name: 'about' }, About.asView());
//   app.route(BookCreate.asRoute('/catalog/book/create/', { name: 'book-create' }));

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

// Django's Http404: what is not there (the error handler of the app shows its page).
class Http404 extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'Http404';
    this.statusCode = 404;
    this.code = 'XUFA_VIEWS_ERR_NOT_FOUND';
  }
}

// What a view is not set up to do (Django's ImproperlyConfigured): a mistake of the code, a 500.
class ImproperlyConfigured extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImproperlyConfigured';
    this.code = 'XUFA_VIEWS_ERR_IMPROPERLY_CONFIGURED';
  }
}

// The static fields of a class and of those it extends (the nearest first wins): its settings.
function settingsOf(Class) {
  const settings = {};
  for (const [key, owner] of ownersOf(Class)) settings[key] = owner[key];
  return settings;
}

// Each setting of a class with the class that gives it (the nearest that has it), found once per class: a view is
// made at every request. The values are read when it is made, so a setting changed later is seen.
const owners = new WeakMap();
function ownersOf(Class) {
  let found = owners.get(Class);
  if (found === undefined) {
    const chain = [];
    for (let current = Class; current && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
      chain.unshift(current);
    }
    const byKey = new Map();
    // Static fields are enumerable, static methods are not.
    for (const current of chain) for (const key of Object.keys(current)) byKey.set(key, current);
    found = [...byKey];
    owners.set(Class, found);
  }
  return found;
}

// {name} in a text filled with the values of an object (Django's success_url = '/books/{id}/'); encoded for
// addresses unless encode is false.
function fill(text, values, encode = true) {
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    if (!values || values[name] === undefined || values[name] === null) return whole;
    return encode ? encodeURIComponent(String(values[name])) : String(values[name]);
  });
}

class View {
  // The methods it answers (those it has a method for).
  static httpMethodNames = HTTP_METHODS;
  // Only for users who logged in, or with these permissions (of @xufa/auth's accounts): login_required,
  // permission_required.
  static loginRequired = false;
  static permissionRequired = null;
  // More values for the context of its template (Django's extra_context).
  static extraContext = null;

  constructor(options = {}) {
    for (const [key, owner] of ownersOf(this.constructor)) {
      const value = owner[key];
      // A setting left null does not hide a method of that name (successUrl() instead of static successUrl).
      if ((value === null || value === undefined) && typeof this[key] === 'function') continue;
      this[key] = value;
    }
    for (const [key, value] of Object.entries(options)) {
      if (HTTP_METHODS.includes(key)) throw new TypeError(`${key} is a method of HTTP, not an option of a view`);
      if (!(key in this)) {
        throw new TypeError(`${this.constructor.name} has no setting ${key}: only those of the class can be given`);
      }
      this[key] = value;
    }
  }

  // The handler of a route: a view made for each request, then dispatch(). options: settings for this route.
  static asView(options = {}) {
    // Checks the options once, when the route is made.
    new this(options); // eslint-disable-line no-new
    const Class = this;
    const handler = async function view(request, reply) {
      return new Class(options).setup(request, reply).dispatch();
    };
    handler.viewClass = Class;
    handler.viewOptions = options;
    return handler;
  }

  // The methods of HTTP of a route of it: those it answers (HEAD comes with GET).
  static get methods() {
    return this.httpMethodNames
      .filter((name) => name !== 'head' && name !== 'options' && typeof this.prototype[name] === 'function')
      .map((name) => name.toUpperCase());
  }

  // A route of @xufa/http: app.route(BookList.asRoute('/catalog/books/', { name: 'books' })).
  static asRoute(url, routeOptions = {}, options = {}) {
    return { method: this.methods, ...routeOptions, url, handler: this.asView(options) };
  }

  setup(request, reply) {
    this.request = request;
    this.reply = reply;
    this.params = request.params || {};
    this.query = request.query || {};
    return this;
  }

  // Who may come (login and permissions), then the method of the request (HEAD as GET).
  async dispatch() {
    if (await this.checkAccess()) return this.reply;
    let name = this.request.method.toLowerCase();
    if (name === 'head' && typeof this.head !== 'function') name = 'get';
    if (!this.httpMethodNames.includes(name) || typeof this[name] !== 'function') return this.httpMethodNotAllowed();
    return this[name]();
  }

  // The guards of accounts: true when they answered (to the login), a 403 thrown without the permission.
  async checkAccess() {
    const permissions = [].concat(this.permissionRequired || []);
    if (!this.loginRequired && !permissions.length) return false;
    const { accounts } = this.request.server;
    if (!accounts)
      throw new ImproperlyConfigured('loginRequired and permissionRequired need the accounts of @xufa/auth');
    const guard = permissions.length ? accounts.permissionRequired(...permissions) : accounts.loginRequired;
    await guard(this.request, this.reply);
    return this.reply.sent;
  }

  httpMethodNotAllowed() {
    const allowed = this.constructor.methods;
    return this.reply
      .code(405)
      .header('allow', allowed.join(', '))
      .send({ error: 'Method Not Allowed', statusCode: 405 });
  }

  options() {
    return this.reply.code(200).header('allow', this.constructor.methods.join(', ')).send();
  }

  // The address of a named route (app.reverse).
  reverse(name, params, options) {
    return this.request.server.reverse(name, params, options);
  }

  redirect(url, code) {
    return code ? this.reply.redirect(url, code) : this.reply.redirect(url);
  }

  // The context of its template: the view, its extraContext, and what is given.
  async getContextData(context = {}) {
    return { view: this, ...(this.extraContext || {}), ...context };
  }
}

// The settings every view of an app takes when its own are not given (app.viewDefaults, of the plugin of
// @xufa/views or of a project): baseTemplate, paginateBy.
function defaultsOf(request) {
  return (request && request.server && request.server.viewDefaults) || {};
}

// Django's TemplateResponseMixin: renders a template of @xufa/template with a context.
class TemplateView extends View {
  static templateName = null;
  // The template the built-in ones extend ({{extends baseTemplate}}, with a block content): the app's default, else
  // 'base'.
  static baseTemplate = null;
  // The title of the page (title in the context): a text with {field} of the object, or getTitle().
  static title = null;

  getTemplateNames() {
    if (!this.templateName) throw new ImproperlyConfigured(`${this.constructor.name} has no templateName`);
    return [this.templateName];
  }

  getTitle() {
    if (this.title === null || this.title === undefined) return undefined;
    return typeof this.title === 'function' ? this.title(this) : fill(this.title, this.object, false);
  }

  async getContextData(context = {}) {
    const values = await super.getContextData(context);
    const defaults = { baseTemplate: this.baseTemplate || defaultsOf(this.request).baseTemplate || 'base' };
    const title = this.getTitle();
    if (title !== undefined) defaults.title = title;
    return { ...defaults, ...values };
  }

  // The first of getTemplateNames() the app has (as Django's select_template); the last when none is found.
  async renderToResponse(context) {
    if (typeof this.reply.view !== 'function') {
      throw new ImproperlyConfigured('A view with a template needs the plugin of @xufa/template');
    }
    const names = this.getTemplateNames();
    const { hasView } = this.request.server;
    const name = typeof hasView === 'function' ? names.find((item) => hasView(item)) || names[0] : names[0];
    return this.reply.view(name, context);
  }

  // TemplateView: its template, with the parameters of the route in the context.
  async get() {
    return this.renderToResponse(await this.getContextData({ params: this.params }));
  }
}

// RedirectView: to url (with {param} of the route) or to a named route (patternName, with the parameters of this
// one); permanent: 301 (else 302); queryString: the query of the request goes too. No address: 410.
class RedirectView extends View {
  static url = null;
  static patternName = null;
  static permanent = false;
  static queryString = false;

  getRedirectUrl() {
    let url;
    if (this.url) url = fill(this.url, this.params);
    else if (this.patternName) url = this.reverse(this.patternName, this.params);
    else return null;
    const index = this.request.url.indexOf('?');
    if (this.queryString && index >= 0) url += (url.includes('?') ? '&' : '?') + this.request.url.slice(index + 1);
    return url;
  }

  get() {
    const url = this.getRedirectUrl();
    if (url === null) return this.reply.code(410).send();
    return this.redirect(url, this.permanent ? 301 : 302);
  }

  head() {
    return this.get();
  }

  post() {
    return this.get();
  }

  put() {
    return this.get();
  }

  patch() {
    return this.get();
  }

  delete() {
    return this.get();
  }
}

export { View, TemplateView, RedirectView, Http404, ImproperlyConfigured, settingsOf, fill, defaultsOf, HTTP_METHODS };
