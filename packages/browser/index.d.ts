// The types of @xufa/browser: Chrome and Edge through the DevTools Protocol, with the API of Playwright for what it
// has.

/// <reference types="node" />

export interface LaunchOptions {
  /** The browser to start: Chrome, Chromium or Edge (findBrowser() by default). */
  executablePath?: string | null;
  /** Without a window (true by default). */
  headless?: boolean;
  /** More arguments of the browser. */
  args?: string[];
  /** Ms the browser has to answer once started (30000). */
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ContextOptions {
  /** The language of the pages: navigator.language, Intl and the Accept-Language header. */
  locale?: string;
  /** The size of the pages (1280 x 720 by default). */
  viewport?: { width: number; height: number };
  /** Ms actions and waits of its pages wait (30000 by default). */
  timeout?: number;
}

export interface TimeoutOptions {
  timeout?: number;
}

export interface ClickOptions extends TimeoutOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
  /** Without the checks of actions (visible, enabled, still, the element a click would hit). */
  force?: boolean;
  /** Where, from the top left of the element (its center by default). */
  position?: { x: number; y: number };
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

export type SelectOptionValue = string | { value?: string; label?: string; index?: number };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaitForSelectorOptions extends TimeoutOptions {
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  /** An error when the selector has more than one element. */
  strict?: boolean;
}

export interface NavigationOptions extends TimeoutOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

export interface ScreenshotOptions {
  /** Written there too. */
  path?: string;
  /** The whole page, not only what the viewport shows. */
  fullPage?: boolean;
  clip?: Box;
}

/** Options of the elements of a locator: those with this text (part of it, in any case), or that match this. */
export interface LocatorOptions {
  hasText?: string | RegExp;
}

export declare class TimeoutError extends Error {}
export declare class TargetClosedError extends Error {}
export declare class ProtocolError extends Error {
  code: number;
}

export declare class ConsoleMessage {
  /** 'log', 'debug', 'info', 'error', 'warning'... */
  type(): string;
  text(): string;
  location(): { url?: string; lineNumber?: number; columnNumber?: number };
}

export declare class Dialog {
  type(): 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message(): string;
  defaultValue(): string;
  accept(promptText?: string): Promise<void>;
  dismiss(): Promise<void>;
}

export declare class Request {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): string | null;
}

export declare class Response {
  url(): string;
  status(): number;
  ok(): boolean;
  headers(): Record<string, string>;
  request(): Request | null;
  /** Once the request has finished loading. */
  body(): Promise<Buffer>;
  text(): Promise<string>;
  json(): Promise<any>;
}

/** Elements found again by their selectors each time; actions on them wait for one, and fail on more (strict). */
export declare class Locator {
  locator(selector: string, options?: LocatorOptions): Locator;
  filter(options: LocatorOptions): Locator;
  nth(index: number): Locator;
  first(): Locator;
  last(): Locator;
  count(): Promise<number>;
  all(): Promise<Locator[]>;
  click(options?: ClickOptions): Promise<void>;
  dblclick(options?: ClickOptions): Promise<void>;
  fill(value: string, options?: TimeoutOptions): Promise<void>;
  press(key: string, options?: TimeoutOptions & { delay?: number }): Promise<void>;
  check(options?: ClickOptions): Promise<void>;
  uncheck(options?: ClickOptions): Promise<void>;
  selectOption(values: SelectOptionValue | SelectOptionValue[], options?: TimeoutOptions): Promise<string[]>;
  textContent(options?: TimeoutOptions): Promise<string | null>;
  innerText(options?: TimeoutOptions): Promise<string>;
  getAttribute(name: string, options?: TimeoutOptions): Promise<string | null>;
  inputValue(options?: TimeoutOptions): Promise<string>;
  isChecked(options?: TimeoutOptions): Promise<boolean>;
  /** null when it is not visible. */
  boundingBox(options?: TimeoutOptions): Promise<Box | null>;
  isVisible(): Promise<boolean>;
  isHidden(): Promise<boolean>;
  waitFor(options?: WaitForSelectorOptions): Promise<void>;
  hover(options?: ClickOptions): Promise<void>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  evaluate<R, A = undefined>(fn: (element: Element, arg: A) => R | Promise<R>, arg?: A): Promise<R>;
}

/** An element of $ and waitForSelector: found again by its selector and index. */
export declare class ElementHandle extends Locator {}

export interface Keyboard {
  down(key: string): Promise<void>;
  up(key: string): Promise<void>;
  /** A key, or keys held together: 'Enter', 'Shift+Tab', 'Control+a'. */
  press(key: string, options?: { delay?: number }): Promise<void>;
  /** Characters, one key each. */
  type(text: string, options?: { delay?: number }): Promise<void>;
  insertText(text: string): Promise<void>;
}

export interface Mouse {
  move(x: number, y: number, options?: { steps?: number }): Promise<void>;
  down(options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<void>;
  up(options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<void>;
  click(
    x: number,
    y: number,
    options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number; delay?: number }
  ): Promise<void>;
  dblclick(x: number, y: number, options?: { button?: 'left' | 'right' | 'middle'; delay?: number }): Promise<void>;
  wheel(deltaX: number, deltaY: number): Promise<void>;
}

export interface PageEvents {
  console: (message: ConsoleMessage) => void;
  pageerror: (error: Error) => void;
  dialog: (dialog: Dialog) => void;
  request: (request: Request) => void;
  response: (response: Response) => void;
  close: (page: Page) => void;
}

export declare class Page {
  keyboard: Keyboard;
  mouse: Mouse;
  on<E extends keyof PageEvents>(event: E, listener: PageEvents[E]): this;
  once<E extends keyof PageEvents>(event: E, listener: PageEvents[E]): this;
  off<E extends keyof PageEvents>(event: E, listener: PageEvents[E]): this;
  context(): BrowserContext;
  url(): string;
  isClosed(): boolean;
  setDefaultTimeout(timeout: number): void;
  /** The response of its document; null in the same document (a new #hash) or for a file. */
  goto(url: string, options?: NavigationOptions): Promise<Response | null>;
  reload(options?: NavigationOptions): Promise<Response | null>;
  title(): Promise<string>;
  content(): Promise<string>;
  setContent(html: string, options?: NavigationOptions): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  close(): Promise<void>;
  evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  waitForTimeout(ms: number): Promise<void>;
  /** Until the function is truthy in the page (an error in it fails the wait). */
  waitForFunction<R, A = undefined>(
    fn: (arg: A) => R | Promise<R>,
    arg?: A,
    options?: TimeoutOptions & { polling?: number }
  ): Promise<{ jsonValue(): Promise<R> }>;
  waitForSelector(selector: string, options?: WaitForSelectorOptions): Promise<ElementHandle | null>;
  waitForResponse(
    match: string | RegExp | ((response: Response) => boolean | Promise<boolean>),
    options?: TimeoutOptions
  ): Promise<Response>;
  waitForRequest(
    match: string | RegExp | ((request: Request) => boolean | Promise<boolean>),
    options?: TimeoutOptions
  ): Promise<Request>;
  waitForEvent<E extends keyof PageEvents>(
    event: E,
    options?: TimeoutOptions & { predicate?: (value: Parameters<PageEvents[E]>[0]) => boolean | Promise<boolean> }
  ): Promise<Parameters<PageEvents[E]>[0]>;
  waitForURL(match: string | RegExp | ((url: URL) => boolean), options?: TimeoutOptions): Promise<void>;
  $(selector: string): Promise<ElementHandle | null>;
  $$(selector: string): Promise<ElementHandle[]>;
  $eval<R, A = undefined>(selector: string, fn: (element: Element, arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  $$eval<R, A = undefined>(selector: string, fn: (elements: Element[], arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  locator(selector: string, options?: LocatorOptions): Locator;
  getByText(text: string, options?: { exact?: boolean }): Locator;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator;
  click(selector: string, options?: ClickOptions): Promise<void>;
  dblclick(selector: string, options?: ClickOptions): Promise<void>;
  fill(selector: string, value: string, options?: TimeoutOptions): Promise<void>;
  type(selector: string, text: string, options?: TimeoutOptions & { delay?: number }): Promise<void>;
  press(selector: string, key: string, options?: TimeoutOptions & { delay?: number }): Promise<void>;
  check(selector: string, options?: ClickOptions): Promise<void>;
  uncheck(selector: string, options?: ClickOptions): Promise<void>;
  selectOption(
    selector: string,
    values: SelectOptionValue | SelectOptionValue[],
    options?: TimeoutOptions
  ): Promise<string[]>;
  textContent(selector: string, options?: TimeoutOptions): Promise<string | null>;
  innerText(selector: string, options?: TimeoutOptions): Promise<string>;
  innerHTML(selector: string, options?: TimeoutOptions): Promise<string>;
  getAttribute(selector: string, name: string, options?: TimeoutOptions): Promise<string | null>;
  inputValue(selector: string, options?: TimeoutOptions): Promise<string>;
  isChecked(selector: string, options?: TimeoutOptions): Promise<boolean>;
  /** Now, without waiting. */
  isVisible(selector: string): Promise<boolean>;
  isHidden(selector: string): Promise<boolean>;
  focus(selector: string, options?: TimeoutOptions): Promise<void>;
  hover(selector: string, options?: ClickOptions): Promise<void>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
}

export declare class BrowserContext {
  pages(): Page[];
  newPage(): Promise<Page>;
  setDefaultTimeout(timeout: number): void;
  close(): Promise<void>;
  readonly closed: boolean;
}

export declare class Browser {
  /** Chrome/155.0.8059.40, Edge/... */
  version(): string;
  isConnected(): boolean;
  newContext(options?: ContextOptions): Promise<BrowserContext>;
  /** A page in a context of its own, closed with it. */
  newPage(options?: ContextOptions): Promise<Page>;
  close(): Promise<void>;
}

/** Starts Chrome or Edge in a profile of its own (removed when it closes). */
export declare function launch(options?: LaunchOptions): Promise<Browser>;

/** The Chrome (or Chromium, or Edge) of this machine: CHROME, else where they install themselves; null when none. */
export declare function findBrowser(): string | null;

/** As Playwright's chromium: launch(), and executablePath() (findBrowser()). */
export declare const chromium: { launch: typeof launch; executablePath: typeof findBrowser };
