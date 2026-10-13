// @xufa/browser: Chrome and Edge driven through the DevTools Protocol, for tests of pages, with the API of Playwright
// for what it has (chromium.launch, contexts, pages, locators, the keyboard and the mouse). No dependencies.
export { launch, findBrowser, chromium, Browser, BrowserContext } from './lib/browser.js';
export { Page, Locator, ElementHandle, TimeoutError, ConsoleMessage, Dialog, Request, Response } from './lib/page.js';
export { ProtocolError, TargetClosedError } from './lib/connection.js';
