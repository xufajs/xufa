/* eslint-disable no-console */
// Opens every page of docs/ in a browser, from the disk (file://, as the docs are read without a server), following
// their links from index.html: it fails on a link to a page or file that is not there, to a folder (which a browser
// shows as a list of files), to an anchor that is not in its page, on a page without the style of the site, and on
// an error of a script. Chrome or Edge as installed (CHROME gives another), driven by @xufa/browser.
//
// node tools/docs/crawl.js          (pnpm docs:crawl)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium, findBrowser } from '@xufa/browser';

const DOCS = path.join(import.meta.dirname, '../../docs');

async function crawl() {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.log('docs crawl: no Chrome nor Edge found (CHROME=<path of one>): skipped');
    return { skipped: true };
  }
  const browser = await chromium.launch({ executablePath });
  // (Closed whatever happens: an open browser keeps the process running.)
  try {
    return await crawlWith(browser);
  } finally {
    await browser.close();
  }
}

async function crawlWith(browser) {
  const page = await browser.newPage();
  const start = pathToFileURL(path.join(DOCS, 'index.html')).href;
  const root = start.replace(/index\.html$/, '');
  const short = (url) => url.replace(root, '');
  const problems = [];
  page.on('pageerror', (err) => problems.push(`${short(page.url())}: ${err.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${short(page.url())}: ${message.text()}`);
  });
  const ids = new Map(); // page -> its ids
  const anchors = []; // [from, page, id]
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = fileURLToPath(url);
    if (!fs.existsSync(file)) {
      problems.push(`missing: ${short(url)}`);
      continue;
    }
    if (fs.statSync(file).isDirectory()) {
      problems.push(`a folder, not a page: ${short(url)}`);
      continue;
    }
    if (!file.endsWith('.html')) continue;
    await page.goto(url);
    // The style of the site is there (the header is laid out by style.css).
    const styled = await page
      .$eval('header.header', (header) => window.getComputedStyle(header).position !== 'static') // eslint-disable-line no-undef
      .catch(() => false);
    if (!styled) problems.push(`no style: ${short(url)}`);
    ids.set(url, new Set(await page.$$eval('[id]', (elements) => elements.map((element) => element.id))));
    const links = await page.$$eval('a[href], link[href], script[src]', (elements) =>
      elements.map((element) => element.href || element.src)
    );
    for (const link of links) {
      if (!link.startsWith(root)) continue;
      const [target, anchor] = link.split('#');
      const clean = target.split('?')[0];
      if (anchor && clean.endsWith('.html')) anchors.push([url, clean, decodeURIComponent(anchor)]);
      queue.push(clean);
    }
  }
  for (const [from, target, id] of anchors) {
    if (ids.has(target) && !ids.get(target).has(id)) problems.push(`no #${id} in ${short(target)} (${short(from)})`);
  }
  return { pages: ids.size, anchors: anchors.length, problems: [...new Set(problems)] };
}

if (process.argv[1] === import.meta.filename) {
  crawl().then(
    (result) => {
      if (result.skipped) return;
      console.log(`docs crawl: ${result.pages} pages opened from disk, ${result.anchors} links to anchors checked`);
      if (result.problems.length) {
        console.log(result.problems.map((problem) => `  ${problem}`).join('\n'));
        process.exitCode = 1;
      }
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    }
  );
}

export { crawl };
