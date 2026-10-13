# @xufa/browser

Chrome and Edge, as installed on the machine, driven through the DevTools Protocol: pages, locators, the keyboard and
the mouse, with the API of Playwright for what it has. No dependencies and no browsers to download.

```sh
npm install --save-dev @xufa/browser
```

```js
import { chromium, findBrowser } from '@xufa/browser';

describe.skipIf(!findBrowser())('the admin, in a browser', () => {
  let browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it('logs in', async () => {
    const page = await browser.newPage({ locale: 'en-US' });
    await page.goto('http://localhost:3000/admin/');
    await page.fill('#username', 'ada');
    await page.click('button:has-text("Log in")');
    await page.waitForSelector('text=Welcome');
  });
});
```

- `findBrowser()`: `CHROME`, else Chrome, Chromium or Edge where they install themselves; `null` when none.
- Selectors: CSS (lists too), `:has-text()`, `:text()`, `:visible`, `text=`, `role=button[name="Save"]`, `>>`,
  `nth=`; the pseudo-classes inside `:not`, `:is`, `:where` and `:has`.
- Actions wait for their element: there, visible, enabled, still and the one a click would hit. Locators are strict.
- `waitForSelector`, `waitForFunction`, `waitForResponse`, `waitForRequest`, `waitForEvent`, `waitForURL`.
- Events: `console`, `pageerror`, `dialog` (dismissed when no one listens), `request`, `response`.
- Contexts with their locale, viewport and timeout; PNG screenshots of the viewport or the whole page.
- A `TimeoutError` says what was waited for, why it was not done, the URL of the page and the line of the caller.
  `XUFA_BROWSER_DEBUG=1` logs the protocol.

Not there: Firefox and WebKit, frames, routing of requests, tracing, video and downloads.

The browser is started with `--remote-debugging-pipe` (JSON on two pipes: no port, no WebSocket); launching takes about
250 ms.

Docs: [docs/browser](../../docs/browser/index.html).

## License

MIT
