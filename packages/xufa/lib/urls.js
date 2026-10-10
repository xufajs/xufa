// The urls.yaml of an app (or urls.yml, urls.json, urls.js): Django's urls.py as names and values. Views are those
// views.js exports (functions of (request, reply), or views of classes of @xufa/views), models those of the project.
//
//   # catalog/urls.yaml
//   prefix: /catalog
//   routes:
//     - { path: /, name: index, view: index }
//     - { path: mybooks/, name: my-borrowed, view: LoanedBooksByUser }
//     - { path: book/<uuid:pk>/renew/, name: renew-book, view: renewBook, methods: [GET, POST], permission: Book.renew }
//     - { path: about/, name: about, template: about }        # a TemplateView
//     - { path: home/, redirect: index }                      # a RedirectView to a named route (or an address)
//     - { crud: Book, fields: [title, author], list: { selectRelated: author } }   # the five pages of a model
//
// A route takes login: true or permission (one, or a list), and options: settings of its view of a class.
import fs from 'node:fs';
import path from 'node:path';
import * as viewsModule from '@xufa/views';

const FILES = ['urls.yaml', 'urls.yml', 'urls.json', 'urls.js'];
const ROUTE_KEYS = ['path', 'name', 'view', 'template', 'redirect', 'methods', 'login', 'permission', 'options'];

// The file of the urls of a folder, or null.
function urlsFile(dir) {
  return FILES.map((name) => path.join(dir, name)).find((file) => fs.existsSync(file)) || null;
}

const join = (prefix, address) => {
  const base = (prefix || '').replace(/\/+$/, '');
  const rest = String(address || '').replace(/^\/+/, '');
  return `${base}/${rest}`;
};

const isViewClass = (value) => typeof value === 'function' && typeof value.asRoute === 'function';

// The plugin of @xufa/http of the routes of a spec ({ prefix, routes }). views: what views.js exports; label: the
// app (the folder of its templates for crud); where: the file, for the errors.
function urlsPlugin(spec, { views = {}, label = null, where = 'urls' } = {}) {
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.routes)) {
    throw new TypeError(`${where}: { prefix, routes: [...] }`);
  }
  const { prefix = '', routes } = spec;
  const viewOf = (name, at) => {
    const found = views[name];
    if (found === undefined) throw new TypeError(`${where}: ${at}: views.js exports no ${name}`);
    return found;
  };

  return async function urls(app) {
    const generic = viewsModule;
    const project = app.project || null;
    const modelOf = (ref, at) => {
      if (typeof ref !== 'string') throw new TypeError(`${where}: ${at}: crud is the name of a model`);
      if (!project) throw new TypeError(`${where}: ${at}: crud needs the models of a project`);
      return project.model(ref);
    };
    // The guards of a function view (preHandler of the accounts of @xufa/auth).
    const guardsOf = (entry, at) => {
      const permissions = [].concat(entry.permission || []);
      if (!entry.login && !permissions.length) return {};
      if (!app.accounts) throw new TypeError(`${where}: ${at}: login and permission need the accounts of @xufa/auth`);
      return {
        preHandler: permissions.length ? app.accounts.permissionRequired(...permissions) : app.accounts.loginRequired,
      };
    };

    routes.forEach((entry, index) => {
      const at = `route ${index + 1}`;
      if (!entry || typeof entry !== 'object') throw new TypeError(`${where}: ${at} is an object`);
      if (entry.crud !== undefined) {
        const { crud: ref, templateDir = label, ...options } = entry;
        for (const page of generic.crud.PAGES) {
          const view = options[page] && options[page].view;
          if (typeof view === 'string') options[page] = { ...options[page], view: viewOf(view, at) };
        }
        const model = modelOf(ref, at);
        for (const route of generic.crud(model, { prefix, templateDir, ...options })) app.route(route);
        return;
      }
      for (const key of Object.keys(entry)) {
        if (!ROUTE_KEYS.includes(key)) throw new TypeError(`${where}: ${at}: ${key} is no key of a route`);
      }
      const url = join(prefix, entry.path);
      const routeOptions = entry.name ? { name: entry.name } : {};
      const settings = { ...(entry.options || {}) };
      if (entry.login) settings.loginRequired = true;
      if (entry.permission) settings.permissionRequired = entry.permission;
      if (entry.template) {
        app.route(generic.TemplateView.asRoute(url, routeOptions, { templateName: entry.template, ...settings }));
        return;
      }
      if (entry.redirect) {
        const target = String(entry.redirect);
        const options = target.startsWith('/') ? { url: target } : { patternName: target };
        app.route(generic.RedirectView.asRoute(url, routeOptions, { ...options, ...settings }));
        return;
      }
      if (typeof entry.view !== 'string')
        throw new TypeError(`${where}: ${at}: a route has view, template or redirect`);
      const view = viewOf(entry.view, at);
      if (isViewClass(view)) {
        app.route(view.asRoute(url, routeOptions, settings));
        return;
      }
      if (typeof view !== 'function') throw new TypeError(`${where}: ${at}: ${entry.view} is no view`);
      app.route({
        method: entry.methods ? [].concat(entry.methods).map((method) => String(method).toUpperCase()) : ['GET'],
        url,
        ...routeOptions,
        ...guardsOf(entry, at),
        handler: view,
      });
    });
  };
}

export { urlsFile, urlsPlugin, FILES };
