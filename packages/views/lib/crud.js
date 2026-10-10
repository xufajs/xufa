// The five pages of a model, as the Django tutorial names them: crud(Book, { fields }) gives the routes of
//
//   books              /books/                  ListView
//   book-detail        /book/<int:pk>           DetailView
//   book-create        /book/create/            CreateView    Book.add
//   book-update        /book/<int:pk>/update/   UpdateView    Book.change
//   book-delete        /book/<int:pk>/delete/   DeleteView    Book.delete
//
// for app.route(). Each page takes the settings of its view (list: { paginateBy }, delete: { blockedText }), a view
// of its own (view: a class), selectRelated and prefetchRelated (its queryset), and path.
import { ListView, DetailView, CreateView, UpdateView, DeleteView, addressOf } from './models.js';

const PAGES = ['list', 'detail', 'create', 'update', 'delete'];
const CLASSES = { list: ListView, detail: DetailView, create: CreateView, update: UpdateView, delete: DeleteView };
const ACTIONS = { create: 'add', update: 'change', delete: 'delete' };

// The converter of the key of a model in a path: <int:pk>, <uuid:pk>, else <str:pk>.
function converterOf(Model) {
  const { pk } = Model.meta;
  const type = pk && pk.constructor ? pk.constructor.name : '';
  if (/^(Id|Integer|BigInteger|SmallInteger|PositiveInteger)Field$/.test(type)) return 'int';
  if (type === 'UuidField') return 'uuid';
  return 'str';
}

const join = (prefix, path) => `${prefix.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

function crud(Model, options = {}) {
  if (!Model || !Model.meta) throw new TypeError('crud(Model, options): Model is a model of @xufa/orm');
  const {
    fields = null,
    name = Model.name.toLowerCase(),
    plural = `${name}s`,
    prefix = '',
    templateDir = null,
    // true: Model.add, .change and .delete for create, update and delete; false: none; or { create: 'perm' ... }.
    permissions = true,
    only = PAGES,
    ...pages
  } = options;
  for (const key of Object.keys(pages)) {
    if (!PAGES.includes(key))
      throw new TypeError(`crud(${Model.name}): ${key} is no option (pages: ${PAGES.join(', ')})`);
  }
  const pk = `<${converterOf(Model)}:pk>`;
  const names = {
    list: plural,
    detail: `${name}-detail`,
    create: `${name}-create`,
    update: `${name}-update`,
    delete: `${name}-delete`,
  };
  const paths = {
    list: `${plural}/`,
    detail: `${name}/${pk}`,
    create: `${name}/create/`,
    update: `${name}/${pk}/update/`,
    delete: `${name}/${pk}/delete/`,
  };
  const routes = [];
  for (const page of PAGES) {
    if (!only.includes(page)) continue;
    const {
      view: Class = CLASSES[page],
      path = paths[page],
      selectRelated,
      prefetchRelated,
      ...settings
    } = pages[page] || {};
    const viewOptions = { model: Model, ...(templateDir ? { templateDir } : {}) };
    if (selectRelated || prefetchRelated) {
      let queryset = Model.objects.all();
      if (selectRelated) queryset = queryset.selectRelated(...[].concat(selectRelated));
      if (prefetchRelated) queryset = queryset.prefetchRelated(...[].concat(prefetchRelated));
      viewOptions.queryset = queryset;
    }
    if (fields && (page === 'create' || page === 'update') && !settings.formClass) viewOptions.fields = fields;
    if (ACTIONS[page] && permissions) {
      const given = permissions === true ? undefined : permissions[page];
      if (given !== false) viewOptions.permissionRequired = given || `${Model.name}.${ACTIONS[page]}`;
    }
    if (page === 'create' || page === 'update') {
      viewOptions.successUrl = (view) =>
        addressOf(view.request.server, view.object) || view.reverse(names.detail, { pk: view.object.pk });
    }
    if (page === 'delete' && only.includes('list')) viewOptions.successUrl = (view) => view.reverse(names.list);
    routes.push(Class.asRoute(join(prefix, path), { name: names[page] }, { ...viewOptions, ...settings }));
  }
  return routes;
}

crud.PAGES = PAGES;

export { crud, converterOf, PAGES };
