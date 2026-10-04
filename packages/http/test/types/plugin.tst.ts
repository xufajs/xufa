// Ported from fastify (test/types/plugin.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import * as https from 'node:https'
import { XufaError } from '@xufa/errors'
import { expect } from 'tstyche'
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
  expect(opts).type.toBe<TestOptions>()
}
const testPluginOptsAsync: XufaPluginAsync<TestOptions> = async function (instance, opts) {
  expect(opts).type.toBe<TestOptions>()
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

expect(xufa().register).type.not.toBeCallableWith(testPluginOpts, {}) // must provide required options
expect(xufa().register).type.not.toBeCallableWith(testPluginOptsAsync, {}) // must provide required options

expect(xufa().register(testPluginOpts, { option1: '', option2: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(testPluginOptsAsync, { option1: '', option2: true })).type.toBeAssignableTo<XufaInstance>()

expect(xufa().register(function (instance, opts, done) { })).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(function (instance, opts, done) { }, () => { })).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(function (instance, opts, done) { }, { logLevel: 'info', prefix: 'foobar' })).type.toBeAssignableTo<XufaInstance>()

expect(xufa().register(import('./dummy-plugin.mjs'))).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(import('./dummy-plugin.mjs'), { foo: 1 })).type.toBeAssignableTo<XufaInstance>()

const testPluginCallback: XufaPluginCallback = function (instance, opts, done) { }
expect(xufa().register(testPluginCallback, {})).type.toBeAssignableTo<XufaInstance>()

const testPluginAsync: XufaPluginAsync = async function (instance, opts) { }
expect(xufa().register(testPluginAsync, {})).type.toBeAssignableTo<XufaInstance>()

expect(
  xufa().register(function (instance, opts): Promise<void> { return Promise.resolve() })
).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(async function (instance, opts) { }, () => { })).type.toBeAssignableTo<XufaInstance>()
expect(xufa().register(async function (instance, opts) { }, { logLevel: 'info', prefix: 'foobar' })).type.toBeAssignableTo<XufaInstance>()

expect(xufa().register).type.not.toBeCallableWith(function () { }, { logLevel: '', prefix: 'foobar' }) // must provide valid logLevel

const httpsServer = xufa({ https: {} })
expect(httpsServer).type.not.toBeAssignableTo<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  Promise<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(httpsServer).type.toBeAssignableTo<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  PromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(httpsServer).type.toBe<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()

// Chainable
httpsServer
  .register(testPluginOpts, testOptions)
  .after((_error) => { })
  .ready((_error) => { })
  .close(() => { })

// Thenable
expect(httpsServer.after()).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.close()).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.ready()).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.register(testPluginOpts, testOptions)).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.register(testPluginOptsWithType)).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.register(testPluginOptsWithTypeAsync)).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.register(testPluginOptsWithType, { prefix: '/test' })).type.toBeAssignableTo<PromiseLike<undefined>>()
expect(httpsServer.register(testPluginOptsWithTypeAsync, { prefix: '/test' })).type.toBeAssignableTo<PromiseLike<undefined>>()

async function testAsync (): Promise<void> {
  await httpsServer
    .register(testPluginOpts, testOptions)
    .register(testPluginOpts, testOptions)
}
