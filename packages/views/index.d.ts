/** Types of @xufa/views: views of classes, as Django's generic views. */
import type { XufaReply, XufaRequest, RouteOptions } from '@xufa/http';
import type { Form, ModelForm } from '@xufa/forms';

/** Django's Http404: a 404 the error handler of the app shows. */
export declare class Http404 extends Error {
  constructor(message?: string);
  statusCode: 404;
  code: 'XUFA_VIEWS_ERR_NOT_FOUND';
}

/** Django's ImproperlyConfigured: a view not set up for what it is asked (a 500). */
export declare class ImproperlyConfigured extends Error {
  code: 'XUFA_VIEWS_ERR_IMPROPERLY_CONFIGURED';
}

export type ViewHandler = ((request: XufaRequest, reply: XufaReply) => Promise<unknown>) & {
  viewClass: typeof View;
  viewOptions: Record<string, unknown>;
};

type Settings<T> = { [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] | null : T[K] };

/**
 * A view: a method for each method of HTTP it answers (get, post...), made for each request by asView(). Its settings
 * are static fields of its class; asView(options) changes them for a route.
 */
export declare class View {
  static httpMethodNames: string[];
  static loginRequired: boolean;
  static permissionRequired: string | string[] | null;
  static extraContext: Record<string, unknown> | null;
  /** The handler of a route (options: settings of the class for this route). */
  static asView<T extends View>(this: new (options?: any) => T, options?: Settings<T>): ViewHandler;
  /** The methods of HTTP it answers (HEAD comes with GET). */
  static readonly methods: string[];
  /** A route: app.route(BookList.asRoute('/books/', { name: 'books' })). */
  static asRoute<T extends View>(
    this: new (options?: any) => T,
    url: string,
    routeOptions?: Partial<RouteOptions> & { name?: string },
    options?: Settings<T>
  ): RouteOptions;

  constructor(options?: Record<string, unknown>);
  httpMethodNames: string[];
  loginRequired: boolean;
  permissionRequired: string | string[] | null;
  extraContext: Record<string, unknown> | null;
  request: XufaRequest;
  reply: XufaReply;
  params: Record<string, string>;
  query: Record<string, any>;
  dispatch(): Promise<unknown>;
  httpMethodNotAllowed(): XufaReply;
  /** The address of a named route (app.reverse). */
  reverse(
    name: string,
    params?: Record<string, unknown> | unknown[],
    options?: { query?: Record<string, unknown> }
  ): string;
  redirect(url: string, code?: number): XufaReply;
  getContextData(context?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * A view with a template of @xufa/template (TemplateView: GET renders it, with params in the context). Its context has
 * baseTemplate (the template the built-in ones extend) and title.
 */
export declare class TemplateView extends View {
  static templateName: string | null;
  /** The template the built-in ones extend: app.viewDefaults.baseTemplate, else 'base'. */
  static baseTemplate: string | null;
  /** The title of the page: a text with {field} of the object, or a function of the view. */
  static title: string | ((view: any) => string) | null;
  templateName: string | null;
  baseTemplate: string | null;
  title: string | ((view: any) => string) | null;
  /** The names to try, the first the app has (app.hasView) is rendered. */
  getTemplateNames(): string[];
  getTitle(): string | undefined;
  renderToResponse(context: Record<string, unknown>): Promise<unknown>;
  get(): Promise<unknown>;
}

/** To url ({param} filled) or a named route (patternName); permanent: 301; 410 without an address. */
export declare class RedirectView extends View {
  static url: string | null;
  static patternName: string | null;
  static permanent: boolean;
  static queryString: boolean;
  url: string | null;
  patternName: string | null;
  permanent: boolean;
  queryString: boolean;
  getRedirectUrl(): string | null;
  get(): XufaReply;
}

/** The settings of the views of models. */
export declare class ModelView<M = any> extends TemplateView {
  static model: any;
  static queryset: any;
  static templateDir: string | null;
  static templateNameSuffix: string;
  /** The built-in template when the app has no <model><suffix>: xufa/list, xufa/detail, xufa/form... */
  static genericTemplate: string | null;
  model: any;
  queryset: any;
  templateDir: string | null;
  templateNameSuffix: string;
  genericTemplate: string | null;
  getModel(): any;
  getQueryset(): any;
}

export declare class SingleObjectView<M = any> extends ModelView<M> {
  static pkUrlKwarg: string;
  static slugUrlKwarg: string;
  static slugField: string;
  static queryPkAndSlug: boolean;
  static contextObjectName: string | null;
  object: M | null;
  getObject(queryset?: any): Promise<M>;
  getContextObjectName(): string;
}

/**
 * An object (404 when it is not there) in <model>_detail, as object and <model> (bookInstance); the built-in template
 * shows fieldValues (fields: those, else all but the key).
 */
export declare class DetailView<M = any> extends SingleObjectView<M> {
  static fields: string[] | null;
  fields: string[] | null;
  fieldValues(): { name: string; label: string; value: unknown }[];
}

/** The objects in pages of paginateBy in <model>_list: objectList, <model>List, page, paginator, isPaginated. */
export declare class ListView<M = any> extends ModelView<M> {
  static ordering: string | string[] | null;
  /** Objects in a page: else app.viewDefaults.paginateBy; false: no pages. */
  static paginateBy: number | false | null;
  static paginateOrphans: number;
  static allowEmpty: boolean;
  static pageKwarg: string;
  /** 'keyset': pages by keys (KeysetPaginator of @xufa/orm, ?cursor=), no numbers nor count ('numbers'). */
  static pagination: 'numbers' | 'keyset';
  /** The query parameter of the cursor of keyset pages ('cursor'). */
  static cursorKwarg: string;
  static contextObjectName: string | null;
  objectList: M[];
  getOrdering(): string | string[] | null;
  getPaginateBy(): number | null;
  getContextObjectName(): string;
  paginateQueryset(
    queryset: any,
    size: number
  ): Promise<{ paginator: any; page: any; objectList: M[]; isPaginated: boolean }>;
}

interface FormViewSettings<F> {
  formClass: (new (options?: any) => F) | null;
  initial: Record<string, unknown> | null;
  prefix: string | null;
  successUrl: string | ((view: any) => string) | null;
  getFormClass(): new (options?: any) => F;
  getInitial(): Record<string, unknown>;
  getFormKwargs(): Record<string, unknown>;
  getForm(FormClass?: new (options?: any) => F): F;
  getSuccessUrl(): string;
  formValid(form: F): Promise<unknown>;
  formInvalid(form: F): Promise<unknown>;
  renderForm(form: F): Promise<unknown>;
  get(): Promise<unknown>;
  post(): Promise<unknown>;
}

/** A form of its own (formClass): GET shows it, POST cleans it: formValid (to successUrl) or formInvalid. */
export declare class FormView<F extends Form = Form> extends TemplateView {
  static formClass: any;
  static initial: Record<string, unknown> | null;
  static prefix: string | null;
  static successUrl: string | null;
}
export interface FormView<F extends Form = Form> extends FormViewSettings<F> {}

export declare class ModelFormView<M = any> extends SingleObjectView<M> {
  static formClass: any;
  static fields: string[] | '__all__' | null;
  static initial: Record<string, unknown> | null;
  static prefix: string | null;
  /** A text with {field} of the object, else the object's absoluteUrl or getAbsoluteUrl(). */
  static successUrl: string | null;
  fields: string[] | '__all__' | null;
}
export interface ModelFormView<M = any> extends FormViewSettings<ModelForm<M>> {}

/** The form of a new object (<model>_form), saved and to its address. */
export declare class CreateView<M = any> extends ModelFormView<M> {}
/** The form of the object of the route (<model>_form). */
export declare class UpdateView<M = any> extends ModelFormView<M> {}

/** An object that keeps another from being deleted (a foreign key with onDelete 'protect'). */
export interface Blocker {
  object: any;
  /** Its address (absoluteUrl, or the route <model>-detail), or null. */
  href: string | null;
  text: string;
  /** Model.field of the foreign key. */
  relation: string;
}

/**
 * GET asks (<model>_confirm_delete), or lists the blockers; POST (or DELETE) deletes and goes to successUrl; a POST
 * the blockers stop comes back to the question.
 */
export declare class DeleteView<M = any> extends SingleObjectView<M> {
  static formClass: any;
  static successUrl: string | null;
  /** The question: a text with {field} of the object. */
  static question: string | null;
  /** The text before the blockers: a text with {field} of the object. */
  static blockedText: string | null;
  question: string | null;
  blockedText: string | null;
  getQuestion(): string;
  getBlockers(): Promise<Blocker[]>;
  getBlockedText(blockers: Blocker[]): string;
}
export interface DeleteView<M = any> extends FormViewSettings<Form> {}

/** Django's get_object_or_404: of a model or a QuerySet. */
export declare function getObjectOr404<M = any>(source: any, conditions?: Record<string, unknown>): Promise<M>;
/** Django's get_list_or_404. */
export declare function getListOr404<M = any>(source: any, conditions?: Record<string, unknown>): Promise<M[]>;

/** The address of an object: its absoluteUrl (or getAbsoluteUrl()), else the route <model>-detail of the app, else null. */
export declare function addressOf(app: any, object: any): string | null;

/** The settings of one page of crud(): those of its view, a view of its own, its queryset's related objects, its path. */
export type CrudPage = Record<string, unknown> & {
  view?: typeof View;
  path?: string;
  selectRelated?: string | string[];
  prefetchRelated?: string | string[];
};

export interface CrudOptions {
  /** The fields of the forms of create and update. */
  fields?: string[] | '__all__';
  /** The name of the model in routes ('book': book-detail...), and of the list ('books'). */
  name?: string;
  plural?: string;
  /** Before every path ('/catalog'). */
  prefix?: string;
  templateDir?: string;
  /** true: Model.add, .change and .delete for create, update and delete; false: none; or one per page (false: none). */
  permissions?: boolean | { create?: string | false; update?: string | false; delete?: string | false };
  /** The pages made ('list', 'detail', 'create', 'update', 'delete'). */
  only?: ('list' | 'detail' | 'create' | 'update' | 'delete')[];
  list?: CrudPage;
  detail?: CrudPage;
  create?: CrudPage;
  update?: CrudPage;
  delete?: CrudPage;
}

/** The five pages of a model, with Django's names (books, book-detail, book-create, book-update, book-delete). */
export declare function crud(Model: any, options?: CrudOptions): RouteOptions[];

export interface ViewDefaults {
  /** The template the built-in ones extend ('base'). */
  baseTemplate?: string;
  /** Objects in a page of the lists that give none. */
  paginateBy?: number | null;
}

/** The plugin: app.viewDefaults for the views of the app. */
export declare function plugin(app: any, options: ViewDefaults, done: (err?: Error) => void): void;

/** The folder of the built-in templates (xufa/list, xufa/detail, xufa/form, xufa/confirm_delete), for the roots of @xufa/template. */
export declare const templates: string;
