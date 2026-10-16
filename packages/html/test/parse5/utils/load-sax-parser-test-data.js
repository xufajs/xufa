// Ported from parse5's test/utils/load-sax-parser-test-data.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import path from 'node:path';
import { normalizeNewLine } from './common.js';
export function loadSAXParserTestData() {
    const dataDirPath = new URL('../data/sax', import.meta.url);
    const testSetFileDirs = fs.readdirSync(dataDirPath);
    return testSetFileDirs.map((dirName) => {
        const srcFilePath = path.join(fileURLToPath(dataDirPath), dirName, 'src.html');
        const expectedFilePath = path.join(fileURLToPath(dataDirPath), dirName, 'expected.html');
        const src = fs.readFileSync(srcFilePath).toString();
        const expected = fs.readFileSync(expectedFilePath).toString();
        return {
            name: dirName,
            src: normalizeNewLine(src),
            expected: normalizeNewLine(expected),
        };
    });
}
