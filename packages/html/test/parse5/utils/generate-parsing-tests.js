// Ported from parse5's test/utils/generate-parsing-tests.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { fileURLToPath } from 'node:url';
import { it } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import * as fs from 'node:fs';
import path from 'node:path';
import { serializeToDatFileFormat } from './serialize-to-dat-file-format.js';
import { generateTestsForEachTreeAdapter } from './common.js';
import { parseDatFile } from './parse-dat-file.js';
export function loadTreeConstructionTestData(dataDir, treeAdapter) {
    const tests = [];
    const dataDirPath = fileURLToPath(dataDir);
    const testSetFileNames = fs.readdirSync(dataDir);
    const dirName = path.basename(dataDirPath);
    for (const fileName of testSetFileNames) {
        if (path.extname(fileName) !== '.dat') {
            continue;
        }
        const filePath = path.join(dataDirPath, fileName);
        const testSet = fs.readFileSync(filePath, 'utf8');
        const setName = fileName.replace('.dat', '');
        for (const [idx, test] of parseDatFile(testSet, treeAdapter).entries()) {
            tests.push({
                ...test,
                idx,
                setName,
                dirName,
            });
        }
    }
    return tests;
}
function prettyPrintParserAssertionArgs(actual, expected, chunks) {
    let msg = '\nExpected:\n';
    msg += '-----------------\n';
    msg += `${expected}\n`;
    msg += '\nActual:\n';
    msg += '-----------------\n';
    msg += `${actual}\n`;
    if (chunks) {
        msg += 'Chunks:\n';
        msg += JSON.stringify(chunks);
    }
    return msg;
}
function createParsingTest(test, treeAdapter, parse, { withoutErrors, expectError } = {}) {
    return async () => {
        const errs = [];
        const opts = {
            scriptingEnabled: test.scriptingEnabled,
            treeAdapter,
            onParseError: (err) => {
                let errStr = `(${err.startLine}:${err.startCol}`;
                // NOTE: use ranges for token errors
                if (err.startLine !== err.endLine || err.startCol !== err.endCol) {
                    errStr += `-${err.endLine}:${err.endCol}`;
                }
                errStr += `) ${err.code}`;
                errs.push(errStr);
            },
        };
        const { node, chunks } = await parse(test, opts);
        const actual = serializeToDatFileFormat(node, opts.treeAdapter);
        const msg = prettyPrintParserAssertionArgs(actual, test.expected, chunks);
        try {
            assert.ok(actual === test.expected, msg);
            if (!withoutErrors) {
                assert.deepEqual(errs.sort(), test.expectedErrors.sort());
            }
        }
        catch (error) {
            if (expectError) {
                return;
            }
            throw error;
        }
        if (expectError) {
            throw new Error(`Expected error but none was thrown`);
        }
    };
}
// TODO: Stop using the fork here.
const treePath = new URL('../data/html5lib-tests-fork/tree-construction', import.meta.url);
export function generateParsingTests(name, prefix, { withoutErrors, expectErrors: expectError = [], suitePath = treePath, }, parse) {
    generateTestsForEachTreeAdapter(name, (treeAdapter) => {
        const errorsToExpect = new Set(expectError);
        for (const test of loadTreeConstructionTestData(suitePath, treeAdapter)) {
            const expectError = errorsToExpect.delete(`${test.idx}.${test.setName}`);
            it(`${prefix}(${test.dirName}) - ${test.idx}.${test.setName} - \`${test.input}\` (line ${test.lineNum})`, createParsingTest(test, treeAdapter, parse, {
                withoutErrors,
                expectError,
            }));
        }
        if (errorsToExpect.size > 0) {
            throw new Error(`Expected errors were not found: ${[...errorsToExpect].join(', ')}`);
        }
    });
}
