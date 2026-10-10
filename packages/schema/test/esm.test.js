import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import * as schema from '../index.js';

describe('ESM import', () => {
  test('every export is available as a named ESM export', () => {
    const url = pathToFileURL(path.join(import.meta.dirname, '../index.js')).href;
    const script = `import * as ns from ${JSON.stringify(url)};
      console.log(JSON.stringify(Object.keys(ns).filter((key) => key !== 'default' && key !== 'module.exports')));`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });
    expect(JSON.parse(output).sort()).toEqual(Object.keys(schema).sort());
  });
});
