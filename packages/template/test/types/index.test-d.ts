import { expectType, expectError } from 'tsd';
import { compile, render, fill, TemplateEngine, TemplateError, SafeString, escapeHtml, CompiledTemplate } from '../..';

const page = compile('<h1>{{ title }}</h1>', { name: 'page.html' });
expectType<CompiledTemplate>(page);
expectType<string>(page({ title: 'x' }));
expectType<((context?: object | Record<string, unknown> | null) => unknown) | undefined>(page.value);
expectType<string>(render('{{ a }}', { a: 1 }, { escape: false }));
expectType<unknown>(fill({ port: '{{ env.PORT }}' }, { env: process.env }));

const engine = new TemplateEngine({
  filters: { money: (value: number) => `${value.toFixed(2)} €` },
  globals: { site: 'xufa' },
  escape: (text) => text,
  strict: true,
  partials: { row: '<tr>{{ item }}</tr>' },
  maxDepth: 10,
  cacheSize: 100,
});
expectType<TemplateEngine>(engine.filter('shout', (value: string) => `${value}!`).partial('x', '{{ 1 }}'));
expectType<string>(engine.render('{{ 1 | money }}'));
expectError(new TemplateEngine({ escape: 'html' }));
expectError(engine.partial('x', 1));

expectType<string>(new SafeString('<b>').value);
expectType<string>(escapeHtml('<'));
const error = new TemplateError('bad');
expectType<number | undefined>(error.line);
expectType<string | undefined>(error.template);

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
expectType<void>(plugin({}, viewOptions, () => {}));
declare const view: RenderView;
expectType<Promise<string>>(view('users/show', { user: 1 }, { layout: false }));
declare const replyView: ReplyView<{ sent: true }>;
expectType<{ sent: true }>(replyView('hello'));
expectError(view(1));

expectType<Generator<string, void, undefined>>(page.stream({ title: 'x' }, { chunkSize: 1024 }));
const streaming: TemplatePluginOptions = { stream: true, chunkSize: 4096 };
expectType<boolean | undefined>(streaming.stream);
expectType<Promise<string>>(view('big', {}, { stream: true }));
