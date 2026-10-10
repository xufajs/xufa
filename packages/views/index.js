// @xufa/views: views of classes, as Django's generic views: View, TemplateView, RedirectView, and those of models of
// @xufa/orm (ListView, DetailView) and their forms of @xufa/forms (FormView, CreateView, UpdateView, DeleteView);
// crud(Model) gives the five pages of a model; templates is the folder of the built-in ones (xufa/list, xufa/detail,
// xufa/form, xufa/confirm_delete), for the roots of @xufa/template.
import path from 'node:path';
import { View, TemplateView, RedirectView, Http404, ImproperlyConfigured } from './lib/base.js';
import { crud } from './lib/crud.js';

const templates = path.join(import.meta.dirname, 'templates');

// The plugin: the defaults of the views of the app (app.viewDefaults): baseTemplate (the template the built-in ones
// extend, 'base') and paginateBy (of the lists that give none).
function plugin(app, options, done) {
  const { baseTemplate = 'base', paginateBy = null } = options || {};
  app.decorate('viewDefaults', { baseTemplate, paginateBy });
  done();
}
plugin[Symbol.for('skip-override')] = true;
plugin[Symbol.for('fastify.display-name')] = '@xufa/views';

export * from './lib/models.js';

export { View, TemplateView, RedirectView, Http404, ImproperlyConfigured, crud, plugin, templates };
