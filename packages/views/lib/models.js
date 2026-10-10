// The views of models (django.views.generic.detail, list and edit): ListView, DetailView, FormView, CreateView,
// UpdateView and DeleteView, over the QuerySets of @xufa/orm and the forms of @xufa/forms.
//
//   class BookList extends ListView {
//     static model = Book;
//     static paginateBy = 10;          // context: bookList, page, paginator, isPaginated (template book_list)
//   }
//   class BookUpdate extends UpdateView {
//     static model = Book;
//     static fields = ['title', 'author', 'summary', 'isbn', 'genre'];
//     static permissionRequired = 'Book.change';
//   }
import { TemplateView, Http404, ImproperlyConfigured, fill, defaultsOf } from './base.js';
import * as formsModule from '@xufa/forms';

// The name of a model in a context: BookInstance is bookInstance.
const nameOf = (model) => model.name.charAt(0).toLowerCase() + model.name.slice(1);
// Its names for people (meta.label: 'book instance'), and with a capital.
const labelOf = (model) => (model.meta && model.meta.label) || model.name;
const pluralOf = (model) => (model.meta && model.meta.labelPlural) || `${labelOf(model)}s`;
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const words = (name) => capital(name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());

// The address of an object: its absoluteUrl (or getAbsoluteUrl()), else the route <model>-detail of the app (that
// of crud), else null.
function addressOf(app, object) {
  if (!object) return null;
  if (typeof object.getAbsoluteUrl === 'function') return object.getAbsoluteUrl();
  if (object.absoluteUrl) return object.absoluteUrl;
  const name = `${object.constructor.name.toLowerCase()}-detail`;
  if (app && typeof app.routeNames === 'function' && Object.hasOwn(app.routeNames(), name)) {
    return app.reverse(name, { pk: object.pk });
  }
  return null;
}

// Django's get_object_or_404: the object of a QuerySet (or model) and conditions, else Http404. A key that the key of
// the model cannot be (not a uuid...) is not there either.
async function getObjectOr404(source, conditions) {
  const queryset = source && source.objects ? source.objects.all() : source;
  const { model } = queryset;
  if (conditions && Object.hasOwn(conditions, 'pk') && model.meta.pk && typeof model.meta.pk.toValue === 'function') {
    try {
      model.meta.pk.toValue(conditions.pk);
    } catch {
      throw new Http404(`No ${model.name} matches the given query.`);
    }
  }
  const object = await queryset.filter(conditions || {}).first();
  if (!object) throw new Http404(`No ${model.name} matches the given query.`);
  return object;
}

// Django's get_list_or_404: the objects, else Http404.
async function getListOr404(source, conditions) {
  const queryset = source && source.objects ? source.objects.all() : source;
  const list = await queryset.filter(conditions || {});
  if (!list.length) throw new Http404(`No ${queryset.model.name} matches the given query.`);
  return list;
}

// What views of models share: their model or QuerySet, and the name of their template (<model>_<suffix>, in
// templateDir; when the app has none, the built-in xufa/<genericTemplate> of the folder templates of this package).
const ModelViewMixin = (Base) =>
  class extends Base {
    static model = null;
    static queryset = null;
    static templateDir = null;
    static templateNameSuffix = '';
    static genericTemplate = null;

    // The model: model, else that of the queryset.
    getModel() {
      const model = this.model || (this.queryset && this.queryset.model);
      if (!model) throw new ImproperlyConfigured(`${this.constructor.name} has no model or queryset`);
      return model;
    }

    // A new QuerySet for each request (a QuerySet given is not run twice).
    getQueryset() {
      if (this.queryset) return this.queryset.all();
      return this.getModel().objects.all();
    }

    getTemplateNames() {
      if (this.templateName) return [this.templateName];
      const name = `${this.getModel().name.toLowerCase()}${this.templateNameSuffix}`;
      const names = [this.templateDir ? `${this.templateDir}/${name}` : name];
      if (this.genericTemplate) names.push(`xufa/${this.genericTemplate}`);
      return names;
    }

    // The names of the model for its templates: modelLabel ('book instance') and modelLabelPlural.
    async getContextData(context = {}) {
      const model = this.getModel();
      return super.getContextData({ modelLabel: labelOf(model), modelLabelPlural: pluralOf(model), ...context });
    }
  };

// Django's SingleObjectMixin: the object of the route (pk, or slug) of the QuerySet.
const SingleObjectMixin = (Base) =>
  class extends ModelViewMixin(Base) {
    static pkUrlKwarg = 'pk';
    static slugUrlKwarg = 'slug';
    static slugField = 'slug';
    static queryPkAndSlug = false;
    static contextObjectName = null;

    // queryset: getQueryset()'s by default.
    async getObject(queryset) {
      if (!queryset) queryset = this.getQueryset();
      const pk = this.params[this.pkUrlKwarg];
      const slug = this.params[this.slugUrlKwarg];
      const conditions = {};
      if (pk !== undefined) conditions.pk = pk;
      if (slug !== undefined && (pk === undefined || this.queryPkAndSlug)) conditions[this.slugField] = slug;
      if (!Object.keys(conditions).length) {
        throw new ImproperlyConfigured(
          `${this.constructor.name} is called with an object's key (${this.pkUrlKwarg}) or slug (${this.slugUrlKwarg})`
        );
      }
      return getObjectOr404(queryset, conditions);
    }

    getContextObjectName() {
      return this.contextObjectName || nameOf(this.getModel());
    }

    async getContextData(context = {}) {
      const values = {};
      if (this.object) {
        values.object = this.object;
        values[this.getContextObjectName()] = this.object;
      }
      return super.getContextData({ ...values, ...context });
    }
  };

// DetailView: an object (404 when it is not there) in the template <model>_detail, as object and as <model>; the
// built-in one shows its fields (fields: those, else all but the key) as fieldValues [{ name, label, value }].
class DetailView extends SingleObjectMixin(TemplateView) {
  static templateNameSuffix = '_detail';
  static genericTemplate = 'detail';
  static fields = null;

  getTitle() {
    const given = super.getTitle();
    return given !== undefined ? given : `${capital(labelOf(this.getModel()))}: ${this.object}`;
  }

  // The fields of the object for the built-in template: labels, choices by their labels, related objects loaded.
  fieldValues() {
    const { meta } = this.getModel();
    const names = this.fields || meta.fields.filter((field) => !field.primaryKey).map((field) => field.name);
    return names.map((name) => {
      const field = meta.field(name);
      let value;
      if (field && field.choices && typeof this.object.display === 'function') value = this.object.display(name);
      else {
        try {
          value = this.object[name];
        } catch {
          // A relation not loaded: its key.
          value = field && field.attname ? this.object[field.attname] : undefined;
        }
      }
      return { name, label: (field && field.label) || words(name), value };
    });
  }

  async getContextData(context = {}) {
    return super.getContextData({ fieldValues: this.object ? this.fieldValues() : [], ...context });
  }

  async get() {
    this.object = await this.getObject();
    return this.renderToResponse(await this.getContextData());
  }
}

// ListView: the objects of the QuerySet (ordering), in pages of paginateBy (the page of ?page=, or the parameter
// page of the route; 'last' is the last one; one that is not there: 404) in the template <model>_list, as
// objectList and <model>List, with page, paginator and isPaginated. pagination: 'keyset' pages by keys instead
// (KeysetPaginator of @xufa/orm: ?cursor=, page.nextCursor and page.previousCursor, no numbers nor count): far pages
// cost what the first does.
class ListView extends ModelViewMixin(TemplateView) {
  static templateNameSuffix = '_list';
  static genericTemplate = 'list';
  static ordering = null;
  static paginateBy = null;
  static paginateOrphans = 0;
  static allowEmpty = true;
  static pageKwarg = 'page';
  static pagination = 'numbers';
  static cursorKwarg = 'cursor';
  static contextObjectName = null;

  // Not async: a QuerySet is thenable, an async function would run it (after loginRequired, request.account is the
  // user).
  getQueryset() {
    const queryset = super.getQueryset();
    const ordering = this.getOrdering();
    return ordering ? queryset.orderBy(...[].concat(ordering)) : queryset;
  }

  getOrdering() {
    return this.ordering;
  }

  // paginateBy, else the app's (viewDefaults.paginateBy); false: no pages.
  getPaginateBy() {
    if (this.paginateBy === false) return null;
    return this.paginateBy || defaultsOf(this.request).paginateBy || null;
  }

  getTitle() {
    const given = super.getTitle();
    return given !== undefined ? given : `${capital(labelOf(this.getModel()))} List`;
  }

  getContextObjectName() {
    return this.contextObjectName || `${nameOf(this.getModel())}List`;
  }

  // The page of a QuerySet: { paginator, page, objectList, isPaginated }.
  async paginateQueryset(queryset, size) {
    if (this.pagination === 'keyset') {
      const { KeysetPaginator } = queryset.db.orm;
      const paginator = new KeysetPaginator(queryset, size);
      const page = await paginator.page(this.query[this.cursorKwarg]);
      return { paginator, page, objectList: page.objectList, isPaginated: page.hasOtherPages };
    }
    const { Paginator } = queryset.db.orm;
    const paginator = new Paginator(queryset, size, {
      orphans: this.paginateOrphans,
      allowEmptyFirstPage: this.allowEmpty,
    });
    const given = this.params[this.pageKwarg] ?? this.query[this.pageKwarg] ?? 1;
    const number = given === 'last' ? await paginator.numPages() : given;
    const page = await paginator.page(number);
    return { paginator, page, objectList: page.objectList, isPaginated: page.hasOtherPages };
  }

  async get() {
    const queryset = this.getQueryset();
    const size = this.getPaginateBy();
    const values = size
      ? await this.paginateQueryset(queryset, size)
      : { paginator: null, page: null, isPaginated: false, objectList: await queryset };
    if (!this.allowEmpty && values.objectList.length === 0) {
      throw new Http404(`Empty list and ${this.constructor.name}.allowEmpty is false.`);
    }
    this.objectList = values.objectList;
    return this.renderToResponse(
      await this.getContextData({ ...values, [this.getContextObjectName()]: values.objectList })
    );
  }
}

// Django's FormMixin and ProcessFormView: GET shows the form, POST cleans it: formValid(form) (to successUrl) or
// formInvalid(form) (the form again, with its errors).
const FormMixin = (Base) =>
  class extends Base {
    static formClass = null;
    static initial = null;
    static prefix = null;
    static successUrl = null;

    getFormClass() {
      if (!this.formClass) throw new ImproperlyConfigured(`${this.constructor.name} has no formClass`);
      return this.formClass;
    }

    getInitial() {
      return { ...(this.initial || {}) };
    }

    // The options of the form: initial and prefix, and the body of a POST or PUT.
    getFormKwargs() {
      const kwargs = { initial: this.getInitial(), prefix: this.prefix };
      if (['POST', 'PUT', 'PATCH'].includes(this.request.method)) kwargs.data = this.request.body || {};
      return kwargs;
    }

    getForm(FormClass = this.getFormClass()) {
      return new FormClass(this.getFormKwargs());
    }

    getSuccessUrl() {
      if (!this.successUrl) throw new ImproperlyConfigured(`${this.constructor.name} has no successUrl`);
      return typeof this.successUrl === 'function' ? this.successUrl(this) : this.successUrl;
    }

    async formValid() {
      return this.redirect(this.getSuccessUrl());
    }

    async formInvalid(form) {
      return this.renderForm(form);
    }

    // The template with the form (the objects of its choices loaded).
    async renderForm(form) {
      if (typeof form.prepare === 'function') await form.prepare();
      return this.renderToResponse(await this.getContextData({ form }));
    }

    async get() {
      return this.renderForm(this.getForm());
    }

    async post() {
      const form = this.getForm();
      return (await form.isValid()) ? this.formValid(form) : this.formInvalid(form);
    }

    put() {
      return this.post();
    }
  };

// FormView: a form of its own (formClass) in templateName.
class FormView extends FormMixin(TemplateView) {}

// Django's ModelFormMixin: a ModelForm of the model (formClass, or fields: a ModelForm of them), of this.object;
// formValid saves it and goes to successUrl ({field} of the object filled), or to the address of the object
// (absoluteUrl, or getAbsoluteUrl()).
const ModelFormMixin = (Base) =>
  class extends FormMixin(SingleObjectMixin(Base)) {
    static fields = null;
    static templateNameSuffix = '_form';
    static genericTemplate = 'form';

    // Create <model>, or Update <model>: <object>.
    getTitle() {
      const given = super.getTitle();
      if (given !== undefined) return given;
      const label = labelOf(this.getModel());
      return this.object ? `Update ${label}: ${this.object}` : `Create ${label}`;
    }

    getFormClass() {
      if (this.formClass) {
        if (this.fields) throw new ImproperlyConfigured(`${this.constructor.name}: give fields or formClass, not both`);
        return this.formClass;
      }
      if (!this.fields) {
        throw new ImproperlyConfigured(`${this.constructor.name} has no fields: a ModelForm needs them (or '__all__')`);
      }
      const { modelFormOf } = formsModule;
      return modelFormOf(this.getModel(), { fields: this.fields });
    }

    getFormKwargs() {
      return { ...super.getFormKwargs(), instance: this.object || null };
    }

    getSuccessUrl() {
      if (this.successUrl) {
        if (typeof this.successUrl === 'function') return this.successUrl(this);
        return fill(this.successUrl, this.object);
      }
      const object = this.object || {};
      const url = typeof object.getAbsoluteUrl === 'function' ? object.getAbsoluteUrl() : object.absoluteUrl;
      if (!url) {
        throw new ImproperlyConfigured(
          `${this.constructor.name} has no successUrl, and its object no absoluteUrl or getAbsoluteUrl()`
        );
      }
      return url;
    }

    async formValid(form) {
      this.object = await form.save();
      return this.redirect(this.getSuccessUrl());
    }
  };

// CreateView: the form of a new object (template <model>_form).
class CreateView extends ModelFormMixin(TemplateView) {
  async get() {
    this.object = null;
    return super.get();
  }

  async post() {
    this.object = null;
    return super.post();
  }
}

// UpdateView: the form of the object of the route (404 when it is not there).
class UpdateView extends ModelFormMixin(TemplateView) {
  async get() {
    this.object = await this.getObject();
    return super.get();
  }

  async post() {
    this.object = await this.getObject();
    return super.post();
  }
}

// DeleteView: GET asks (template <model>_confirm_delete, with the object), POST deletes it (formValid, after its
// form: formClass, a form with no fields by default) and goes to successUrl. The objects that protect it (foreign keys
// with onDelete 'protect') are blockers in the context, [{ object, href, text, relation }] with blockedText, else its
// question; a POST they stop (ProtectedError) comes back to the question, as Django's views that catch it.
class DeleteView extends FormMixin(SingleObjectMixin(TemplateView)) {
  static templateNameSuffix = '_confirm_delete';
  static genericTemplate = 'confirm_delete';
  // No PUT (that of forms): GET, POST and DELETE.
  static httpMethodNames = ['get', 'post', 'delete', 'head', 'options'];
  // The question (a text with {field} of the object), and the text before the blockers.
  static question = null;
  static blockedText = null;

  getTitle() {
    const given = super.getTitle();
    return given !== undefined ? given : `Delete ${labelOf(this.getModel())}`;
  }

  getQuestion() {
    if (this.question) return fill(this.question, this.object, false);
    return `Are you sure you want to delete the ${labelOf(this.getModel())}: ${this.object}?`;
  }

  // The objects whose foreign keys protect this one ([] when it can go).
  async getBlockers() {
    const { meta } = this.getModel();
    const blockers = [];
    for (const field of meta.reverse || []) {
      if (field.onDelete !== 'protect') continue;
      const related = await field.model.objects.filter({ [field.name]: this.object.pk });
      for (const object of related) {
        const href = addressOf(this.request.server, object);
        blockers.push({ object, href, text: String(object), relation: `${field.model.name}.${field.name}` });
      }
    }
    return blockers;
  }

  getBlockedText(blockers) {
    if (this.blockedText) return fill(this.blockedText, this.object, false);
    const models = [...new Set(blockers.map((blocker) => blocker.object.constructor))];
    const what = models.map((model) => pluralOf(model)).join(' and ');
    return `You can't delete this ${labelOf(this.getModel())} until all its ${what} have been deleted:`;
  }

  async getContextData(context = {}) {
    const values = await super.getContextData(context);
    const blockers = values.blockers || (this.object ? await this.getBlockers() : []);
    return {
      question: this.object ? this.getQuestion() : undefined,
      blockedText: blockers.length ? this.getBlockedText(blockers) : undefined,
      ...values,
      blockers,
    };
  }

  getFormClass() {
    if (this.formClass) return this.formClass;
    const { Form } = formsModule;
    return Form;
  }

  getSuccessUrl() {
    if (!this.successUrl) throw new ImproperlyConfigured(`${this.constructor.name} has no successUrl`);
    return typeof this.successUrl === 'function' ? this.successUrl(this) : fill(this.successUrl, this.object);
  }

  async formValid() {
    const url = this.getSuccessUrl();
    try {
      await this.object.delete();
    } catch (err) {
      // Kept by others: the question again, with them (a DELETE gets the error: 409).
      if (!(err && err.code === 'XUFA_ORM_ERR_PROTECTED') || this.request.method === 'DELETE') throw err;
      return this.redirect(this.request.url);
    }
    return this.redirect(url);
  }

  async get() {
    this.object = await this.getObject();
    return this.renderToResponse(await this.getContextData());
  }

  async post() {
    this.object = await this.getObject();
    return super.post();
  }

  // DELETE: as Django's, deletes at once.
  async delete() {
    this.object = await this.getObject();
    return this.formValid(this.getForm());
  }
}

export {
  addressOf,
  getObjectOr404,
  getListOr404,
  ModelViewMixin,
  SingleObjectMixin,
  FormMixin,
  ModelFormMixin,
  DetailView,
  ListView,
  FormView,
  CreateView,
  UpdateView,
  DeleteView,
};
