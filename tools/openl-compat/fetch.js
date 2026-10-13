// The example workbooks of OpenL Tablets (its demo projects: examples, tutorials, templates), at a pinned commit, into
// workbooks/ (not in this repository: they are OpenL's, under the LGPL). From a local clone (node fetch.js <clone>),
// or from GitHub.
//
//   node fetch.js                      # from GitHub, at COMMIT
//   node fetch.js ../../../openl-tablets  # from a clone (at any commit: say which in the results)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '52d11b6c88c3387eb142968455d307ca63edd74e';
const here = path.dirname(fileURLToPath(import.meta.url));
// The workbooks, and other files of their projects (the messages of i18n folders).
const files = [
  ...JSON.parse(fs.readFileSync(path.join(here, 'files.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(here, 'resources.json'), 'utf8')),
];
const clone = process.argv[2];
const target = path.join(here, 'workbooks');

let copied = 0;
for (const file of files) {
  const to = path.join(target, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (clone) {
    fs.copyFileSync(path.join(clone, file), to);
  } else {
    const url = `https://raw.githubusercontent.com/openl-tablets/openl-tablets/${COMMIT}/${file
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    fs.writeFileSync(to, Buffer.from(await response.arrayBuffer()));
  }
  copied += 1;
}
console.log(`openl-compat: ${copied} files in workbooks/ (${clone ? `from ${clone}` : `commit ${COMMIT}`})`);
