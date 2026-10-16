// Runs tests of web-platform-tests (test/wpt, copied by tools/port-wpt) on the DOM of @xufa/html, as a browser runs a
// page: its scripts in document order (WPT's own testharness.js, and what the page loads), then the load event; the
// results are what testharness.js reports. Each page is a realm of its own (a vm context) where the DOM itself runs too
// (bundled once by @xufa/bundle), so that its objects and the errors it throws are the page's, as in a browser.
//
// The window has what testharness.js needs and nothing more: timers, the load and error events of the window, a
// location. No events of nodes, iframes, layout or MutationObserver: the tests that need them fail, as they should.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { bundle } from '@xufa/bundle';

const ROOT = path.join(import.meta.dirname, '../wpt');
const FOLDERS = ['dom/nodes', 'dom/traversal', 'dom/collections', 'dom/lists'];
const STATUS = ['PASS', 'FAIL', 'TIMEOUT', 'NOTRUN', 'PRECONDITION_FAILED'];
const HARNESS = ['OK', 'ERROR', 'TIMEOUT', 'PRECONDITION_FAILED'];
// A page whose harness never reports (it waits for an event that never comes) is given up after this.
const PAGE_TIMEOUT = 60000;

// testharnessreport.js: no output in the page; the results to the runner; the timeouts of testharness.js (10 s,
// 60 s for long tests) times multiplier.
const harnessReport = (multiplier) => `
setup({ output: false, timeout_multiplier: ${multiplier} });
add_completion_callback(function (tests, status) {
  __done(
    tests.map(function (t) { return { name: t.name, status: t.status, message: t.message }; }),
    { status: status.status, message: status.message }
  );
});`;

let dom = null;
// The DOM as a script, compiled once and run in the realm of each page.
function domScript() {
  if (!dom) {
    const { js } = bundle(path.join(import.meta.dirname, '../../dom.js'), { globalName: '__xufaDom' });
    dom = new vm.Script(js, { filename: '@xufa/html/dom' });
  }
  return dom;
}

// The test files: pages that load testharness.js, and the .window.js and .any.js tests (made pages as WPT's server
// makes them). Not the documents tests load, references or crash tests.
function testFiles() {
  return FOLDERS.flatMap((folder) =>
    fs
      .readdirSync(path.join(ROOT, folder), { recursive: true })
      .map((file) => `${folder}/${file.split(path.sep).join('/')}`)
      .filter((file) => !/\/(resources|support|crashtests)\//.test(file) && !/-(ref|crash)\.html$/.test(file))
      .filter(
        (file) =>
          /\.(window|any)\.js$/.test(file) ||
          (/\.(html|xhtml|svg|xml)$/.test(file) &&
            /\/resources\/testharness\.js/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')))
      )
  ).sort();
}

function pageOf(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (/\.(window|any)\.js$/.test(file)) {
    const metas = [...text.matchAll(/^\/\/ META: (\w+)=(.*)$/gm)];
    const scripts = metas.filter(([, key]) => key === 'script').map(([, , value]) => `<script src="${value.trim()}"></script>`);
    const title = metas.find(([, key]) => key === 'title')?.[2] ?? '';
    return {
      type: 'text/html',
      source:
        `<!doctype html><meta charset=utf-8><title>${title}</title>` +
        '<script src=/resources/testharness.js></script><script src=/resources/testharnessreport.js></script>' +
        `${scripts.join('')}<div id=log></div><script src="${path.posix.basename(file)}"></script>`,
    };
  }
  let type = 'text/html';
  if (/\.(xhtml|xht)$/.test(file)) type = 'application/xhtml+xml';
  else if (file.endsWith('.svg')) type = 'image/svg+xml';
  else if (file.endsWith('.xml')) type = 'application/xml';
  return { type, source: text };
}

// The error of a page that a timer or a promise of it threw: reported to the page (window error event), as browsers do.
let reportToPage = null;
process.on('unhandledRejection', (error) => reportToPage?.(error));

// Runs a test page: { harness: 'OK' | 'ERROR: ...' | ..., tests: [{ name, status, message }] }.
function runPage(file, multiplier = 1) {
  return new Promise((resolve) => {
    const context = vm.createContext({});
    domScript().runInContext(context);
    const window = vm.runInContext('globalThis', context);
    const { INTERFACES, DOMParser } = window.__xufaDom;
    const { type, source } = pageOf(file);
    const document = new DOMParser().parseFromString(source, type);
    // (The window of the page, as createWindow() makes it.)
    document._defaultView = window;
    const listeners = {};
    const report = (error) => {
      for (const listener of listeners.error ?? []) {
        listener({ type: 'error', error, message: String(error), filename: '', lineno: 0 });
      }
    };
    const guarded = (fn) => {
      reportToPage = report;
      try {
        fn();
      } catch (error) {
        report(error);
      }
    };
    Object.assign(window, INTERFACES, {
      document,
      window,
      self: window,
      parent: window,
      top: window,
      opener: null,
      frames: window,
      location: { href: `http://web-platform.test:8000/${file}`, protocol: 'http:', search: '', hash: '' },
      setTimeout: (fn, ms, ...args) =>
        setTimeout(() => guarded(() => (typeof fn === 'function' ? fn(...args) : vm.runInContext(fn, context))), ms),
      clearTimeout,
      setInterval: (fn, ms, ...args) => setInterval(() => guarded(() => fn(...args)), ms),
      clearInterval,
      queueMicrotask,
      console,
      URL,
      URLSearchParams,
      postMessage() {},
      addEventListener(name, listener) {
        (listeners[name] ??= []).push(listener);
      },
      removeEventListener(name, listener) {
        listeners[name] = (listeners[name] ?? []).filter((each) => each !== listener);
      },
    });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ harness: 'TIMEOUT (of the page)', tests: [] }), PAGE_TIMEOUT);
    window.__done = (tests, status) =>
      finish({
        harness: HARNESS[status.status] + (status.message ? `: ${status.message}` : ''),
        tests: tests.map(({ name, status: code, message }) => ({ name, status: STATUS[code], message })),
      });
    const scripts = [...document.getElementsByTagNameNS('*', 'script')];
    const errors = [];
    for (const script of scripts) {
      const src =
        script.getAttribute('src') ??
        script.getAttribute('href') ??
        script.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      let code = script.textContent;
      let name = `${file} (inline)`;
      if (src?.endsWith('testharnessreport.js')) {
        code = harnessReport(multiplier);
      } else if (src) {
        name = src.startsWith('/') ? src.slice(1) : path.posix.join(path.posix.dirname(file), src);
        try {
          code = fs.readFileSync(path.join(ROOT, name), 'utf8');
        } catch {
          errors.push(`no ${src}`);
          continue;
        }
      }
      guarded(() => {
        try {
          vm.runInContext(code, context, { filename: name });
        } catch (error) {
          errors.push(String(error));
          throw error;
        }
      });
    }
    setTimeout(() => {
      guarded(() => {
        const onload = document.documentElement?.getElementsByTagName?.('body')[0]?.getAttribute('onload');
        if (onload) vm.runInContext(onload, context);
        for (const listener of listeners.load ?? []) listener.call(window, { type: 'load', target: window });
        if (typeof window.onload === 'function') window.onload({ type: 'load' });
      });
      if (typeof window.add_completion_callback !== 'function') {
        finish({ harness: `NO HARNESS: ${errors.join('; ')}`, tests: [] });
      }
    }, 0);
  });
}

// Runs the pages, `concurrency` at a time: { [file]: result }.
// (multipliers: of the timeouts of pages, by file; 1 for the others.)
async function runPages(files, { concurrency = 8, multipliers = new Map() } = {}) {
  const results = {};
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next];
      next += 1;
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      results[file] = await runPage(file, multipliers.get(file) ?? 1);
      results[file].ms = Date.now() - started;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

export { ROOT, testFiles, runPage, runPages };
