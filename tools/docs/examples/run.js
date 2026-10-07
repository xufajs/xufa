// The examples of the docs, run: every <pre data-run> of tools/docs/pages/*.page.html is a program that must run
// without an error and end (a server it opens, closed), and when the block after it is a <pre data-output>, print
// exactly that. Each runs in a process of its own, in an async function (top-level await works), with @xufa/* and
// xufa/* resolved to the packages of this repository (resolve.js).
//
//   node tools/docs/examples/run.js            # the examples marked; fails when one does not run as shown
//   node tools/docs/examples/run.js --all      # every JavaScript block, marked or not: which run as they are
//   node tools/docs/examples/run.js http-guide # those of the pages whose names contain this
//   node tools/docs/examples/run.js --show     # and what those without a <pre data-output> print (to show it)
//
// <pre data-run> takes a name for the reports: <pre data-run="decorators">. A <pre data-setup> runs before every
// example after it in its page (the requires a page makes once); <!--run-before: code--> just before an example adds
// code to that one only (a require its page leaves out, values it assumes); <!--run-setup: code--> is code for every
// example after it in its page, not shown (the models a page talks about).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PAGES = path.join(__dirname, '../pages');
const TIMEOUT = 10000;
// Addresses of servers of databases: examples naming them are run only when marked.
const SERVER = /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\//;
const skipped = [];

const unescape = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// The examples of a page: [{ page, line, name, code, output, marked }].
function examplesOf(file, all) {
  const text = fs.readFileSync(path.join(PAGES, file), 'utf8');
  const blocks = [...text.matchAll(/<pre([^>]*)><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g)];
  const examples = [];
  const setups = [];
  let end = 0;
  blocks.forEach((block, i) => {
    const [, preAttributes, codeAttributes, body] = block;
    // Code for every example after it, not shown: <!--run-setup: the models the page talks about -->.
    for (const hidden of text.slice(end, block.index).matchAll(/<!--run-setup:([\s\S]*?)-->/g)) {
      setups.push(unescape(hidden[1].trim()));
    }
    if (/\bdata-setup\b/.test(preAttributes)) {
      setups.push(unescape(body));
      end = block.index + block[0].length;
      return;
    }
    const run = /\bdata-run(?:="([^"]*)")?/.exec(preAttributes);
    const js = /language-js\b/.test(codeAttributes);
    // Code for this example only, in a comment just before it: <!--run-before: const { s } = require(...); -->
    const before = /<!--run-before:([\s\S]*?)-->\s*$/.exec(text.slice(end, block.index));
    end = block.index + block[0].length;
    if (/language-ts\b/.test(codeAttributes)) return; // type-checked by types.js
    if (!run && !(all && js && body.trim())) return;
    // --all does not run what names a server of a database (it would write to one there is on this machine).
    if (!run && SERVER.test(unescape(body))) {
      skipped.push(`${file}:${text.slice(0, block.index).split('\n').length}`);
      return;
    }
    const next = blocks[i + 1];
    const between = next ? text.slice(block.index + block[0].length, next.index) : '';
    const output =
      next && /\bdata-output\b/.test(next[1]) && between.trim() === ''
        ? unescape(next[3]).replace(/\r\n/g, '\n')
        : null;
    examples.push({
      page: file.replace(/\.page\.html$/, ''),
      line: text.slice(0, block.index).split('\n').length,
      name: run && run[1] ? run[1] : '',
      code: [...setups, before ? before[1].trim() : '', unescape(body)].filter(Boolean).join('\n'),
      output,
      marked: Boolean(run),
    });
  });
  return examples;
}

// Runs one: { ok, reason }.
function runOne(example, dir) {
  const file = path.join(dir, `${example.page}-${example.line}.js`);
  fs.writeFileSync(
    file,
    `'use strict';\n(async () => {\n${example.code}\n})().catch((err) => {\n  console.error(err);\n  process.exitCode = 1;\n});\n`
  );
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 'resolve.js'), file], {
      cwd: dir,
      // As the environment of a machine of development: no NODE_ENV (what examples print may depend on it).
      env: Object.fromEntries(
        Object.entries({ ...process.env, NODE_NO_WARNINGS: '1' }).filter(([name]) => name !== 'NODE_ENV')
      ),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill(), TIMEOUT);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const printed = stdout.replace(/\r\n/g, '\n').trim();
      if (signal) resolve({ ok: false, reason: `did not end in ${TIMEOUT / 1000} s (a server or a timer left open)` });
      else if (code !== 0 || stderr.trim())
        resolve({ ok: false, reason: (stderr.trim() || `exit code ${code}`).split('\n').slice(0, 6).join('\n') });
      else if (example.output !== null && printed !== example.output.trim()) {
        resolve({ ok: false, reason: `printed:\n${printed}\nthe page shows:\n${example.output.trim()}` });
      } else resolve({ ok: true, printed });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const show = args.includes('--show');
  const filter = args.find((arg) => !arg.startsWith('--'));
  const files = fs
    .readdirSync(PAGES)
    .filter((file) => file.endsWith('.page.html'))
    .filter((file) => !filter || file.includes(filter));
  const examples = files.flatMap((file) => examplesOf(file, all));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-docs-examples-'));
  const results = new Array(examples.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(os.availableParallelism() - 1, 8)) }, async () => {
    while (next < examples.length) {
      const index = next;
      next += 1;
      results[index] = await runOne(examples[index], dir);
    }
  });
  await Promise.all(workers);
  fs.rmSync(dir, { recursive: true, force: true });
  const failed = [];
  examples.forEach((example, i) => {
    const where = `${example.page}.page.html:${example.line}${example.name ? ` (${example.name})` : ''}`;
    if (all)
      console.log(
        `${results[i].ok ? 'runs ' : 'fails'} ${example.marked ? '[marked] ' : ''}${where}${results[i].ok ? '' : `: ${results[i].reason.split('\n')[0]}`}`
      );
    if (show && results[i].ok && example.output === null && results[i].printed) {
      console.log(`${where} printed:\n${results[i].printed}\n`);
    }
    if (!results[i].ok && (example.marked || !all))
      failed.push(`${where}\n  ${results[i].reason.replace(/\n/g, '\n  ')}`);
  });
  const marked = examples.filter((example) => example.marked).length;
  const outputs = examples.filter((example) => example.marked && example.output !== null).length;
  if (failed.length) {
    console.log(`docs examples: ${failed.length} of ${marked} failed\n${failed.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`docs examples: ${marked} run as the docs show them (${outputs} with their output checked)`);
  }
  if (all && skipped.length) {
    console.log(`not run, as they name a server of a database: ${skipped.join(', ')}`);
  }
}

main();
