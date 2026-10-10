// The TypeScript declarations of a package: its index.d.ts, or index.d.cts (the CommonJS declarations of a package of
// ES modules: tools/esm/declarations.mjs); null when it has none.
import fs from 'node:fs';
import path from 'node:path';

function declarationsOf(dir) {
  return ['index.d.ts', 'index.d.cts'].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file)) ?? null;
}

export { declarationsOf };
