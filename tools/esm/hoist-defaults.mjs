// Hoisted namespace imports (import * as xModule) of modules whose require() gave one value ('module.exports'):
// default imports instead. node tools/esm/hoist-defaults.mjs (after hoist.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../packages');
function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}
let fixed = 0;
for (const file of files(root)) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  text = text.replace(/^import \* as (\w+Module_*) from '([^']+)';$/gm, (whole, name, specifier) => {
    let target;
    try {
      target = fs.realpathSync(createRequire(file).resolve(specifier));
    } catch {
      return whole;
    }
    const source = fs.readFileSync(target, 'utf8');
    if (!source.includes("as 'module.exports'")) return whole;
    fixed += 1;
    console.log(`${path.relative(root, file)}: ${name} <- ${specifier}`);
    return `import ${name} from '${specifier}';`;
  });
  if (text !== before) fs.writeFileSync(file, text);
}
console.log('fixed', fixed);
