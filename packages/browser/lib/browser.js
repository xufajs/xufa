// Chrome or Edge started with --remote-debugging-pipe, in a profile of its own (removed when it closes); browser
// contexts (each its cookies and storage), and their pages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Connection } from './connection.js';
import { Page } from './page.js';

// Where Chrome and Edge are installed, on each system; CHROME (or the option executablePath) gives another.
const CANDIDATES = {
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
};

/** The Chrome (or Chromium, or Edge) of this machine: CHROME, else where they install themselves; null if none. */
function findBrowser() {
  return (
    [process.env.CHROME, ...(CANDIDATES[process.platform] ?? CANDIDATES.linux)].find(
      (candidate) => candidate && fs.existsSync(candidate)
    ) ?? null
  );
}

const ARGS = [
  '--remote-debugging-pipe',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-breakpad',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-sync',
  '--disable-features=Translate,MediaRouter,OptimizationHints,DialMediaRouteProvider',
  '--metrics-recording-only',
  '--password-store=basic',
  '--use-mock-keychain',
  '--mute-audio',
  '--hide-scrollbars',
];

class BrowserContext {
  constructor(browser, id, options) {
    this.browser = browser;
    this.id = id;
    this.options = options;
    this.timeout = options.timeout;
    this.openPages = new Set();
    this.closed = false;
  }

  pages() {
    return [...this.openPages];
  }

  async newPage() {
    const { connection } = this.browser;
    const { targetId } = await connection.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: this.id,
    });
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, connection.session(sessionId), targetId);
    this.openPages.add(page);
    page.once('close', () => this.openPages.delete(page));
    await page.init({
      viewport: this.options.viewport ?? { width: 1280, height: 720 },
      locale: this.options.locale,
      userAgent: this.browser.userAgent,
    });
    return page;
  }

  setDefaultTimeout(timeout) {
    this.timeout = timeout;
    for (const page of this.openPages) page.setDefaultTimeout(timeout);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.browser.contexts.delete(this);
    if (this.browser.connection.closed) return;
    await this.browser.connection.send('Target.disposeBrowserContext', { browserContextId: this.id }).catch(() => {});
  }
}

class Browser {
  constructor(child, connection, userDataDir) {
    this.child = child;
    this.connection = connection;
    this.userDataDir = userDataDir;
    this.contexts = new Set();
    this.userAgent = '';
    this.closed = false;
    this.exited = new Promise((resolve) => child.once('exit', resolve));
  }

  version() {
    return this.product;
  }

  isConnected() {
    return !this.connection.closed;
  }

  /** A context of its own (cookies, storage): locale (and Accept-Language), viewport ({ width, height }). */
  async newContext(options = {}) {
    const { browserContextId } = await this.connection.send('Target.createBrowserContext', { disposeOnDetach: true });
    const context = new BrowserContext(this, browserContextId, options);
    this.contexts.add(context);
    return context;
  }

  /** A page in a context of its own, closed with it. */
  async newPage(options = {}) {
    const context = await this.newContext(options);
    const page = await context.newPage();
    page.ownsContext = true;
    return page;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.connection.send('Browser.close').catch(() => {});
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 5000);
    await this.exited;
    clearTimeout(timer);
    // (Windows keeps the files of a profile a moment after the browser exits.)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 100));
      }
    }
  }
}

/** Starts Chrome or Edge (executablePath, else findBrowser()); headless unless headless: false. */
async function launch({ executablePath = findBrowser(), headless = true, args = [], timeout = 30_000, env } = {}) {
  if (!executablePath) {
    throw new Error('No Chrome, Chromium or Edge found: install one, or set CHROME (or executablePath) to it');
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-browser-'));
  const child = spawn(
    executablePath,
    [...ARGS, ...(headless ? ['--headless=new'] : []), `--user-data-dir=${userDataDir}`, ...args, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: env ?? process.env, windowsHide: true }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const connection = new Connection(child.stdio[4], child.stdio[3]);
  const browser = new Browser(child, connection, userDataDir);
  child.once('exit', () => connection.close());
  const failed = new Promise((_, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`The browser exited (${code}) before it answered:\n${stderr}`)));
  });
  const timer = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`The browser did not answer in ${timeout}ms:\n${stderr}`)), timeout).unref();
  });
  try {
    const version = await Promise.race([connection.send('Browser.getVersion'), failed, timer]);
    browser.product = version.product;
    // (As a browser that shows its window: some pages treat "HeadlessChrome" apart.)
    browser.userAgent = version.userAgent.replace('HeadlessChrome', 'Chrome');
  } catch (err) {
    child.kill('SIGKILL');
    throw err;
  }
  failed.catch(() => {});
  return browser;
}

const chromium = { launch, executablePath: findBrowser };

export { launch, findBrowser, chromium, Browser, BrowserContext };
