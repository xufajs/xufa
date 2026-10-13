// Ported from fastify (test/types/plugin.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import * as https from 'node:https'
import { XufaError } from '@xufa/errors'
import { expectTypeOf } from '@xufa/test';
import xufa, { XufaInstance, XufaPluginOptions, SafePromiseLike } from '../..'
import { XufaPluginCallback, XufaPluginAsync } from '../../types/plugin.js'

// XufaPlugin & XufaRegister
interface TestOptions extends XufaPluginOptions {
  option1: string;
  option2: boolean;
}
const testOptions: TestOptions = {
  option1: 'a',
  option2: false
}
const testPluginOpts: XufaPluginCallback<TestOptions> = function (instance, opts, done) {
  expectTypeOf(opts).toEqualTypeOf<TestOptions>();
}
const testPluginOptsAsync: XufaPluginAsync<TestOptions> = async function (instance, opts) {
  expectTypeOf(opts).toEqualTypeOf<TestOptions>();
}

const testPluginOptsWithType = (
  instance: XufaInstance,
  opts: XufaPluginOptions,
  done: (error?: XufaError) => void
) => { }
const testPluginOptsWithTypeAsync = async (
  instance: XufaInstance,
  opts: XufaPluginOptions
) => { }

// @ts-expect-error
(xufa().register)(testPluginOpts, {}); // must provide required options
// @ts-expect-error
(xufa().register)(testPluginOptsAsync, {}); // must provide required options

expectTypeOf(xufa().register(testPluginOpts, { option1: '', option2: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(testPluginOptsAsync, { option1: '', option2: true })).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa().register(function (instance, opts, done) { })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(function (instance, opts, done) { }, () => { })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(function (instance, opts, done) { }, { logLevel: 'info', prefix: 'foobar' })).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa().register(import('./dummy-plugin.mjs'))).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(import('./dummy-plugin.mjs'), { foo: 1 })).toMatchTypeOf<XufaInstance>();

const testPluginCallback: XufaPluginCallback = function (instance, opts, done) { }
expectTypeOf(xufa().register(testPluginCallback, {})).toMatchTypeOf<XufaInstance>();

const testPluginAsync: XufaPluginAsync = async function (instance, opts) { }
expectTypeOf(xufa().register(testPluginAsync, {})).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa().register(function (instance, opts): Promise<void> { return Promise.resolve() })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(async function (instance, opts) { }, () => { })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa().register(async function (instance, opts) { }, { logLevel: 'info', prefix: 'foobar' })).toMatchTypeOf<XufaInstance>();

// @ts-expect-error
(xufa().register)(function () { }, { logLevel: '', prefix: 'foobar' }); // must provide valid logLevel

const httpsServer = xufa({ https: {} })
expectTypeOf(httpsServer).not.toMatchTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  Promise<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(httpsServer).toMatchTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  PromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(httpsServer).toEqualTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();

// Chainable
httpsServer
  .register(testPluginOpts, testOptions)
  .after((_error) => { })
  .ready((_error) => { })
  .close(() => { })

// Thenable
expectTypeOf(httpsServer.after()).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.close()).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.ready()).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.register(testPluginOpts, testOptions)).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.register(testPluginOptsWithType)).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.register(testPluginOptsWithTypeAsync)).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.register(testPluginOptsWithType, { prefix: '/test' })).toMatchTypeOf<PromiseLike<undefined>>();
expectTypeOf(httpsServer.register(testPluginOptsWithTypeAsync, { prefix: '/test' })).toMatchTypeOf<PromiseLike<undefined>>();

async function testAsync (): Promise<void> {
  await httpsServer
    .register(testPluginOpts, testOptions)
    .register(testPluginOpts, testOptions)
}
