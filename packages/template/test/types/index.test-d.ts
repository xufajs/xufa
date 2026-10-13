import { assertType, expectTypeOf } from '@xufa/test';
import { compile, render, fill, TemplateEngine, TemplateError, SafeString, escapeHtml, CompiledTemplate } from '../..';

const page = compile('<h1>{{ title }}</h1>', { name: 'page.html' });
expectTypeOf(page).toEqualTypeOf<CompiledTemplate>();
expectTypeOf(page({ title: 'x' })).toEqualTypeOf<string>();
expectTypeOf(page.value).toEqualTypeOf<((context?: object | Record<string, unknown> | null) => unknown) | undefined>();
expectTypeOf(render('{{ a }}', { a: 1 }, { escape: false })).toEqualTypeOf<string>();
expectTypeOf(fill({ port: '{{ env.PORT }}' }, { env: process.env })).toEqualTypeOf<unknown>();

const engine = new TemplateEngine({
  filters: { money: (value: number) => `${value.toFixed(2)} €` },
  globals: { site: 'xufa' },
  escape: (text) => text,
  strict: true,
  partials: { row: '<tr>{{ item }}</tr>' },
  maxDepth: 10,
  cacheSize: 100,
});
expectTypeOf(engine.filter('shout', (value: string) => `${value}!`).partial('x', '{{ 1 }}')).toEqualTypeOf<TemplateEngine>();
expectTypeOf(engine.render('{{ 1 | money }}')).toEqualTypeOf<string>();
// @ts-expect-error
new TemplateEngine({ escape: 'html' });
// @ts-expect-error
engine.partial('x', 1);

expectTypeOf(new SafeString('<b>').value).toEqualTypeOf<string>();
expectTypeOf(escapeHtml('<')).toEqualTypeOf<string>();
const error = new TemplateError('bad');
expectTypeOf(error.line).toEqualTypeOf<number | undefined>();
expectTypeOf(error.template).toEqualTypeOf<string | undefined>();

import { plugin, TemplatePluginOptions, ReplyView, RenderView } from '../..';

const viewOptions: TemplatePluginOptions = {
  root: 'views',
  extension: '.html',
  layout: 'layout',
  defaultContext: { site: 'xufa' },
  cache: true,
  propertyName: 'view',
  filters: { upper: (value: string) => value.toUpperCase() },
  loadPartial: (name) => (name === 'x' ? '{{ 1 }}' : undefined),
};
expectTypeOf(plugin({}, viewOptions, () => {})).toEqualTypeOf<void>();
declare const view: RenderView;
expectTypeOf(view('users/show', { user: 1 }, { layout: false })).toEqualTypeOf<Promise<string>>();
declare const replyView: ReplyView<{ sent: true }>;
expectTypeOf(replyView('hello')).toEqualTypeOf<{ sent: true }>();
// @ts-expect-error
view(1);

expectTypeOf(page.stream({ title: 'x' }, { chunkSize: 1024 })).toEqualTypeOf<Generator<string, void, undefined>>();
const streaming: TemplatePluginOptions = { stream: true, chunkSize: 4096 };
expectTypeOf(streaming.stream).toEqualTypeOf<boolean | undefined>();
expectTypeOf(view('big', {}, { stream: true })).toEqualTypeOf<Promise<string>>();

const withContext: TemplatePluginOptions = { context: [async (request) => ({ user: request.user })], builtins: false };
expectTypeOf(withContext.builtins).toEqualTypeOf<boolean | undefined>();
// @ts-expect-error
assertType<TemplatePluginOptions>({ context: 'nope' });
