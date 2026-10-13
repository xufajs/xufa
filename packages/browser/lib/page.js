// A page (a tab) of a browser context: navigation, the events of the page (console, pageerror, dialog, response),
// actions that wait for their element as a user would (visible, enabled, still, and the one a click would hit), and
// locators, as Playwright's of the same names.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { install } from './injected.js';
import { Keyboard, Mouse } from './input.js';
import { TargetClosedError } from './connection.js';

const INSTALL = `(${install.toString()})()`;

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// A function for the page, as the source of a call with its argument.
function callOf(fn, ...args) {
  const source = typeof fn === 'function' ? fn.toString() : `() => (${fn})`;
  return `(${source})(${args.map((arg) => (arg === undefined ? 'undefined' : JSON.stringify(arg))).join(', ')})`;
}

class ConsoleMessage {
  constructor(type, text, location) {
    this._type = type;
    this._text = text;
    this._location = location;
  }

  type() {
    return this._type;
  }

  text() {
    return this._text;
  }

  location() {
    return this._location;
  }
}

class Dialog {
  constructor(session, params) {
    this.session = session;
    this.params = params;
    this.handled = false;
  }

  type() {
    return this.params.type;
  }

  message() {
    return this.params.message;
  }

  defaultValue() {
    return this.params.defaultPrompt ?? '';
  }

  async accept(promptText) {
    this.handled = true;
    await this.session.send('Page.handleJavaScriptDialog', { accept: true, promptText });
  }

  async dismiss() {
    this.handled = true;
    await this.session.send('Page.handleJavaScriptDialog', { accept: false });
  }
}

class Request {
  constructor(params) {
    this.params = params;
  }

  url() {
    return this.params.request.url;
  }

  method() {
    return this.params.request.method;
  }

  headers() {
    return this.params.request.headers;
  }

  postData() {
    return this.params.request.postData ?? null;
  }
}

class Response {
  constructor(session, params, request, finished) {
    this.session = session;
    this.params = params;
    this._request = request;
    // (Its body: once the request has finished loading.)
    this.finished = finished;
  }

  url() {
    return this.params.response.url;
  }

  status() {
    return this.params.response.status;
  }

  ok() {
    const status = this.status();
    return status === 0 || (status >= 200 && status <= 299);
  }

  headers() {
    return Object.fromEntries(Object.entries(this.params.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
  }

  request() {
    return this._request;
  }

  async body() {
    await this.finished;
    const { body, base64Encoded } = await this.session.send('Network.getResponseBody', {
      requestId: this.params.requestId,
    });
    return Buffer.from(body, base64Encoded ? 'base64' : 'utf8');
  }

  async text() {
    return (await this.body()).toString('utf8');
  }

  async json() {
    return JSON.parse(await this.text());
  }
}

// What a value of the console is, as text.
function textOfArg(arg) {
  if (arg.type === 'string') return arg.value;
  if (arg.type === 'undefined') return 'undefined';
  if ('value' in arg) return String(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  return arg.description ?? `[${arg.type}]`;
}

// An exception of the page as an Error: its message, its name, its stack.
function errorOf(details) {
  const exception = details.exception ?? {};
  const description = exception.description ?? details.text ?? 'Error';
  const [first] = description.split('\n');
  const error = new Error();
  const match = /^(\w*Error|\w+): ([\s\S]*)$/.exec(first);
  if (exception.className && match) {
    error.name = match[1];
    error.message = match[2];
  } else {
    error.message = exception.value !== undefined ? String(exception.value) : first.replace(/^Uncaught /, '');
  }
  error.stack = description;
  return error;
}

class Page extends EventEmitter {
  constructor(context, session, targetId) {
    super();
    this._context = context;
    this.session = session;
    this.targetId = targetId;
    this.keyboard = new Keyboard(session);
    this.mouse = new Mouse(session, this.keyboard);
    this.timeout = context.timeout ?? 30_000;
    this.mainFrameId = null;
    this.currentUrl = 'about:blank';
    // (The navigations of the main frame, to new documents or in the same one: goto waits for the next.)
    this.navigations = 0;
    this.lifecycle = new Map();
    this.requests = new Map();
    this.documents = new Map();
    this.loading = new Map();
    this.waiters = new Set();
    this.closed = false;
    this.ownsContext = false;
  }

  async init({ viewport, locale, userAgent }) {
    const { session } = this;
    session.on('Page.lifecycleEvent', ({ frameId, loaderId, name }) => {
      if (frameId !== this.mainFrameId) return;
      if (name === 'init') this.lifecycle.set(loaderId, new Set());
      if (!this.lifecycle.has(loaderId)) this.lifecycle.set(loaderId, new Set());
      this.lifecycle.get(loaderId).add(name);
      this.wake();
    });
    session.on('Page.frameNavigated', ({ frame }) => {
      if (frame.parentId) return;
      this.mainFrameId = frame.id;
      this.currentUrl = frame.url + (frame.urlFragment ?? '');
      this.navigations += 1;
      this.emit('framenavigated', frame);
      this.wake();
    });
    session.on('Page.navigatedWithinDocument', ({ frameId, url }) => {
      if (frameId !== this.mainFrameId) return;
      this.currentUrl = url;
      this.navigations += 1;
      this.wake();
    });
    session.on('Runtime.consoleAPICalled', ({ type, args, stackTrace }) => {
      const kind = type === 'warning' ? 'warning' : type;
      const frame = stackTrace?.callFrames?.[0];
      const location = frame ? { url: frame.url, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber } : {};
      this.emit('console', new ConsoleMessage(kind, args.map(textOfArg).join(' '), location));
    });
    session.on('Log.entryAdded', ({ entry }) => {
      // (Errors the browser logs, as resources that do not load: console messages of the page too, as Playwright's.)
      if (entry.source === 'console-api') return;
      const kind = entry.level === 'verbose' ? 'debug' : entry.level;
      this.emit('console', new ConsoleMessage(kind, entry.text, { url: entry.url, lineNumber: entry.lineNumber }));
    });
    session.on('Runtime.exceptionThrown', ({ exceptionDetails }) => this.emit('pageerror', errorOf(exceptionDetails)));
    session.on('Page.javascriptDialogOpening', (params) => {
      const dialog = new Dialog(session, params);
      // No one listening: dismissed, as Playwright does.
      if (this.listenerCount('dialog') === 0) dialog.dismiss().catch(() => {});
      else this.emit('dialog', dialog);
    });
    session.on('Network.requestWillBeSent', (params) => {
      this.requests.set(params.requestId, new Request(params));
      this.emit('request', this.requests.get(params.requestId));
    });
    session.on('Network.responseReceived', (params) => {
      const response = new Response(
        session,
        params,
        this.requests.get(params.requestId) ?? null,
        this.finishedOf(params.requestId)
      );
      if (params.type === 'Document' && params.loaderId) this.documents.set(params.loaderId, response);
      this.emit('response', response);
    });
    // (On the next turn: the listeners of this event, as XUFA_BROWSER_DEBUG's, still find the request.)
    session.on('Network.loadingFinished', ({ requestId }) => {
      this.settle(requestId, null);
      setImmediate(() => this.requests.delete(requestId));
    });
    session.on('Network.loadingFailed', ({ requestId, errorText }) => {
      this.settle(requestId, new Error(`The request failed: ${errorText}`));
      this.requests.delete(requestId);
    });
    session.on('detached', () => {
      this.closed = true;
      this.wake();
      this.emit('close', this);
    });
    // XUFA_BROWSER_DEBUG: what goes wrong in the page on stderr (errors with their stacks, requests that fail or
    // answer 400 and over).
    if (process.env.XUFA_BROWSER_DEBUG) {
      const log = (text) => process.stderr.write(`[browser ${this.targetId.slice(0, 6)}] ${text}\n`);
      this.on('pageerror', (err) => log(`pageerror at ${this.currentUrl}: ${err.stack}`));
      this.on('console', (message) => message.type() === 'error' && log(`console.error: ${message.text()}`));
      this.on(
        'response',
        (response) =>
          response.status() >= 400 &&
          log(`${response.status()} ${response.request()?.method() ?? ''} ${response.url()}`)
      );
      session.on(
        'Network.loadingFailed',
        ({ errorText, canceled }) => !canceled && log(`request failed: ${errorText}`)
      );
      // XUFA_BROWSER_DEBUG=bodies: the bodies of the requests of scripts (fetch, XHR) too.
      if (process.env.XUFA_BROWSER_DEBUG === 'bodies') {
        session.on('Network.loadingFinished', async ({ requestId }) => {
          const request = this.requests.get(requestId);
          if (!request || !['Fetch', 'XHR'].includes(request.params.type)) return;
          const body = await session.send('Network.getResponseBody', { requestId }).catch(() => null);
          log(`${request.method()} ${request.url()} -> ${body ? body.body.slice(0, 160) : '(no body)'}`);
        });
      }
    }
    const { frameTree } = await session.send('Page.getFrameTree');
    this.mainFrameId = frameTree.frame.id;
    this.currentUrl = frameTree.frame.url;
    await Promise.all([
      session.send('Page.enable'),
      session.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      session.send('Runtime.enable'),
      session.send('Network.enable'),
      session.send('Log.enable'),
      session.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTALL }),
      session.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      }),
      ...(locale
        ? [
            session.send('Emulation.setLocaleOverride', { locale }),
            session.send('Network.setUserAgentOverride', { userAgent, acceptLanguage: locale }),
          ]
        : []),
    ]);
  }

  // When a request has finished loading (an error when it failed): what response.body() waits for.
  finishedOf(requestId) {
    if (!this.loading.has(requestId)) {
      let settle;
      const promise = new Promise((resolve, reject) => {
        settle = (error) => (error ? reject(error) : resolve());
      });
      promise.catch(() => {});
      this.loading.set(requestId, { promise, settle });
    }
    return this.loading.get(requestId).promise;
  }

  settle(requestId, error) {
    this.finishedOf(requestId);
    this.loading.get(requestId).settle(error);
    // (Kept a while: a response read late still finds it.)
    setTimeout(() => this.loading.delete(requestId), 60_000).unref();
  }

  // Waiters (of events, of states) look again.
  wake() {
    for (const waiter of this.waiters) waiter();
  }

  context() {
    return this._context;
  }

  url() {
    return this.currentUrl;
  }

  isClosed() {
    return this.closed;
  }

  setDefaultTimeout(timeout) {
    this.timeout = timeout;
  }

  // The result of an expression in the page (by value), or of an exception of it, an Error.
  async evaluateExpression(expression) {
    const result = await this.session.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw errorOf(result.exceptionDetails);
    return result.result.value;
  }

  /** A function run in the page with its argument: its result (awaited), by value. */
  async evaluate(fn, arg) {
    return this.evaluateExpression(callOf(fn, arg));
  }

  // A helper of the engine in the page (installed again in a document that has it not yet); { wait } while the page
  // navigates.
  async helper(name, ...args) {
    const expression = `(() => { const b = globalThis.__xufaBrowser; return b ? b[${JSON.stringify(name)}](${args
      .map((arg) => (arg === undefined ? 'undefined' : JSON.stringify(arg)))
      .join(', ')}) : { missing: true }; })()`;
    try {
      let result = await this.evaluateExpression(expression);
      if (result?.missing) {
        await this.evaluateExpression(INSTALL);
        result = await this.evaluateExpression(expression);
      }
      return result;
    } catch (err) {
      if (err instanceof TargetClosedError) throw err;
      if (/context was destroyed|Cannot find context|Execution context/i.test(err.message))
        return { wait: 'navigating' };
      throw err;
    }
  }

  // Runs step until it gives { done } (its value), as long as the timeout allows; it says why it waits ({ wait }).
  async retry(what, timeout, step) {
    // (Made before the first await, its stack has the caller's line: the test's, not only those of the driver.)
    const origin = new Error();
    const fail = (error) => {
      error.stack = `${error.name}: ${error.message}\n${origin.stack.split('\n').slice(1).join('\n')}`;
      return error;
    };
    const deadline = Date.now() + (timeout ?? this.timeout);
    let reason = '';
    for (;;) {
      if (this.closed) throw fail(new TargetClosedError(what));
      const result = await step();
      if (result && 'done' in result) return result.done;
      if (result?.error) throw fail(new Error(`${what}: ${result.error}`));
      reason = result?.wait ?? reason;
      if (Date.now() >= deadline) {
        throw fail(
          new TimeoutError(
            `${what}: Timeout ${timeout ?? this.timeout}ms exceeded${reason ? ` (${reason})` : ''}, at ${this.currentUrl}.`
          )
        );
      }
      await sleep(Math.min(30, Math.max(0, deadline - Date.now())));
    }
  }

  // ------------------------------------------------------------------------------------------------- navigation

  async waitForLoad(loaderId, event, timeout, what) {
    const name = { load: 'load', domcontentloaded: 'DOMContentLoaded', networkidle: 'networkIdle', commit: 'commit' }[
      event
    ];
    if (name === 'commit') return;
    await new Promise((resolve, reject) => {
      const check = () => {
        if (this.lifecycle.get(loaderId)?.has(name)) finish(resolve);
        else if (this.closed) finish(() => reject(new TargetClosedError(what)));
      };
      const timer = setTimeout(
        () => finish(() => reject(new TimeoutError(`${what}: Timeout ${timeout}ms exceeded, waiting for "${event}"`))),
        timeout
      );
      const finish = (then) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        then();
      };
      this.waiters.add(check);
      check();
    });
  }

  /** Goes to a URL; gives the response of its document (null for the same document, or a file). */
  async goto(url, { timeout = this.timeout, waitUntil = 'load' } = {}) {
    const before = this.navigations;
    const result = await this.session.send('Page.navigate', { url, frameId: this.mainFrameId });
    if (result.errorText) throw new Error(`page.goto: ${result.errorText} at ${url}`);
    if (!result.loaderId) {
      // In the same document (a new #hash): until the page has navigated (there, or wherever the page sent itself
      // meanwhile).
      await this.retry(`page.goto(${url})`, timeout, async () =>
        this.navigations > before ? { done: null } : { wait: 'navigating' }
      );
      return null;
    }
    await this.waitForLoad(result.loaderId, waitUntil, timeout, `page.goto(${url})`);
    return this.documents.get(result.loaderId) ?? null;
  }

  async reload({ timeout = this.timeout, waitUntil = 'load' } = {}) {
    const navigated = new Promise((resolve) => {
      const onFrame = (frame) => {
        if (frame.parentId) return;
        this.off('framenavigated', onFrame);
        resolve(frame);
      };
      this.on('framenavigated', onFrame);
    });
    await this.session.send('Page.reload');
    const frame = await navigated;
    await this.waitForLoad(frame.loaderId, waitUntil, timeout, 'page.reload');
    return this.documents.get(frame.loaderId) ?? null;
  }

  async title() {
    return this.evaluate(() => globalThis.document.title);
  }

  async content() {
    return this.evaluate(() => globalThis.document.documentElement.outerHTML);
  }

  async setContent(html, options = {}) {
    await this.goto(`data:text/html,${encodeURIComponent(html)}`, options);
  }

  async setViewportSize({ width, height }) {
    await this.session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async close() {
    if (this.closed) return;
    const detached = new Promise((done) => this.session.once('detached', done));
    await this.session.connection.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await detached;
    if (this.ownsContext) await this._context.close();
  }

  // ------------------------------------------------------------------------------------------------------ waiting

  async waitForTimeout(ms) {
    await sleep(ms);
  }

  /** Until the function is true in the page: its value. */
  async waitForFunction(fn, arg, { timeout = this.timeout, polling } = {}) {
    const interval = typeof polling === 'number' ? polling : 30;
    const expression = callOf(fn, arg);
    const deadline = Date.now() + timeout;
    for (;;) {
      let value;
      try {
        value = await this.evaluateExpression(expression);
      } catch (err) {
        if (!/context was destroyed|Cannot find context|Execution context/i.test(err.message)) throw err;
      }
      if (value) return { jsonValue: async () => value };
      if (Date.now() >= deadline) throw new TimeoutError(`page.waitForFunction: Timeout ${timeout}ms exceeded.`);
      await sleep(interval);
    }
  }

  /** Until an element of the selector is as state says (visible by default): it, or null (hidden, detached). */
  async waitForSelector(selector, { state = 'visible', timeout = this.timeout, strict = false } = {}) {
    const target = { selector };
    return this.retry(`page.waitForSelector(${JSON.stringify(selector)})`, timeout, async () => {
      const now = await this.helper('state', target);
      if (now.wait) return now;
      if (strict && now.count > 1) return { error: `strict: ${now.count} elements` };
      const ok =
        state === 'attached'
          ? now.attached
          : state === 'detached'
            ? !now.attached
            : state === 'hidden'
              ? !now.visible
              : now.visible;
      if (!ok) return { wait: state === 'visible' && now.attached ? 'not visible' : 'not there' };
      return {
        done:
          state === 'detached' || state === 'hidden'
            ? null
            : new ElementHandle(this, { chain: [{ selector, nth: 0 }] }),
      };
    });
  }

  /** The next response whose URL is this (or matches this RegExp), or that the predicate takes. */
  waitForResponse(match, { timeout = this.timeout } = {}) {
    return this.waitForEvent('response', {
      timeout,
      predicate: (response) =>
        typeof match === 'function'
          ? match(response)
          : match instanceof RegExp
            ? match.test(response.url())
            : response.url() === match,
    });
  }

  waitForRequest(match, { timeout = this.timeout } = {}) {
    return this.waitForEvent('request', {
      timeout,
      predicate: (request) =>
        typeof match === 'function'
          ? match(request)
          : match instanceof RegExp
            ? match.test(request.url())
            : request.url() === match,
    });
  }

  waitForEvent(event, options = {}) {
    const { timeout = this.timeout, predicate = () => true } =
      typeof options === 'function' ? { predicate: options } : options;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, listener);
        reject(new TimeoutError(`page.waitForEvent(${event}): Timeout ${timeout}ms exceeded.`));
      }, timeout);
      const listener = async (value) => {
        if (!(await predicate(value))) return;
        clearTimeout(timer);
        this.off(event, listener);
        resolve(value);
      };
      this.on(event, listener);
    });
  }

  async waitForURL(match, { timeout = this.timeout } = {}) {
    const test = (url) =>
      typeof match === 'function' ? match(new URL(url)) : match instanceof RegExp ? match.test(url) : url === match;
    await this.retry('page.waitForURL', timeout, async () =>
      test(this.currentUrl) ? { done: true } : { wait: this.currentUrl }
    );
  }

  // ------------------------------------------------------------------------------------------------------- query

  async $(selector) {
    const now = await this.helper('state', { selector });
    return now.attached ? new ElementHandle(this, { chain: [{ selector, nth: 0 }] }) : null;
  }

  async $$(selector) {
    const now = await this.helper('state', { selector });
    return Array.from({ length: now.count ?? 0 }, (_, nth) => new ElementHandle(this, { chain: [{ selector, nth }] }));
  }

  /** The function of the first element of the selector (an error when there is none), and its argument. */
  async $eval(selector, fn, arg) {
    return this.evaluateExpression(
      `(() => { const element = globalThis.__xufaBrowser.query(${JSON.stringify(selector)})[0]; ` +
        `if (!element) throw new Error(${JSON.stringify(`failed to find element matching selector "${selector}"`)}); ` +
        `return (${fn.toString()})(element, ${arg === undefined ? 'undefined' : JSON.stringify(arg)}); })()`
    );
  }

  /** The function of the elements of the selector (an array), and its argument. */
  async $$eval(selector, fn, arg) {
    return this.evaluateExpression(
      `(${fn.toString()})(globalThis.__xufaBrowser.query(${JSON.stringify(selector)}), ${
        arg === undefined ? 'undefined' : JSON.stringify(arg)
      })`
    );
  }

  locator(selector, options = {}) {
    return new Locator(this, [
      { selector, ...(options.hasText !== undefined ? { hasText: textOption(options.hasText) } : {}) },
    ]);
  }

  getByText(text, { exact = false } = {}) {
    return this.locator(`text=${exact ? JSON.stringify(text) : text}`);
  }

  getByRole(role, { name, exact = false } = {}) {
    return this.locator(
      `role=${role}${name === undefined ? '' : `[name=${JSON.stringify(name)}${exact ? 's' : 'i'}]`}`
    );
  }

  // ----------------------------------------------------------------------------------------------------- actions

  // The actions on a target ({ selector } or { chain }); strict: one element only (locators).

  async clickTarget(
    target,
    strict,
    what,
    { button = 'left', clickCount = 1, delay = 0, force = false, position, timeout, modifiers = [] } = {}
  ) {
    const point = await this.retry(what, timeout, async () => {
      const result = await this.helper('clickPoint', target, strict, { force, position });
      return result.x === undefined ? result : { done: result };
    });
    for (const modifier of modifiers) await this.keyboard.down(modifier);
    await this.mouse.click(point.x, point.y, { button, clickCount, delay });
    for (const modifier of modifiers) await this.keyboard.up(modifier);
  }

  async fillTarget(target, strict, value, what, { timeout } = {}) {
    const ready = await this.retry(what, timeout, async () => {
      const result = await this.helper('prepareFill', target, strict, String(value));
      return result.set || result.type ? { done: result } : result;
    });
    if (ready.set) return;
    if (value === '') await this.keyboard.press('Delete');
    else await this.keyboard.insertText(String(value));
  }

  async readTarget(target, strict, what, kind, name, { timeout } = {}) {
    return this.retry(what, timeout, async () => {
      const result = await this.helper('read', target, strict, kind, name);
      return 'value' in result ? { done: result.value } : result;
    });
  }

  async selectTarget(target, strict, values, what, { timeout } = {}) {
    const wanted = (Array.isArray(values) ? values : [values]).map((value) =>
      typeof value === 'object' ? value : String(value)
    );
    return this.retry(what, timeout, async () => {
      const result = await this.helper('selectOption', target, strict, wanted);
      return result.values ? { done: result.values } : result;
    });
  }

  async checkTarget(target, strict, checked, what, options = {}) {
    if ((await this.readTarget(target, strict, what, 'checked', undefined, options)) === checked) return;
    await this.clickTarget(target, strict, what, options);
    if ((await this.readTarget(target, strict, what, 'checked', undefined, options)) !== checked) {
      throw new Error(`${what}: clicking did not change the checked state`);
    }
  }

  async pressTarget(target, strict, key, what, options = {}) {
    await this.retry(what, options.timeout, async () => {
      const result = await this.helper('focus', target, strict);
      return result.ok ? { done: true } : result;
    });
    await this.keyboard.press(key, options);
  }

  click(selector, options) {
    return this.clickTarget({ selector }, false, `page.click(${JSON.stringify(selector)})`, options);
  }

  dblclick(selector, options) {
    return this.clickTarget({ selector }, false, `page.dblclick(${JSON.stringify(selector)})`, {
      ...options,
      clickCount: 2,
    });
  }

  fill(selector, value, options) {
    return this.fillTarget({ selector }, false, value, `page.fill(${JSON.stringify(selector)})`, options);
  }

  async type(selector, text, options) {
    await this.pressTarget({ selector }, false, '', `page.type(${JSON.stringify(selector)})`, options).catch(() => {});
    await this.keyboard.type(text, options);
  }

  press(selector, key, options) {
    return this.pressTarget({ selector }, false, key, `page.press(${JSON.stringify(selector)})`, options);
  }

  check(selector, options) {
    return this.checkTarget({ selector }, false, true, `page.check(${JSON.stringify(selector)})`, options);
  }

  uncheck(selector, options) {
    return this.checkTarget({ selector }, false, false, `page.uncheck(${JSON.stringify(selector)})`, options);
  }

  selectOption(selector, values, options) {
    return this.selectTarget({ selector }, false, values, `page.selectOption(${JSON.stringify(selector)})`, options);
  }

  textContent(selector, options) {
    return this.readTarget(
      { selector },
      false,
      `page.textContent(${JSON.stringify(selector)})`,
      'textContent',
      undefined,
      options
    );
  }

  innerText(selector, options) {
    return this.readTarget(
      { selector },
      false,
      `page.innerText(${JSON.stringify(selector)})`,
      'innerText',
      undefined,
      options
    );
  }

  innerHTML(selector, options) {
    return this.readTarget(
      { selector },
      false,
      `page.innerHTML(${JSON.stringify(selector)})`,
      'innerHTML',
      undefined,
      options
    );
  }

  getAttribute(selector, name, options) {
    return this.readTarget(
      { selector },
      false,
      `page.getAttribute(${JSON.stringify(selector)})`,
      'attribute',
      name,
      options
    );
  }

  inputValue(selector, options) {
    return this.readTarget(
      { selector },
      false,
      `page.inputValue(${JSON.stringify(selector)})`,
      'inputValue',
      undefined,
      options
    );
  }

  isChecked(selector, options) {
    return this.readTarget(
      { selector },
      false,
      `page.isChecked(${JSON.stringify(selector)})`,
      'checked',
      undefined,
      options
    );
  }

  /** Visible now (no waiting). */
  async isVisible(selector) {
    const now = await this.helper('state', { selector });
    return !!now.visible;
  }

  async isHidden(selector) {
    return !(await this.isVisible(selector));
  }

  async focus(selector, options) {
    await this.pressTarget({ selector }, false, '', `page.focus(${JSON.stringify(selector)})`, options).catch(() => {});
  }

  async hover(selector, options = {}) {
    const point = await this.retry(`page.hover(${JSON.stringify(selector)})`, options.timeout, async () => {
      const result = await this.helper('clickPoint', { selector }, false, options);
      return result.x === undefined ? result : { done: result };
    });
    await this.mouse.move(point.x, point.y);
  }

  /** A PNG of the page (the whole page with fullPage), written to path too when given. */
  async screenshot({ path, fullPage = false, clip } = {}) {
    const params = { format: 'png' };
    if (clip) params.clip = { ...clip, scale: 1 };
    else if (fullPage) {
      const { cssContentSize } = await this.session.send('Page.getLayoutMetrics');
      params.clip = {
        x: 0,
        y: 0,
        width: Math.ceil(cssContentSize.width),
        height: Math.ceil(cssContentSize.height),
        scale: 1,
      };
      params.captureBeyondViewport = true;
    }
    const { data } = await this.session.send('Page.captureScreenshot', params);
    const buffer = Buffer.from(data, 'base64');
    if (path) fs.writeFileSync(path, buffer);
    return buffer;
  }
}

// hasText of locators: a string, or a RegExp (as its source and flags, for the page).
const textOption = (value) => (value instanceof RegExp ? { source: value.source, flags: value.flags } : String(value));

class Locator {
  constructor(page, chain) {
    this.page = page;
    this.chain = chain;
  }

  get target() {
    return { chain: this.chain };
  }

  get what() {
    return `locator(${this.chain.map((step) => JSON.stringify(step.selector)).join(' >> ')})`;
  }

  locator(selector, options = {}) {
    return new Locator(this.page, [
      ...this.chain,
      { selector, ...(options.hasText !== undefined ? { hasText: textOption(options.hasText) } : {}) },
    ]);
  }

  filter({ hasText } = {}) {
    const last = this.chain[this.chain.length - 1];
    return new Locator(this.page, [...this.chain.slice(0, -1), { ...last, hasText: textOption(hasText) }]);
  }

  nth(index) {
    const last = this.chain[this.chain.length - 1];
    // (Of what the step finds: a step that has its nth already is narrowed again, by a step of its own.)
    if (last.nth !== undefined) return new Locator(this.page, [...this.chain, { selector: ':scope', nth: index }]);
    return new Locator(this.page, [...this.chain.slice(0, -1), { ...last, nth: index }]);
  }

  first() {
    return this.nth(0);
  }

  last() {
    return this.nth(-1);
  }

  async count() {
    const found = await this.page.helper('state', this.target);
    return found.count ?? 0;
  }

  async all() {
    return Array.from({ length: await this.count() }, (_, index) => this.nth(index));
  }

  click(options) {
    return this.page.clickTarget(this.target, true, `${this.what}.click`, options);
  }

  dblclick(options) {
    return this.page.clickTarget(this.target, true, `${this.what}.dblclick`, { ...options, clickCount: 2 });
  }

  fill(value, options) {
    return this.page.fillTarget(this.target, true, value, `${this.what}.fill`, options);
  }

  press(key, options) {
    return this.page.pressTarget(this.target, true, key, `${this.what}.press`, options);
  }

  check(options) {
    return this.page.checkTarget(this.target, true, true, `${this.what}.check`, options);
  }

  uncheck(options) {
    return this.page.checkTarget(this.target, true, false, `${this.what}.uncheck`, options);
  }

  selectOption(values, options) {
    return this.page.selectTarget(this.target, true, values, `${this.what}.selectOption`, options);
  }

  textContent(options) {
    return this.page.readTarget(this.target, true, `${this.what}.textContent`, 'textContent', undefined, options);
  }

  innerText(options) {
    return this.page.readTarget(this.target, true, `${this.what}.innerText`, 'innerText', undefined, options);
  }

  getAttribute(name, options) {
    return this.page.readTarget(this.target, true, `${this.what}.getAttribute`, 'attribute', name, options);
  }

  inputValue(options) {
    return this.page.readTarget(this.target, true, `${this.what}.inputValue`, 'inputValue', undefined, options);
  }

  isChecked(options) {
    return this.page.readTarget(this.target, true, `${this.what}.isChecked`, 'checked', undefined, options);
  }

  boundingBox(options) {
    return this.page.readTarget(this.target, true, `${this.what}.boundingBox`, 'box', undefined, options);
  }

  async isVisible() {
    const now = await this.page.helper('state', this.target);
    return !!now.visible;
  }

  async isHidden() {
    return !(await this.isVisible());
  }

  async waitFor({ state = 'visible', timeout } = {}) {
    await this.page.retry(`${this.what}.waitFor`, timeout, async () => {
      const now = await this.page.helper('state', this.target);
      if (now.wait) return now;
      const ok =
        state === 'attached'
          ? now.attached
          : state === 'detached'
            ? !now.attached
            : state === 'hidden'
              ? !now.visible
              : now.visible;
      return ok ? { done: true } : { wait: state };
    });
  }

  async hover(options = {}) {
    const point = await this.page.retry(`${this.what}.hover`, options.timeout, async () => {
      const result = await this.page.helper('clickPoint', this.target, true, options);
      return result.x === undefined ? result : { done: result };
    });
    await this.page.mouse.move(point.x, point.y);
  }

  async screenshot(options = {}) {
    const box = await this.boundingBox(options);
    if (!box) throw new Error(`${this.what}.screenshot: not visible`);
    return this.page.screenshot({ ...options, clip: box });
  }

  async evaluate(fn, arg) {
    return this.page.evaluateExpression(
      `(${fn.toString()})(globalThis.__xufaBrowser.resolve(${JSON.stringify(this.target)})[0], ${
        arg === undefined ? 'undefined' : JSON.stringify(arg)
      })`
    );
  }
}

// What $ and waitForSelector give: an element, as a locator of it (found again by its selector and index).
class ElementHandle extends Locator {}

export { Page, Locator, ElementHandle, TimeoutError, ConsoleMessage, Dialog, Request, Response };
