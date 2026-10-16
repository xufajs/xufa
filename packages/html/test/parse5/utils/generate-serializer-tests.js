// Ported from parse5's test/utils/generate-serializer-tests.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { it } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import * as fs from 'node:fs';
import { parse } from '../../../index.js';
import { generateTestsForEachTreeAdapter, getStringDiffMsg } from './common.js';
export function generateSerializerTests(name, prefix, serialize) {
    const data = fs.readFileSync(new URL('../data/serialization/tests.json', import.meta.url)).toString('utf8');
    const tests = JSON.parse(data);
    generateTestsForEachTreeAdapter(name, (treeAdapter) => {
        for (const [idx, test] of tests.entries()) {
            it(`${prefix} - ${idx}.${test.name}`, async () => {
                const opts = { ...test.options, treeAdapter };
                const document = parse(test.input, opts);
                const serializedResult = await serialize(document, opts);
                //NOTE: use ok assertion, so output will not be polluted by the whole content of the strings
                assert.ok(serializedResult === test.expected, getStringDiffMsg(serializedResult, test.expected));
            });
        }
    });
}
